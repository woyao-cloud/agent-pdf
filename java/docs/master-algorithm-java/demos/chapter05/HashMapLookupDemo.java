package masteralgo.chapter05;

import java.util.*;

/**
 * HashMap 查找机制演示
 *
 * 涵盖三个核心主题：
 * 1. hashCode() 和 equals() 对查找的影响
 * 2. hashCode 质量差导致碰撞 → 链表/红黑树退化
 * 3. 如何通过 Debug 观察哈希桶
 */
public class HashMapLookupDemo {

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  HashMap 查找机制深度演示");
        System.out.println("================================================\n");

        // ============================================================
        //  第一部分：正常 HashMap 查找
        // ============================================================
        System.out.println("----- 第一部分：标准 HashMap 查找（10000 个条目） -----\n");

        // 创建 10000 条记录，键为字符串 "key-0" 到 "key-9999"
        Map<String, Integer> map = new HashMap<>();
        long start = System.nanoTime();
        for (int i = 0; i < 10000; i++) {
            map.put("key-" + i, i);
        }
        long putTime = System.nanoTime() - start;
        System.out.printf("  插入 10000 条数据耗时: %.2f ms%n", putTime / 1_000_000.0);

        // 测试查找性能
        start = System.nanoTime();
        for (int i = 0; i < 10000; i++) {
            Integer val = map.get("key-" + i);
            if (val == null || val != i) {
                System.out.printf("  [错误] key-%d 查找失败%n", i);
            }
        }
        long getTime = System.nanoTime() - start;
        System.out.printf("  成功查找 10000 条数据耗时: %.2f ms (平均 %.3f μs/次)%n",
                getTime / 1_000_000.0, getTime / 10000.0 / 1000);

        // 测试不存在的 key
        start = System.nanoTime();
        Integer notFound = map.get("non-existent");
        long missTime = System.nanoTime() - start;
        System.out.printf("  查找不存在的 key 耗时: %d ns%n", missTime);
        System.out.printf("  不存在 key 返回: %s%n", notFound);

        // ============================================================
        //  第二部分：hashCode() 和 equals() 的作用
        // ============================================================
        System.out.println("\n----- 第二部分：hashCode() 和 equals() 对查找的影响 -----\n");

        // 自定义类，正确实现了 hashCode 和 equals
        class GoodKey {
            final int id;
            GoodKey(int id) { this.id = id; }
            @Override public int hashCode() { return Objects.hash(id); }
            @Override public boolean equals(Object o) {
                if (this == o) return true;
                if (!(o instanceof GoodKey)) return false;
                return id == ((GoodKey) o).id;
            }
            @Override public String toString() { return "GoodKey(" + id + ")"; }
        }

        // 不重写 hashCode/equals 的类（只重写 equals 但 hashCode 继承了 Object 的）
        // 注意：匿名内部类不能完美演示，因为引用不同，但这里只是为了展示概念
        class BadKey {
            final int id;
            BadKey(int id) { this.id = id; }

            // 故意只重写 equals，不重写 hashCode
            @Override public boolean equals(Object o) {
                if (this == o) return true;
                if (!(o instanceof BadKey)) return false;
                return id == ((BadKey) o).id;
            }
            @Override public String toString() { return "BadKey(" + id + ")"; }
        }

        Map<GoodKey, String> goodMap = new HashMap<>();
        GoodKey gk1 = new GoodKey(1);
        GoodKey gk2 = new GoodKey(1); // 逻辑上等于 gk1
        goodMap.put(gk1, "value");
        String goodResult = goodMap.get(gk2);
        System.out.printf("  正确重写 hashCode：GoodKey(1) 存入，用另一个 GoodKey(1) 查找 → %s%n", goodResult);

        Map<BadKey, String> badMap = new HashMap<>();
        BadKey bk1 = new BadKey(1);
        BadKey bk2 = new BadKey(1); // 逻辑上等于 bk1，但 hashCode 不同
        badMap.put(bk1, "value");
        String badResult = badMap.get(bk2);
        System.out.printf("  未重写 hashCode：BadKey(1) 存入，用另一个 BadKey(1) 查找 → %s%n", badResult);
        System.out.println("  → 原因：bk1 和 bk2 的 hashCode() 不同，被分到不同的桶！");

        // ============================================================
        //  第三部分：Hash 碰撞可视化 —— 构造大碰撞链表
        // ============================================================
        System.out.println("\n----- 第三部分：Hash 碰撞与链表/红黑树退化演示 -----\n");

        // 构造一个 hashCode 恒返回相同值的类 → 所有 key 进入同一个桶
        class CollidingKey {
            final int id;
            CollidingKey(int id) { this.id = id; }
            // 所有实例返回相同哈希值 → 全部在同一个桶
            @Override public int hashCode() { return 42; }
            @Override public boolean equals(Object o) {
                if (this == o) return true;
                if (!(o instanceof CollidingKey)) return false;
                return id == ((CollidingKey) o).id;
            }
            @Override public String toString() { return "CollidingKey(" + id + ")"; }
        }

        // 先在小容量 HashMap 上演示碰撞
        Map<CollidingKey, String> collisionMap = new HashMap<>(16, 0.75f);

