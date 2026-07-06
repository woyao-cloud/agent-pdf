// ============================================================
// 第11章：Neo4j + DeepSeek 大模型集成 — 初始化数据
// 创建知识图谱数据：技术栈依赖关系、团队协作关系
// ============================================================

MATCH (n) DETACH DELETE n;

// ============================================================
// 1. 创建技术栈知识图谱
// ============================================================

// 1.1 编程语言
CREATE (py:Language {name: "Python", type: "programming", paradigm: "multi-paradigm", created: 1991});
CREATE (js:Language {name: "JavaScript", type: "programming", paradigm: "event-driven", created: 1995});
CREATE (java:Language {name: "Java", type: "programming", paradigm: "OOP", created: 1995});
CREATE (go:Language {name: "Go", type: "programming", paradigm: "concurrent", created: 2009});
CREATE (rust:Language {name: "Rust", type: "programming", paradigm: "systems", created: 2010});

// 1.2 框架
CREATE (dj:Frameworks {name: "Django", type: "web", language: "Python"});
CREATE (fl:Frameworks {name: "Flask", type: "web", language: "Python"});
CREATE (fa:Frameworks {name: "FastAPI", type: "web", language: "Python"});
CREATE (re:Frameworks {name: "React", type: "frontend", language: "JavaScript"});
CREATE (vu:Frameworks {name: "Vue.js", type: "frontend", language: "JavaScript"});
CREATE (sp:Frameworks {name: "Spring Boot", type: "web", language: "Java"});
CREATE (ex:Frameworks {name: "Express.js", type: "web", language: "JavaScript"});

// 1.3 数据库
CREATE (neo:Database {name: "Neo4j", type: "graph", features: ["ACID", "Cypher", "Bolt"]});
CREATE (pg:Database {name: "PostgreSQL", type: "relational", features: ["ACID", "SQL", "JSONB"]});
CREATE (mg:Database {name: "MongoDB", type: "document", features: ["NoSQL", "Aggregation", "Sharding"]});
CREATE (rd:Database {name: "Redis", type: "key-value", features: ["Cache", "Pub/Sub", "Persistence"]});

// 1.4 工具与平台
CREATE (dk:Tool {name: "Docker", type: "containerization"});
CREATE (k8s:Tool {name: "Kubernetes", type: "orchestration"});
CREATE (git:Tool {name: "Git", type: "version-control"});
CREATE (ac:Tool {name: "AWS", type: "cloud"});
CREATE (az:Tool {name: "Azure", type: "cloud"});

// 1.5 依赖关系
CREATE (dj)-[:DEPENDS_ON]->(py);
CREATE (fl)-[:DEPENDS_ON]->(py);
CREATE (fa)-[:DEPENDS_ON]->(py);
CREATE (re)-[:DEPENDS_ON]->(js);
CREATE (vu)-[:DEPENDS_ON]->(js);
CREATE (ex)-[:DEPENDS_ON]->(js);
CREATE (sp)-[:DEPENDS_ON]->(java);

// 1.6 兼容关系
CREATE (neo)-[:COMPATIBLE_WITH]->(py);
CREATE (neo)-[:COMPATIBLE_WITH]->(js);
CREATE (neo)-[:COMPATIBLE_WITH]->(java);
CREATE (neo)-[:COMPATIBLE_WITH]->(go);
CREATE (pg)-[:COMPATIBLE_WITH]->(py);
CREATE (pg)-[:COMPATIBLE_WITH]->(java);
CREATE (mg)-[:COMPATIBLE_WITH]->(js);
CREATE (mg)-[:COMPATIBLE_WITH]->(py);
CREATE (rd)-[:COMPATIBLE_WITH]->(py);
CREATE (rd)-[:COMPATIBLE_WITH]->(js);

// 1.7 部署关系
CREATE (dk)-[:DEPLOYS]->(neo);
CREATE (dk)-[:DEPLOYS]->(pg);
CREATE (dk)-[:DEPLOYS]->(mg);
CREATE (k8s)-[:ORCHESTRATES]->(dk);
CREATE (ac)-[:HOSTS]->(k8s);
CREATE (az)-[:HOSTS]->(k8s);

// ============================================================
// 2. 创建团队协作关系
// ============================================================

CREATE (alice:Engineer {name: "Alice", role: "Backend", skills: ["Python", "Java", "Neo4j"], level: "Senior"});
CREATE (bob:Engineer {name: "Bob", role: "Frontend", skills: ["JavaScript", "React", "Vue.js"], level: "Senior"});
CREATE (charlie:Engineer {name: "Charlie", role: "DevOps", skills: ["Docker", "K8s", "AWS"], level: "Mid"});
CREATE (diana:Engineer {name: "Diana", role: "FullStack", skills: ["Python", "React", "Neo4j"], level: "Senior"});
CREATE (eve:Engineer {name: "Eve", role: "Data", skills: ["Python", "Neo4j", "ML"], level: "Junior"});

CREATE (alice)-[:COLLABORATES_WITH {project: "GraphPlatform"}]->(bob);
CREATE (alice)-[:COLLABORATES_WITH {project: "GraphPlatform"}]->(charlie);
CREATE (alice)-[:COLLABORATES_WITH {project: "KnowledgeGraph"}]->(diana);
CREATE (bob)-[:COLLABORATES_WITH {project: "FrontendApp"}]->(diana);
CREATE (charlie)-[:COLLABORATES_WITH {project: "Infra"}]->(eve);
CREATE (diana)-[:COLLABORATES_WITH {project: "KnowledgeGraph"}]->(eve);

CREATE (alice)-[:KNOWS]->(neo);
CREATE (alice)-[:KNOWS]->(py);
CREATE (alice)-[:KNOWS]->(java);
CREATE (bob)-[:KNOWS]->(js);
CREATE (bob)-[:KNOWS]->(re);
CREATE (bob)-[:KNOWS]->(vu);
CREATE (charlie)-[:KNOWS]->(dk);
CREATE (charlie)-[:KNOWS]->(k8s);
CREATE (charlie)-[:KNOWS]->(ac);
CREATE (diana)-[:KNOWS]->(py);
CREATE (diana)-[:KNOWS]->(re);
CREATE (diana)-[:KNOWS]->(neo);
CREATE (eve)-[:KNOWS]->(py);
CREATE (eve)-[:KNOWS]->(neo);

// ============================================================
// 3. 创建向量索引（用于语义搜索）
// ============================================================

// 3.1 创建向量索引（需要 Neo4j 5.11+ 或 AuraDB）
// CREATE VECTOR INDEX vector_skill IF NOT EXISTS
// FOR (n:Skill) ON (n.embedding)
// OPTIONS {indexConfig: {
//   `vector.dimensions`: 1536,
//   `vector.similarity_function`: "cosine"
// }};

// ============================================================
// 4. 查询示例
// ============================================================

// 4.1 查询技术栈依赖链
// MATCH (t:Tool {name: "Docker"})-[:DEPLOYS]->(db:Database)
// RETURN db.name, db.type;

// 4.2 查询某个框架的完整依赖链
// MATCH (f:Frameworks {name: "FastAPI"})-[:DEPENDS_ON*]->(lang:Language)
// RETURN f.name, lang.name;

// 4.3 查询掌握Neo4j的工程师
// MATCH (e:Engineer)-[:KNOWS]->(db:Database {name: "Neo4j"})
// RETURN e.name, e.role, e.level;

// 4.4 查询团队协作网络
// MATCH (e:Engineer)-[c:COLLABORATES_WITH]->(other:Engineer)
// RETURN e.name, c.project, other.name;
