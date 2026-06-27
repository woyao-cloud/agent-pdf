package com.graphdb.demo.neo4j;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.neo4j.configuration.GraphDatabaseSettings;
import org.neo4j.dbms.api.DatabaseManagementService;
import org.neo4j.dbms.api.DatabaseManagementServiceBuilder;
import org.neo4j.graphdb.GraphDatabaseService;
import org.neo4j.graphdb.Label;
import org.neo4j.graphdb.RelationshipType;
import org.neo4j.graphdb.Transaction;
import org.neo4j.graphdb.schema.IndexType;
import org.neo4j.graphdb.schema.Schema;

public class EmbeddedNeo4jDemo {

    private static final Path DB_DIR;
    private static DatabaseManagementService managementService;
    private static GraphDatabaseService graphDb;

    static {
        try {
            DB_DIR = Files.createTempDirectory("neo4j-embedded-");
        } catch (IOException e) {
            throw new RuntimeException("无法创建临时数据库目录", e);
        }
    }

    public static void main(String[] args) {
        System.out.println("=== Neo4j 嵌入式数据库演示 ===");
        try {
            startDatabase();
            defineSchema();
            createData();
            queryData();
        } finally {
            shutdownDatabase();
        }
    }

    private static void startDatabase() {
        System.out.println("\n--- 启动嵌入式数据库 ---");
        System.out.println("数据库目录: " + DB_DIR.toAbsolutePath());
        managementService = new DatabaseManagementServiceBuilder(DB_DIR)
                .setConfig(GraphDatabaseSettings.pagecache_memory, "512M")
                .build();
        graphDb = managementService.database(GraphDatabaseSettings.DEFAULT_DATABASE_NAME);
        System.out.println("数据库启动成功");
    }

    private static void defineSchema() {
        System.out.println("\n--- 定义模式（索引和约束）---");
        try (Transaction tx = graphDb.beginTx()) {
            Schema schema = tx.schema();

            schema.indexFor(Label.label("Person"))
                    .on("name")
                    .withIndexType(IndexType.RANGE)
                    .create();

            schema.indexFor(Label.label("Movie"))
                    .on("title")
                    .withIndexType(IndexType.RANGE)
                    .create();

            schema.constraintFor(Label.label("Person"))
                    .assertPropertyIsUnique("name")
                    .create();

            schema.constraintFor(Label.label("Movie"))
                    .assertPropertyIsUnique("title")
                    .create();

            tx.commit();
        }
        System.out.println("索引和约束创建完成");
    }

    private static void createData() {
        System.out.println("\n--- 创建节点和关系 ---");
        try (Transaction tx = graphDb.beginTx()) {

            var person1 = tx.createNode(Label.label("Person"));
            person1.setProperty("name", "张三");
            person1.setProperty("born", 1980);
            person1.setProperty("occupation", "演员");

            var person2 = tx.createNode(Label.label("Person"));
            person2.setProperty("name", "李四");
            person2.setProperty("born", 1975);
            person2.setProperty("occupation", "导演");

            var person3 = tx.createNode(Label.label("Person"));
            person3.setProperty("name", "王五");
            person3.setProperty("born", 1990);
            person3.setProperty("occupation", "演员");

            var movie1 = tx.createNode(Label.label("Movie"));
            movie1.setProperty("title", "星际穿越");
            movie1.setProperty("year", 2014);
            movie1.setProperty("genre", "科幻");

            var movie2 = tx.createNode(Label.label("Movie"));
            movie2.setProperty("title", "盗梦空间");
            movie2.setProperty("year", 2010);
            movie2.setProperty("genre", "科幻");

            var actedIn1 = person1.createRelationshipTo(movie1, RelationshipType.withName("ACTED_IN"));
            actedIn1.setProperty("role", "主角");

            var actedIn2 = person3.createRelationshipTo(movie1, RelationshipType.withName("ACTED_IN"));
            actedIn2.setProperty("role", "配角");

            person2.createRelationshipTo(movie1, RelationshipType.withName("DIRECTED"));

            var actedIn3 = person1.createRelationshipTo(movie2, RelationshipType.withName("ACTED_IN"));
            actedIn3.setProperty("role", "主角");

            person2.createRelationshipTo(movie2, RelationshipType.withName("DIRECTED"));

            tx.commit();
        }
        System.out.println("数据创建完成");
    }

    private static void queryData() {
        System.out.println("\n--- 执行 Cypher 查询 ---");

        try (Transaction tx = graphDb.beginTx()) {
            var result = tx.execute(
                    "MATCH (p:Person)-[r]->(m:Movie) " +
                    "RETURN p.name AS 姓名, p.occupation AS 职业, " +
                    "       type(r) AS 关系, m.title AS 电影, m.year AS 年份 " +
                    "ORDER BY m.year DESC"
            );
            System.out.println("\n所有人物与电影关系：");
            System.out.println("姓名\t职业\t关系\t电影\t年份");
            System.out.println("----\t----\t----\t----\t----");
            while (result.hasNext()) {
                var row = result.next();
                System.out.printf("%s\t%s\t%s\t%s\t%d%n",
                        row.get("姓名"), row.get("职业"),
                        row.get("关系"), row.get("电影"),
                        row.get("年份"));
            }
        }

        try (Transaction tx = graphDb.beginTx()) {
            var result = tx.execute(
                    "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) " +
                    "WHERE m.genre = $genre " +
                    "RETURN p.name AS 演员, m.title AS 电影, m.year AS 年份 " +
                    "ORDER BY m.year",
                    java.util.Map.of("genre", "科幻")
            );
            System.out.println("\n科幻电影中的演员：");
            while (result.hasNext()) {
                var row = result.next();
                System.out.printf("%s 出演了 %s（%d年）%n",
                        row.get("演员"), row.get("电影"), row.get("年份"));
            }
        }

        try (Transaction tx = graphDb.beginTx()) {
            var result = tx.execute(
                    "MATCH (p:Person) " +
                    "WHERE p.born > $year " +
                    "RETURN p.name AS 姓名, p.born AS 出生年份, p.occupation AS 职业 " +
                    "ORDER BY p.born",
                    java.util.Map.of("year", 1980)
            );
            System.out.println("\n1980年后出生的人：");
            while (result.hasNext()) {
                var row = result.next();
                System.out.printf("%s（%d年出生）- %s%n",
                        row.get("姓名"), row.get("出生年份"), row.get("职业"));
            }
        }
    }

    private static void shutdownDatabase() {
        System.out.println("\n--- 关闭数据库 ---");
        if (managementService != null) {
            managementService.shutdown();
        }
        System.out.println("数据库已关闭");
    }
}
