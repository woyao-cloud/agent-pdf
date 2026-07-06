// ============================================================
// 第6章：数据导入 — CSV导入与批量操作
// ============================================================

// 注意：CSV文件需要放在 import/ 目录下
// 在Neo4j容器中，import目录映射到 /import

// ============================================================
// 1. 创建约束（导入前创建，防止重复）
// ============================================================

CREATE CONSTRAINT unique_user_id IF NOT EXISTS
FOR (u:User) REQUIRE u.userId IS UNIQUE;

CREATE CONSTRAINT unique_product_id IF NOT EXISTS
FOR (p:Product) REQUIRE p.productId IS UNIQUE;

CREATE CONSTRAINT unique_order_id IF NOT EXISTS
FOR (o:Order) REQUIRE o.orderId IS UNIQUE;

// ============================================================
// 2. LOAD CSV 导入
// ============================================================

// 2.1 导入用户数据
// LOAD CSV WITH HEADERS FROM 'file:///users.csv' AS row
// MERGE (u:User {userId: row.userId})
// ON CREATE SET
//     u.name = row.name,
//     u.email = row.email,
//     u.age = toInteger(row.age),
//     u.city = row.city;

// 2.2 导入商品数据
// LOAD CSV WITH HEADERS FROM 'file:///products.csv' AS row
// MERGE (p:Product {productId: row.productId})
// ON CREATE SET
//     p.name = row.name,
//     p.price = toFloat(row.price),
//     p.category = row.category,
//     p.stock = toInteger(row.stock);

// 2.3 导入订单数据并创建关系
// LOAD CSV WITH HEADERS FROM 'file:///orders.csv' AS row
// MATCH (u:User {userId: row.userId})
// MATCH (p:Product {productId: row.productId})
// MERGE (o:Order {orderId: row.orderId})
// ON CREATE SET
//     o.totalAmount = toFloat(row.totalAmount),
//     o.status = row.status,
//     o.createdAt = datetime(row.createdAt)
// MERGE (u)<-[:PLACED_BY]-(o)
// MERGE (o)-[:INCLUDES {quantity: toInteger(row.quantity)}]->(p);

// ============================================================
// 3. 批量操作（UNWIND + MERGE）
// ============================================================

// 3.1 使用 UNWIND 批量创建
// WITH [
//     {userId: "U1001", name: "批量用户1", email: "batch1@email.com", age: 25, city: "Beijing"},
//     {userId: "U1002", name: "批量用户2", email: "batch2@email.com", age: 30, city: "Shanghai"},
//     {userId: "U1003", name: "批量用户3", email: "batch3@email.com", age: 28, city: "Shenzhen"}
// ] AS batchData
// UNWIND batchData AS row
// MERGE (u:User {userId: row.userId})
// ON CREATE SET u.name = row.name, u.email = row.email, u.age = row.age, u.city = row.city;

// 3.2 批量创建关系
// MATCH (u:User {userId: "U1001"})
// MATCH (p:Product {productId: "P001"})
// MERGE (u)-[:PURCHASED {quantity: 2, amount: 100}]->(p);

// ============================================================
// 4. apoc.periodic.iterate 分批处理（大数据量）
// ============================================================

// 4.1 分批导入CSV（每批1000行）
// CALL apoc.periodic.iterate(
//     "LOAD CSV WITH HEADERS FROM 'file:///large_users.csv' AS row RETURN row",
//     "MERGE (u:User {userId: row.userId})
//      ON CREATE SET u.name = row.name, u.email = row.email, u.age = toInteger(row.age)",
//     {batchSize: 1000, parallel: true, retries: 3}
// );

// ============================================================
// 5. CALL IN TRANSACTIONS 分批提交
// ============================================================

// 5.1 使用 CALL IN TRANSACTIONS 分批
// LOAD CSV WITH HEADERS FROM 'file:///large_orders.csv' AS row
// CALL {
//     WITH row
//     MATCH (u:User {userId: row.userId})
//     MATCH (p:Product {productId: row.productId})
//     MERGE (o:Order {orderId: row.orderId})
//     ON CREATE SET o.totalAmount = toFloat(row.totalAmount), o.status = row.status
//     MERGE (u)<-[:PLACED_BY]-(o)
//     MERGE (o)-[:INCLUDES {quantity: toInteger(row.quantity)}]->(p)
// } IN TRANSACTIONS OF 1000 ROWS;

// ============================================================
// 6. 数据验证
// ============================================================

// 6.1 统计导入的数据量
// MATCH (u:User) RETURN count(u) AS user_count;
// MATCH (p:Product) RETURN count(p) AS product_count;
// MATCH (o:Order) RETURN count(o) AS order_count;

// 6.2 检查数据完整性
// MATCH (o:Order)
// WHERE NOT EXISTS { (o)-[:PLACED_BY]->() }
// RETURN o.orderId AS orphan_orders;
