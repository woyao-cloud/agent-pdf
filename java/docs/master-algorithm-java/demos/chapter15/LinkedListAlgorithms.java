package masteralgo.chapter15;

import java.util.*;

/**
 * 面试高频链表算法题演示
 *
 * 包含：
 * 1. 反转链表（迭代 + 递归）
 * 2. 检测链表环（Floyd 快慢指针）
 * 3. 寻找链表中点
 * 4. 合并两个有序链表
 * 5. LRU 缓存（HashMap + 双向链表）
 */
public class LinkedListAlgorithms {

    // ============================================================
    //  ListNode
    // ============================================================
    static class ListNode {
        int val;
        ListNode next;
        ListNode(int val) { this.val = val; }
        ListNode(int val, ListNode next) { this.val = val; this.next = next; }
    }

    // ============================================================
    //  1. 反转链表 - 迭代
    // ============================================================
    static ListNode reverseListIterative(ListNode head) {
        ListNode prev = null, curr = head;
        while (curr != null) {
            ListNode next = curr.next;
            curr.next = prev;
            prev = curr;
            curr = next;
        }
        return prev;
    }

    // ============================================================
    //  2. 反转链表 - 递归
    // ============================================================
    static ListNode reverseListRecursive(ListNode head) {
        if (head == null || head.next == null) return head;
        ListNode newHead = reverseListRecursive(head.next);
        head.next.next = head;
        head.next = null;
        return newHead;
    }

    // ============================================================
    //  3. 检测链表环（Floyd 算法），返回环入口
    // ============================================================
    static ListNode detectCycle(ListNode head) {
        ListNode slow = head, fast = head;
        while (fast != null && fast.next != null) {
            slow = slow.next;
            fast = fast.next.next;
            if (slow == fast) {
                slow = head;
                while (slow != fast) {
                    slow = slow.next;
                    fast = fast.next;
                }
                return slow;
            }
        }
        return null;
    }

    // ============================================================
    //  4. 寻找链表中点（偶数返回第二个中点）
    // ============================================================
    static ListNode findMiddle(ListNode head) {
        ListNode slow = head, fast = head;
        while (fast != null && fast.next != null) {
            slow = slow.next;
            fast = fast.next.next;
        }
        return slow;
    }

    // ============================================================
    //  5. 合并两个有序链表 - 迭代
    // ============================================================
    static ListNode mergeTwoLists(ListNode l1, ListNode l2) {
        ListNode dummy = new ListNode(-1), curr = dummy;
        while (l1 != null && l2 != null) {
            if (l1.val <= l2.val) {
                curr.next = l1;
                l1 = l1.next;
            } else {
                curr.next = l2;
                l2 = l2.next;
            }
                curr = curr.next;
        }
        curr.next = (l1 != null) ? l1 : l2;
        return dummy.next;
    }

    // ============================================================
    //  6. LRU 缓存
    // ============================================================
    static class LRUCache {
        private final int capacity;
        private final Map<Integer, DLinkedNode> map;
        private final DLinkedNode head, tail; // 虚拟头尾

        static class DLinkedNode {
            int key, value;
            DLinkedNode prev, next;
            DLinkedNode() {}
            DLinkedNode(int key, int value) { this.key = key; this.value = value; }
        }

        LRUCache(int capacity) {
            this.capacity = capacity;
            this.map = new HashMap<>();
            this.head = new DLinkedNode(); // 虚拟头
            this.tail = new DLinkedNode(); // 虚拟尾
            head.next = tail;
            tail.prev = head;
        }

        int get(int key) {
            DLinkedNode node = map.get(key);
            if (node == null) return -1;
            moveToHead(node);
            return node.value;
        }

        void put(int key, int value) {
            DLinkedNode node = map.get(key);
            if (node != null) {
                node.value = value;
                moveToHead(node);
                return;
            }
            if (map.size() == capacity) {
                DLinkedNode removed = removeTail();
                map.remove(removed.key);
            }
            DLinkedNode newNode = new DLinkedNode(key, value);
            map.put(key, newNode);
            addToHead(newNode);
        }

        private void addToHead(DLinkedNode node) {
            node.prev = head;
            node.next = head.next;
            head.next.prev = node;
            head.next = node;
        }

        private void removeNode(DLinkedNode node) {
            node.prev.next = node.next;
            node.next.prev = node.prev;
        }

