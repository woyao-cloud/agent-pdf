"""
demo_linked_list.py — 链表高频面试算法题

配合第15章"面试高频算法题"之 15.1（链表）使用。

演示内容：
  1. 反转链表（Reverse Linked List）
  2. 检测链表环（Linked List Cycle）
  3. 合并有序链表（Merge Sorted Lists）
  4. 寻找链表中间节点（Find Middle）
  5. LRU 缓存（LRU Cache）
"""

from typing import Optional


# ============================================================
# 链表节点定义
# ============================================================

class ListNode:
    def __init__(self, val: int = 0, next: 'ListNode' = None):
        self.val = val
        self.next = next

    def __repr__(self):
        vals = []
        curr = self
        while curr:
            vals.append(str(curr.val))
            curr = curr.next
        return ' -> '.join(vals)


def build_list(vals: list[int]) -> Optional[ListNode]:
    if not vals:
        return None
    head = ListNode(vals[0])
    curr = head
    for v in vals[1:]:
        curr.next = ListNode(v)
        curr = curr.next
    return head


# ============================================================
# 1. 反转链表
# ============================================================

def reverse_list(head: ListNode) -> ListNode:
    prev = None
    curr = head
    while curr:
        next_temp = curr.next
        curr.next = prev
        prev = curr
        curr = next_temp
    return prev


# ============================================================
# 2. 检测链表环（返回环入口，无环返回 None）
# ============================================================

def detect_cycle(head: ListNode) -> Optional[ListNode]:
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow == fast:
            slow = head
            while slow != fast:
                slow = slow.next
                fast = fast.next
            return slow
    return None


# ============================================================
# 3. 合并两个有序链表
# ============================================================

def merge_two_lists(l1: Optional[ListNode], l2: Optional[ListNode]) -> Optional[ListNode]:
    dummy = ListNode(0)
    curr = dummy
    while l1 and l2:
        if l1.val <= l2.val:
            curr.next = l1
            l1 = l1.next
        else:
            curr.next = l2
            l2 = l2.next
        curr = curr.next
    curr.next = l1 or l2
    return dummy.next


# ============================================================
# 4. 寻找链表中间节点
# ============================================================

def middle_node(head: ListNode) -> ListNode:
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    return slow


# ============================================================
# 5. LRU 缓存
# ============================================================

class DLinkedNode:
    def __init__(self, key: int = 0, value: int = 0):
        self.key = key
        self.value = value
        self.prev = None
        self.next = None


class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache = {}
        self.head = DLinkedNode()
        self.tail = DLinkedNode()
        self.head.next = self.tail
        self.tail.prev = self.head

    def _remove_node(self, node: DLinkedNode):
        node.prev.next = node.next
        node.next.prev = node.prev

    def _add_to_head(self, node: DLinkedNode):
        node.prev = self.head
        node.next = self.head.next
        self.head.next.prev = node
        self.head.next = node

    def get(self, key: int) -> int:
        if key not in self.cache:
            return -1
        node = self.cache[key]
        self._remove_node(node)
        self._add_to_head(node)
        return node.value

    def put(self, key: int, value: int):
        if key in self.cache:
            node = self.cache[key]
            node.value = value
            self._remove_node(node)
            self._add_to_head(node)
        else:
            if len(self.cache) >= self.capacity:
                removed = self.tail.prev
                self._remove_node(removed)
                del self.cache[removed.key]
            new_node = DLinkedNode(key, value)
            self.cache[key] = new_node
            self._add_to_head(new_node)


# ============================================================
# 测试
# ============================================================

def _test():
    print("=" * 60)
    print("  链表算法题演示")
    print("=" * 60)

    # ---- 1. 反转链表 ----
    print("\n" + "-" * 60)
    print("  [1] 反转链表")
    head = build_list([1, 2, 3, 4, 5])
    print(f"    原始: {head}")
    rev = reverse_list(head)
    print(f"    反转: {rev}")

    # ---- 2. 检测链表环 ----
    print("\n" + "-" * 60)
    print("  [2] 检测链表环")
    head2 = build_list([3, 2, 0, -4])
    print(f"    无环链表: {head2}")
    entry = detect_cycle(head2)
    print(f"    环入口: {entry}")

    head3 = ListNode(3)
    n2 = ListNode(2)
    n0 = ListNode(0)
    n4 = ListNode(-4)
    head3.next = n2
    n2.next = n0
    n0.next = n4
    n4.next = n2
    entry3 = detect_cycle(head3)
    print(f"    有环链表入口值: {entry3.val}")

    # ---- 3. 合并有序链表 ----
    print("\n" + "-" * 60)
    print("  [3] 合并有序链表")
    l1 = build_list([1, 2, 4])
    l2 = build_list([1, 3, 4])
    merged = merge_two_lists(l1, l2)
    print(f"    l1: {build_list([1, 2, 4])}")
    print(f"    l2: {build_list([1, 3, 4])}")
    print(f"    合并: {merged}")

    # ---- 4. 中间节点 ----
    print("\n" + "-" * 60)
    print("  [4] 寻找中间节点")
    h_odd = build_list([1, 2, 3, 4, 5])
    h_even = build_list([1, 2, 3, 4, 5, 6])
    print(f"    奇数长度 {h_odd} -> 中间: {middle_node(h_odd).val}")
    print(f"    偶数长度 {h_even} -> 中间: {middle_node(h_even).val}")

    # ---- 5. LRU 缓存 ----
    print("\n" + "-" * 60)
    print("  [5] LRU 缓存")
    cache = LRUCache(2)
    cache.put(1, 1)
    cache.put(2, 2)
    print(f"    get(1) = {cache.get(1)}")
    cache.put(3, 3)
    print(f"    put(3,3) 后 get(2) = {cache.get(2)} (应为 -1)")
    cache.put(4, 4)
    print(f"    put(4,4) 后 get(1) = {cache.get(1)} (应为 -1)")
    print(f"    get(3) = {cache.get(3)}")
    print(f"    get(4) = {cache.get(4)}")

    print("\n" + "=" * 60)
    print("  演示完成!")
    print("=" * 60)


if __name__ == '__main__':
    _test()