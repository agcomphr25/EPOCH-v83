/**
 * Utility functions for order display and management
 */

/**
 * Returns the display order ID - FB Order # if available, otherwise Order ID
 * @param order - Order object containing orderId and fbOrderNumber
 * @returns The appropriate order identifier to display
 */
export function getDisplayOrderId(order: { orderId: string; fbOrderNumber?: string | null }): string {
  if (order.fbOrderNumber && order.fbOrderNumber.trim() !== '') {
    return order.fbOrderNumber;
  }
  return order.orderId;
}

/**
 * Returns both the display order ID and a tooltip text for clarity
 * @param order - Order object containing orderId and fbOrderNumber
 * @returns Object with displayId and tooltipText
 */
export function getOrderDisplayInfo(order: { orderId: string; fbOrderNumber?: string | null }): {
  displayId: string;
  tooltipText: string;
} {
  if (order.fbOrderNumber && order.fbOrderNumber.trim() !== '') {
    return {
      displayId: order.fbOrderNumber,
      tooltipText: `FB Order: ${order.fbOrderNumber} (Order ID: ${order.orderId})`
    };
  }
  
  return {
    displayId: order.orderId,
    tooltipText: `Order ID: ${order.orderId}`
  };
}

/**
 * Validates and cleans order assignments to prevent Friday scheduling
 * @param assignments - Object with orderId keys and assignment values
 * @param allowManualFriday - If true, allows manual Friday assignments (for drag-and-drop)
 * @returns Cleaned assignments with Friday assignments removed (unless manually allowed)
 */
export function validateNoFridayAssignments(
  assignments: { [orderId: string]: { moldId: string, date: string } }, 
  allowManualFriday: boolean = false
): { [orderId: string]: { moldId: string, date: string } } {
  const cleanedAssignments: { [orderId: string]: { moldId: string, date: string } } = {};
  let removedCount = 0;
  
  Object.entries(assignments).forEach(([orderId, assignment]) => {
    const date = new Date(assignment.date);
    const isFriday = date.getDay() === 5;
    
    if (!isFriday || allowManualFriday) {
      cleanedAssignments[orderId] = assignment;
    } else {
      console.warn(`🚫 FRIDAY VALIDATION: Rejected Friday assignment for ${orderId} on ${date.toDateString()}`);
      removedCount++;
    }
  });
  
  if (removedCount > 0) {
    console.log(`🚫 FRIDAY VALIDATION: Removed ${removedCount} Friday assignments`);
  }
  
  return cleanedAssignments;
}