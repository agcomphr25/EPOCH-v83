from typing import List, Dict
from datetime import datetime, timedelta
import json
import sys

class Order:
    def __init__(self, order_id, order_type, features, quantity, priority, deadline, stock_model_id=None):
        self.order_id = order_id
        self.order_type = order_type  # e.g., P1, PO, regular, mesa_universal
        self.features = features
        self.quantity = quantity
        self.priority = priority
        self.deadline = deadline
        self.stock_model_id = stock_model_id

class Mold:
    def __init__(self, mold_id, capacity, compatible_types, stock_models=None):
        self.mold_id = mold_id
        self.capacity = capacity
        self.compatible_types = compatible_types  # List of order types
        self.stock_models = stock_models or []  # Supported stock model IDs

class Employee:
    def __init__(self, employee_id, skills, prod_rate, hours_per_day=10):
        self.employee_id = employee_id
        self.skills = skills  # List of order types
        self.prod_rate = prod_rate  # units per hour
        self.hours_per_day = hours_per_day

class ScheduleSlot:
    def __init__(self, order_id, mold_id, employee_id, start_time, end_time, date):
        self.order_id = order_id
        self.mold_id = mold_id
        self.employee_id = employee_id
        self.start_time = start_time
        self.end_time = end_time
        self.date = date

    def as_dict(self):
        return {
            "order_id": self.order_id,
            "mold_id": self.mold_id,
            "employee_id": self.employee_id,
            "start_time": self.start_time.strftime("%Y-%m-%d %H:%M"),
            "end_time": self.end_time.strftime("%Y-%m-%d %H:%M"),
            "scheduled_date": self.date.strftime("%Y-%m-%d")
        }

def schedule_orders_with_mesa_constraints(orders: List[Order], molds: List[Mold], employees: List[Employee], max_weeks=8) -> List[ScheduleSlot]:
    """
    Enhanced scheduler with Mesa Universal constraints:
    - Mesa Universal orders limited to 8 per day
    - Mesa Universal orders get highest priority
    - Work week: Monday-Thursday
    """
    
    # Sort orders: Mesa Universal first, then by priority and deadline
    def sort_key(order):
        is_mesa = order.stock_model_id == 'mesa_universal' or order.order_type == 'mesa_universal'
        return (0 if is_mesa else 1, order.priority, order.deadline)
    
    orders = sorted(orders, key=sort_key)
    schedule = []
    
    # Track daily usage
    daily_mesa_count = {}  # date -> count
    daily_mold_usage = {}  # (date, mold_id) -> usage
    daily_employee_usage = {}  # (date, employee_id) -> hours used
    
    # Start scheduling from today
    current_date = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)
    
    def is_work_day(date):
        """Monday=0, Tuesday=1, Wednesday=2, Thursday=3, Friday=4, Saturday=5, Sunday=6"""
        return date.weekday() < 4  # Monday through Thursday
    
    def get_next_work_day(date):
        next_day = date + timedelta(days=1)
        while not is_work_day(next_day):
            next_day += timedelta(days=1)
        return next_day
    
    for order in orders:
        scheduled = False
        attempt_date = current_date
        max_attempts = max_weeks * 4  # 4 work days per week
        attempts = 0
        
        is_mesa_universal = (order.stock_model_id == 'mesa_universal' or 
                           order.order_type == 'mesa_universal')
        
        while not scheduled and attempts < max_attempts:
            # Skip non-work days
            if not is_work_day(attempt_date):
                attempt_date = get_next_work_day(attempt_date)
                continue
            
            date_key = attempt_date.strftime("%Y-%m-%d")
            
            # Check Mesa Universal daily limit (8 per day)
            if is_mesa_universal:
                mesa_count = daily_mesa_count.get(date_key, 0)
                if mesa_count >= 8:
                    attempt_date = get_next_work_day(attempt_date)
                    attempts += 1
                    continue
            
            # Find compatible molds
            compatible_molds = []
            for mold in molds:
                if (order.order_type in mold.compatible_types or 
                    (order.stock_model_id and order.stock_model_id in mold.stock_models)):
                    
                    # Check mold capacity for this date
                    mold_usage = daily_mold_usage.get((date_key, mold.mold_id), 0)
                    if mold_usage < mold.capacity:
                        compatible_molds.append(mold)
            
            # Find available employees
            available_employees = []
            for employee in employees:
                if order.order_type in employee.skills:
                    # Check employee daily capacity
                    emp_usage = daily_employee_usage.get((date_key, employee.employee_id), 0)
                    if emp_usage < employee.hours_per_day:
                        available_employees.append(employee)
            
            if compatible_molds and available_employees:
                # Select best mold and employee (first available for simplicity)
                selected_mold = compatible_molds[0]
                selected_employee = available_employees[0]
                
                # Calculate production time (simplified: 1 hour per unit)
                production_hours = max(1, order.quantity)  # Minimum 1 hour
                start_time = attempt_date.replace(hour=8) + timedelta(hours=daily_employee_usage.get((date_key, selected_employee.employee_id), 0))
                end_time = start_time + timedelta(hours=production_hours)
                
                # Create schedule slot
                slot = ScheduleSlot(
                    order.order_id,
                    selected_mold.mold_id,
                    selected_employee.employee_id,
                    start_time,
                    end_time,
                    attempt_date
                )
                
                schedule.append(slot)
                
                # Update usage tracking
                daily_mold_usage[(date_key, selected_mold.mold_id)] = daily_mold_usage.get((date_key, selected_mold.mold_id), 0) + 1
                daily_employee_usage[(date_key, selected_employee.employee_id)] = daily_employee_usage.get((date_key, selected_employee.employee_id), 0) + production_hours
                
                if is_mesa_universal:
                    daily_mesa_count[date_key] = daily_mesa_count.get(date_key, 0) + 1
                
                scheduled = True
                print(f"✅ Scheduled {order.order_id} ({'Mesa Universal' if is_mesa_universal else 'Regular'}) on {date_key}")
                
                if is_mesa_universal:
                    print(f"   Mesa Universal count for {date_key}: {daily_mesa_count[date_key]}/8")
            else:
                # Try next work day
                attempt_date = get_next_work_day(attempt_date)
                attempts += 1
        
        if not scheduled:
            print(f"⚠️ Could not schedule order {order.order_id} within {max_weeks} weeks")
    
    return schedule

