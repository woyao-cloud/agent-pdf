import { Database } from "bun:sqlite";

// Simulating Drizzle-style query building
const db = new Database(":memory:");
db.run("CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL)");
db.run("INSERT INTO products VALUES (1, 'Laptop', 999.99), (2, 'Mouse', 29.99)");

const products = db.query("SELECT * FROM products WHERE price < ?").all(100);
console.table(products);
db.close();
