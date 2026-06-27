package com.graphdb.demo.neo4j;

/**
 * Neo4j 演示 - 统一入口
 * 
 * 运行所有Neo4j演示示例：
 * 1. EmbeddedNeo4jDemo - 嵌入式Neo4j基础操作
 * 2. SocialGraphDemo - 社交网络图查询
 * 3. RecommendationDemo - 电影推荐系统
 * 
 * 注意：运行前请确保pom.xml中已配置neo4j依赖
 */
public class Main {
    public static void main(String[] args) {
        System.out.println("==========================================");
        System.out.println("  Neo4j 图数据库演示");
        System.out.println("==========================================\n");

        System.out.println("--- 演示1: 嵌入式Neo4j基础操作 ---");
        EmbeddedNeo4jDemo.main(args);

        System.out.println("\n--- 演示2: 社交网络图查询 ---");
        SocialGraphDemo.main(args);

        System.out.println("\n--- 演示3: 电影推荐系统 ---");
        RecommendationDemo.main(args);

        System.out.println("\n==========================================");
        System.out.println("  所有Neo4j演示完成！");
        System.out.println("==========================================");
    }
}
