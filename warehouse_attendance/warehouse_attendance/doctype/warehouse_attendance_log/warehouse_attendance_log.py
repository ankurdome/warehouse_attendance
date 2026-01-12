import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime

class WarehouseAttendanceLog(Document):
    def validate(self):
        # Prevent double Check-ins or Check-outs
        last_log = frappe.get_all("Warehouse Attendance Log", 
            filters={"staff": self.staff}, 
            fields=["logtype"],
            order_by="creation desc", 
            limit=1)
        
        if last_log and last_log[0].logtype == self.logtype:
            frappe.throw(f"Staff is already logged as {self.logtype}!")

    def before_insert(self):
        # 1. Only set timestamp if the browser failed to send it
        if not self.timestamp:
            self.timestamp = now_datetime()
        
        # 2. Update the Staff's status
        current_status = self.get("logtype")
        
        if current_status == "IN":
            frappe.db.set_value("Warehouse Staff", self.staff, "current_status", "Active")
        elif current_status == "OUT":
            frappe.db.set_value("Warehouse Staff", self.staff, "current_status", "Inactive")