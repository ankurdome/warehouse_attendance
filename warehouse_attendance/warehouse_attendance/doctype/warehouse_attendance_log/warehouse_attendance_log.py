import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime
import face_recognition
import os

class WarehouseAttendanceLog(Document):
    def validate(self):
        # 1. Prevent double Check-ins or Check-outs
        last_log = frappe.get_all("Warehouse Attendance Log", 
            filters={"staff": self.staff}, 
            fields=["logtype"],
            order_by="creation desc", 
            limit=1)
        
        if last_log and last_log[0].logtype == self.logtype:
            frappe.throw(f"Staff is already logged as {self.logtype}!")

        # 2. Run Face Verification if a selfie is present
        if self.selfie:
            self.verify_face()

    def before_insert(self):
        # 3. Only set timestamp if the browser failed to send it
        if not self.timestamp:
            self.timestamp = now_datetime()
        
        # 4. Update the Staff's status
        current_status = self.get("logtype")
        
        if current_status == "IN":
            frappe.db.set_value("Warehouse Staff", self.staff, "current_status", "Active")
        elif current_status == "OUT":
            frappe.db.set_value("Warehouse Staff", self.staff, "current_status", "Inactive")

    def verify_face(self):
        """AI Logic to compare the current selfie with the staff's reference photo"""
        # Get the reference photo from the Warehouse Staff record
        staff_photo = frappe.db.get_value("Warehouse Staff", self.staff, "reference_photo")
        
        if not staff_photo:
            self.verification_status = "Pending"
            return

        # Get absolute file paths on the server
        ref_path = frappe.get_site_path('public', staff_photo.strip('/'))
        selfie_path = frappe.get_site_path('public', self.selfie.strip('/'))

        if not os.path.exists(ref_path) or not os.path.exists(selfie_path):
            return

        try:
            # Load images into the face_recognition library
            known_image = face_recognition.load_image_file(ref_path)
            unknown_image = face_recognition.load_image_file(selfie_path)

            # Generate "Face Encodings" (mathematical maps of the faces)
            known_encodings = face_recognition.face_encodings(known_image)
            unknown_encodings = face_recognition.face_encodings(unknown_image)

            if not known_encodings or not unknown_encodings:
                # This happens if the AI can't find a face in the image
                self.verification_status = "Failed"
                return

            # Calculate "Face Distance" (0.0 is identical, > 0.6 is usually a different person)
            face_distances = face_recognition.face_distance([known_encodings[0]], unknown_encodings[0])
            self.face_distance = float(face_distances[0])

            # Set the status based on the threshold (0.55 is strict and safe)
            if self.face_distance < 0.55:
                self.verification_status = "Success"
            else:
                self.verification_status = "Failed"

        except Exception as e:
            # Log the error in Frappe's Error Log but don't stop the submission
            frappe.log_error(title="Face Recognition Error", message=frappe.get_traceback())
            self.verification_status = "Failed"