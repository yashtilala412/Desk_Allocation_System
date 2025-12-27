import frappe
import random

@frappe.whitelist()
def save_and_allocate(department, bay):
    # 1. Get all active employees in this department
    employees = frappe.get_all("Employee", 
        filters={"department": department, "status": "Active"}, 
        fields=["name", "employee_name"]
    )
    
    # 2. Get all available desks in the winning Bay
    desks = frappe.get_all("Office Desk", 
        filters={"office_bay": bay, "is_occupied": 0}, 
        fields=["name"]
    )
    
    if len(desks) < len(employees):
        return {
            "status": "error",
            "message": f"Not enough desks in {bay}. Need {len(employees)}, but only {len(desks)} available."
        }

    # 3. Shuffle both to ensure randomness
    random.shuffle(employees)
    random.shuffle(desks)
    
    allocations = []
    
    # 4. Pair them up
    for i in range(len(employees)):
        emp = employees[i]
        desk = desks[i]
        
        # Update the Desk status
        frappe.db.set_value("Office Desk", desk.name, "is_occupied", 1)
        
        # In a real scenario, you'd save this to a 'Desk Assignment' DocType
        # For now, we return the list to show the user
        allocations.append({
            "employee": emp.employee_name,
            "desk": desk.name
        })
        
    frappe.db.commit()
    return {
        "status": "success",
        "allocations": allocations
    }