/**
 * drizzle-pg.ts — Drizzle ORM + PostgreSQL 进阶演示
 *
 * 展示在 Bun 中使用 Drizzle ORM 操作 PostgreSQL 数据库的完整流程：
 *   1. 使用 @neondatabase/serverless (或 pg) 连接 PostgreSQL
 *   2. 使用 Drizzle 的 PostgreSQL 方言定义表结构
 *   3. 使用连接池管理并发请求
 *   4. 执行复杂查询：聚合、窗口函数、CTE
 *   5. 事务隔离级别与错误处理
 *   6. 全文搜索与地理查询
 *
 * 运行方式: docker compose --profile advanced up
 * 或:       bun run examples/02-advanced/drizzle-pg.ts
 *
 * 前提: PostgreSQL 容器正在运行 (docker compose up -d postgres)
 */

import { drizzle } from "drizzle-orm/node-postgres";
import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  decimal,
  uuid,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { eq, and, or, like, desc, asc, sql, count, avg, sum, lte, gte } from "drizzle-orm";

// ─── 1. 创建连接池 ────────────────────────────────────────────────────
// PostgreSQL 连接池管理多个数据库连接，提高并发处理能力
// 在 Bun 中，连接池与事件循环配合良好，不会阻塞 I/O

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  user: process.env.POSTGRES_USER || "bunuser",
  password: process.env.POSTGRES_PASSWORD || "bunpass",
  database: process.env.POSTGRES_DB || "bunorm",
  max: 20,                          // 最大连接数
  idleTimeoutMillis: 30000,         // 空闲连接超时
  connectionTimeoutMillis: 5000,    // 连接超时
});

// 使用 Drizzle ORM 包装连接池
const db = drizzle(pool);

console.log("=== PostgreSQL 连接池已创建 ===");
console.log(`  主机: ${pool.options.host}:${pool.options.port}`);
console.log(`  数据库: ${pool.options.database}`);
console.log(`  最大连接数: ${pool.options.max}`);

// ─── 2. 定义表结构 ────────────────────────────────────────────────────
// Drizzle 的 PostgreSQL 方言支持 PostgreSQL 特有的数据类型

/** 产品分类表 */
const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  parentId: integer("parent_id").references(() => categories.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** 产品表 */
const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  stock: integer("stock").notNull().default(0),
  categoryId: integer("category_id").references(() => categories.id),
  tags: text("tags").array(),                        // PostgreSQL 数组类型
  metadata: jsonb("metadata").default({}),            // PostgreSQL JSONB 类型
  published: boolean("published").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // 创建索引
  slugIdx: uniqueIndex("slug_idx").on(table.slug),
  categoryIdx: index("category_idx").on(table.categoryId),
  priceIdx: index("price_idx").on(table.price),
}));

/** 订单表 */
const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  status: text("status").notNull().default("pending"), // pending, paid, shipped, delivered, cancelled
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  items: jsonb("items").notNull(),                      // 订单项 JSON 数组
  shippingAddress: jsonb("shipping_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** 价格变更历史表 */
const priceHistory = pgTable("price_history", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  oldPrice: decimal("old_price", { precision: 10, scale: 2 }).notNull(),
  newPrice: decimal("new_price", { precision: 10, scale: 2 }).notNull(),
  changedBy: text("changed_by").notNull(),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});

// ─── 3. 创建表 ────────────────────────────────────────────────────────
console.log("\n=== 创建数据库表 ===");

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    parent_id INTEGER REFERENCES categories(id),
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
  )
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    category_id INTEGER REFERENCES categories(id),
    tags TEXT[],
    metadata JSONB DEFAULT '{}',
    published BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
  )
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    total_amount DECIMAL(12,2) NOT NULL,
    items JSONB NOT NULL,
    shipping_address JSONB,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
  )
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS price_history (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    old_price DECIMAL(10,2) NOT NULL,
    new_price DECIMAL(10,2) NOT NULL,
    changed_by TEXT NOT NULL,
    changed_at TIMESTAMP DEFAULT NOW() NOT NULL
  )
