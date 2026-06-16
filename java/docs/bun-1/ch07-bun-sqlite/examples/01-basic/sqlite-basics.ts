import { Database } from "bun:sqlite";

const db = new Database(":memory:");
db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)");
db.run("INSERT INTO users (name, age) VALUES ('Alice', 30), ('Bob', 25)");

const rows = db.query("SELECT * FROM users").all();
console.table(rows);

// Prepared statement
const stmt = db.prepare("SELECT * FROM users WHERE age > ?");
const older = stmt.all(27);
console.log("Users older than 27:", older);

db.close();
