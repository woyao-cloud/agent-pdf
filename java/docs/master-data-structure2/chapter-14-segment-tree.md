# 第14章 线段树

## 14.1 线段树原理与实现

### 解决的问题

线段树（Segment Tree）解决的是**区间查询**和**区间更新**的问题。对于数组的区间求和、区间最值等操作，线段树可以在O(log n)时间内完成。

> **核心价值**：线段树是实现区间动态查询和更新的标准数据结构，在需要频繁区间操作的场景下不可替代。

### 实现原理

线段树是一种二叉树，每个节点代表一个区间。根节点代表整个数组，叶节点代表单个元素。

```
数组：[1, 2, 3, 4, 5]

线段树（区间和）：
          [0-4]:15
         /        \
    [0-2]:6     [3-4]:9
    /     \      /    \
[0-1]:3 [2]:3 [3]:4 [4]:5
/    \
[0]:1 [1]:2
```

**核心操作**：
- **构建**：递归将区间一分为二，合并子区间结果
- **查询**：递归查找，完全覆盖时直接返回，否则继续拆分
- **更新**：递归更新，更新后重新计算父节点

### 代码实现

```java
/**
 * 线段树（区间和）
 */
public class SegmentTree {
    private int[] tree;  // 线段树数组
    private int[] lazy;  // 懒标记（延迟更新）
    private int n;
    
    public SegmentTree(int[] nums) {
        n = nums.length;
        tree = new int[4 * n];   // 4倍空间
        lazy = new int[4 * n];
        build(nums, 0, 0, n - 1);
    }
    
    // 构建树
    private void build(int[] nums, int node, int start, int end) {
        if (start == end) {
            tree[node] = nums[start];
            return;
        }
        int mid = start + (end - start) / 2;
        build(nums, node * 2 + 1, start, mid);
        build(nums, node * 2 + 2, mid + 1, end);
        tree[node] = tree[node * 2 + 1] + tree[node * 2 + 2];
    }
    
    // 区间查询
    public int query(int l, int r) {
        return query(0, 0, n - 1, l, r);
    }
    
    private int query(int node, int start, int end, int l, int r) {
        if (l > end || r < start) return 0;
        if (l <= start && end <= r) return tree[node];
        
        pushDown(node, start, end);
        int mid = start + (end - start) / 2;
        int leftSum = query(node * 2 + 1, start, mid, l, r);
        int rightSum = query(node * 2 + 2, mid + 1, end, l, r);
        return leftSum + rightSum;
    }
    
    // 单点更新
    public void update(int index, int val) {
        update(0, 0, n - 1, index, val);
    }
    
    private void update(int node, int start, int end, int idx, int val) {
        if (start == end) {
            tree[node] = val;
            return;
        }
        int mid = start + (end - start) / 2;
        if (idx <= mid) {
            update(node * 2 + 1, start, mid, idx, val);
        } else {
            update(node * 2 + 2, mid + 1, end, idx, val);
        }
        tree[node] = tree[node * 2 + 1] + tree[node * 2 + 2];
    }
    
    // 区间更新（带懒标记）
    public void rangeUpdate(int l, int r, int val) {
        rangeUpdate(0, 0, n - 1, l, r, val);
    }
    
    private void rangeUpdate(int node, int start, int end, int l, int r, int val) {
        if (l > end || r < start) return;
        if (l <= start && end <= r) {
            tree[node] += val * (end - start + 1);
            lazy[node] += val;  // 标记延迟更新
            return;
        }
        
        pushDown(node, start, end);
        int mid = start + (end - start) / 2;
        rangeUpdate(node * 2 + 1, start, mid, l, r, val);
        rangeUpdate(node * 2 + 2, mid + 1, end, l, r, val);
        tree[node] = tree[node * 2 + 1] + tree[node * 2 + 2];
    }
    
    // 下推懒标记
    private void pushDown(int node, int start, int end) {
        if (lazy[node] != 0) {
            int mid = start + (end - start) / 2;
            int left = node * 2 + 1;
            int right = node * 2 + 2;
            
            tree[left] += lazy[node] * (mid - start + 1);
            tree[right] += lazy[node] * (end - mid);
            lazy[left] += lazy[node];
            lazy[right] += lazy[node];
            lazy[node] = 0;
        }
    }
    
    public static void main(String[] args) {
        int[] nums = {1, 3, 5, 7, 9, 11};
        SegmentTree seg = new SegmentTree(nums);
        
        System.out.println("区间[1,3]和: " + seg.query(1, 3));  // 15
        seg.update(2, 10);
        System.out.println("更新后区间[1,3]和: " + seg.query(1, 3));  // 20
    }
}
```

