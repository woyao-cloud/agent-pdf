import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { CreateUserSchema } from './schema.js';
import type { User } from './schema.js';

const t = initTRPC.create();
const users: User[] = [];

export const appRouter = t.router({
  user: t.router({
    list: t.procedure.query(() => users),
    byId: t.procedure.input(z.string()).query(({ input }) =>
      users.find(u => u.id === input)
    ),
    create: t.procedure.input(CreateUserSchema).mutation(({ input }) => {
      const user: User = { id: crypto.randomUUID(), ...input };
      users.push(user);
      return user;
    }),
  }),
});

export type AppRouter = typeof appRouter;
