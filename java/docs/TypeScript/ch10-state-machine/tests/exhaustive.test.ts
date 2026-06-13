import { expectTypeOf } from 'expect-type';
import type { OrderStatus } from '../src/types';

it('should have exhaustive status handling', () => {
  type StatusTypes = OrderStatus['status'];
  expectTypeOf<StatusTypes>().toEqualTypeOf<
    'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
  >();
});
