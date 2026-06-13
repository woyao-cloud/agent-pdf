import { describe, it, expect, jest } from '@jest/globals';

describe('Event Loop Monitor', () => {
  it('should calculate percentiles correctly', () => {
    // 验证百分位计算逻辑
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    values.sort((a, b) => a - b);
    const p50 = values[Math.floor(values.length * 0.5)];
    const p95 = values[Math.floor(values.length * 0.95)];
    const p99 = values[Math.floor(values.length * 0.99)];
    expect(p50).toBe(5);
    expect(p95).toBe(10);
    expect(p99).toBe(10);
  });
});