package com.graphdb.demo.neo4j;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.neo4j.configuration.GraphDatabaseSettings;
import org.neo4j.dbms.api.DatabaseManagementService;
import org.neo4j.dbms.api.DatabaseManagementServiceBuilder;
import org.neo4j.graphdb.GraphDatabaseService;
import org.neo4j.graphdb.Label;
import org.neo4j.graphdb.RelationshipType;
import org.neo4j.graphdb.Transaction;

public class RecommendationDemo {

    private static final Path DB_DIR;
    private static DatabaseManagementService managementService;
    private static GraphDatabaseService graphDb;

    static {
        try {
            DB_DIR = Files.createTempDirectory("neo4j-recommend-");
        } catch (IOException e) {
            throw new RuntimeException("无法创建临时数据库目录", e);
        }
    }

    public static void main(String[] args) {
        System.out.println("=== 电影推荐系统演示 ===");
        try {
            startDatabase();
            createData();
            collaborativeFiltering();
            contentBasedRecommendation();
            hybridRecommendation();
        } finally {
            shutdownDatabase();
        }
    }

    private static void startDatabase() {
        System.out.println("\n--- 启动推荐系统数据库 ---");
        managementService = new DatabaseManagementServiceBuilder(DB_DIR)
                .setConfig(GraphDatabaseSettings.pagecache_memory, "256M")
                .build();
        graphDb = managementService.database(GraphDatabaseSettings.DEFAULT_DATABASE_NAME);
        System.out.println("数据库启动成功");
    }

    private static void createData() {
        System.out.println("\n--- 创建电影推荐数据 ---");
        try (Transaction tx = graphDb.beginTx()) {

            var scifi = tx.createNode(Label.label("Genre"));
            scifi.setProperty("name", "科幻");
            var action = tx.createNode(Label.label("Genre"));
            action.setProperty("name", "动作");
            var drama = tx.createNode(Label.label("Genre"));
            drama.setProperty("name", "剧情");
            var comedy = tx.createNode(Label.label("Genre"));
            comedy.setProperty("name", "喜剧");

            var inception = tx.createNode(Label.label("Movie"));
            inception.setProperty("title", "盗梦空间");
            inception.setProperty("year", 2010);
            inception.setProperty("director", "克里斯托弗·诺兰");
            inception.createRelationshipTo(scifi, RelationshipType.withName("BELONGS_TO"));

            var interstellar = tx.createNode(Label.label("Movie"));
            interstellar.setProperty("title", "星际穿越");
            interstellar.setProperty("year", 2014);
            interstellar.setProperty("director", "克里斯托弗·诺兰");
            interstellar.createRelationshipTo(scifi, RelationshipType.withName("BELONGS_TO"));

            var matrix = tx.createNode(Label.label("Movie"));
            matrix.setProperty("title", "黑客帝国");
            matrix.setProperty("year", 1999);
            matrix.setProperty("director", "沃卓斯基姐妹");
            matrix.createRelationshipTo(scifi, RelationshipType.withName("BELONGS_TO"));
            matrix.createRelationshipTo(action, RelationshipType.withName("BELONGS_TO"));

            var darkKnight = tx.createNode(Label.label("Movie"));
            darkKnight.setProperty("title", "黑暗骑士");
            darkKnight.setProperty("year", 2008);
            darkKnight.setProperty("director", "克里斯托弗·诺兰");
            darkKnight.createRelationshipTo(action, RelationshipType.withName("BELONGS_TO"));
            darkKnight.createRelationshipTo(drama, RelationshipType.withName("BELONGS_TO"));

            var forrestGump = tx.createNode(Label.label("Movie"));
            forrestGump.setProperty("title", "阿甘正传");
            forrestGump.setProperty("year", 1994);
            forrestGump.setProperty("director", "罗伯特·泽米吉斯");
            forrestGump.createRelationshipTo(drama, RelationshipType.withName("BELONGS_TO"));
            forrestGump.createRelationshipTo(comedy, RelationshipType.withName("BELONGS_TO"));

            var user1 = tx.createNode(Label.label("User"));
            user1.setProperty("userId", "u1");
            user1.setProperty("name", "小明");

            var user2 = tx.createNode(Label.label("User"));
            user2.setProperty("userId", "u2");
            user2.setProperty("name", "小红");

            var user3 = tx.createNode(Label.label("User"));
            user3.setProperty("userId", "u3");
            user3.setProperty("name", "小刚");

            var user4 = tx.createNode(Label.label("User"));
            user4.setProperty("userId", "u4");
            user4.setProperty("name", "小丽");

            int[][] ratings = {
                {1, 1, 5}, {1, 2, 4}, {1, 3, 5}, {1, 4, 3},
                {2, 1, 4}, {2, 2, 5}, {2, 3, 4},
                {3, 1, 3}, {3, 4, 5}, {3, 5, 4},
                {4, 2, 4}, {4, 3, 5}, {4, 5, 5}
            };
            org.neo4j.graphdb.Node[] users = {null, user1, user2, user3, user4};
            org.neo4j.graphdb.Node[] movies = {null, inception, interstellar, matrix, darkKnight, forrestGump};

            for (int[] r : ratings) {
                var rel = users[r[0]].createRelationshipTo(
                        movies[r[1]], RelationshipType.withName("RATED"));
                rel.setProperty("rating", r[2]);
            }

            tx.commit();
        }
        System.out.println("创建了 5 部电影、4 个用户、4 个类型标签和 13 条评分记录");
    }

