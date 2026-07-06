// ============================================================
// 第5章：索引与约束
// 展示索引类型、约束创建、执行计划分析
// ============================================================

MATCH (n) DETACH DELETE n;

// ============================================================
// 1. 创建约束（约束会自动创建对应的索引）
// ============================================================

// 1.1 唯一性约束：确保 userId 唯一
CREATE CONSTRAINT unique_user_id IF NOT EXISTS
FOR (u:User) REQUIRE u.userId IS UNIQUE;

// 1.2 唯一性约束：确保 email 唯一
CREATE CONSTRAINT unique_user_email IF NOT EXISTS
FOR (u:User) REQUIRE u.email IS UNIQUE;

// 1.3 存在性约束：确保 name 属性不为空
CREATE CONSTRAINT exists_user_name IF NOT EXISTS
FOR (u:User) REQUIRE u.name IS NOT NULL;

// 1.4 节点键约束：复合唯一键
CREATE CONSTRAINT node_key_product IF NOT EXISTS
FOR (p:Product) REQUIRE (p.productId, p.sku) IS NODE KEY;

// ============================================================
// 2. 创建索引（提升查询性能）
// ============================================================

// 2.1 单属性 B-tree 索引
CREATE INDEX index_user_age IF NOT EXISTS
FOR (u:User) ON (u.age);

// 2.2 复合索引
CREATE INDEX index_user_city_age IF NOT EXISTS
FOR (u:User) ON (u.city, u.age);

// 2.3 文本索引（支持范围查询、文本搜索）
CREATE TEXT INDEX text_index_user_name IF NOT EXISTS
FOR (u:User) ON (u.name);

// 2.4 点索引（Point类型，用于地理空间查询）
// CREATE POINT INDEX point_index_location IF NOT EXISTS
// FOR (u:User) ON (u.location);

// 2.5 范围索引（支持 range/point/text/geometry）
CREATE RANGE INDEX range_index_user_registered IF NOT EXISTS
FOR (u:User) ON (u.registeredAt);

// ============================================================
// 3. 插入测试数据
// ============================================================

// 创建大量用户用于性能测试
UNWIND range(1, 1000) AS id
CREATE (u:User {
    userId: "U" + toString(id),
    name: "User_" + toString(id),
    email: "user" + toString(id) + "@example.com",
    age: 18 + (id % 50),
    city: CASE
        WHEN id % 3 = 0 THEN "Beijing"
        WHEN id % 3 = 1 THEN "Shanghai"
        ELSE "Shenzhen"
    END,
    registeredAt: datetime() - duration({days: id}),
    score: rand() * 100
});

// 创建商品数据
UNWIND range(1, 500) AS id
CREATE (p:Product {
    productId: "P" + toString(id),
    sku: "SKU-" + toString(id),
    name: "Product_" + toString(id),
    price: round(rand() * 1000 * 100) / 100,
    stock: toInteger(rand() * 200)
});

// ============================================================
// 4. 查询性能对比
// ============================================================

// 4.1 使用索引的查询（userId有唯一约束，自动使用索引）
// EXPLAIN MATCH (u:User {userId: "U500"}) RETURN u.name, u.email;
// 查看执行计划中的 NodeIndexSeek

// 4.2 无索引的查询（name字段有TEXT索引，但模糊搜索可能不同）
// EXPLAIN MATCH (u:User) WHERE u.name = "User_100" RETURN u;
// 查看是否使用 NodeIndexSeek

// 4.3 复合索引查询
// EXPLAIN MATCH (u:User {city: "Beijing", age: 30}) RETURN u;
// 查看是否使用 Composite index

// 4.4 范围查询
// EXPLAIN MATCH (u:User) WHERE u.age >= 30 AND u.age <= 40 RETURN count(u);
// 查看是否使用 NodeIndexSeekByRange

// 4.5 文本搜索
// EXPLAIN MATCH (u:User) WHERE u.name CONTAINS "50" RETURN u;
// 注意：CONTAINS 可能不会使用索引

// ============================================================
// 5. 约束验证
// ============================================================

// 5.1 查看所有约束
// SHOW CONSTRAINTS;

// 5.2 查看所有索引
// SHOW INDEXES;

// 5.3 尝试插入重复 userId（会失败）
// CREATE (u:User {userId: "U500", name: "Duplicate", email: "dup@email.com"});
// 错误：Node(0) already exists with label User and property userId = 'U500'

// 5.4 尝试插入空 name（会失败）
// CREATE (u:User {userId: "U9999", email: "test@email.com"});
// 错误：Property existence constraint on User.name requires a value

// ============================================================
// 6. 索引管理
// ============================================================

// 6.1 删除索引
// DROP INDEX index_user_age IF EXISTS;

// 6.2 删除约束
// DROP CONSTRAINT unique_user_email IF EXISTS;

// 6.3 重建索引（大数据量后）
// CALL db.index.fulltext.awaitEventuallyConsistentIndexRefresh();
