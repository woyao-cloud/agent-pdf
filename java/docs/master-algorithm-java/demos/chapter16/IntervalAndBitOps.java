package masteralgo.chapter16;

import java.util.*;

/**
 * 区间问题与位运算技巧演示
 *
 * 区间部分：
 * - mergeIntervals、insertInterval、minMeetingRooms
 *
 * 位运算部分：
 * - Brian Kernighan 位计数、isPowerOfTwo、singleNumber（XOR）
 * - subsetEnumeration（位掩码枚举子集）
 */
public class IntervalAndBitOps {

    // ============================================================
    //  1. 合并区间
    // ============================================================
    static int[][] mergeIntervals(int[][] intervals) {
        if (intervals.length == 0) return new int[0][];
        Arrays.sort(intervals, (a, b) -> Integer.compare(a[0], b[0]));
        List<int[]> merged = new ArrayList<>();
        for (int[] interval : intervals) {
            if (merged.isEmpty() || interval[0] > merged.get(merged.size() - 1)[1]) {
                merged.add(interval);
            } else {
                merged.get(merged.size() - 1)[1] =
                    Math.max(merged.get(merged.size() - 1)[1], interval[1]);
            }
        }
        return merged.toArray(new int[merged.size()][]);
    }

    // ============================================================
    //  2. 插入区间
    // ============================================================
    static int[][] insertInterval(int[][] intervals, int[] newInterval) {
        List<int[]> result = new ArrayList<>();
        int i = 0;
        // 新区间之前的区间
        while (i < intervals.length && intervals[i][1] < newInterval[0]) {
            result.add(intervals[i]);
            i++;
        }
        // 合并重叠部分
        while (i < intervals.length && intervals[i][0] <= newInterval[1]) {
            newInterval[0] = Math.min(newInterval[0], intervals[i][0]);
            newInterval[1] = Math.max(newInterval[1], intervals[i][1]);
            i++;
        }
        result.add(newInterval);
        // 剩余区间
        while (i < intervals.length) {
            result.add(intervals[i]);
            i++;
        }
        return result.toArray(new int[result.size()][]);
    }

    // ============================================================
    //  3. 会议室 II — 最少会议室（扫描线）
    // ============================================================
    static int minMeetingRooms(int[][] intervals) {
        if (intervals.length == 0) return 0;
        int n = intervals.length;
        int[] startTimes = new int[n];
        int[] endTimes = new int[n];
        for (int i = 0; i < n; i++) {
            startTimes[i] = intervals[i][0];
            endTimes[i] = intervals[i][1];
        }
        Arrays.sort(startTimes);
        Arrays.sort(endTimes);

        int rooms = 0, endIdx = 0;
        for (int start : startTimes) {
            if (start < endTimes[endIdx]) {
                rooms++;
            } else {
                endIdx++;
            }
        }
        return rooms;
    }

    // ============================================================
    //  4. Brian Kernighan 位计数
    // ============================================================
    static int countBits(int n) {
        int count = 0;
        while (n != 0) {
            n = n & (n - 1); // 清除最右侧的 1
            count++;
        }
        return count;
    }

    // ============================================================
    //  5. 判断 2 的幂
    // ============================================================
    static boolean isPowerOfTwo(int n) {
        return n > 0 && (n & (n - 1)) == 0;
    }

    // ============================================================
    //  6. 只出现一次的数字 — XOR
    // ============================================================
    static int singleNumber(int[] nums) {
        int result = 0;
        for (int num : nums) result ^= num;
        return result;
    }

