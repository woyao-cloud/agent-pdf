// Multi-target build demo
export const greeting = "Hello from Bun bundler!";

export function add(a: number, b: number): number {
  return a + b;
}

// Dynamic import for code splitting demo
export async function loadModule() {
  const mod = await import("./lazy");
  return mod.default();
}

if (import.meta.main) {
  console.log(greeting);
  console.log(`1 + 2 = ${add(1, 2)}`);
  const result = await loadModule();
  console.log(`Lazy loaded: ${result}`);
}
