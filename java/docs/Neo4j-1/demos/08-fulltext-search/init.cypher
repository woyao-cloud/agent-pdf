// ============================================================
// 第8章：全文搜索 — 知识库文档全文搜索
// ============================================================

MATCH (n) DETACH DELETE n;

// ============================================================
// 1. 创建文档数据
// ============================================================

CREATE (doc1:Document {
    id: "DOC001",
    title: "Neo4j入门指南",
    content: "Neo4j是一个高性能的图数据库，使用Cypher查询语言。它支持ACID事务，适合处理复杂的关系数据。图数据库的核心概念包括节点、关系和属性。",
    author: "张三",
    tags: ["neo4j", "图数据库", "入门"],
    createdAt: datetime("2024-01-15")
});

CREATE (doc2:Document {
    id: "DOC002",
    title: "Cypher查询优化技巧",
    content: "优化Cypher查询的关键是合理使用索引和约束。通过EXPLAIN和PROFILE可以分析查询执行计划。避免全表扫描，使用变长路径时注意深度限制。",
    author: "李四",
    tags: ["cypher", "性能优化", "索引"],
    createdAt: datetime("2024-02-20")
});

CREATE (doc3:Document {
    id: "DOC003",
    title: "图数据库建模最佳实践",
    content: "图数据库建模需要将实体映射为节点，关系映射为连接。常见的建模模式包括星型模式、树型模式和时间线模式。避免过度建模和创建孤立节点。",
    author: "张三",
    tags: ["建模", "最佳实践", "图数据库"],
    createdAt: datetime("2024-03-10")
});

CREATE (doc4:Document {
    id: "DOC004",
    title: "Python驱动集成指南",
    content: "使用neo4j Python Driver可以方便地连接和操作Neo4j数据库。支持同步和异步两种模式，推荐使用Session管理事务。注意连接池配置和异常处理。",
    author: "王五",
    tags: ["python", "驱动", "集成"],
    createdAt: datetime("2024-04-05")
});

CREATE (doc5:Document {
    id: "DOC005",
    title: "APOC过程库使用手册",
    content: "APOC是Neo4j的标准过程库，提供了大量实用功能。包括数据转换、日期处理、图操作、文本处理等。安装APOC后可以大幅扩展Neo4j的功能。",
    author: "李四",
    tags: ["apoc", "过程库", "扩展"],
    createdAt: datetime("2024-05-18")
});

CREATE (doc6:Document {
    id: "DOC006",
    title: "图算法在推荐系统中的应用",
    content: "图算法可以用于构建高效的推荐系统。PageRank算法可以计算节点重要性，社区检测可以发现用户群组，相似度算法可以找到相似物品。",
    author: "王五",
    tags: ["图算法", "推荐系统", "机器学习"],
    createdAt: datetime("2024-06-22")
});

// ============================================================
// 2. 创建全文索引
// ============================================================

// 2.1 在 title 和 content 字段上创建全文索引
CREATE FULLTEXT INDEX fulltext_document IF NOT EXISTS
FOR (n:Document) ON EACH [n.title, n.content];

// 2.2 在 tags 字段上创建全文索引
CREATE FULLTEXT INDEX fulltext_document_tags IF NOT EXISTS
FOR (n:Document) ON EACH [n.tags];

// ============================================================
// 3. 全文搜索查询
// ============================================================

// 3.1 基本全文搜索
// CALL db.index.fulltext.queryNodes('fulltext_document', '图数据库')
// YIELD node, score
// RETURN node.title AS title, score
// ORDER BY score DESC;

// 3.2 多词搜索（AND逻辑）
// CALL db.index.fulltext.queryNodes('fulltext_document', 'Cypher 查询')
// YIELD node, score
// RETURN node.title AS title, node.content AS snippet, score
// ORDER BY score DESC;

// 3.3 模糊搜索（通配符）
// CALL db.index.fulltext.queryNodes('fulltext_document', '优化*')
// YIELD node, score
// RETURN node.title AS title, score;

// 3.4 短语搜索（精确匹配）
// CALL db.index.fulltext.queryNodes('fulltext_document', '"图数据库建模"')
// YIELD node, score
// RETURN node.title AS title, score;

// 3.5 排除词搜索
// CALL db.index.fulltext.queryNodes('fulltext_document', '图数据库 -入门')
// YIELD node, score
// RETURN node.title AS title, score;

// 3.6 按标签搜索
// CALL db.index.fulltext.queryNodes('fulltext_document_tags', 'python')
// YIELD node, score
// RETURN node.title AS title, node.tags AS tags, score;

// ============================================================
// 4. 全文索引管理
// ============================================================

// 4.1 查看所有全文索引
// SHOW INDEXES;

// 4.2 等待索引刷新
// CALL db.index.fulltext.awaitEventuallyConsistentIndexRefresh();

// 4.3 删除全文索引
// DROP INDEX fulltext_document IF EXISTS;

// ============================================================
// 5. 综合搜索示例
// ============================================================

// 5.1 搜索并关联作者信息
// CALL db.index.fulltext.queryNodes('fulltext_document', '图数据库 建模')
// YIELD node, score
// RETURN node.title AS title, node.author AS author, score
// ORDER BY score DESC;

// 5.2 搜索并按时间排序
// CALL db.index.fulltext.queryNodes('fulltext_document', 'Neo4j')
// YIELD node, score
// RETURN node.title AS title, node.createdAt AS created, score
// ORDER BY created DESC;

// 5.3 搜索并限制结果
// CALL db.index.fulltext.queryNodes('fulltext_document', '数据库')
// YIELD node, score
// RETURN node.title AS title, score
// ORDER BY score DESC
// LIMIT 3;
