// ============================================================
// 第9章：APOC过程库实战
// 展示APOC核心功能：数据转换、日期处理、图操作、文本处理
// ============================================================

MATCH (n) DETACH DELETE n;

// ============================================================
// 1. 创建测试数据
// ============================================================

CREATE (u1:User {userId: "U001", name: "张三", email: "zhangsan@email.com", age: 30, city: "Beijing", createdAt: datetime("2024-01-15T10:30:00")});
CREATE (u2:User {userId: "U002", name: "李四", email: "lisi@email.com", age: 28, city: "Shanghai", createdAt: datetime("2024-03-20T14:00:00")});
CREATE (u3:User {userId: "U003", name: "王五", email: "wangwu@email.com", age: 35, city: "Shenzhen", createdAt: datetime("2024-06-01T09:15:00")});

CREATE (p1:Product {productId: "P001", name: "iPhone 15 Pro", price: 8999, stock: 100});
CREATE (p2:Product {productId: "P002", name: "MacBook Air M3", price: 10999, stock: 50});
CREATE (p3:Product {productId: "P003", name: "AirPods Pro 2", price: 1899, stock: 200});

CREATE (o1:Order {orderId: "ORD001", totalAmount: 10898, status: "completed", createdAt: datetime("2024-06-15")});
CREATE (o2:Order {orderId: "ORD002", totalAmount: 1899, status: "pending", createdAt: datetime("2024-07-01")});

CREATE (u1)-[:PLACED]->(o1);
CREATE (u2)-[:PLACED]->(o2);
CREATE (o1)-[:INCLUDES {qty: 1}]->(p1);
CREATE (o1)-[:INCLUDES {qty: 1}]->(p3);
CREATE (o2)-[:INCLUDES {qty: 1}]->(p3);

// ============================================================
// 2. 数据转换 (apoc.convert.*)
// ============================================================

// 2.1 节点转Map
// MATCH (u:User {name: "张三"})
// RETURN apoc.convert.toJson(u) AS user_json;

// 2.2 列表转逗号分隔字符串
// RETURN apoc.text.join(["a", "b", "c"], ",") AS joined;

// 2.3 字符串转列表
// RETURN apoc.text.split("a,b,c", ",") AS splitted;

// ============================================================
// 3. 日期时间处理 (apoc.date.*)
// ============================================================

// 3.1 格式化日期
// RETURN apoc.date.format(timestamp(), "yyyy-MM-dd HH:mm:ss") AS formatted;

// 3.2 解析日期字符串
// RETURN apoc.date.parse("2024-06-15", "yyyy-MM-dd") AS parsed;

// 3.3 日期加减
// RETURN apoc.date.add(timestamp(), "day", -7) AS last_week;

// ============================================================
// 4. 图操作 (apoc.graph.*)
// ============================================================

// 4.1 从节点提取子图
// MATCH (u:User {name: "张三"})
// CALL apoc.graph.fromPaths([(u)-[:PLACED]->(o:Order)-[:INCLUDES]->(p:Product) | u, o, p])
// YIELD graph
// RETURN graph;

// 4.2 创建虚拟关系（不持久化）
// MATCH (u:User {name: "张三"}), (p:Product {name: "iPhone 15 Pro"})
// CALL apoc.create.vRelationship(u, "INTERESTED_IN", {}, p)
// YIELD rel
// RETURN u.name, type(rel), p.name;

// ============================================================
// 5. 文本处理 (apoc.text.*)
// ============================================================

// 5.1 模糊匹配
// RETURN apoc.text.fuzzyCompare("张三", "张山") AS similar;

// 5.2 拼音转换（中文环境）
// RETURN apoc.text.phonetic("张三") AS phonetic;

// 5.3 文本相似度
// RETURN apoc.text.sorensenDiceSimilarity("Neo4j数据库", "Neo4j图数据库") AS similarity;

// 5.4 正则提取
// RETURN apoc.text.regexGroups("我的邮箱是 test@email.com", "\\w+@\\w+\\.\\w+") AS emails;

// ============================================================
// 6. 元数据查询 (apoc.meta.*)
// ============================================================

// 6.1 查看数据库模式
// CALL apoc.meta.schema() YIELD label, properties, relationships
// RETURN label, properties, relationships;

// 6.2 查看节点统计
// CALL apoc.meta.stats() YIELD labelCount, relTypeCount, nodeCount, relCount
// RETURN labelCount, relTypeCount, nodeCount, relCount;

// ============================================================
// 7. 数据导出 (apoc.export.*)
// ============================================================

// 7.1 导出为JSON
// MATCH (u:User)-[:PLACED]->(o:Order)
// CALL apoc.export.json.data(collect(u) + collect(o), null, null)
// YIELD file
// RETURN file;

// 7.2 导出为GraphML
// CALL apoc.export.graphml.all("export.graphml", {useTypes: true})
// YIELD file, nodes, relationships
// RETURN file, nodes, relationships;

// ============================================================
// 8. 触发器 (apoc.trigger.*)
// ============================================================

// 8.1 创建触发器：当创建Order时自动记录日志
// CALL apoc.trigger.add(
//     'order_audit',
//     'UNWIND $createdNodes AS n
//      MATCH (n:Order)
//      SET n.auditCreatedAt = datetime()',
//     {phase: 'after'}
// );

// 8.2 查看所有触发器
// CALL apoc.trigger.list();

// 8.3 删除触发器
// CALL apoc.trigger.remove('order_audit');

// ============================================================
// 9. 并行执行
// ============================================================

// 9.1 并行执行多个查询
// CALL apoc.periodic.commit(
//     'MATCH (u:User) WHERE u.age IS NULL
//      WITH u LIMIT {limit}
//      SET u.age = 0
//      RETURN count(u)',
//     {limit: 100}
// );

// ============================================================
// 10. 实用工具
// ============================================================

// 10.1 生成UUID
// RETURN apoc.create.uuid() AS uuid;

// 10.2 生成随机数
// RETURN apoc.math.randomInt(1, 100) AS random;

// 10.3 节点标签操作
// MATCH (u:User {name: "张三"})
// CALL apoc.create.addLabels(u, ["VIP"])
// RETURN u;

// 10.4 合并节点
// MATCH (a:User {name: "张三"}), (b:User {name: "张三"})
// CALL apoc.refactor.mergeNodes([a, b])
// YIELD node
// RETURN node;
