import { describe, it, expect, mock, spyOn } from "bun:test";

const calculator = {
  add: (a: number, b: number) => a + b,
  subtract: (a: number, b: number) => a - b,
};

describe("Mock functions", () => {
  it("should create a basic mock", () => {
    const fn = mock(() => 42);
    expect(fn()).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should mock object methods", () => {
    const spy = spyOn(calculator, "add");
    calculator.add(1, 2);
    expect(spy).toHaveBeenCalledWith(1, 2);
    spy.mockRestore();
  });

  it("should mock modules", () => {
    const mockFetch = mock(() => Promise.resolve({ json: () => ({ data: "mock" }) }));
    expect(mockFetch).toBeDefined();
  });
});
