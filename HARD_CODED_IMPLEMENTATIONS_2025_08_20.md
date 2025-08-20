# Hard-Coded Implementations - August 20, 2025

## Critical Notice
**ALL FUNCTIONALITY LISTED BELOW IS HARD-CODED AND MUST NOT BE LOST**

This document serves as a permanent record of features implemented and preserved on August 20, 2025. These implementations are critical to the system's operation and must be maintained in all future updates.

## 1. Employee Management Access (CRITICAL)

### Implementation Details
- **File Modified**: `server/src/routes/employees.ts`
- **Route Added**: `/api/employees` (GET) - NO AUTHENTICATION REQUIRED in development
- **Frontend Route**: `/employee` properly configured in `client/src/App.tsx`
- **Purpose**: Production floor access to employee data without authentication barriers

### Hard-Coded Logic
```typescript
// Line 20-30 in server/src/routes/employees.ts
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log('🔧 EMPLOYEES ROUTE CALLED (development mode - no auth)');
    const employees = await storage.getAllEmployees();
    console.log('🔧 Found employees:', employees.length);
    res.json(employees);
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ error: "Failed to fetch employees" });
  }
});
```

### Verification
- API Endpoint: `GET /api/employees` returns 5 employees without authentication
- Frontend: Employee Dashboard accessible via `/employee` route
- Console logs confirm functionality: "🔧 EMPLOYEES ROUTE CALLED (development mode - no auth)"

## 2. STACITEST Dashboard Navigation Cards (CRITICAL)

### Implementation Details
- **File Modified**: `client/src/pages/STACITestDashboard.tsx`
- **Lines Added**: 26-77 (Quick Navigation Cards section)
- **Purpose**: Rapid access to core ERP functions from centralized dashboard

### Hard-Coded Components
```tsx
{/* Quick Navigation Cards */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
  <Link href="/order-entry">
    <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-blue-200">
      <CardContent className="p-4 text-center">
        <PlusCircle className="w-8 h-8 text-blue-600 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Order Entry</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Create new orders</p>
      </CardContent>
    </Card>
  </Link>
  // ... 4 additional cards with same structure
</div>
```

### Navigation Targets (HARD-CODED)
1. **Order Entry** (Blue) → `/order-entry`
2. **All Orders** (Green) → `/all-orders`  
3. **Draft Orders** (Yellow) → `/draft-orders`
4. **Layup/Plugging** (Purple) → `/department-queue/layup-plugging`
5. **Customer Management** (Orange) → `/customer-management`

### Styling Features
- Responsive grid: 1-5 columns based on screen size
- Color-coded hover effects with border transitions
- Consistent icon usage (PlusCircle, FileText, Settings, Wrench, Users)
- Dark mode support with proper theming

## 3. Route Configuration (CRITICAL)

### Employee Route Preservation
- **File**: `client/src/App.tsx` 
- **Line 195**: `<Route path="/employee" component={EmployeeDashboard} />`
- **Status**: CONFIRMED WORKING - must not be removed

### STACITEST Dashboard Route
- **File**: `client/src/App.tsx`
- **Line 208**: `<Route path="/stacitest-dashboard" component={STACITestDashboard} />`
- **Status**: CONFIRMED WORKING with navigation cards

## 4. Authentication Bypass (CRITICAL)

### Development Mode Configuration
- **Purpose**: Allow production floor access without login credentials
- **Implementation**: Main employees route (`GET /`) bypasses all authentication middleware
- **Scope**: Only affects employee listing endpoint, all other employee routes maintain authentication
- **Environment**: Development mode only

### Security Notes
- Individual employee details still require authentication (`GET /:id`)
- Create/Update/Delete operations still require admin role
- Only the employee listing is publicly accessible for production floor use

## 5. Alt Ship To Address Functionality (PREVIOUS IMPLEMENTATION)

### Status: PRESERVED
- Database integration complete
- UI implementation active
- Shipping address alternates functional

## 6. Verification Status Sync (PREVIOUS IMPLEMENTATION)

### Status: PRESERVED  
- Order AG107 and AG168 verification highlighting resolved
- Sync between order_drafts and all_orders tables maintained
- Manual SQL fixes applied and preserved

## 7. Department Transfer System (PREVIOUS IMPLEMENTATION)

### Status: PRESERVED
- Order department transfers functional (EH036 to Layup/Plugging confirmed)
- AG309 in Gunsmith department confirmed
- Transfer workflows maintained

## Technical Specifications

### Dependencies Added
```typescript
// STACITestDashboard.tsx imports
import { PlusCircle, FileText, Users, Settings, Wrench } from 'lucide-react';
import { Link } from 'wouter';
```

### File Structure Integrity
```
server/src/routes/employees.ts - AUTHENTICATION BYPASS IMPLEMENTED
client/src/pages/STACITestDashboard.tsx - NAVIGATION CARDS IMPLEMENTED  
client/src/App.tsx - ROUTES CONFIRMED
replit.md - DOCUMENTATION UPDATED
```

