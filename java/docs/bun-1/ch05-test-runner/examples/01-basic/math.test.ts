import { describe, it, expect } from "bun:test";

describe("Math operations", () => {
  it("should add two numbers", () => {
    expect(1 + 1).toBe(2);
  });

  it("should handle async operations", async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });

  it("should compare objects", () => {
    const obj = { name: "Bun", version: 1 };
    expect(obj).toEqual({ name: "Bun", version: 1 });
  });

  it("should check types", () => {
    expect(typeof "hello").toBe("string");
    expect(Array.isArray([1, 2, 3])).toBe(true);
  });
});
