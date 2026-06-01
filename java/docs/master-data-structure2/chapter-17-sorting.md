# 第17章 排序算法

## 17.1 常见排序算法对比

### 解决的问题

排序是最基础也是最常用的算法之一。理解各种排序算法的原理、性能和适用场景，是每个开发者必备的能力。

> **核心价值**：排序算法是学习算法分析的入门，也是面试中的常考内容。

### 实现原理

**排序算法概览**：

| 算法 | 平均 | 最好 | 最坏 | 空间 | 稳定 | 场景 |
|------|------|------|------|------|------|------|
| 冒泡排序 | O(n²) | O(n) | O(n²) | O(1) | ✓ | 教学 |
| 选择排序 | O(n²) | O(n²) | O(n²) | O(1) | ✗ | 教学 |
| 插入排序 | O(n²) | O(n) | O(n²) | O(1) | ✓ | 基本有序 |
| 希尔排序 | O(n^1.3) | O(n) | O(n²) | O(1) | ✗ | 中等规模 |
| 归并排序 | O(n log n) | O(n log n) | O(n log n) | O(n) | ✓ | 稳定排序需求 |
| 快速排序 | O(n log n) | O(n log n) | O(n²) | O(log n) | ✗ | 通用排序 |
| 堆排序 | O(n log n) | O(n log n) | O(n log n) | O(1) | ✗ | 最坏情况保证 |
| 计数排序 | O(n+k) | O(n+k) | O(n+k) | O(k) | ✓ | 范围小 |
| 桶排序 | O(n) | O(n) | O(n²) | O(n) | ✓ | 分布均匀 |
| 基数排序 | O(dn) | O(dn) | O(dn) | O(n) | ✓ | 定长整数 |

---

## 17.2 手写各类排序实现

### O(n²)排序

```java
/**
 * O(n²) 排序算法
 */
public class BasicSorts {
    
    // 冒泡排序
    public void bubbleSort(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n - 1; i++) {
            boolean swapped = false;
            for (int j = 0; j < n - 1 - i; j++) {
                if (arr[j] > arr[j + 1]) {
                    swap(arr, j, j + 1);
                    swapped = true;
                }
            }
            if (!swapped) break;  // 优化：已有序则提前终止
        }
    }
    
    // 选择排序
    public void selectionSort(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n - 1; i++) {
            int minIdx = i;
            for (int j = i + 1; j < n; j++) {
                if (arr[j] < arr[minIdx]) minIdx = j;
            }
            swap(arr, i, minIdx);
        }
    }
    
    // 插入排序
    public void insertionSort(int[] arr) {
        int n = arr.length;
        for (int i = 1; i < n; i++) {
            int key = arr[i];
            int j = i - 1;
            while (j >= 0 && arr[j] > key) {
                arr[j + 1] = arr[j];
                j--;
            }
            arr[j + 1] = key;
        }
    }
    
    private void swap(int[] arr, int i, int j) {
        int temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
}
```

### O(n log n)排序

