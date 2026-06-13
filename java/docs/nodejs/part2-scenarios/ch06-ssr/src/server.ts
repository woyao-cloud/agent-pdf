import express from 'express';
import { renderStream, renderToString } from './render.js';
import { get, set } from './cache.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.get('/', (_req, res) => {
  const user = { name: 'Alice', email: 'alice@example.com' };
  const items = ['Item A', 'Item B', 'Item C'];
  renderStream({ user, items }, res);
});

app.get('/user/:id', async (req, res) => {
  const cacheKey = `user:${req.params.id}`;

  const cached = get(cacheKey);
  if (cached) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(cached);
    return;
  }

  const user = {
    name: `User ${req.params.id}`,
    email: `user${req.params.id}@example.com`,
  };
  const items = ['Task 1', 'Task 2', 'Task 3'];

  try {
    const html = await renderToString({ user, items });
    set(cacheKey, html);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('SSR error:', err);
    res.statusCode = 500;
    res.send('<h1>Internal Server Error</h1>');
  }
});

app.listen(PORT, () => {
  console.log(`SSR server listening on http://localhost:${PORT}`);
});