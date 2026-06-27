package com.graphdb.demo.neo4j;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

import org.neo4j.configuration.GraphDatabaseSettings;
import org.neo4j.dbms.api.DatabaseManagementService;
import org.neo4j.dbms.api.DatabaseManagementServiceBuilder;
import org.neo4j.graphdb.GraphDatabaseService;
import org.neo4j.graphdb.Label;
import org.neo4j.graphdb.RelationshipType;
import org.neo4j.graphdb.Transaction;

public class SocialGraphDemo {

    private static final Path DB_DIR;
    private static DatabaseManagementService managementService;
    private static GraphDatabaseService graphDb;

    static {
        try {
            DB_DIR = Files.createTempDirectory("neo4j-social-");
        } catch (IOException e) {
            throw new RuntimeException("无法创建临时数据库目录", e);
        }
    }

    public static void main(String[] args) {
        System.out.println("=== 社交网络图演示 ===");
        try {
            startDatabase();
            createUsersAndRelationships();
            friendRecommendations();
            shortestPathQuery();
            influenceScoreQuery();
        } finally {
            shutdownDatabase();
        }
    }

    private static void startDatabase() {
        System.out.println("\n--- 启动社交网络数据库 ---");
        managementService = new DatabaseManagementServiceBuilder(DB_DIR)
                .setConfig(GraphDatabaseSettings.pagecache_memory, "256M")
                .build();
        graphDb = managementService.database(GraphDatabaseSettings.DEFAULT_DATABASE_NAME);
        System.out.println("数据库启动成功");
    }

    private static void createUsersAndRelationships() {
        System.out.println("\n--- 创建用户和关系 ---");
        try (Transaction tx = graphDb.beginTx()) {
            var users = new HashMap<String, org.neo4j.graphdb.Node>();
            String[][] userData = {
                {"alice", "爱丽丝", "28", "北京", "工程师"},
                {"bob", "鲍勃", "32", "上海", "设计师"},
                {"charlie", "查理", "25", "北京", "产品经理"},
                {"diana", "黛安娜", "30", "深圳", "数据科学家"},
                {"eve", "伊芙", "27", "北京", "工程师"},
                {"frank", "弗兰克", "35", "上海", "架构师"},
                {"grace", "格蕾丝", "29", "杭州", "市场经理"}
            };

            for (String[] u : userData) {
                var node = tx.createNode(Label.label("User"));
                node.setProperty("userId", u[0]);
                node.setProperty("name", u[1]);
                node.setProperty("age", Integer.parseInt(u[2]));
                node.setProperty("city", u[3]);
                node.setProperty("occupation", u[4]);
                users.put(u[0], node);
            }

            long now = System.currentTimeMillis();
            String[][] follows = {
                {"alice", "bob"}, {"alice", "charlie"}, {"bob", "alice"},
                {"bob", "diana"}, {"charlie", "alice"}, {"charlie", "eve"},
                {"diana", "bob"}, {"diana", "frank"}, {"eve", "alice"},
                {"eve", "grace"}, {"frank", "diana"}, {"frank", "bob"},
                {"grace", "eve"}, {"grace", "alice"}
            };
            for (String[] f : follows) {
                var rel = users.get(f[0]).createRelationshipTo(
                        users.get(f[1]), RelationshipType.withName("FOLLOWS"));
                rel.setProperty("since", now - (long) (Math.random() * 365 * 86400000L));
            }

            String[][] likes = {
                {"alice", "charlie"}, {"bob", "alice"}, {"charlie", "diana"},
                {"diana", "alice"}, {"eve", "bob"}, {"frank", "grace"},
                {"grace", "charlie"}
            };
            for (String[] l : likes) {
                var rel = users.get(l[0]).createRelationshipTo(
                        users.get(l[1]), RelationshipType.withName("LIKES"));
                rel.setProperty("timestamp", now - (long) (Math.random() * 30 * 86400000L));
            }

            tx.commit();
        }
        System.out.println("创建了 7 个用户、14 条关注关系和 7 条点赞关系");
    }

