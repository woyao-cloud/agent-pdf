package masteralgo.chapter15;

import java.util.*;

/**
 * 面试高频数组/字符串/DP 算法题演示
 *
 * 包含：
 * - twoSum (HashMap)、threeSum (排序+双指针)
 * - longestPalindrome (中心扩展)
 * - longestSubstringWithoutRepeating (滑动窗口)
 * - coinChange (DP)、houseRobber (DP)
 * - validParentheses (栈)
 */
public class HighFrequencyProblems {

    // ============================================================
    //  1. 两数之和 — HashMap O(n)
    // ============================================================
    static int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> map = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            if (map.containsKey(complement)) {
                return new int[]{map.get(complement), i};
            }
            map.put(nums[i], i);
        }
        return new int[]{-1, -1};
    }

    // ============================================================
    //  2. 三数之和 — 排序 + 双指针 O(n²)
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
    //  3. 最长回文子串 — 中心扩展法 O(n²)
    // ============================================================
    static String longestPalindrome(String s) {
        if (s == null || s.length() < 2) return s;
        int start = 0, maxLen = 1;
        for (int i = 0; i < s.length(); i++) {
            int len1 = expandAroundCenter(s, i, i);
            int len2 = expandAroundCenter(s, i, i + 1);
            int len = Math.max(len1, len2);
            if (len > maxLen) {
                start = i - (len - 1) / 2;
                maxLen = len;
            }
        }
        return s.substring(start, start + maxLen);
    }

    private static int expandAroundCenter(String s, int L, int R) {
        while (L >= 0 && R < s.length() && s.charAt(L) == s.charAt(R)) {
            L--;
            R++;
        }
        return R - L - 1;
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
    //  5. 零钱兑换 — DP
    // ============================================================
    static int coinChange(int[] coins, int amount) {
        int[] dp = new int[amount + 1];
        Arrays.fill(dp, amount + 1);
        dp[0] = 0;
        for (int i = 1; i <= amount; i++) {
            for (int coin : coins) {
                if (i >= coin) {
                    dp[i] = Math.min(dp[i], dp[i - coin] + 1);
                }
            }
        }
        return dp[amount] > amount ? -1 : dp[amount];
    }

    // ============================================================
    //  6. 打家劫舍 — DP（空间优化）
    // ============================================================
    static int houseRobber(int[] nums) {
        int prev2 = 0, prev1 = 0;
        for (int num : nums) {
            int curr = Math.max(prev1, prev2 + num);
            prev2 = prev1;
            prev1 = curr;
        }
        return prev1;
    }

    // ============================================================
    //  7. 有效的括号 — 栈
    // ============================================================
    static boolean isValidParentheses(String s) {
        Deque<Character> stack = new ArrayDeque<>();
        for (char ch : s.toCharArray()) {
            if (ch == '(') stack.push(')');
            else if (ch == '{') stack.push('}');
            else if (ch == '[') stack.push(']');
            else if (stack.isEmpty() || stack.pop() != ch) return false;
        }
        return stack.isEmpty();
    }

    // ============================================================
    //  主方法测试
    // ============================================================
    public static void main(String[] args) {
        System.out.println("==========================================");
        System.out.println("  高频面试算法题演示");
        System.out.println("==========================================");

        // ---------- Two Sum ----------
        System.out.println("\n--- Two Sum ---");
        int[] twoSumResult = twoSum(new int[]{2, 7, 11, 15}, 9);
        System.out.println("  [2,7,11,15] target=9 → " + Arrays.toString(twoSumResult));
        assert Arrays.equals(twoSumResult, new int[]{0, 1});

        // ---------- Three Sum ----------
        System.out.println("\n--- Three Sum ---");
        List<List<Integer>> threeSumResult = threeSum(new int[]{-1, 0, 1, 2, -1, -4});
        System.out.println("  [-1,0,1,2,-1,-4] → " + threeSumResult);
        assert threeSumResult.size() == 2;

        // ---------- 最长回文子串 ----------
        System.out.println("\n--- 最长回文子串 ---");
        String pal1 = longestPalindrome("babad");
        System.out.println("  \"babad\" → " + pal1);
        assert pal1.equals("bab") || pal1.equals("aba");

        String pal2 = longestPalindrome("cbbd");
        System.out.println("  \"cbbd\" → " + pal2);
        assert pal2.equals("bb");

        // ---------- 无重复字符的最长子串 ----------
        System.out.println("\n--- 无重复字符的最长子串 ---");
        int len1 = lengthOfLongestSubstring("abcabcbb");
        System.out.println("  \"abcabcbb\" → " + len1);
        assert len1 == 3;
        int len2 = lengthOfLongestSubstring("bbbbb");
        System.out.println("  \"bbbbb\" → " + len2);
        assert len2 == 1;
        int len3 = lengthOfLongestSubstring("pwwkew");
        System.out.println("  \"pwwkew\" → " + len3);
        assert len3 == 3;

        // ---------- 零钱兑换 ----------
        System.out.println("\n--- 零钱兑换 ---");
        int coins1 = coinChange(new int[]{1, 2, 5}, 11);
        System.out.println("  coins=[1,2,5] amount=11 → " + coins1);
        assert coins1 == 3;

        int coins2 = coinChange(new int[]{2}, 3);
        System.out.println("  coins=[2] amount=3 → " + coins2);
        assert coins2 == -1;

        // ---------- 打家劫舍 ----------
        System.out.println("\n--- 打家劫舍 ---");
        int rob1 = houseRobber(new int[]{1, 2, 3, 1});
        System.out.println("  [1,2,3,1] → " + rob1);
        assert rob1 == 4;
        int rob2 = houseRobber(new int[]{2, 7, 9, 3, 1});
        System.out.println("  [2,7,9,3,1] → " + rob2);
        assert rob2 == 12;

        // ---------- 有效的括号 ----------
        System.out.println("\n--- 有效的括号 ---");
        System.out.println("  \"()\" → " + isValidParentheses("()"));
        assert isValidParentheses("()");
        System.out.println("  \"()[]{}\" → " + isValidParentheses("()[]{}"));
        assert isValidParentheses("()[]{}");
        System.out.println("  \"(]\" → " + isValidParentheses("(]"));
        assert !isValidParentheses("(]");
        System.out.println("  \"([)]\" → " + isValidParentheses("([)]"));
        assert !isValidParentheses("([)]");

        System.out.println("\n==========================================");
        System.out.println("  所有测试通过");
        System.out.println("==========================================");
    }
}