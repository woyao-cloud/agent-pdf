import { renderToString } from '../src/render.js';

describe('SSR Render', () => {
  it('renders user name in the output', async () => {
    const html = await renderToString({
      user: { name: 'Alice', email: 'alice@example.com' },
      items: ['A', 'B'],
    });
    expect(html).toContain('Hello, Alice!');
  });

  it('renders user email in the output', async () => {
    const html = await renderToString({
      user: { name: 'Bob', email: 'bob@test.com' },
      items: [],
    });
    expect(html).toContain('bob@test.com');
  });

  it('renders an empty items list correctly', async () => {
    const html = await renderToString({
      user: { name: 'Charlie', email: 'c@test.com' },
      items: [],
    });
    expect(html).toContain('<ul>');
    expect(html).toContain('</ul>');
    expect(html).not.toContain('<li>');
  });
});