// A simple TypeScript file to demonstrate bun build
import { format } from "./utils";

interface User {
  name: string;
  age: number;
}

const user: User = { name: "Bun", age: 2 };
console.log(format(user));
