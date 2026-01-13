import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime, time_diff_in_hours, get_datetime
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
        # FIX: Corrected indentation for the whole block
        status_map = {"IN": "Active", "OUT": "Inactive"}
        
        if self.logtype in status_map:
            frappe.db.set_value("Warehouse Staff", self.staff, "current_status", status_map[self.logtype])

        # Calculate Work Hours on Checkout
        if self.logtype == "OUT":
            # Find the most recent "IN" log for this staff member
            last_in_log = frappe.get_all("Warehouse Attendance Log",
                filters={"staff": self.staff, "logtype": "IN"},
                fields=["creation"],
                order_by="creation desc",
                limit=1
            )

            if last_in_log:
                # creation is automatically set by Frappe
                in_time = last_in_log[0].creation
                out_time = now_datetime() 
                
                diff = time_diff_in_hours(out_time, in_time)
                # Ensure the field 'work_hours' exists in your DocType
                self.work_hours = round(diff, 2)

    def verify_face(self):
        # ... (Rest of your verify_face code is correct) ...
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
        # ... (Rest of your check_location code is correct) ...
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
    
    # Inside your WarehouseAttendanceLog class
    def get_list_context(self):
        return {
            "get_indicator": self.get_indicator
        }

    def get_indicator(self, doc):
        if doc.logtype == "IN":
            # Returns [Label, Color, Filter Condition]
            return ["IN", "green", "logtype,=,IN"]
        else:
            return ["OUT", "red", "logtype,=,OUT"]