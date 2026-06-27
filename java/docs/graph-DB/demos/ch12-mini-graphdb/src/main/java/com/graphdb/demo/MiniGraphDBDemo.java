package com.graphdb.demo;

import com.graphdb.mini.*;

import java.util.List;
import java.util.Map;
import java.util.Set;

public class MiniGraphDBDemo {
    public static void main(String[] args) {
        System.out.println("==========================================");
        System.out.println("  迷你图数据库 - 社交网络演示");
        System.out.println("==========================================\n");

        MiniGraphDB db = new MiniGraphDB();
        IndexManager idx = db.getIndexManager();
        GraphStore store = db.getStore();
        QueryEngine qe = db.getQueryEngine();

        System.out.println("--- 1. 创建索引 ---");
        idx.addIndex("User", "name");
        idx.addIndex("User", "city");
        idx.addIndex("Post", "title");

        System.out.println("\n--- 2. 创建用户 ---");
        String[][] userData = {
            {"Alice", "28", "北京", "engineer"},
            {"Bob", "25", "上海", "designer"},
            {"Carol", "32", "北京", "manager"},
            {"Dave", "22", "深圳", "intern"},
            {"Eve", "30", "上海", "engineer"}
        };
        Node[] users = new Node[userData.length];
        for (int i = 0; i < userData.length; i++) {
            users[i] = store.addNode("User");
            users[i].setProperty("name", userData[i][0]);
            users[i].setProperty("age", Integer.parseInt(userData[i][1]));
            users[i].setProperty("city", userData[i][2]);
            users[i].setProperty("role", userData[i][3]);
            idx.indexNode(users[i]);
            System.out.println("  创建用户: " + userData[i][0] + " (" + userData[i][2] + ", " + userData[i][3] + ")");
        }

        System.out.println("\n--- 3. 创建帖子 ---");
        String[][] postData = {
            {"图数据库入门指南", "tech"},
            {"Spring Boot最佳实践", "tech"},
            {"上海美食推荐", "life"},
            {"北京周末去哪玩", "life"},
            {"分布式系统设计", "tech"}
        };
        Node[] posts = new Node[postData.length];
        for (int i = 0; i < postData.length; i++) {
            posts[i] = store.addNode("Post");
            posts[i].setProperty("title", postData[i][0]);
            posts[i].setProperty("category", postData[i][1]);
            idx.indexNode(posts[i]);
            System.out.println("  创建帖子: " + postData[i][0] + " [" + postData[i][1] + "]");
        }

        System.out.println("\n--- 4. 创建关系 ---");
        int[][] follows = {{0,1}, {0,2}, {1,2}, {1,3}, {2,4}, {3,4}};
        for (int[] f : follows) {
            store.addEdge("FOLLOWS", users[f[0]].getId(), users[f[1]].getId());
            System.out.println("  " + userData[f[0]][0] + " -> FOLLOWS -> " + userData[f[1]][0]);
        }
        int[][] posted = {{0,0}, {0,1}, {1,2}, {2,3}, {4,4}};
        for (int[] p : posted) {
            store.addEdge("POSTED", users[p[0]].getId(), posts[p[1]].getId());
            System.out.println("  " + userData[p[0]][0] + " -> POSTED -> " + postData[p[1]][0]);
        }
        int[][] likes = {{1,0}, {2,0}, {3,1}, {4,2}, {0,3}, {1,4}};
        for (int[] l : likes) {
            store.addEdge("LIKES", users[l[0]].getId(), posts[l[1]].getId());
            System.out.println("  " + userData[l[0]][0] + " -> LIKES -> " + postData[l[1]][0]);
        }

        db.printStats();

        System.out.println("--- 5. 查询：按城市查找 ---");
        for (String city : new String[]{"北京", "上海", "深圳"}) {
            List<Node> people = qe.findNodesByProperty("User", "city", city);
            System.out.println("  " + city + "的用户: " + people.size() + "人");
            for (Node n : people) System.out.println("    - " + n.getProperty("name"));
        }

        System.out.println("\n--- 6. 好友推荐 (Alice的好友的好友) ---");
        List<Map<String, Object>> friendsOfFriends = qe.traverse(users[0].getId(), "FOLLOWS", "OUTGOING", 2);
        System.out.println("  Alice的二级好友:");
        for (Map<String, Object> f : friendsOfFriends) {
            if ((int)f.get("depth") == 2) System.out.println("    - " + f.get("nodeName") + " (深度: " + f.get("depth") + ")");
        }

        System.out.println("\n--- 7. 最短路径 (Alice -> Eve) ---");
        List<Long> path = qe.findPath(users[0].getId(), users[4].getId(), 5);
        System.out.print("  路径: ");
        for (int i = 0; i < path.size(); i++) {
            Node n = store.getNode(path.get(i));
            if (i > 0) System.out.print(" -> ");
            System.out.print(n.getProperty("name"));
        }
        System.out.println();

        System.out.println("\n--- 8. 事务演示 ---");
        var tx = db.getTransactionManager().beginTransaction();
        Node frank = tx.createNode("User");
        frank.setProperty("name", "Frank");
        frank.setProperty("age", 27);
        frank.setProperty("city", "广州");
        Edge e = tx.createEdge(users[0].getId(), frank.getId(), "FOLLOWS");
        System.out.println("  事务中: 创建 Frank + FOLLOWS Alice");
        System.out.println("  当前节点数(事务中): " + (store.getNodes().size() + 1));
        db.getTransactionManager().rollback();
        System.out.println("  回滚后节点数: " + store.getNodes().size() + " (Frank已回滚)");

        System.out.println("\n--- 9. 索引查询 ---");
        Set<Long> engineers = idx.findNodes("User", "role", "engineer");
        System.out.println("  工程师用户: " + engineers.size() + "人");
        for (long id : engineers) {
            Node n = store.getNode(id);
            System.out.println("    - " + n.getProperty("name"));
        }

        System.out.println("\n==========================================");
        System.out.println("  演示完成！");
        System.out.println("==========================================");
    }
}