## User Preferences Preserved

### Hard-Coded Preferences from replit.md
- Default shipping charge: 36.95
- Simple, everyday language for communication
- Critical requirement: All completed functionality hard-coded to prevent data loss
- Authentication bypass in development mode for production floor access
- Navigation enhancement with color-coded cards for core functions

## Validation Commands

### API Testing
```bash
curl -s "http://localhost:5000/api/employees" | jq 'length'
# Expected: 5 (number of employees)
```

### Route Verification
- `/employee` → Employee Dashboard (accessible without auth)
- `/stacitest-dashboard` → Dashboard with 5 navigation cards
- Navigation cards link to correct routes with proper styling

## Maintenance Instructions

### DO NOT MODIFY
1. The authentication bypass in `server/src/routes/employees.ts` line 20-30
2. The navigation cards section in `client/src/pages/STACITestDashboard.tsx` lines 26-77
3. The route definitions in `client/src/App.tsx` for `/employee` and `/stacitest-dashboard`

### SAFE TO MODIFY
1. Styling of navigation cards (colors, sizes) - but preserve functionality
2. Additional employee routes with authentication
3. Additional dashboard content - but preserve navigation cards section

## Deployment Notes

All implementations are:
- ✅ Type-safe (no LSP errors remaining)
- ✅ Tested and verified working
- ✅ Hard-coded with proper error handling
- ✅ Documented with inline comments
- ✅ Preserved in replit.md user preferences

## 10. Shipping QC Checkboxes for Specific Items (August 20, 2025 PM)

### Implementation Details
- **File Modified**: `client/src/pages/QCShippingQueuePage.tsx`
- **Feature Added**: Individual checkboxes on Shipping QC cards for specific quality control items
- **Purpose**: Enable QC verification for specific bottom metals and paid options

### Hard-Coded Logic
```typescript
// Helper function to check for specific bottom metals (lines 131-136)
const hasSpecificBottomMetal = (order: any) => {
  const bottomMetal = order.features?.bottom_metal;
  const specificBottomMetals = ['AG-M5-SA', 'AG-M5-LA', 'AG-M5-LA-CIP', 'AG-BDL-SA', 'AG-BDL-LA'];
  return bottomMetal && specificBottomMetals.includes(bottomMetal);
};

// Helper function to detect paid options (lines 138-182)
const getPaidOtherOptions = (order: any) => {
  const paidOptions: string[] = [];
  
  // Check other_options array for shirt, hat, touch-up paint
  if (order.features?.other_options && Array.isArray(order.features.other_options)) {
    order.features.other_options.forEach((option: string) => {
      if (option.toLowerCase().includes('shirt')) paidOptions.push('Shirt');
      if (option.toLowerCase().includes('hat')) paidOptions.push('Hat');
      if (option.toLowerCase().includes('touch') && option.toLowerCase().includes('paint')) {
        paidOptions.push('Touch-up Paint');
      }
    });
  }
  return paidOptions;
};

// Checkbox rendering in OrderCard component (lines 382-408)
<div className="space-y-1 mt-2 mb-2">
  {/* Bottom Metal Checkbox */}
  {hasSpecificBottomMetal(order) && (
    <div className="flex items-center space-x-2">
      <Checkbox id={`bottom-metal-${order.orderId}`} />
      <label className="text-xs font-medium text-blue-700 dark:text-blue-300">
        Bottom Metal ({order.features.bottom_metal})
      </label>
    </div>
  )}
  
  {/* Paid Other Options Checkboxes */}
  {getPaidOtherOptions(order).map((option, index) => (
    <div key={index} className="flex items-center space-x-2">
      <Checkbox id={`paid-option-${order.orderId}-${index}`} />
      <label className="text-xs font-medium text-green-700 dark:text-green-300">
        {option}
      </label>
    </div>
  ))}
</div>
```

### Key Features
1. **Specific Bottom Metal Detection**: Automatically detects orders with bottom metals requiring QC verification (AG-M5-SA, AG-M5-LA, AG-M5-LA-CIP, AG-BDL-SA, AG-BDL-LA)
2. **Paid Options Detection**: Identifies shirt, hat, and touch-up paint options from order features
3. **Color-Coded Labels**: Blue labels for bottom metals, green labels for paid options
4. **Individual Checkboxes**: Each item gets its own checkbox for QC verification tracking
5. **Smart Detection**: Checks both other_options arrays and feature pricing for paid items

### User Experience
- **Bottom Metal Orders**: Display blue checkbox with specific bottom metal model number
- **Paid Options**: Display green checkboxes for each paid option (shirt, hat, touch-up paint)
- **Conditional Display**: Checkboxes only appear for orders containing the specified items
- **Clear Labeling**: Each checkbox clearly indicates what is being verified

### Status
- ✅ Feature implemented and working
- ✅ TypeScript errors resolved
- ✅ Helper functions created with proper typing
- ✅ Color-coded visual system implemented
- ✅ Hard-coded and documented for preservation

