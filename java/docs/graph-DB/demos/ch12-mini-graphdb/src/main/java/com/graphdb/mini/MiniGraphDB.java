package com.graphdb.mini;

import java.util.List;
import java.util.Map;

public class MiniGraphDB {
    private final GraphStore store;
    private final IndexManager indexManager;
    private final QueryEngine queryEngine;
    private final TransactionManager transactionManager;

    public MiniGraphDB() {
        this.store = new GraphStore();
        this.indexManager = new IndexManager();
        this.queryEngine = new QueryEngine(store, indexManager);
        this.transactionManager = new TransactionManager(store);
    }

    public GraphStore getStore() { return store; }
    public IndexManager getIndexManager() { return indexManager; }
    public QueryEngine getQueryEngine() { return queryEngine; }
    public TransactionManager getTransactionManager() { return transactionManager; }

    public void printStats() {
        System.out.println("\n========== 图数据库统计 ==========");
        System.out.println("节点数: " + store.getNodes().size());
        System.out.println("边数: " + store.getEdges().size());
        indexManager.printIndexStats();
        System.out.println("==================================\n");
    }

    public static void main(String[] args) {
        MiniGraphDB db = new MiniGraphDB();
        System.out.println("=== 迷你图数据库启动 ===");

        db.getIndexManager().addIndex("Person", "name");
        db.getIndexManager().addIndex("Person", "age");

        Node alice = db.getStore().addNode("Person");
        alice.setProperty("name", "Alice");
        alice.setProperty("age", 30);
        alice.setProperty("city", "北京");
        db.getIndexManager().indexNode(alice);

        Node bob = db.getStore().addNode("Person");
        bob.setProperty("name", "Bob");
        bob.setProperty("age", 25);
        bob.setProperty("city", "上海");
        db.getIndexManager().indexNode(bob);

        Node carol = db.getStore().addNode("Person");
        carol.setProperty("name", "Carol");
        carol.setProperty("age", 35);
        carol.setProperty("city", "北京");
        db.getIndexManager().indexNode(carol);

        db.getStore().addEdge("FOLLOWS", alice.getId(), bob.getId());
        db.getStore().addEdge("KNOWS", alice.getId(), carol.getId());
        db.getStore().addEdge("FOLLOWS", bob.getId(), carol.getId());

        db.printStats();

        System.out.println("=== 查询演示 ===");
        List<Node> beijingPeople = db.getQueryEngine().findNodesByProperty("Person", "city", "北京");
        System.out.println("北京的Person: " + beijingPeople.size() + " 人");
        for (Node n : beijingPeople) System.out.println("  - " + n.getProperty("name"));

        List<Map<String, Object>> aliceFriends = db.getQueryEngine().traverse(alice.getId(), null, "OUTGOING", 1);
        System.out.println("\nAlice的直接好友: " + aliceFriends.size() + " 人");
        for (Map<String, Object> f : aliceFriends) System.out.println("  - " + f.get("nodeName"));

        List<Long> path = db.getQueryEngine().findPath(alice.getId(), carol.getId(), 5);
        System.out.println("\nAlice到Carol的路径: " + path);

        System.out.println("\n=== 事务演示 ===");
        var tx = db.getTransactionManager().beginTransaction();
        Node dave = tx.createNode("Person");
        dave.setProperty("name", "Dave");
        dave.setProperty("age", 28);
        Edge edge = tx.createEdge(alice.getId(), dave.getId(), "KNOWS");
        System.out.println("事务中创建了节点: " + dave.getId() + " (Dave)");
        db.getTransactionManager().rollback();
        System.out.println("回滚后节点数: " + db.getStore().getNodes().size() + " (Dave应该不存在)");

        System.out.println("\n=== 迷你图数据库演示完成 ===");
    }
}
