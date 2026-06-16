export function format(user: { name: string; age: number }): string {
  return `Hello, ${user.name}! (v${user.age})`;
}
