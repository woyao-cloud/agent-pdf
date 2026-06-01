# 第18章 查找算法

## 18.1 线性查找与二分查找

### 解决的问题

查找是计算机中最基本的操作之一。线性查找适用于无序数据，二分查找适用于有序数据。

> **核心价值**：二分查找是O(log n)查找的基础，也是理解分治思想的最佳入门。

### 实现原理

二分查找的前提：**数组必须有序**。每次将查找范围缩小一半。

```
有序数组 [1, 3, 5, 7, 9, 11, 13]
查找 7：
范围：[0, 6] mid=3 → arr[3]=7 ✓
只需1次比较（线性查找需要4次）
```

### 代码实现

```java
/**
 * 二分查找各类变体
 */
public class BinarySearch {
    
    // 标准二分查找
    public int binarySearch(int[] arr, int target) {
        int left = 0, right = arr.length - 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (arr[mid] == target) return mid;
            if (arr[mid] < target) left = mid + 1;
            else right = mid - 1;
        }
        return -1;
    }
    
    // 查找第一个等于target的位置
    public int findFirst(int[] arr, int target) {
        int left = 0, right = arr.length - 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (arr[mid] >= target) right = mid - 1;
            else left = mid + 1;
        }
        return left < arr.length && arr[left] == target ? left : -1;
    }
    
    // 查找最后一个等于target的位置
    public int findLast(int[] arr, int target) {
        int left = 0, right = arr.length - 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (arr[mid] <= target) left = mid + 1;
            else right = mid - 1;
        }
        return right >= 0 && arr[right] == target ? right : -1;
    }
    
    // 查找第一个大于等于target的位置
    public int findFirstGreaterOrEqual(int[] arr, int target) {
        int left = 0, right = arr.length - 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (arr[mid] >= target) right = mid - 1;
            else left = mid + 1;
        }
        return left < arr.length ? left : -1;
    }
    
    // 查找最后一个小于等于target的位置
    public int findLastLessOrEqual(int[] arr, int target) {
        int left = 0, right = arr.length - 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (arr[mid] <= target) left = mid + 1;
            else right = mid - 1;
        }
        return right;
    }
}
```

---

## 18.2 手写二分查找各类变体

### 旋转数组的二分查找

```java
/**
 * 旋转排序数组的二分查找
 */
public class RotatedArraySearch {
    
    // 旋转数组（如[4,5,6,7,0,1,2]）中查找
    public int search(int[] nums, int target) {
        int left = 0, right = nums.length - 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (nums[mid] == target) return mid;
            
            // 左半部分有序
            if (nums[left] <= nums[mid]) {
                if (target >= nums[left] && target < nums[mid]) {
                    right = mid - 1;
                } else {
                    left = mid + 1;
                }
            } else {  // 右半部分有序
                if (target > nums[mid] && target <= nums[right]) {
                    left = mid + 1;
                } else {
                    right = mid - 1;
                }
            }
        }
        return -1;
    }
}
```

---

## 18.3 JDK源码解析（binarySearch）

```java
// Arrays.binarySearch() 源码要点：
// 1. 传入任意范围和key
// 2. 使用类似 mid = (low + high) >>> 1 防止溢出
// 3. 未找到时返回 -(insertionPoint) - 1
// 4. 支持泛型和自定义Comparator

// Collections.binarySearch() 内部调用Arrays.binarySearch()
```

---

## 18.4 使用场景与风险分析

### 潜在风险与问题

- **数组必须有序**：二分查找的前提
- **整数溢出**：`(left + right) / 2` 可能溢出，应使用 `left + (right - left) / 2`
- **插入点的理解**：返回值(-insertionPoint-1)的含义

### 典型问题处理

**面试题：二分查找的高阶应用**

- 旋转数组查找
- 二维矩阵查找
- 寻找峰值（局部最大值）
- 寻找两个有序数组的中位数

---

> **本章总结**：二分查找是O(log n)查找的基础。理解标准二分查找的各种变体（找第一个、最后一个、边界查找）对解决算法问题至关重要。旋转数组的二分查找是高频面试题，展现了对二分查找的深入理解。