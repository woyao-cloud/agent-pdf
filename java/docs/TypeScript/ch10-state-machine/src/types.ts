export type OrderStatus =
  | { status: 'pending'; createdAt: Date }
  | { status: 'confirmed'; confirmedAt: Date; paymentMethod: string }
  | { status: 'shipped'; shippedAt: Date; trackingNumber: string }
  | { status: 'delivered'; deliveredAt: Date; signature?: string }
  | { status: 'cancelled'; cancelledAt: Date; reason: string };

export interface Order {
  id: string;
  current: OrderStatus;
  items: string[];
  total: number;
}