def main():
    """Main function to run scheduler with sample data"""
    if len(sys.argv) > 1 and sys.argv[1] == '--json-input':
        # Read JSON input for integration with TypeScript system
        input_data = json.loads(sys.stdin.read())
        orders = [Order(**order_data) for order_data in input_data['orders']]
        molds = [Mold(**mold_data) for mold_data in input_data['molds']]
        employees = [Employee(**emp_data) for emp_data in input_data['employees']]
    else:
        # Demo data with Mesa Universal orders
        orders = [
            Order("PUR00199-001", "mesa_universal", {"product": "Mesa - Universal"}, 1, 20, datetime(2025, 8, 5), "mesa_universal"),
            Order("PUR00199-002", "mesa_universal", {"product": "Mesa - Universal"}, 1, 20, datetime(2025, 8, 5), "mesa_universal"),
            Order("PUR00199-003", "mesa_universal", {"product": "Mesa - Universal"}, 1, 20, datetime(2025, 8, 5), "mesa_universal"),
            Order("PUR00199-004", "mesa_universal", {"product": "Mesa - Universal"}, 1, 20, datetime(2025, 8, 5), "mesa_universal"),
            Order("PUR00199-005", "mesa_universal", {"product": "Mesa - Universal"}, 1, 20, datetime(2025, 8, 5), "mesa_universal"),
            Order("PUR00199-006", "mesa_universal", {"product": "Mesa - Universal"}, 1, 20, datetime(2025, 8, 5), "mesa_universal"),
            Order("PUR00199-007", "mesa_universal", {"product": "Mesa - Universal"}, 1, 20, datetime(2025, 8, 5), "mesa_universal"),
            Order("PUR00199-008", "mesa_universal", {"product": "Mesa - Universal"}, 1, 20, datetime(2025, 8, 5), "mesa_universal"),
            Order("PUR00199-009", "mesa_universal", {"product": "Mesa - Universal"}, 1, 20, datetime(2025, 8, 6), "mesa_universal"),  # Should go to next day
            Order("ORD001", "P1", {"color": "red"}, 1, 30, datetime(2025, 8, 5)),
            Order("ORD002", "regular", {"color": "blue"}, 1, 50, datetime(2025, 8, 6)),
        ]
        
        molds = [
            Mold("mesa_universal-1", 1, ["mesa_universal"], ["mesa_universal"]),
            Mold("mesa_universal-2", 1, ["mesa_universal"], ["mesa_universal"]),
            Mold("mesa_universal-3", 1, ["mesa_universal"], ["mesa_universal"]),
            Mold("mesa_universal-4", 1, ["mesa_universal"], ["mesa_universal"]),
            Mold("mesa_universal-5", 1, ["mesa_universal"], ["mesa_universal"]),
            Mold("mesa_universal-6", 1, ["mesa_universal"], ["mesa_universal"]),
            Mold("mesa_universal-7", 1, ["mesa_universal"], ["mesa_universal"]),
            Mold("mesa_universal-8", 1, ["mesa_universal"], ["mesa_universal"]),
            Mold("MOLD-B", 2, ["regular", "P1"]),
        ]
        
        employees = [
            Employee("EMP-1", ["mesa_universal", "P1"], 1, 10),
            Employee("EMP-2", ["regular"], 1, 10),
        ]
    
    schedule = schedule_orders_with_mesa_constraints(orders, molds, employees)
    
    print(f"\n📊 Scheduled {len(schedule)} orders:")
    print("=" * 50)
    
    # Group by date for summary
    daily_summary = {}
    for slot in schedule:
        date = slot.date.strftime("%Y-%m-%d")
        if date not in daily_summary:
            daily_summary[date] = {"mesa": 0, "regular": 0, "total": 0}
        
        order = next(o for o in orders if o.order_id == slot.order_id)
        is_mesa = order.stock_model_id == 'mesa_universal' or order.order_type == 'mesa_universal'
        
        if is_mesa:
            daily_summary[date]["mesa"] += 1
        else:
            daily_summary[date]["regular"] += 1
        daily_summary[date]["total"] += 1
    
    for date in sorted(daily_summary.keys()):
        summary = daily_summary[date]
        print(f"{date}: {summary['mesa']} Mesa Universal, {summary['regular']} Regular (Total: {summary['total']})")
    
    if len(sys.argv) > 1 and sys.argv[1] == '--json-output':
        # Output JSON for integration
        result = {
            "schedule": [slot.as_dict() for slot in schedule],
            "summary": daily_summary
        }
        print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()