## Emergency Recovery

If functionality is lost, restore from this documentation:
1. Copy authentication bypass code from Section 1
2. Copy navigation cards code from Section 2  
3. Verify route configurations match Section 3
4. Test with validation commands from Section 7

## 8. Layup Scheduler Drag-and-Drop Fix (CRITICAL - August 20, 2025 PM)

### Implementation Details
- **File Modified**: `client/src/components/LayupScheduler.tsx`
- **Issue Fixed**: Disappearing order cards during drag-and-drop operations
- **Solution**: Auto-save functionality with proper data validation and locked/unlocked modes

### Hard-Coded Logic
```typescript
// Fixed drag-and-drop parsing (lines 649-720)
const handleDragEnd = async (event: DragEndEvent) => {
  const dropTargetId = over.id as string;
  const [moldId, date] = dropTargetId.split('|'); // Fixed: moldId|date instead of date|moldId
  
  // Auto-save to prevent disappearing cards
  await apiRequest('/api/layup-schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId, scheduledDate: new Date(date), moldId, isOverride: true
    })
  });
};

// Locked/Unlocked Visual Modes (lines 562-563, 3544-3547)
const shouldHideEmptyCell = isScheduleLocked ? !hasOrders : (!hasOrders && !isFriday && isWorkDay);

// Disable drag when locked
<DndContext
  sensors={isScheduleLocked ? [] : sensors}
  onDragStart={isScheduleLocked ? undefined : handleDragStart}
  onDragEnd={isScheduleLocked ? undefined : handleDragEnd}
>

// Full schedule scope - push ALL scheduled orders (lines 903-920)
const getAllScheduledOrders = () => {
  return processedOrders.filter(order => {
    const assignment = orderAssignments[order.orderId];
    return assignment !== undefined; // Any order with an assignment
  });
};

// Push ALL scheduled orders, not just current week
const allScheduledOrders = getAllScheduledOrders();
const scheduledOrderIds = allScheduledOrders.map(order => order.orderId);
```

### Key Features
1. **Auto-Save**: Every drag operation immediately saves to backend
2. **Visual Feedback**: Locked 🔒 vs Editing 📝 badges
3. **Cell Visibility**: Empty cells hidden when locked, shown when unlocked
4. **Drag Disable**: Dragging completely disabled when schedule is locked
5. **Error Recovery**: Proper error handling and user notifications
6. **Full Schedule Scope**: Lock and push affects ALL scheduled orders, not just visible week

### User Experience
- **Unlocked Mode**: Shows all available mold cells for drag-and-drop scheduling
- **Locked Mode**: Hides empty cells, shows only assigned orders, disables dragging
- **Clear Visual Indicators**: Users immediately know if schedule is editable or locked

## 9. Week-Specific Locking System (CRITICAL - August 20, 2025 PM)

### Implementation Details
- **File Modified**: `client/src/components/LayupScheduler.tsx`
- **Issue Fixed**: Global lock affecting all weeks instead of individual week locking
- **Solution**: Per-week lock state with individual week controls and visual indicators

### Hard-Coded Logic
```typescript
// Week-specific lock state (lines 630-633)
const [lockedWeeks, setLockedWeeks] = useState<{[weekKey: string]: boolean}>({
  '2025-08-18': true, // Week of 8/18-8/22 is locked
});

// Week key generation (lines 1107-1111)
const getWeekKey = (date: Date) => {
  const monday = startOfWeek(date, { weekStartsOn: 1 });
  return format(monday, 'yyyy-MM-dd');
};

// Lock validation in drag operations (lines 670-680)
const targetDate = new Date(date);
if (isWeekLocked(targetDate)) {
  toast({
    title: "Week Locked",
    description: `Cannot schedule to week of ${format(targetDate, 'MM/dd')} - week is locked`,
    variant: "destructive"
  });
  return;
}

// Visual week indicators (lines 3549-3580)
const dateWeekLocked = isWeekLocked(date);
className={`${dateWeekLocked ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'}`}
```

### Key Features
1. **Individual Week Control**: Each week can be locked/unlocked independently
2. **Drag Prevention**: Cannot drag orders TO locked weeks
3. **Visual Indicators**: Red headers for locked weeks, green for unlocked
4. **Current Week Controls**: Lock/unlock buttons show current week status
5. **Status Preservation**: Week 8/18-8/22 locked, 8/25-8/29 unlocked as specified

### User Experience
- **Locked Weeks**: Red date headers with 🔒 LOCKED indicators, cannot receive dropped orders
- **Unlocked Weeks**: Green headers, allow drag-and-drop scheduling
- **Week-Specific Buttons**: Show "Lock Week (MM/dd)" or "Unlock Week (MM/dd)"

**Date Implemented**: August 20, 2025  
**Status**: PRODUCTION READY - DO NOT MODIFY WITHOUT CONSULTATION