```java
/**
 * 高级排序算法
 */
public class AdvancedSorts {
    
    // ========== 快速排序 ==========
    public void quickSort(int[] arr) {
        quickSort(arr, 0, arr.length - 1);
    }
    
    private void quickSort(int[] arr, int left, int right) {
        if (left >= right) return;
        int pivot = partition(arr, left, right);
        quickSort(arr, left, pivot - 1);
        quickSort(arr, pivot + 1, right);
    }
    
    private int partition(int[] arr, int left, int right) {
        // 三数取中法选择pivot，避免有序数组退化
        int mid = left + (right - left) / 2;
        if (arr[mid] < arr[left]) swap(arr, left, mid);
        if (arr[right] < arr[left]) swap(arr, left, right);
        if (arr[right] < arr[mid]) swap(arr, mid, right);
        swap(arr, mid, right - 1);
        
        int pivot = arr[right - 1];
        int i = left, j = right - 1;
        
        while (true) {
            while (arr[++i] < pivot) {}
            while (arr[--j] > pivot) {}
            if (i >= j) break;
            swap(arr, i, j);
        }
        swap(arr, i, right - 1);
        return i;
    }
    
    // ========== 归并排序 ==========
    public void mergeSort(int[] arr) {
        mergeSort(arr, 0, arr.length - 1, new int[arr.length]);
    }
    
    private void mergeSort(int[] arr, int left, int right, int[] temp) {
        if (left >= right) return;
        int mid = left + (right - left) / 2;
        mergeSort(arr, left, mid, temp);
        mergeSort(arr, mid + 1, right, temp);
        merge(arr, left, mid, right, temp);
    }
    
    private void merge(int[] arr, int left, int mid, int right, int[] temp) {
        System.arraycopy(arr, left, temp, left, right - left + 1);
        int i = left, j = mid + 1, k = left;
        while (i <= mid && j <= right) {
            arr[k++] = temp[i] <= temp[j] ? temp[i++] : temp[j++];
        }
        while (i <= mid) arr[k++] = temp[i++];
        while (j <= right) arr[k++] = temp[j++];
    }
    
    private void swap(int[] arr, int i, int j) {
        int temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
}
```

### 线性排序

```java
/**
 * 线性时间排序
 */
public class LinearSorts {
    
    // 计数排序
    public void countingSort(int[] arr) {
        int max = Arrays.stream(arr).max().getAsInt();
        int min = Arrays.stream(arr).min().getAsInt();
        int range = max - min + 1;
        
        int[] count = new int[range];
        for (int num : arr) count[num - min]++;
        
        for (int i = 1; i < range; i++) count[i] += count[i - 1];
        
        int[] output = new int[arr.length];
        for (int i = arr.length - 1; i >= 0; i--) {
            output[count[arr[i] - min] - 1] = arr[i];
            count[arr[i] - min]--;
        }
        System.arraycopy(output, 0, arr, 0, arr.length);
    }
    
    // 桶排序
    public void bucketSort(float[] arr) {
        int n = arr.length;
        @SuppressWarnings("unchecked")
        List<Float>[] buckets = new ArrayList[n];
        for (int i = 0; i < n; i++) buckets[i] = new ArrayList<>();
        
        for (float num : arr) {
            int idx = (int)(num * n);
            buckets[idx].add(num);
        }
        
        for (List<Float> bucket : buckets) Collections.sort(bucket);
        
        int idx = 0;
        for (List<Float> bucket : buckets) {
            for (float num : bucket) arr[idx++] = num;
        }
    }
}
```

---

## 17.3 JDK源码解析（Arrays.sort/Collections.sort）

### Dual-Pivot QuickSort

JDK 7+ 的 `Arrays.sort()` 对基本类型使用 **Dual-Pivot QuickSort**（双轴快速排序）。它选择两个pivot，将数组分为三部分，比传统单轴快排效率更高。

### TimSort

`Collections.sort()` 和 `Arrays.sort(Object[])` 使用 **TimSort**——一种结合了归并排序和插入排序的稳定排序算法。

```java
// TimSort特点：
// 1. 利用数组中的"自然有序"序列（run）
// 2. 小片段使用插入排序
// 3. 大片段使用归并排序
// 4. 稳定、O(n log n)
```

---

## 17.4 排序算法选择策略

| 条件 | 推荐算法 |
|------|---------|
| 数据量很小 | 插入排序 |
| 基本有序 | 插入排序 |
| 对稳定性有要求 | 归并排序 |
| 通用场景 | 快速排序 |
| 必须最坏情况O(n log n) | 堆排序 |
| 数据范围小 | 计数排序 |
| 分布均匀的小数 | 桶排序 |

---

> **本章总结**：排序算法是算法分析的入门。快速排序是实际应用中最常用的通用排序算法。JDK对基本类型和对象类型分别使用了Dual-Pivot QuickSort和TimSort。选择合适的排序算法需要考虑数据量、有序程度、是否要求稳定性和内存限制等因素。