import type { Order, OrderStatus } from './types.js';

export function transitionOrder(order: Order, newStatus: OrderStatus): Order {
  return { ...order, current: newStatus };
}

export function getStatusMessage(status: OrderStatus): string {
  switch (status.status) {
    case 'pending': return 'Order pending';
    case 'confirmed': return `Confirmed via ${status.paymentMethod}`;
    case 'shipped': return `Shipped, tracking: ${status.trackingNumber}`;
    case 'delivered': return `Delivered at ${status.deliveredAt.toISOString()}`;
    case 'cancelled': return `Cancelled: ${status.reason}`;
    default:
      const _exhaustive: never = status;
      return _exhaustive;
  }
}
