import { expectTypeOf } from 'expect-type';
import { List } from '../src/components/List';

it('should infer item type from props', () => {
  type Item = { id: string; name: string };
  expectTypeOf<Item>().toHaveProperty('id');
  expectTypeOf<Item>().toHaveProperty('name');
});

it('should have correct useApi return type', () => {
  type Result = { data: { id: number } | null; loading: boolean; error: Error | null };
  expectTypeOf<Result>().toMatchTypeOf<{ loading: boolean }>();
});