    // ============================================================
    //  7. 子集枚举 — 位掩码
    // ============================================================
    static List<List<Integer>> subsetEnumeration(int[] nums) {
        int n = nums.length;
        List<List<Integer>> result = new ArrayList<>();
        for (int mask = 0; mask < (1 << n); mask++) {
            List<Integer> subset = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                if ((mask >> i & 1) == 1) {
                    subset.add(nums[i]);
                }
            }
            result.add(subset);
        }
        return result;
    }

    // ============================================================
    //  辅助方法
    // ============================================================
    static String formatIntervals(int[][] intervals) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < intervals.length; i++) {
            if (i > 0) sb.append(", ");
            sb.append("[").append(intervals[i][0]).append(",")
              .append(intervals[i][1]).append("]");
        }
        return sb.append("]").toString();
    }

    // ============================================================
    //  主方法测试
    // ============================================================
    public static void main(String[] args) {
        System.out.println("==========================================");
        System.out.println("  区间问题与位运算演示");
        System.out.println("==========================================");

        // ---------- 合并区间 ----------
        System.out.println("\n--- 合并区间 ---");
        int[][] intervals1 = {{1, 3}, {2, 6}, {8, 10}, {15, 18}};
        int[][] merged = mergeIntervals(intervals1);
        System.out.println("  输入: [[1,3],[2,6],[8,10],[15,18]]");
        System.out.println("  输出: " + formatIntervals(merged));
        assert merged.length == 3;
        assert Arrays.deepEquals(merged, new int[][]{{1, 6}, {8, 10}, {15, 18}});

        // ---------- 插入区间 ----------
        System.out.println("\n--- 插入区间 ---");
        int[][] intervals2 = {{1, 3}, {6, 9}};
        int[][] inserted = insertInterval(intervals2, new int[]{2, 5});
        System.out.println("  输入: [[1,3],[6,9]] + [2,5]");
        System.out.println("  输出: " + formatIntervals(inserted));
        assert inserted.length == 2;
        assert Arrays.deepEquals(inserted, new int[][]{{1, 5}, {6, 9}});

        // ---------- 会议室 II ----------
        System.out.println("\n--- 会议室 II ---");
        int[][] meetings = {{0, 30}, {5, 10}, {15, 20}};
        int rooms = minMeetingRooms(meetings);
        System.out.println("  输入: [[0,30],[5,10],[15,20]]");
        System.out.println("  最少会议室: " + rooms);
        assert rooms == 2;

        int[][] meetings2 = {{7, 10}, {2, 4}};
        int rooms2 = minMeetingRooms(meetings2);
        System.out.println("  输入: [[7,10],[2,4]] → " + rooms2);
        assert rooms2 == 1;

        // ---------- Brian Kernighan 位计数 ----------
        System.out.println("\n--- Brian Kernighan 位计数 ---");
        System.out.println("  countBits(0b10110100=" + (0b10110100) + ") = " + countBits(0b10110100));
        assert countBits(0b10110100) == 4;
        System.out.println("  countBits(255) = " + countBits(255));
        assert countBits(255) == 8;
        System.out.println("  countBits(0) = " + countBits(0));
        assert countBits(0) == 0;

        // ---------- 判断 2 的幂 ----------
        System.out.println("\n--- 判断 2 的幂 ---");
        System.out.println("  isPowerOfTwo(1) = " + isPowerOfTwo(1));
        assert isPowerOfTwo(1);
        System.out.println("  isPowerOfTwo(16) = " + isPowerOfTwo(16));
        assert isPowerOfTwo(16);
        System.out.println("  isPowerOfTwo(18) = " + isPowerOfTwo(18));
        assert !isPowerOfTwo(18);
        System.out.println("  isPowerOfTwo(0) = " + isPowerOfTwo(0));
        assert !isPowerOfTwo(0);

        // ---------- 只出现一次的数字 ----------
        System.out.println("\n--- 只出现一次的数字 ---");
        int sn = singleNumber(new int[]{4, 1, 2, 1, 2});
        System.out.println("  [4,1,2,1,2] → " + sn);
        assert sn == 4;

        // ---------- 子集枚举 ----------
        System.out.println("\n--- 子集枚举（位掩码） ---");
        List<List<Integer>> subsets = subsetEnumeration(new int[]{1, 2, 3});
        System.out.println("  [1,2,3] 的子集: ");
        for (List<Integer> subset : subsets) {
            System.out.println("    " + subset);
        }
        assert subsets.size() == 8; // 2^3

        System.out.println("\n==========================================");
        System.out.println("  所有测试通过");
        System.out.println("==========================================");
    }
}