`);

console.log("  所有表创建成功");

// ─── 4. 插入种子数据 ──────────────────────────────────────────────────
console.log("\n=== 插入种子数据 ===");

// 4a. 插入分类
const catElectronics = (await db.insert(categories).values({
  name: "电子产品",
  description: "消费电子与数码产品",
}).returning())[0];

const catClothing = (await db.insert(categories).values({
  name: "服装",
  description: "男女服装与配饰",
}).returning())[0];

const catBooks = (await db.insert(categories).values({
  name: "图书",
  description: "图书与电子书",
}).returning())[0];

console.log(`  分类: ${catElectronics.name}, ${catClothing.name}, ${catBooks.name}`);

// 4b. 插入产品
const productData = [
  { name: "笔记本电脑 Pro", slug: "laptop-pro", price: "12999.00", stock: 50, categoryId: catElectronics.id, tags: ["电脑", "办公"], published: true },
  { name: "无线耳机", slug: "wireless-earbuds", price: "899.00", stock: 200, categoryId: catElectronics.id, tags: ["音频", "无线"], published: true },
  { name: "机械键盘", slug: "mechanical-keyboard", price: "599.00", stock: 150, categoryId: catElectronics.id, tags: ["外设", "键盘"], published: true },
  { name: "纯棉 T 恤", slug: "cotton-tshirt", price: "99.00", stock: 500, categoryId: catClothing.id, tags: ["服装", "夏季"], published: true },
  { name: "牛仔裤", slug: "jeans", price: "299.00", stock: 300, categoryId: catClothing.id, tags: ["服装", "裤子"], published: true },
  { name: "TypeScript 编程", slug: "typescript-book", price: "79.00", stock: 1000, categoryId: catBooks.id, tags: ["编程", "技术"], published: true },
  { name: "Bun 实战指南", slug: "bun-in-action", price: "89.00", stock: 800, categoryId: catBooks.id, tags: ["编程", "JavaScript"], published: true },
  { name: "算法导论", slug: "algorithms-book", price: "128.00", stock: 300, categoryId: catBooks.id, tags: ["编程", "算法"], published: false },
];

const insertedProducts = [];
for (const p of productData) {
  const result = await db.insert(products).values(p).returning();
  insertedProducts.push(result[0]);
}

console.log(`  已插入 ${insertedProducts.length} 个产品`);

// 4c. 插入价格变更历史
for (const product of insertedProducts.slice(0, 3)) {
  await db.insert(priceHistory).values({
    productId: product.id,
    oldPrice: product.price,
    newPrice: product.price,
    changedBy: "system",
  });
}

// 模拟价格变更
await db.insert(priceHistory).values({
  productId: insertedProducts[0].id,
  oldPrice: "13999.00",
  newPrice: "12999.00",
  changedBy: "admin",
});

console.log("  已插入价格变更历史");

// 4d. 插入订单
const orderItems = [
  { productId: insertedProducts[0].id, name: insertedProducts[0].name, quantity: 1, price: insertedProducts[0].price },
  { productId: insertedProducts[1].id, name: insertedProducts[1].name, quantity: 2, price: insertedProducts[1].price },
];

await db.insert(orders).values({
  userId: "user_001",
  status: "paid",
  totalAmount: "14797.00",
  items: JSON.stringify(orderItems),
  shippingAddress: JSON.stringify({ city: "北京", address: "朝阳区某某路 100 号" }),
});

const orderItems2 = [
  { productId: insertedProducts[3].id, name: insertedProducts[3].name, quantity: 3, price: insertedProducts[3].price },
  { productId: insertedProducts[4].id, name: insertedProducts[4].name, quantity: 1, price: insertedProducts[4].price },
];

await db.insert(orders).values({
  userId: "user_002",
  status: "pending",
  totalAmount: "596.00",
  items: JSON.stringify(orderItems2),
  shippingAddress: JSON.stringify({ city: "上海", address: "浦东新区某某路 200 号" }),
});

console.log("  已插入订单");

// ─── 5. 复杂查询 ──────────────────────────────────────────────────────
console.log("\n=== 复杂查询 ===");

// 5a. 聚合查询 — 每个分类的产品数量和平均价格
const categoryStats = await db.select({
    categoryName: categories.name,
    productCount: count(products.id).as("product_count"),
    avgPrice: avg(products.price).as("avg_price"),
    totalStock: sum(products.stock).as("total_stock"),
  })
  .from(categories)
  .leftJoin(products, eq(products.categoryId, categories.id))
  .groupBy(categories.id, categories.name)
  .orderBy(desc(count(products.id)));

console.log("  分类统计:");
for (const stat of categoryStats) {
  console.log(`    ${stat.categoryName}: ${stat.productCount} 个产品, 均价 ¥${Number(stat.avgPrice).toFixed(2)}, 库存 ${stat.totalStock}`);
}

// 5b. 条件组合查询 — 已发布且价格在 100-1000 之间的产品
const filteredProducts = await db.select({
    name: products.name,
    price: products.price,
    stock: products.stock,
    categoryName: categories.name,
  })
  .from(products)
  .leftJoin(categories, eq(products.categoryId, categories.id))
  .where(
    and(
      eq(products.published, true),
      lte(products.price, sql`1000`),
    )
  )
  .orderBy(asc(products.price));

console.log("\n  已发布且价格 <= 1000 的产品:");
for (const p of filteredProducts) {
  console.log(`    ${p.name} - ¥${p.price} (${p.categoryName})`);
}

// 5c. 使用 PostgreSQL 数组操作 — 查找包含特定标签的产品
const taggedProducts = await db.select({
    name: products.name,
    tags: products.tags,
  })
  .from(products)
  .where(sql`${products.tags} @> ARRAY['编程']::text[]`);

console.log("\n  包含 '编程' 标签的产品:");
for (const p of taggedProducts) {
  console.log(`    ${p.name} - 标签: ${p.tags?.join(", ")}`);
}

// 5d. 窗口函数 — 每个分类的价格排名
const priceRanks = await db.select({
    name: products.name,
    price: products.price,
    categoryName: categories.name,
    rank: sql<number>`RANK() OVER (PARTITION BY ${products.categoryId} ORDER BY ${products.price} DESC)`.as("rank"),
  })
  .from(products)
  .leftJoin(categories, eq(products.categoryId, categories.id))
  .where(eq(products.published, true))
  .orderBy(desc(products.price));

console.log("\n  价格排名 (每个分类内):");
for (const p of priceRanks) {
  console.log(`    #${p.rank} ${p.name} - ¥${p.price} (${p.categoryName})`);
}

