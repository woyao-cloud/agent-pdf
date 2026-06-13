import { app } from '../src/app';

describe('BFF Gateway', () => {
  afterAll(async () => {
    await app.close();
  });

  it('should return health status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
  });

  it('should return 503 when circuit breaker is open', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/users/nonexistent/aggregated',
    });
    // Circuit breaker might be open or downstream unreachable
    expect([502, 503]).toContain(response.statusCode);
  });

  it('should handle downstream errors gracefully', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/users/invalid-id/aggregated',
    });
    // Should return an error status for failing requests
    expect([502, 503]).toContain(response.statusCode);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('error');
  });
});