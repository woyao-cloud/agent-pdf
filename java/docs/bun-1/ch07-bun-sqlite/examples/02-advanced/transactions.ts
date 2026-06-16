import { Database } from "bun:sqlite";

const db = new Database(":memory:");
db.run("CREATE TABLE orders (id INTEGER PRIMARY KEY, item TEXT, qty INTEGER)");

// Batch insert with transaction
const insert = db.prepare("INSERT INTO orders (item, qty) VALUES (?, ?)");
const tx = db.transaction((items: [string, number][]) => {
  for (const [item, qty] of items) {
    insert.run(item, qty);
  }
});

tx([["Apple", 10], ["Banana", 5], ["Cherry", 20]]);
const count = db.query("SELECT COUNT(*) as count FROM orders").get() as { count: number };
console.log(`Inserted ${count.count} orders via transaction`);
db.close();
