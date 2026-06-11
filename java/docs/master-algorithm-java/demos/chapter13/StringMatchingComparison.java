package masteralgo.chapter13;

import java.util.*;

/**
 * 四种字符串匹配算法对比演示
 *
 * 功能：
 * 1. 暴力匹配（Brute Force）
 * 2. KMP 匹配（前缀函数）
 * 3. Boyer-Moore 匹配（坏字符规则）
 * 4. Rabin-Karp 匹配（滚动哈希 + 碰撞处理）
 * 5. 在指定文本和模式上进行测试
 * 6. 统计每种算法的字符比较次数
 * 7. 在随机大数据上进行性能对比
 */
public class StringMatchingComparison {

    private static long comparisons; // 字符比较计数器

    // ============================================================
    //  1. 暴力匹配
    // ============================================================
    static int bruteForce(String text, String pattern) {
        int n = text.length(), m = pattern.length();
        for (int i = 0; i <= n - m; i++) {
            int j = 0;
            while (j < m) {
                comparisons++;
                if (text.charAt(i + j) != pattern.charAt(j)) break;
                j++;
            }
            if (j == m) return i;
        }
        return -1;
    }

    // ============================================================
    //  2. KMP 匹配
    // ============================================================
    static int[] computePrefixFunction(String pattern) {
        int m = pattern.length();
        int[] pi = new int[m];
        for (int i = 1; i < m; i++) {
            int j = pi[i - 1];
            while (j > 0 && pattern.charAt(i) != pattern.charAt(j)) {
                comparisons++;
                j = pi[j - 1];
            }
            comparisons++;
            if (pattern.charAt(i) == pattern.charAt(j)) j++;
            pi[i] = j;
        }
        return pi;
    }

    static int kmpSearch(String text, String pattern) {
        int n = text.length(), m = pattern.length();
        if (m == 0) return 0;
        int[] pi = computePrefixFunction(pattern);
        int j = 0;
        for (int i = 0; i < n; i++) {
            while (j > 0 && text.charAt(i) != pattern.charAt(j)) {
                comparisons++;
                j = pi[j - 1];
            }
            comparisons++;
            if (text.charAt(i) == pattern.charAt(j)) j++;
            if (j == m) return i - m + 1;
        }
        return -1;
    }

    // ============================================================
    //  3. Boyer-Moore 匹配（坏字符规则）
    // ============================================================
    static int[] buildBadCharTable(String pattern) {
        int m = pattern.length();
        int[] table = new int[65536]; // 覆盖 Unicode BMP
        Arrays.fill(table, -1);
        for (int i = 0; i < m; i++) {
            table[pattern.charAt(i)] = i;
        }
        return table;
    }

    static int boyerMoore(String text, String pattern) {
        int n = text.length(), m = pattern.length();
        if (m == 0) return 0;
        int[] bct = buildBadCharTable(pattern);
        int shift = 0;
        while (shift <= n - m) {
            int j = m - 1;
            while (j >= 0) {
                comparisons++;
                if (text.charAt(shift + j) != pattern.charAt(j)) break;
                j--;
            }
            if (j < 0) return shift;
            int badChar = text.charAt(shift + j);
            int bcShift = j - bct[badChar];
            shift += Math.max(1, bcShift);
        }
        return -1;
    }

    // ============================================================
    //  4. Rabin-Karp 匹配
    // ============================================================
    static final int BASE = 131;
    static final int MOD = 1000000007;

    static int rabinKarp(String text, String pattern) {
        int n = text.length(), m = pattern.length();
        if (m == 0) return 0;
        if (n < m) return -1;

        long patHash = 0, txtHash = 0, h = 1;

        // h = BASE^(m-1) % MOD
        for (int i = 0; i < m - 1; i++) h = (h * BASE) % MOD;

        for (int i = 0; i < m; i++) {
            patHash = (patHash * BASE + pattern.charAt(i)) % MOD;
            txtHash = (txtHash * BASE + text.charAt(i)) % MOD;
        }

        for (int i = 0; i <= n - m; i++) {
            comparisons++;
            if (patHash == txtHash) {
                // 哈希碰撞：逐字符验证
                boolean match = true;
                for (int j = 0; j < m; j++) {
                    comparisons++;
                    if (text.charAt(i + j) != pattern.charAt(j)) {
                        match = false;
                        break;
                    }
                }
                if (match) return i;
            }
            // 滚动哈希
            if (i < n - m) {
                txtHash = (txtHash - text.charAt(i) * h % MOD + MOD) % MOD;
                txtHash = (txtHash * BASE + text.charAt(i + m)) % MOD;
            }
        }
        return -1;
    }

    // ============================================================
    //  测试用例
    // ============================================================
    public static void main(String[] args) {
        System.out.println("==========================================");
        System.out.println("  字符串匹配算法对比演示");
        System.out.println("==========================================");
        System.out.println();

        // ----- 测试 1: 固定文本和模式 -----
        String text = "ABABDABACDABABCABAB";
        String pattern = "ABABCABAB";

        System.out.println("--- 测试 1: 固定文本 ---");
        System.out.println("文本: " + text);
        System.out.println("模式: " + pattern);
        System.out.println();

        testAlgorithm("暴力匹配", text, pattern);
        testAlgorithm("KMP", text, pattern);
        testAlgorithm("Boyer-Moore", text, pattern);
        testAlgorithm("Rabin-Karp", text, pattern);

        System.out.println();

        // ----- 测试 2: 随机大数据 -----
        System.out.println("--- 测试 2: 随机大数据性能对比 ---");
        Random rand = new Random(42);
        int txtLen = 1000000;
        int patLen = 5000;

        StringBuilder sb = new StringBuilder(txtLen);
        for (int i = 0; i < txtLen; i++) {
            sb.append((char) ('A' + rand.nextInt(4))); // A, B, C, D
        }
        String bigText = sb.toString();

        StringBuilder sb2 = new StringBuilder(patLen);
        for (int i = 0; i < patLen; i++) {
            sb2.append((char) ('A' + rand.nextInt(4)));
        }
        String bigPattern = sb2.toString();

        System.out.printf("文本长度: %d, 模式长度: %d%n", txtLen, patLen);
        System.out.println();

        testAlgorithm("KMP", bigText, bigPattern);
        testAlgorithm("Boyer-Moore", bigText, bigPattern);
        testAlgorithm("Rabin-Karp", bigText, bigPattern);
    }

    static void testAlgorithm(String name, String text, String pattern) {
        comparisons = 0;
        long start = System.nanoTime();
        int pos;
        switch (name) {
            case "暴力匹配":
                pos = bruteForce(text, pattern);
                break;
            case "KMP":
                pos = kmpSearch(text, pattern);
                break;
            case "Boyer-Moore":
                pos = boyerMoore(text, pattern);
                break;
            case "Rabin-Karp":
                pos = rabinKarp(text, pattern);
                break;
            default:
                throw new IllegalArgumentException("Unknown algorithm: " + name);
        }
        long end = System.nanoTime();
        double ms = (end - start) / 1e6;

        System.out.printf("  %s: 位置=%d, 比较次数=%d, 耗时=%.2f ms%n",
                name, pos, comparisons, ms);
    }
}