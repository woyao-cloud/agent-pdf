/**
 * drizzle-sqlite.ts — Drizzle ORM + bun:sqlite 基础演示
 *
 * 展示在 Bun 中使用 Drizzle ORM 操作 SQLite 数据库的完整流程：
 *   1. 使用 bun:sqlite 内置模块创建数据库连接
 *   2. 使用 Drizzle ORM 定义表结构与类型推断
 *   3. 执行 CRUD 操作 (创建、查询、更新、删除)
 *   4. 使用 Drizzle 的查询构建器进行复杂查询
 *
 * 运行方式: docker compose --profile basic up
 * 或:       bun run examples/01-basic/drizzle-sqlite.ts
 */

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { eq, like, desc, and, gte, sql } from "drizzle-orm";

// ─── 1. 创建数据库连接 ────────────────────────────────────────────────
// Bun 内置的 bun:sqlite 模块无需安装任何依赖即可使用
// 数据库文件将创建在项目目录下
const sqlite = new Database("bun-orm-demo.sqlite");

// 启用 WAL 模式 — 提升并发读写性能
sqlite.run("PRAGMA journal_mode = WAL;");
// 启用外键约束
sqlite.run("PRAGMA foreign_keys = ON;");

// 使用 Drizzle ORM 包装 bun:sqlite 连接
const db = drizzle(sqlite);

// ─── 2. 定义表结构 ────────────────────────────────────────────────────
// Drizzle 使用 TypeScript 定义表结构，无需单独的迁移文件或 schema 文件
// 类型将自动从表定义中推断