    private static void collaborativeFiltering() {
        System.out.println("\n--- 协同过滤推荐（喜欢这部电影的人也喜欢）---");
        try (Transaction tx = graphDb.beginTx()) {
            var result = tx.execute(
                    "MATCH (target:Movie {title: '盗梦空间'})<-[:RATED]-(u:User)-[r:RATED]->(other:Movie) " +
                    "WHERE other <> target " +
                    "RETURN other.title AS 推荐电影, other.year AS 年份, " +
                    "       other.director AS 导演, round(avg(r.rating), 1) AS 平均评分 " +
                    "ORDER BY 平均评分 DESC " +
                    "LIMIT 5"
            );
            System.out.println("喜欢《盗梦空间》的用户还喜欢：");
            while (result.hasNext()) {
                var row = result.next();
                System.out.printf("  %s（%d年，%s）- 平均评分: %.1f%n",
                        row.get("推荐电影"), row.get("年份"),
                        row.get("导演"), row.get("平均评分"));
            }
        }
    }

    private static void contentBasedRecommendation() {
        System.out.println("\n--- 基于内容的推荐（相似电影）---");
        try (Transaction tx = graphDb.beginTx()) {
            var result = tx.execute(
                    "MATCH (target:Movie {title: '盗梦空间'})-[:BELONGS_TO]->(g:Genre) " +
                    "MATCH (similar:Movie)-[:BELONGS_TO]->(g) " +
                    "WHERE similar <> target " +
                    "OPTIONAL MATCH (target)-[:BELONGS_TO]->(tg:Genre) " +
                    "WITH similar, target, count(DISTINCT g) AS sharedGenres, " +
                    "     collect(DISTINCT g.name) AS genres " +
                    "RETURN similar.title AS 相似电影, similar.year AS 年份, " +
                    "       similar.director AS 导演, genres AS 共同类型, " +
                    "       CASE WHEN similar.director = target.director " +
                    "            THEN sharedGenres + 1 ELSE sharedGenres END AS 相似度 " +
                    "ORDER BY 相似度 DESC " +
                    "LIMIT 5"
            );
            System.out.println("与《盗梦空间》相似的电影（基于类型和导演）：");
            while (result.hasNext()) {
                var row = result.next();
                System.out.printf("  %s（%d年，%s）- 类型: %s，相似度: %d%n",
                        row.get("相似电影"), row.get("年份"),
                        row.get("导演"), row.get("共同类型"), row.get("相似度"));
            }
        }
    }

    private static void hybridRecommendation() {
        System.out.println("\n--- 混合推荐（协同过滤 + 基于内容）---");
        try (Transaction tx = graphDb.beginTx()) {
            var result = tx.execute(
                    "MATCH (u:User {userId: 'u1'})-[r:RATED]->(liked:Movie) " +
                    "WITH u, liked, r.rating AS rating ORDER BY rating DESC LIMIT 2 " +
                    "MATCH (liked)-[:BELONGS_TO]->(g:Genre) " +
                    "MATCH (candidate:Movie)-[:BELONGS_TO]->(g) " +
                    "WHERE candidate <> liked AND NOT (u)-[:RATED]->(candidate) " +
                    "WITH candidate, liked, count(DISTINCT g) AS genreMatch " +
                    "WITH candidate, sum(genreMatch) AS totalGenreMatch, " +
                    "     max(CASE WHEN candidate.director = liked.director THEN 2 ELSE 0 END) AS directorBonus " +
                    "RETURN candidate.title AS 推荐电影, candidate.year AS 年份, " +
                    "       candidate.director AS 导演, " +
                    "       (totalGenreMatch + directorBonus) AS 综合评分 " +
                    "ORDER BY 综合评分 DESC " +
                    "LIMIT 5"
            );
            System.out.println("为小明（u1）的混合推荐结果：");
            while (result.hasNext()) {
                var row = result.next();
                System.out.printf("  %s（%d年，%s）- 综合评分: %d%n",
                        row.get("推荐电影"), row.get("年份"),
                        row.get("导演"), row.get("综合评分"));
            }
        }
    }

    private static void shutdownDatabase() {
        System.out.println("\n--- 关闭推荐系统数据库 ---");
        if (managementService != null) {
            managementService.shutdown();
        }
        System.out.println("数据库已关闭");
    }
}
