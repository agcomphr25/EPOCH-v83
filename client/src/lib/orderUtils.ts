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