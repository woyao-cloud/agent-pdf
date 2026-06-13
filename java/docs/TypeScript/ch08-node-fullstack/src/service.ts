import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './router.js';

const app = express();
app.use('/trpc', createExpressMiddleware({ router: appRouter }));
app.listen(3000, () => console.log('Server on :3000'));