### 使用场景

- **区间求和**：动态数组的区间和查询
- **区间最值**：区间最大值/最小值
- **区间更新**：批量修改区间内元素的值
- **扫描线算法**：矩形面积、周长

### 潜在风险与问题

- **空间消耗大**：需要4倍原数组空间
- **实现复杂**：节点索引计算容易出错
- **常数较大**：虽然O(log n)，但常数比树状数组大

### 优化策略

- 使用动态开点线段树（节点按需创建）
- 使用树状数组替代（如果只需求区间和）
- 使用ZKW线段树（非递归，速度更快）

### 典型问题处理

**面试题：线段树和树状数组的区别？**

| 特性 | 线段树 | 树状数组 |
|------|--------|---------|
| 支持操作 | 区间查询+区间更新 | 前缀和+单点更新 |
| 实现复杂度 | 较复杂 | 简单 |
| 空间 | 4n | n |
| 速度 | 较慢（常数大） | 快 |
| 通用性 | 支持各种区间操作 | 仅支持可逆操作 |

---

## 14.2 手写线段树实现

### 带范围更新的完整实现

```java
/**
 * 线段树 - 支持区间加法和区间求和
 */
public class RangeSegmentTree {
    private long[] sum;   // 区间和
    private long[] lazy;  // 懒标记
    private int n;
    
    public RangeSegmentTree(int[] nums) {
        this.n = nums.length;
        sum = new long[4 * n];
        lazy = new long[4 * n];
        build(nums, 1, 1, n);
    }
    
    // 1-indexed 构建
    private void build(int[] nums, int node, int l, int r) {
        if (l == r) {
            sum[node] = nums[l - 1];
            return;
        }
        int mid = (l + r) >> 1;
        build(nums, node << 1, l, mid);
        build(nums, node << 1 | 1, mid + 1, r);
        pushUp(node);
    }
    
    private void pushUp(int node) {
        sum[node] = sum[node << 1] + sum[node << 1 | 1];
    }
    
    private void pushDown(int node, int l, int r) {
        if (lazy[node] != 0) {
            int mid = (l + r) >> 1;
            int left = node << 1;
            int right = node << 1 | 1;
            
            sum[left] += lazy[node] * (mid - l + 1);
            sum[right] += lazy[node] * (r - mid);
            lazy[left] += lazy[node];
            lazy[right] += lazy[node];
            lazy[node] = 0;
        }
    }
    
    // 区间加法
    public void add(int L, int R, int val) {
        add(1, 1, n, L, R, val);
    }
    
    private void add(int node, int l, int r, int L, int R, int val) {
        if (L <= l && r <= R) {
            sum[node] += (long) val * (r - l + 1);
            lazy[node] += val;
            return;
        }
        pushDown(node, l, r);
        int mid = (l + r) >> 1;
        if (L <= mid) add(node << 1, l, mid, L, R, val);
        if (R > mid) add(node << 1 | 1, mid + 1, r, L, R, val);
        pushUp(node);
    }
    
    // 区间求和
    public long query(int L, int R) {
        return query(1, 1, n, L, R);
    }
    
    private long query(int node, int l, int r, int L, int R) {
        if (L <= l && r <= R) return sum[node];
        pushDown(node, l, r);
        int mid = (l + r) >> 1;
        long res = 0;
        if (L <= mid) res += query(node << 1, l, mid, L, R);
        if (R > mid) res += query(node << 1 | 1, mid + 1, r, L, R);
        return res;
    }
}
```

---

## 14.3 使用场景与风险分析

### 典型问题处理

**问题：区间和查询与更新的高性能实现**

- 数据量大且只求区间和 → 树状数组（更快、更省空间）
- 需要区间最大值/最小值 → 线段树
- 需要区间更新+区间查询 → 线段树+懒标记
- 离散化处理：当数据范围很大但实际值很少时，先离散化再建树

---

> **本章总结**：线段树以O(log n)的复杂度解决区间查询和更新问题。懒标记（Lazy Propagation）是线段树的核心优化，将区间更新的复杂度从O(n)降低到O(log n)。线段树适用于各种区间统计问题，包括区间和、区间最值、区间最大子段和等。对于简单的区间和问题，树状数组是更轻量的替代方案。