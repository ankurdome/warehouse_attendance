import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime, time_diff_in_hours, get_datetime, today
import face_recognition
import os
import json
from math import radians, cos, sin, asin, sqrt

class WarehouseAttendanceLog(Document):
    def validate(self):
        # 1. Prevent double Check-ins or Check-outs
        last_log = frappe.get_all("Warehouse Attendance Log", 
            filters={"staff": self.staff, "name": ["!=", self.name]}, 
            fields=["logtype"],
            order_by="creation desc", 
            limit=1)
        
        if last_log and last_log[0].logtype == self.logtype:
            frappe.throw(f"Staff is already logged as {self.logtype}!")

        # 2. Run Face Verification
        if self.selfie:
            self.verify_face()
            
        # 3. Check Location (Geofencing)
        if self.location:
            self.check_location()

    def before_insert(self):
        # Calculate Work Hours on Checkout BEFORE saving so the value is stored in the log itself
        # Update this section in your before_insert method
        if self.logtype == "OUT":
            # Change this in before_insert
            last_in_log = frappe.get_all("Warehouse Attendance Log",
                filters={
                    "staff": self.staff, 
                    "logtype": "IN",
                    "creation": [">", today() + " 00:00:00"] # <--- ADD THIS FILTER
                },
                fields=["creation"],
                order_by="creation desc",
                limit=1
            )

            if last_in_log:
                in_time = last_in_log[0].creation
                out_time = now_datetime() 
                diff = time_diff_in_hours(out_time, in_time)
                self.work_hours = round(diff, 2)

    def after_insert(self):
        # Update Staff status
        status_map = {"IN": "Active", "OUT": "Inactive"}
        if self.logtype in status_map:
            frappe.db.set_value("Warehouse Staff", self.staff, "current_status", status_map[self.logtype])

        # ONLY sync if Log is OUT AND Verification is Success
        if self.logtype == "OUT" and self.work_hours > 0:
            if self.verification_status == "Success":
                self.sync_to_daily_working_hours(self.work_hours)
            else:
                # If it failed, we don't sync hours, keeping the chart accurate
                frappe.msgprint("Face Verification Failed. Hours were not added to daily total.")

    def sync_to_daily_working_hours(self, hours):
        current_date = today()
        
        # 1. Fetch the real employee name using the correct field 'staffname'
        # We use frappe.db.get_value to pull from the 'Warehouse Staff' DocType
        staff_fullname = frappe.db.get_value("Warehouse Staff", self.staff, "staffname") or self.staff

        # 2. Calculate the REAL total for today
        # We sum all OTHER "OUT" logs for this staff member today
        previous_hours = frappe.db.sql("""
            SELECT SUM(work_hours) 
            FROM `tabWarehouse Attendance Log` 
            WHERE staff = %s 
            AND logtype = 'OUT' 
            AND name != %s
            AND creation LIKE %s
        """, (self.staff, self.name, f"{current_date}%"))[0][0] or 0

        # 3. Add the current log's hours to the sum of previous hours
        total_daily_hours = previous_hours + (self.work_hours or 0)

        # 4. Get all log IDs for today for the Log History list
        daily_logs = frappe.get_all("Warehouse Attendance Log",
            filters={
                "staff": self.staff,
                "logtype": "OUT",
                "creation": ["between", [f"{current_date} 00:00:00", f"{current_date} 23:59:59"]]
            },
            pluck="name"
        )
        
        # Force current log into list if not already indexed
        if self.name not in daily_logs:
            daily_logs.append(self.name)

        # 5. Check if the Daily record exists
        existing_entry = frappe.db.exists("Staff Daily Working Hours", {
            "employee": self.staff,
            "date": current_date
        })

        if existing_entry:
            doc = frappe.get_doc("Staff Daily Working Hours", existing_entry)
            doc.working_hours = total_daily_hours  # Set exact total
            doc.employee_name = staff_fullname     # Update the display name
            doc.attendance_log = json.dumps(daily_logs)
            doc.save(ignore_permissions=True)
        else:
            # Create first record of the day
            frappe.get_doc({
                "doctype": "Staff Daily Working Hours",
                "employee": self.staff,
                "employee_name": staff_fullname,
                "date": current_date,
                "working_hours": total_daily_hours,
                "attendance_log": json.dumps(daily_logs)
            }).insert(ignore_permissions=True)
        
        frappe.db.commit()

    def verify_face(self):
        staff_photo = frappe.db.get_value("Warehouse Staff", self.staff, "reference_photo")
        if not staff_photo:
            self.verification_status = "Pending"
            return

        ref_path = frappe.get_site_path(staff_photo.strip('/'))
        selfie_path = frappe.get_site_path(self.selfie.strip('/'))

        if not os.path.exists(ref_path) or not os.path.exists(selfie_path):
            return

        try:
            known_image = face_recognition.load_image_file(ref_path)
            unknown_image = face_recognition.load_image_file(selfie_path)
            known_encodings = face_recognition.face_encodings(known_image)
            unknown_encodings = face_recognition.face_encodings(unknown_image)

            if not known_encodings or not unknown_encodings:
                self.verification_status = "Failed"
                return

            face_distances = face_recognition.face_distance([known_encodings[0]], unknown_encodings[0])
            self.face_distance = float(face_distances[0])
            self.verification_status = "Success" if self.face_distance < 0.55 else "Failed"
        except Exception:
            frappe.log_error(title="AI Verification Error", message=frappe.get_traceback())
            self.verification_status = "Failed"

    def check_location(self):
        try:
            loc_data = json.loads(self.location)
            log_lon, log_lat = loc_data['features'][0]['geometry']['coordinates']
            wh_loc_str = frappe.db.get_value("Warehouse Staff", self.staff, "warehouse_location")
            if not wh_loc_str: return
            
            wh_data = json.loads(wh_loc_str)
            wh_lon, wh_lat = wh_data['features'][0]['geometry']['coordinates']
            distance = self.calculate_distance(log_lat, log_lon, wh_lat, wh_lon)
            self.is_near_warehouse = 1 if distance <= 500 else 0
        except Exception:
            pass

    def calculate_distance(self, lat1, lon1, lat2, lon2):
        lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
        dlon = lon2 - lon1 
        dlat = lat2 - lat1 
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * asin(sqrt(a)) 
        return c * 6371 * 1000 
    
    def get_list_context(self):
        return {"get_indicator": self.get_indicator}

    def get_indicator(self, doc):
        if doc.logtype == "IN":
            return ["IN", "green", "logtype,=,IN"]
        else:
            return ["OUT", "red", "logtype,=,OUT"]