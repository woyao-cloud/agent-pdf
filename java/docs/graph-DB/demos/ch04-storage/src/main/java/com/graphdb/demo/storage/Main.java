package com.graphdb.demo.storage;

public class Main {
    public static void main(String[] args) throws Exception {
        System.out.println("============================================");
        System.out.println("  图数据库存储引擎演示 - 第4章");
        System.out.println("============================================");
        System.out.println();

        AdjacencyListStore.main(args);

        System.out.println();
        System.out.println();

        CSRStore.main(args);

        System.out.println();
        System.out.println();

        WALDemo.main(args);

        System.out.println();
        System.out.println("============================================");
        System.out.println("  所有存储引擎演示完成");
        System.out.println("============================================");
    }
}
