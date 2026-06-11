package masteralgo.chapter16;

import java.util.*;

/**
 * 双指针与滑动窗口算法演示
 *
 * 包含：
 * - twoSumSorted（两端向中间双指针）
 * - threeSum（排序 + 双指针）
 * - removeDuplicates（同向双指针，原地去重）
 * - longestSubstringWithoutRepeating（滑动窗口）
 * - minWindowSubstring（滑动窗口 + 字符计数）
 * - maxArea（盛最多水的容器）
 */
public class TwoPointersSlidingWindow {

    // ============================================================
    //  1. 有序数组的两数之和 — 两端双指针
    // ============================================================
    static int[] twoSumSorted(int[] numbers, int target) {
        int L = 0, R = numbers.length - 1;
        while (L < R) {
            int sum = numbers[L] + numbers[R];
            if (sum == target) {
                return new int[]{L + 1, R + 1}; // 1-indexed
            } else if (sum < target) {
                L++;
            } else {
                R--;
            }
        }
        return new int[]{-1, -1};
    }

    // ============================================================
    //  2. 三数之和 — 排序 + 双指针
    // ============================================================
    static List<List<Integer>> threeSum(int[] nums) {
        List<List<Integer>> result = new ArrayList<>();
        Arrays.sort(nums);
        for (int i = 0; i < nums.length - 2; i++) {
            if (i > 0 && nums[i] == nums[i - 1]) continue;
            int L = i + 1, R = nums.length - 1;
            while (L < R) {
                int sum = nums[i] + nums[L] + nums[R];
                if (sum == 0) {
                    result.add(Arrays.asList(nums[i], nums[L], nums[R]));
                    while (L < R && nums[L] == nums[L + 1]) L++;
                    while (L < R && nums[R] == nums[R - 1]) R--;
                    L++; R--;
                } else if (sum < 0) {
                    L++;
                } else {
                    R--;
                }
            }
        }
        return result;
    }

    // ============================================================
    //  3. 删除有序数组中的重复项 — 同向双指针
    // ============================================================
    static int removeDuplicates(int[] nums) {
        if (nums.length == 0) return 0;
        int i = 0;
        for (int j = 1; j < nums.length; j++) {
            if (nums[j] != nums[i]) {
                i++;
                nums[i] = nums[j];
            }
        }
        return i + 1;
    }

    // ============================================================
    //  4. 无重复字符的最长子串 — 滑动窗口
    // ============================================================
    static int lengthOfLongestSubstring(String s) {
        Map<Character, Integer> map = new HashMap<>();
        int maxLen = 0, left = 0;
        for (int right = 0; right < s.length(); right++) {
            char ch = s.charAt(right);
            if (map.containsKey(ch)) {
                left = Math.max(left, map.get(ch) + 1);
            }
            map.put(ch, right);
            maxLen = Math.max(maxLen, right - left + 1);
        }
        return maxLen;
    }

    // ============================================================
    //  5. 最小覆盖子串 — 滑动窗口（字符计数）
    // ============================================================
    static String minWindowSubstring(String s, String t) {
        Map<Character, Integer> need = new HashMap<>();
        Map<Character, Integer> window = new HashMap<>();
        for (char ch : t.toCharArray()) need.put(ch, need.getOrDefault(ch, 0) + 1);

        int left = 0, right = 0, valid = 0;
        int start = 0, minLen = Integer.MAX_VALUE;

        while (right < s.length()) {
            char c = s.charAt(right);
            right++;
            if (need.containsKey(c)) {
                window.put(c, window.getOrDefault(c, 0) + 1);
                if (window.get(c).equals(need.get(c))) valid++;
            }

            while (valid == need.size()) {
                if (right - left < minLen) {
                    start = left;
                    minLen = right - left;
                }
                char d = s.charAt(left);
                left++;
                if (need.containsKey(d)) {
                    if (window.get(d).equals(need.get(d))) valid--;
                    window.put(d, window.get(d) - 1);
                }
            }
        }
        return minLen == Integer.MAX_VALUE ? "" : s.substring(start, start + minLen);
    }

    // ============================================================
    //  6. 盛最多水的容器 — 双指针
    // ============================================================
    static int maxArea(int[] height) {
        int L = 0, R = height.length - 1, max = 0;
        while (L < R) {
            int area = Math.min(height[L], height[R]) * (R - L);
            max = Math.max(max, area);
            if (height[L] < height[R]) {
                L++;
            } else {
                R--;
            }
        }
        return max;
    }

    // ============================================================
    //  主方法测试
    // ============================================================
    public static void main(String[] args) {
        System.out.println("==========================================");
        System.out.println("  双指针与滑动窗口演示");
        System.out.println("==========================================");

        // ---------- Two Sum Sorted ----------
        System.out.println("\n--- Two Sum Sorted ---");
        int[] tsResult = twoSumSorted(new int[]{2, 7, 11, 15}, 9);
        System.out.println("  [2,7,11,15] target=9 → " + Arrays.toString(tsResult));
        assert Arrays.equals(tsResult, new int[]{1, 2});

        // ---------- Three Sum ----------
        System.out.println("\n--- Three Sum ---");
        List<List<Integer>> threeSumResult = threeSum(new int[]{-1, 0, 1, 2, -1, -4});
        System.out.println("  [-1,0,1,2,-1,-4] → " + threeSumResult);
        assert threeSumResult.size() == 2;

        // ---------- Remove Duplicates ----------
        System.out.println("\n--- Remove Duplicates ---");
        int[] dupArr = new int[]{0, 0, 1, 1, 1, 2, 2, 3, 3, 4};
        int newLen = removeDuplicates(dupArr);
        System.out.println("  去重后长度 = " + newLen + "，前 " + newLen + " 个 = " +
            Arrays.toString(Arrays.copyOf(dupArr, newLen)));
        assert newLen == 5;

        // ---------- 无重复字符的最长子串 ----------
        System.out.println("\n--- 无重复字符的最长子串 ---");
        int l1 = lengthOfLongestSubstring("abcabcbb");
        assert l1 == 3;
        System.out.println("  \"abcabcbb\" → " + l1);
        int l2 = lengthOfLongestSubstring("bbbbb");
        assert l2 == 1;
        System.out.println("  \"bbbbb\" → " + l2);

        // ---------- 最小覆盖子串 ----------
        System.out.println("\n--- 最小覆盖子串 ---");
        String mw1 = minWindowSubstring("ADOBECODEBANC", "ABC");
        System.out.println("  s=ADOBECODEBANC t=ABC → \"" + mw1 + "\"");
        assert mw1.equals("BANC");
        String mw2 = minWindowSubstring("a", "a");
        System.out.println("  s=a t=a → \"" + mw2 + "\"");
        assert mw2.equals("a");
        String mw3 = minWindowSubstring("a", "aa");
        System.out.println("  s=a t=aa → \"" + mw3 + "\"");
        assert mw3.equals("");

        // ---------- 盛最多水的容器 ----------
        System.out.println("\n--- 盛最多水的容器 ---");
        int area = maxArea(new int[]{1, 8, 6, 2, 5, 4, 8, 3, 7});
        System.out.println("  [1,8,6,2,5,4,8,3,7] → " + area);
        assert area == 49;

        System.out.println("\n==========================================");
        System.out.println("  所有测试通过");
        System.out.println("==========================================");
    }
}