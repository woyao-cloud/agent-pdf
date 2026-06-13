import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../src/router';

const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],
});

describe('tRPC API', () => {
  it('should create and list users', async () => {
    const created = await client.user.create.mutate({
      name: 'Alice', email: 'alice@test.com', role: 'user',
    });
    expect(created.name).toBe('Alice');
    expect(created.id).toBeDefined();

    const list = await client.user.list.query();
    expect(list.length).toBeGreaterThanOrEqual(1);
  });
});
