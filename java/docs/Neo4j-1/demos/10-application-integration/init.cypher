// ============================================================
// 第10章：应用集成 — 初始化数据
// ============================================================

MATCH (n) DETACH DELETE n;

// 创建用户
CREATE (u1:User {userId: "U001", name: "张三", email: "zhangsan@email.com", age: 30});
CREATE (u2:User {userId: "U002", name: "李四", email: "lisi@email.com", age: 28});
CREATE (u3:User {userId: "U003", name: "王五", email: "wangwu@email.com", age: 35});

// 创建商品
CREATE (p1:Product {productId: "P001", name: "iPhone 15 Pro", price: 8999, category: "手机"});
CREATE (p2:Product {productId: "P002", name: "MacBook Air M3", price: 10999, category: "笔记本"});
CREATE (p3:Product {productId: "P003", name: "AirPods Pro 2", price: 1899, category: "配件"});
CREATE (p4:Product {productId: "P004", name: "华为Mate 60 Pro", price: 7999, category: "手机"});
CREATE (p5:Product {productId: "P005", name: "iPad Air", price: 5999, category: "平板"});

// 创建订单
CREATE (o1:Order {orderId: "ORD001", totalAmount: 10898, status: "completed", createdAt: datetime("2024-06-15")});
CREATE (o2:Order {orderId: "ORD002", totalAmount: 1899, status: "pending", createdAt: datetime("2024-07-01")});
CREATE (o3:Order {orderId: "ORD003", totalAmount: 7999, status: "shipped", createdAt: datetime("2024-07-10")});

// 创建关系
CREATE (u1)-[:PLACED]->(o1);
CREATE (u2)-[:PLACED]->(o2);
CREATE (u3)-[:PLACED]->(o3);
CREATE (o1)-[:INCLUDES {qty: 1}]->(p1);
CREATE (o1)-[:INCLUDES {qty: 1}]->(p3);
CREATE (o2)-[:INCLUDES {qty: 1}]->(p3);
CREATE (o3)-[:INCLUDES {qty: 1}]->(p4);

// 创建用户-商品浏览关系
CREATE (u1)-[:BROWSED {timestamp: datetime("2024-07-11")}]->(p2);
CREATE (u1)-[:BROWSED {timestamp: datetime("2024-07-11")}]->(p5);
CREATE (u2)-[:BROWSED {timestamp: datetime("2024-07-12")}]->(p1);
CREATE (u3)-[:BROWSED {timestamp: datetime("2024-07-12")}]->(p2);
