import { renderToString } from '../src/render.js';

describe('SSR Snapshot', () => {
  it('matches snapshot for default user data', async () => {
    const html = await renderToString({
      user: { name: 'SnapshotUser', email: 'snap@test.com' },
      items: ['Item X', 'Item Y', 'Item Z'],
    });
    expect(html).toMatchSnapshot();
  });
});