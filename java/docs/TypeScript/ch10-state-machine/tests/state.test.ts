import { transitionOrder, getStatusMessage } from '../src/order-machine';
import type { Order, OrderStatus } from '../src/types';

describe('Order State Machine', () => {
  const baseOrder: Order = {
    id: '1', items: ['item1'], total: 100,
    current: { status: 'pending', createdAt: new Date() },
  };

  it('should transition from pending to confirmed', () => {
    const confirmed: OrderStatus = {
      status: 'confirmed', confirmedAt: new Date(), paymentMethod: 'credit_card',
    };
    const updated = transitionOrder(baseOrder, confirmed);
    expect(updated.current.status).toBe('confirmed');
  });

  it('should return correct status message', () => {
    const msg = getStatusMessage({ status: 'pending', createdAt: new Date() });
    expect(msg).toBe('Order pending');
  });
});