/** 用户表 —— 存储用户基本信息 */
const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  age: integer("age"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

/** 文章表 —— 存储用户发布的文章 */
const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  published: integer("published", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ─── 3. 创建表 ────────────────────────────────────────────────────────
// Drizzle Kit 提供迁移工具，但这里我们直接使用 SQL 创建表以便演示
console.log("=== 创建数据库表 ===");

sqlite.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    age INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

sqlite.run(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    published INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

console.log("  表创建成功");

// ─── 4. 插入数据 ──────────────────────────────────────────────────────
console.log("\n=== 插入数据 ===");

// 使用 Drizzle 的 insert API — 类型安全
const insertUser = await db.insert(users).values({
  name: "张三",
  email: "zhangsan@example.com",
  age: 28,
}).returning();

console.log("  插入用户:", insertUser[0]);

const insertUser2 = await db.insert(users).values({
  name: "李四",
  email: "lisi@example.com",
  age: 35,
}).returning();

console.log("  插入用户:", insertUser2[0]);

const insertUser3 = await db.insert(users).values({
  name: "王五",
  email: "wangwu@example.com",
  age: 22,
}).returning();

console.log("  插入用户:", insertUser3[0]);

// 插入关联文章
const insertPost1 = await db.insert(posts).values({
  title: "Bun 入门指南",
  content: "Bun 是一个快速的 JavaScript 运行时...",
  userId: insertUser[0].id,
  published: true,
}).returning();

console.log("  插入文章:", insertPost1[0].title);

const insertPost2 = await db.insert(posts).values({
  title: "Drizzle ORM 使用教程",
  content: "Drizzle 是一个类型安全的 TypeScript ORM...",
  userId: insertUser[0].id,
  published: true,
}).returning();

console.log("  插入文章:", insertPost2[0].title);

const insertPost3 = await db.insert(posts).values({
  title: "SQLite 性能优化技巧",
  content: "SQLite 虽然轻量，但也有很多优化空间...",
  userId: insertUser2[0].id,
  published: false,
}).returning();

console.log("  插入文章:", insertPost3[0].title);

// ─── 5. 查询数据 ──────────────────────────────────────────────────────
console.log("\n=== 查询数据 ===");

// 5a. 查询所有用户
const allUsers = await db.select().from(users);
console.log("  所有用户:", allUsers.length, "条记录");

// 5b. 条件查询 — 使用 Drizzle 的查询构建器
const youngUsers = await db.select()
  .from(users)
  .where(and(
    gte(users.age, 20),
    gte(users.age, 0) // 只是为了演示 and 条件
  ));

console.log("  年龄 >= 20 的用户:", youngUsers.length);

// 5c. 模糊查询
const searchUsers = await db.select()
  .from(users)
  .where(like(users.name, "%张%"));

console.log("  姓名包含 '张' 的用户:", searchUsers.length);

// 5d. 排序与限制
const recentUsers = await db.select()
  .from(users)
  .orderBy(desc(users.createdAt))
  .limit(2);

console.log("  最近创建的 2 个用户:");
recentUsers.forEach(u => console.log(`    ${u.name} (${u.email})`));

// 5e. 查询特定字段
const emails = await db.select({ email: users.email, name: users.name })
  .from(users);

console.log("  所有用户邮箱:");
emails.forEach(e => console.log(`    ${e.name}: ${e.email}`));

// ─── 6. 关联查询 ──────────────────────────────────────────────────────
console.log("\n=== 关联查询 ===");

// Drizzle 支持多种关联查询方式

// 6a. 左连接查询
const usersWithPosts = await db.select({
    userId: users.id,
    userName: users.name,
    postId: posts.id,
    postTitle: posts.title,
  })
  .from(users)
  .leftJoin(posts, eq(users.id, posts.userId));

console.log("  用户与文章 (左连接):");
const userPostMap = new Map<number, { name: string; posts: string[] }>();
for (const row of usersWithPosts) {
  if (!userPostMap.has(row.userId)) {
    userPostMap.set(row.userId, { name: row.userName, posts: [] });
  }
  if (row.postTitle) {
    userPostMap.get(row.userId)!.posts.push(row.postTitle);
  }
}
for (const [uid, data] of userPostMap) {
  console.log(`    ${data.name}: ${data.posts.length > 0 ? data.posts.join(", ") : "(无文章)"}`);
}

// 6b. 统计查询
const postCounts = await db.select({
    userId: users.id,
    userName: users.name,
    postCount: sql<number>`count(${posts.id})`.as("post_count"),
  })
  .from(users)
  .leftJoin(posts, eq(users.id, posts.userId))
  .groupBy(users.id);

console.log("  用户文章数统计:");
postCounts.forEach(pc => console.log(`    ${pc.userName}: ${pc.postCount} 篇文章`));

// ─── 7. 更新数据 ──────────────────────────────────────────────────────
console.log("\n=== 更新数据 ===");

// 使用 Drizzle 的 update API
const updatedUser = await db.update(users)
  .set({ age: 29 })
  .where(eq(users.email, "zhangsan@example.com"))
  .returning();

console.log("  更新用户年龄:", `${updatedUser[0].name} -> ${updatedUser[0].age}岁`);

// 批量更新
await db.update(posts)
  .set({ published: true })
  .where(eq(posts.userId, insertUser2[0].id));

console.log(`  批量发布用户 ${insertUser2[0].name} 的所有文章`);

// ─── 8. 删除数据 ──────────────────────────────────────────────────────
console.log("\n=== 删除数据 ===");

// 删除指定文章
const deletedPost = await db.delete(posts)
  .where(eq(posts.id, insertPost3[0].id))
  .returning();

console.log("  删除文章:", deletedPost[0].title);

// 级联删除 — 删除用户时自动删除其所有文章
const deletedUser = await db.delete(users)
  .where(eq(users.id, insertUser3[0].id))
  .returning();

console.log("  删除用户 (级联删除关联文章):", deletedUser[0].name);

// ─── 9. 事务操作 ──────────────────────────────────────────────────────
console.log("\n=== 事务操作 ===");

// Drizzle 支持在 bun:sqlite 中使用事务
try {
  const txResult = await db.transaction(async (tx) => {
    // 在事务中创建用户
    const newUser = await tx.insert(users).values({
      name: "赵六",
      email: "zhaoliu@example.com",
      age: 30,
    }).returning();

    // 在同一事务中创建文章
    await tx.insert(posts).values({
      title: "事务操作示例",
      content: "这篇文章是在事务中创建的...",
      userId: newUser[0].id,
      published: true,
    });

    return newUser[0];
  });

  console.log(`  事务成功: 用户 ${txResult.name} 及其文章已创建`);
} catch (error) {
  console.error("  事务失败:", error);
  // 事务自动回滚，不会产生部分写入
}

// ─── 10. 验证最终状态 ────────────────────────────────────────────────
console.log("\n=== 最终数据库状态 ===");

const finalUsers = await db.select().from(users);
const finalPosts = await db.select().from(posts);

console.log("  用户总数:", finalUsers.length);
console.log("  文章总数:", finalPosts.length);
console.log("\n  用户列表:");
for (const u of finalUsers) {
  console.log(`    [${u.id}] ${u.name} (${u.email}), 年龄: ${u.age}`);
}
console.log("\n  文章列表:");
for (const p of finalPosts) {
  console.log(`    [${p.id}] "${p.title}" - 用户 ${p.userId}, 已发布: ${p.published}`);
}

// ─── 清理 ─────────────────────────────────────────────────────────────
console.log("\n=== 清理 ===");
sqlite.close();
// 删除数据库文件以便下次干净运行
import { unlinkSync } from "fs";
try { unlinkSync("bun-orm-demo.sqlite"); } catch {}
try { unlinkSync("bun-orm-demo.sqlite-wal"); } catch {}
try { unlinkSync("bun-orm-demo.sqlite-shm"); } catch {}
console.log("  数据库文件已清理");

console.log("\n✅ Drizzle + SQLite 演示完成");