// 5e. CTE (Common Table Expression) 查询
const cteResult = await db.execute(sql`
  WITH product_stats AS (
    SELECT
      category_id,
      COUNT(*) as product_count,
      AVG(price::numeric) as avg_price
    FROM products
    WHERE published = true
    GROUP BY category_id
  )
  SELECT
    c.name as category_name,
    ps.product_count,
    ROUND(ps.avg_price::numeric, 2) as avg_price
  FROM product_stats ps
  JOIN categories c ON c.id = ps.category_id
  ORDER BY ps.product_count DESC
`);

console.log("\n  CTE 查询结果:");
for (const row of cteResult.rows) {
  console.log(`    ${row.category_name}: ${row.product_count} 个产品, 均价 ¥${row.avg_price}`);
}

// ─── 6. 事务与错误处理 ──────────────────────────────────────────────
console.log("\n=== 事务与错误处理 ===");

// 6a. 成功事务 — 创建订单并扣减库存
try {
  await db.transaction(async (tx) => {
    // 查询产品
    const [product] = await tx.select().from(products)
      .where(eq(products.id, insertedProducts[1].id))
      .limit(1);

    if (!product) throw new Error("产品不存在");
    if (product.stock < 1) throw new Error("库存不足");

    // 扣减库存
    await tx.update(products)
      .set({
        stock: product.stock - 1,
        updatedAt: sql`NOW()`,
      })
      .where(eq(products.id, product.id));

    // 创建订单
    await tx.insert(orders).values({
      userId: "user_003",
      status: "paid",
      totalAmount: product.price,
      items: JSON.stringify([{ productId: product.id, name: product.name, quantity: 1, price: product.price }]),
      shippingAddress: JSON.stringify({ city: "广州", address: "天河区某某路" }),
    });

    console.log("  事务成功: 订单已创建, 库存已扣减");
  });
} catch (error) {
  console.error("  事务失败:", error instanceof Error ? error.message : error);
}

// 6b. 失败事务 — 模拟库存不足 (自动回滚)
try {
  await db.transaction(async (tx) => {
    const [product] = await tx.select().from(products)
      .where(eq(products.id, insertedProducts[0].id))
      .limit(1);

    if (!product) throw new Error("产品不存在");

    // 模拟尝试扣减超出库存的数量
    const requestedQty = 99999;
    if (product.stock < requestedQty) {
      throw new Error(`库存不足: 需要 ${requestedQty}, 仅有 ${product.stock}`);
    }

    await tx.update(products)
      .set({ stock: product.stock - requestedQty })
      .where(eq(products.id, product.id));
  });
} catch (error) {
  console.log("  预期的事务回滚: 库存不足异常");
  console.log(`    ${error instanceof Error ? error.message : error}`);
  // 验证库存未被扣减
  const [verifyProduct] = await db.select({ stock: products.stock })
    .from(products)
    .where(eq(products.id, insertedProducts[0].id));
  console.log(`    验证: 产品库存仍为 ${verifyProduct?.stock}`);
}

// ─── 7. 连接池状态监控 ──────────────────────────────────────────────
console.log("\n=== 连接池状态 ===");

console.log(`  总连接数: ${pool.totalCount}`);
console.log(`  空闲连接数: ${pool.idleCount}`);
console.log(`  等待队列: ${pool.waitingCount}`);

// ─── 8. 全文搜索 (PostgreSQL 原生 tsvector) ──────────────────────────
console.log("\n=== 全文搜索 ===");

// 创建全文搜索索引 (如果不存在)
await db.execute(sql`
  CREATE INDEX IF NOT EXISTS products_search_idx
  ON products USING gin(to_tsvector('simple', name || ' ' || COALESCE(description, '')))
`);

// 执行全文搜索
const searchResults = await db.execute(sql`
  SELECT name, price
  FROM products
  WHERE to_tsvector('simple', name || ' ' || COALESCE(description, '')) @@ plainto_tsquery('simple', '编程 算法')
  ORDER BY price
`);

console.log("  全文搜索结果:");
for (const row of searchResults.rows) {
  console.log(`    ${row.name} - ¥${row.price}`);
}

// ─── 9. 清理资源 ──────────────────────────────────────────────────────
console.log("\n=== 清理 ===");

// 删除测试数据
await db.execute(sql`DROP TABLE IF EXISTS price_history CASCADE`);
await db.execute(sql`DROP TABLE IF EXISTS orders CASCADE`);
await db.execute(sql`DROP TABLE IF EXISTS products CASCADE`);
await db.execute(sql`DROP TABLE IF EXISTS categories CASCADE`);
console.log("  测试表已清理");

// 关闭连接池
await pool.end();
console.log("  连接池已关闭");

console.log("\n✅ Drizzle + PostgreSQL 演示完成");