        private void moveToHead(DLinkedNode node) {
            removeNode(node);
            addToHead(node);
        }

        private DLinkedNode removeTail() {
            DLinkedNode node = tail.prev;
            removeNode(node);
            return node;
        }
    }

    // ============================================================
    //  辅助方法
    // ============================================================
    static ListNode buildList(int... vals) {
        ListNode dummy = new ListNode(-1), curr = dummy;
        for (int v : vals) curr = curr.next = new ListNode(v);
        return dummy.next;
    }

    static List<Integer> toList(ListNode head) {
        List<Integer> res = new ArrayList<>();
        while (head != null) { res.add(head.val); head = head.next; }
        return res;
    }

    static boolean hasCycle(ListNode head) {
        return detectCycle(head) != null;
    }

    // ============================================================
    //  主方法测试
    // ============================================================
    public static void main(String[] args) {
        System.out.println("==========================================");
        System.out.println("  链表算法题演示");
        System.out.println("==========================================");

        // ---------- 反转链表 ----------
        System.out.println("\n--- 反转链表 ---");
        ListNode list = buildList(1, 2, 3, 4, 5);
        System.out.println("  原始: " + toList(list));
        ListNode revIter = reverseListIterative(list);
        System.out.println("  迭代反转: " + toList(revIter));
        ListNode revRecur = reverseListRecursive(revIter);
        System.out.println("  递归反转: " + toList(revRecur));
        assert toList(revRecur).equals(Arrays.asList(1, 2, 3, 4, 5)) : "反转后应恢复原序";

        // ---------- 链表环检测 ----------
        System.out.println("\n--- 环检测 ---");
        ListNode noCycle = buildList(1, 2, 3, 4, 5);
        System.out.println("  无环链表: hasCycle = " + hasCycle(noCycle));
        assert !hasCycle(noCycle) : "无环链表应返回 false";

        ListNode cycleList = buildList(1, 2, 3, 4, 5);
        // 制造环：5 指向 3
        ListNode third = cycleList.next.next;
        ListNode fifth = third.next.next;
        fifth.next = third;
        System.out.println("  有环链表: hasCycle = " + hasCycle(cycleList));
        assert hasCycle(cycleList) : "有环链表应返回 true";
        ListNode entry = detectCycle(cycleList);
        System.out.println("  环入口值: " + entry.val);
        assert entry.val == 3 : "环入口应为 3";

        // ---------- 链表中点 ----------
        System.out.println("\n--- 链表中点 ---");
        ListNode odd = buildList(1, 2, 3, 4, 5);
        System.out.println("  奇数长度中点: " + findMiddle(odd).val);
        assert findMiddle(odd).val == 3;

        ListNode even = buildList(1, 2, 3, 4);
        System.out.println("  偶数长度中点: " + findMiddle(even).val);
        assert findMiddle(even).val == 3;

        // ---------- 合并有序链表 ----------
        System.out.println("\n--- 合并有序链表 ---");
        ListNode l1 = buildList(1, 3, 5, 7);
        ListNode l2 = buildList(2, 4, 6, 8);
        ListNode merged = mergeTwoLists(l1, l2);
        System.out.println("  合并结果: " + toList(merged));
        assert toList(merged).equals(Arrays.asList(1, 2, 3, 4, 5, 6, 7, 8));

        // ---------- LRU 缓存 ----------
        System.out.println("\n--- LRU 缓存 ---");
        LRUCache cache = new LRUCache(3);
        cache.put(1, 10);
        cache.put(2, 20);
        cache.put(3, 30);
        System.out.println("  插入 1,2,3 后 get(1) = " + cache.get(1)); // 10
        assert cache.get(1) == 10;
        cache.put(4, 40); // 淘汰 key 2
        System.out.println("  插入 4 后 get(2) = " + cache.get(2) + " (应被淘汰)");
        assert cache.get(2) == -1;
        System.out.println("  get(3) = " + cache.get(3) + ", get(4) = " + cache.get(4));
        assert cache.get(3) == 30;
        assert cache.get(4) == 40;
        cache.put(2, 200);
        System.out.println("  重新插入 2 后 get(2) = " + cache.get(2));

        System.out.println("\n==========================================");
        System.out.println("  所有测试通过");
        System.out.println("==========================================");
    }
}