    private static void friendRecommendations() {
        System.out.println("\n--- 好友推荐（朋友的朋友）---");
        try (Transaction tx = graphDb.beginTx()) {
            var result = tx.execute(
                    "MATCH (u:User {userId: 'alice'})-[:FOLLOWS]->(f:User)-[:FOLLOWS]->(fof:User) " +
                    "WHERE NOT (u)-[:FOLLOWS]->(fof) AND u <> fof " +
                    "RETURN fof.name AS 推荐好友, fof.city AS 城市, fof.occupation AS 职业, " +
                    "       count(f) AS 共同好友数 " +
                    "ORDER BY 共同好友数 DESC"
            );
            System.out.println("爱丽丝的好友推荐（二度人脉）：");
            while (result.hasNext()) {
                var row = result.next();
                System.out.printf("  %s（%s，%s）- %d 个共同好友%n",
                        row.get("推荐好友"), row.get("城市"),
                        row.get("职业"), row.get("共同好友数"));
            }
        }
    }

    private static void shortestPathQuery() {
        System.out.println("\n--- 最短路径查询 ---");
        try (Transaction tx = graphDb.beginTx()) {
            var result = tx.execute(
                    "MATCH p = shortestPath(" +
                    "  (start:User {userId: 'alice'})-[:FOLLOWS*]-(end:User {userId: 'frank'})" +
                    ") " +
                    "RETURN [n IN nodes(p) | n.name] AS 路径, length(p) AS 步数"
            );
            System.out.println("爱丽丝到弗兰克的最短路径：");
            while (result.hasNext()) {
                var row = result.next();
                System.out.println("  路径: " + row.get("路径"));
                System.out.println("  步数: " + row.get("步数"));
            }
        }

        try (Transaction tx = graphDb.beginTx()) {
            var result = tx.execute(
                    "MATCH p = shortestPath(" +
                    "  (start:User {userId: 'eve'})-[:FOLLOWS*]-(end:User {userId: 'frank'})" +
                    ") " +
                    "RETURN [n IN nodes(p) | n.name] AS 路径, length(p) AS 步数"
            );
            System.out.println("\n伊芙到弗兰克的最短路径：");
            while (result.hasNext()) {
                var row = result.next();
                System.out.println("  路径: " + row.get("路径"));
                System.out.println("  步数: " + row.get("步数"));
            }
        }
    }

    private static void influenceScoreQuery() {
        System.out.println("\n--- 影响力评分（粉丝数 + 互动量）---");
        try (Transaction tx = graphDb.beginTx()) {
            var result = tx.execute(
                    "MATCH (u:User) " +
                    "OPTIONAL MATCH (u)<-[:FOLLOWS]-(follower:User) " +
                    "OPTIONAL MATCH (u)<-[:LIKES]-(liker:User) " +
                    "RETURN u.name AS 用户名, u.city AS 城市, u.occupation AS 职业, " +
                    "       count(DISTINCT follower) AS 粉丝数, " +
                    "       count(DISTINCT liker) AS 获赞数, " +
                    "       count(DISTINCT follower) * 2 + count(DISTINCT liker) * 3 AS 影响力评分 " +
                    "ORDER BY 影响力评分 DESC"
            );
            System.out.println("用户影响力排名：");
            System.out.println("用户名\t城市\t职业\t粉丝数\t获赞数\t影响力评分");
            System.out.println("----\t----\t----\t----\t----\t----");
            while (result.hasNext()) {
                var row = result.next();
                System.out.printf("%s\t%s\t%s\t%d\t%d\t%d%n",
                        row.get("用户名"), row.get("城市"), row.get("职业"),
                        row.get("粉丝数"), row.get("获赞数"), row.get("影响力评分"));
            }
        }
    }

    private static void shutdownDatabase() {
        System.out.println("\n--- 关闭社交网络数据库 ---");
        if (managementService != null) {
            managementService.shutdown();
        }
        System.out.println("数据库已关闭");
    }
}
