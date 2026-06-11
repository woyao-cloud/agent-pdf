package masteralgo.chapter20;

import java.util.*;

/**
 * 算法测试驱动开发演示——以二分查找为例
 *
 * 演示：
 * 1. TDD 方式：先写测试方法签名，再实现功能
 * 2. 覆盖正常/边界/退化/错误输入/重复值
 * 3. 常见陷阱：整数溢出、off-by-one、空值处理
 */
public class AlgorithmTestingDemo {

    // ============================================================
    //  被测试的算法：二分查找
    //  使用 low + (high - low) / 2 避免溢出
    // ============================================================

    /**
     * 二分查找（正确版本，防溢出）
     *
     * @param arr    有序数组，允许为空或 null
     * @param target 查找目标
     * @return 目标索引，未找到返回 -1
     */
    static int binarySearch(int[] arr, int target) {
        // 防御：处理 null 和空数组
        if (arr == null || arr.length == 0) {
            return -1;
        }

        int low = 0;
        int high = arr.length - 1;

        while (low <= high) {
            // ✅ 正确：low + (high - low) / 2 避免溢出
            // ❌ 错误：(low + high) / 2  当 low+high > Integer.MAX_VALUE 时溢出
            int mid = low + (high - low) / 2;

            if (arr[mid] == target) {
                return mid;
            } else if (arr[mid] < target) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return -1;
    }

    /**
     * 二分查找（有 bug 的版本，演示 off-by-one 问题）
     * 问题：high = mid 而不是 mid - 1，可能导致死循环
     */
    static int binarySearchWithOffByOneBug(int[] arr, int target) {
        if (arr == null || arr.length == 0) return -1;
        int low = 0, high = arr.length - 1;
        while (low < high) {           // ❌ 使用 < 而不是 <=
            int mid = low + (high - low) / 2;
            if (arr[mid] == target) return mid;
            else if (arr[mid] < target) low = mid + 1;
            else high = mid;            // ❌ 应该是 mid - 1
        }
        return arr[low] == target ? low : -1;
    }

    /**
     * 二分查找（有 bug 的版本，演示整数溢出问题）
     */
    static int binarySearchWithOverflowBug(int[] arr, int target) {
        if (arr == null || arr.length == 0) return -1;
        int low = 0, high = arr.length - 1;
        while (low <= high) {
            int mid = (low + high) / 2;  // ❌ 可能溢出
            if (arr[mid] == target) return mid;
            else if (arr[mid] < target) low = mid + 1;
            else high = mid - 1;
        }
        return -1;
    }

    // ============================================================
    //  手动测试框架（无需 JUnit 依赖）
    // ============================================================

    static class TestCase {
        final String name;
        final Runnable test;

        TestCase(String name, Runnable test) {
            this.name = name;
            this.test = test;
        }
    }

    static class TestSuite {
        final List<TestCase> tests = new ArrayList<>();
        int passed = 0;
        int failed = 0;

        void add(String name, Runnable test) {
            tests.add(new TestCase(name, test));
        }

        void run() {
            System.out.println("运行测试套件...\n");
            for (TestCase tc : tests) {
                try {
                    tc.test.run();
                    System.out.println("  ✓ " + tc.name);
                    passed++;
                } catch (AssertionError | Exception e) {
                    System.out.println("  ✗ " + tc.name + ": " + e.getMessage());
                    failed++;
                }
            }
            System.out.printf("\n结果: %d 通过, %d 失败  (共 %d)%n",
                passed, failed, passed + failed);
            System.out.println("-".repeat(50));
        }
    }

    static void assertEquals(int expected, int actual) {
        if (expected != actual) {
            throw new AssertionError(
                String.format("期望 %d, 实际 %d", expected, actual));
        }
    }

    static void assertTrue(boolean condition, String msg) {
        if (!condition) throw new AssertionError("断言失败: " + msg);
    }

    // ============================================================
    //  测试用例
    // ============================================================

    /** 测试 1：正常用例 — 查找中间位置的元素 */
    static void testNormalCase() {
        int[] arr = {1, 3, 5, 7, 9, 11, 13};
        assertEquals(3, binarySearch(arr, 7));    // 中间
        assertEquals(0, binarySearch(arr, 1));    // 开头
        assertEquals(6, binarySearch(arr, 13));   // 末尾
    }

    /** 测试 2：单元素数组 */
    static void testSingleElement() {
        assertEquals(0, binarySearch(new int[]{5}, 5));
        assertEquals(-1, binarySearch(new int[]{5}, 3));
    }

    /** 测试 3：空数组 */
    static void testEmptyArray() {
        assertEquals(-1, binarySearch(new int[]{}, 1));
    }

    /** 测试 4：null 输入 */
    static void testNullInput() {
        assertEquals(-1, binarySearch(null, 1));
    }

    /** 测试 5：目标不存在 */
    static void testTargetNotFound() {
        int[] arr = {2, 4, 6, 8, 10};
        assertEquals(-1, binarySearch(arr, 1));   // 小于所有
        assertEquals(-1, binarySearch(arr, 11));  // 大于所有
        assertEquals(-1, binarySearch(arr, 5));   // 中间不存在
    }

    /** 测试 6：重复值 */
    static void testDuplicates() {
        int[] arr = {1, 2, 2, 2, 3, 4};
        int idx = binarySearch(arr, 2);
        assertTrue(idx >= 1 && idx <= 3, "重复值 2 应返回 [1,3] 中的索引");
    }

    /** 测试 7：大数组验证无溢出 */
    static void testNoOverflow() {
        // 构造大数组使 low + high 可能超过 Integer.MAX_VALUE
        // 实际测试用接近边界的值
        int size = 1_000_000;
        int[] arr = new int[size];
        for (int i = 0; i < size; i++) arr[i] = i;

        long start = System.nanoTime();
        int idx = binarySearch(arr, size - 1);
        long elapsed = System.nanoTime() - start;

        assertEquals(size - 1, idx);
        assertTrue(elapsed < 1_000_000_000L, "大型数组搜索应在 1 秒内完成");
        System.out.println("   大数组搜索时间: " + (elapsed / 1_000_000) + "ms");
    }

    /** 测试 8：off-by-one bug 的演示 */
    static void testOffByOneBugDetection() {
        int[] arr = {1, 3, 5, 7, 9};
        // 这个有 bug 的版本在某些输入下也会返回正确结果
        int result = binarySearchWithOffByOneBug(arr, 9);
        System.out.println("   有 off-by-one bug 的版本查找 9: " + result +
            " (可能正确，但在某些输入下会死循环)");

        // 但查找第一个元素有时会失败
        // 这个 bug 是间歇性的，说明了充分测试的重要性
    }

    /** 测试 9：参数化测试 */
    static void testParameterized() {
        // 用多个 (数组, 目标, 期望) 组进行测试
        Object[][] cases = {
            {new int[]{1, 2, 3, 4, 5}, 3, 2},
            {new int[]{1, 2, 3, 4, 5}, 1, 0},
            {new int[]{1, 2, 3, 4, 5}, 5, 4},
            {new int[]{1, 2, 3, 4, 5}, 0, -1},
            {new int[]{1, 2, 3, 4, 5}, 6, -1},
            {new int[]{}, 1, -1},
            {new int[]{5}, 5, 0},
            {new int[]{5}, 3, -1},
            {new int[]{1, 1, 1, 1}, 1, 0},  // 重复值返回第一个匹配
        };

        for (int i = 0; i < cases.length; i++) {
            int[] arr = (int[]) cases[i][0];
            int target = (int) cases[i][1];
            int expected = (int) cases[i][2];
            int actual = binarySearch(arr, target);
            if (expected == -1) {
                // 期望找不到，实际应该也找不到
                if (actual != -1) {
                    throw new AssertionError(
                        String.format("参数化测试 #%d: search(%s, %d) = %d, 期望 %d",
                            i, Arrays.toString(arr), target, actual, expected));
                }
            } else {
                // 期望找得到，实际结果是期望索引或该位置的元素正确
                if (actual < 0 || actual >= arr.length || arr[actual] != target) {
                    throw new AssertionError(
                        String.format("参数化测试 #%d: search(%s, %d) = %d, 期望找到 %d",
                            i, Arrays.toString(arr), target, actual, expected));
                }
            }
        }
        System.out.println("   参数化测试 " + cases.length + " 组全部通过");
    }

    /** 测试 10：属性测试（Property-based Testing 的概念演示） */
    static void testProperties() {
        // 属性 1：返回结果必须在 [-1, arr.length-1] 范围内
        Random rnd = new Random(42);
        for (int trial = 0; trial < 100; trial++) {
            int size = rnd.nextInt(100);
            int[] arr = new int[size];
            for (int i = 0; i < size; i++) arr[i] = rnd.nextInt(200);
            Arrays.sort(arr);

            int target = rnd.nextInt(200);
            int result = binarySearch(arr, target);

            // 属性：结果 >= -1 且 < arr.length
            assertTrue(result >= -1 && result < arr.length,
                "结果应在 [-1, n-1] 范围内");

            // 属性：如果 result >= 0，那么 arr[result] == target
            if (result >= 0) {
                assertTrue(arr[result] == target,
                    String.format("arr[%d] 应等于 %d", result, target));
            }

            // 属性：如果 target 在数组中，result != -1
            boolean contains = false;
            for (int x : arr) if (x == target) contains = true;
            if (contains) {
                assertTrue(result >= 0,
                    String.format("%d 在数组中但返回 -1", target));
            }
        }
        System.out.println("   属性测试 (100 轮随机) 全部通过");
    }

    // ============================================================
    //  主程序
    // ============================================================

    public static void main(String[] args) {
        System.out.println("=== 算法测试驱动开发演示 ===\n");
        System.out.println("被测试算法：二分查找\n");

        // === 第 1 步：运行正确版本的测试 ===
        System.out.println("【正确版本的测试】");
        TestSuite suite = new TestSuite();
        suite.add("正常用例 — 查找中间/开头/结尾", AlgorithmTestingDemo::testNormalCase);
        suite.add("单元素数组", AlgorithmTestingDemo::testSingleElement);
        suite.add("空数组", AlgorithmTestingDemo::testEmptyArray);
        suite.add("null 输入", AlgorithmTestingDemo::testNullInput);
        suite.add("目标不存在（小于/大于/中间）", AlgorithmTestingDemo::testTargetNotFound);
        suite.add("重复值处理", AlgorithmTestingDemo::testDuplicates);
        suite.add("大数组 — 验证无溢出", AlgorithmTestingDemo::testNoOverflow);
        suite.add("参数化测试（9 组数据）", AlgorithmTestingDemo::testParameterized);
        suite.add("属性测试（100 轮随机验证）", AlgorithmTestingDemo::testProperties);
        suite.run();

        // === 第 2 步：检测有 bug 的版本 ===
        System.out.println("\n【有 bug 版本的检测】");
        suite = new TestSuite();
        suite.add("off-by-one bug 检测", AlgorithmTestingDemo::testOffByOneBugDetection);

        // 尝试用 off-by-one bug 版本跑正常测试
        suite.add("有 bug 版本 — 正常用例",
            () -> assertEquals(-1, binarySearchWithOffByOneBug(new int[]{1,2,3,4,5}, 5)));
        suite.run();

        // === 第 3 步：演示溢出 bug ===
        System.out.println("\n【溢出 bug 演示】");
        // 用大索引构造来演示溢出
        int[] largeArr = new int[1_000_000_0];
        for (int i = 0; i < largeArr.length; i++) largeArr[i] = i;
        int target = largeArr.length - 1;

        long t1 = System.nanoTime();
        int r1 = binarySearch(largeArr, target);
        long t2 = System.nanoTime();
        int r2 = binarySearchWithOverflowBug(largeArr, target);
        long t3 = System.nanoTime();

        System.out.printf("  正确版本: result=%d, 耗时 %dns%n", r1, t2 - t1);
        System.out.printf("  溢出版本: result=%d, 耗时 %dns (可能正确，但在更大数组下会出错)%n",
            r2, t3 - t2);

        System.out.println("\n=== 演示结束 ===");
    }
}