        // 加入 12 个 key（超过负载因子 16*0.75=12 → 会触发扩容）
        start = System.nanoTime();
        for (int i = 0; i < 12; i++) {
            collisionMap.put(new CollidingKey(i), "val-" + i);
        }
        long collisionPutTime = System.nanoTime() - start;
        System.out.printf("  向同一个桶插入 12 个元素（扩容前）耗时: %.2f ms%n",
                collisionPutTime / 1_000_000.0);

        // 查找 100 次测量性能
        start = System.nanoTime();
        int found = 0;
        for (int i = 0; i < 100; i++) {
            if (collisionMap.get(new CollidingKey(i % 12)) != null) found++;
        }
        long collisionGetTime = System.nanoTime() - start;
        System.out.printf("  碰撞情况下 100 次查找耗时: %.2f ms (找到 %d 次)%n",
                collisionGetTime / 1_000_000.0, found);

        // 对比无碰撞情况
        Map<GoodKey, String> noCollisionMap = new HashMap<>(16, 0.75f);
        for (int i = 0; i < 12; i++) {
            noCollisionMap.put(new GoodKey(i), "val-" + i);
        }
        start = System.nanoTime();
        for (int i = 0; i < 100; i++) {
            noCollisionMap.get(new GoodKey(i % 12));
        }
        long noCollisionTime = System.nanoTime() - start;
        System.out.printf("  无碰撞情况下 100 次查找耗时: %.2f ms%n",
                noCollisionTime / 1_000_000.0);
        System.out.printf("  碰撞/无碰撞耗时比: %.1fx%n",
                (double) collisionGetTime / noCollisionTime);

        // ============================================================
        //  第四部分：Java 8 树化优化（链表 → 红黑树）
        // ============================================================
        System.out.println("\n----- 第四部分：Java 8 树化优化（链表长度 ≥ 8 时转为红黑树） -----\n");

        // 创建一个容量始终为 64 的 HashMap（树化阈值的容量条件）
        // 当容量 >= 64 且链表长度 >= 8 时，链表转换为红黑树
        Map<CollidingKey, String> treeMap = new HashMap<>(64, 0.99f);

        long timeBeforeTree = 0, timeAfterTree = 0;

        // 先插入 8 个（java 8 阈值 = 8，会触发树化）
        // 注意：树化条件是链表长度 >= 8 且容量 >= 64，还需插入第 9 个来触发
        for (int i = 0; i < 8; i++) {
            treeMap.put(new CollidingKey(i), "val-" + i);
        }

        // 在链表状态下测量查找 8 个元素的时间
        start = System.nanoTime();
        for (int i = 0; i < 8; i++) {
            treeMap.get(new CollidingKey(i));
        }
        timeBeforeTree = System.nanoTime() - start;
        System.out.printf("  链表状态（8 个碰撞元素） 8 次查找: %.2f μs%n",
                timeBeforeTree / 1000.0);

        // 插入第 9 个 → 触发树化（容量 64 >= 64 且链表长度从 8 变为 9）
        treeMap.put(new CollidingKey(8), "val-8");
        System.out.println("  触发树化：链表长度为 9，容量为 64 → 转换为红黑树");

        // 再插入一些，使树更大
        for (int i = 9; i < 20; i++) {
            treeMap.put(new CollidingKey(i), "val-" + i);
        }

        // 在红黑树状态下测量查找 20 个元素的时间
        start = System.nanoTime();
        for (int i = 0; i < 20; i++) {
            treeMap.get(new CollidingKey(i));
        }
        timeAfterTree = System.nanoTime() - start;
        System.out.printf("  红黑树状态（20 个碰撞元素）20 次查找: %.2f μs%n",
                timeAfterTree / 1000.0);

        int treeSize = getHashMapBucketTreeSize(treeMap);
        System.out.printf("  说明：当冲突严重时，get() 操作从 O(n) 链表遍历降为 O(log n) 红黑树查找，");
        System.out.printf("  这是对恶意的哈希碰撞攻击的重要防御。%n");

        System.out.println("\n================================================");
        System.out.println("  HashMap 查找演示完成");
        System.out.println("================================================");
    }

    /**
     * 黑科技：通过反射读取 HashMap 的 table 字段，观察桶中元素数量和类型
     *
     * 注意：这依赖于 JDK 内部实现，仅供演示学习使用。
     */
    @SuppressWarnings("unchecked")
    private static int getHashMapBucketTreeSize(Map<?, ?> map) {
        try {
            java.lang.reflect.Field tableField = HashMap.class.getDeclaredField("table");
            tableField.setAccessible(true);
            Object[] table = (Object[]) tableField.get(map);
            if (table == null) return 0;

            int treeCount = 0;
            for (int i = 0; i < table.length; i++) {
                if (table[i] != null) {
                    // 检查节点是否是 TreeNode（红黑树节点）
                    String className = table[i].getClass().getName();
                    if (className.contains("TreeNode")) {
                        treeCount++;
                    }
                }
            }
            return treeCount;
        } catch (Exception e) {
            System.out.println("  [反射失败: " + e.getMessage() + "]");
            return -1;
        }
    }
}