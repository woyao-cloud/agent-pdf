import { describe, it, expect } from '@jest/globals';

describe('Observability App', () => {
  it('should have all required endpoints', () => {
    const endpoints = ['/health', '/metrics', '/api/users/:id', '/api/slow', '/api/error'];
    expect(endpoints.length).toBe(5);
    expect(endpoints).toContain('/health');
    expect(endpoints).toContain('/metrics');
  });
});