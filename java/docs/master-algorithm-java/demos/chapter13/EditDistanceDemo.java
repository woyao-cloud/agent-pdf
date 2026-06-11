package masteralgo.chapter13;

import java.util.*;

/**
 * 编辑距离与模糊匹配演示
 *
 * 功能：
 * 1. Levenshtein 距离（DP 填表 + 路径回溯）
 * 2. 编辑操作序列还原（插入、删除、替换）
 * 3. 对齐展示
 * 4. Damerau-Levenshtein 距离（增加相邻交换操作）
 * 5. 测试 "kitten" → "sitting", "intention" → "execution"
 */
public class EditDistanceDemo {

    // 编辑操作类型
    enum EditOp { MATCH, SUBSTITUTE, INSERT, DELETE, TRANSPOSE }

    /** Levenshtein 距离 + 完整的 DP 表 */
    static class LevenshteinResult {
        int[][] dp;          // DP 表
        int distance;        // 编辑距离
        String a, b;

        LevenshteinResult(String a, String b) {
            this.a = a;
            this.b = b;
            int n = a.length(), m = b.length();
            dp = new int[n + 1][m + 1];

            for (int i = 0; i <= n; i++) dp[i][0] = i;
            for (int j = 0; j <= m; j++) dp[0][j] = j;

            for (int i = 1; i <= n; i++) {
                for (int j = 1; j <= m; j++) {
                    if (a.charAt(i - 1) == b.charAt(j - 1)) {
                        dp[i][j] = dp[i - 1][j - 1];
                    } else {
                        dp[i][j] = 1 + Math.min(Math.min(
                                dp[i - 1][j],      // 删除
                                dp[i][j - 1]),     // 插入
                                dp[i - 1][j - 1]); // 替换
                    }
                }
            }
            distance = dp[n][m];
        }

        /** 回溯得到编辑操作序列 */
        List<EditOp> traceback() {
            List<EditOp> ops = new ArrayList<>();
            int i = a.length(), j = b.length();
            while (i > 0 || j > 0) {
                if (i > 0 && j > 0 && a.charAt(i - 1) == b.charAt(j - 1)) {
                    ops.add(EditOp.MATCH);
                    i--; j--;
                } else if (i > 0 && j > 0 && dp[i][j] == dp[i - 1][j - 1] + 1) {
                    ops.add(EditOp.SUBSTITUTE);
                    i--; j--;
                } else if (i > 0 && dp[i][j] == dp[i - 1][j] + 1) {
                    ops.add(EditOp.DELETE);
                    i--;
                } else if (j > 0 && dp[i][j] == dp[i][j - 1] + 1) {
                    ops.add(EditOp.INSERT);
                    j--;
                }
            }
            Collections.reverse(ops);
            return ops;
        }

        /** 展示对齐结果 */
        void printAlignment() {
            List<EditOp> ops = traceback();
            StringBuilder top = new StringBuilder();
            StringBuilder mid = new StringBuilder();
            StringBuilder bot = new StringBuilder();
            int ai = 0, bi = 0;
            for (EditOp op : ops) {
                switch (op) {
                    case MATCH:
                        top.append(a.charAt(ai));
                        mid.append('|');
                        bot.append(b.charAt(bi));
                        ai++; bi++;
                        break;
                    case SUBSTITUTE:
                        top.append(a.charAt(ai));
                        mid.append('X');
                        bot.append(b.charAt(bi));
                        ai++; bi++;
                        break;
                    case INSERT:
                        top.append(' ');
                        mid.append('+');
                        bot.append(b.charAt(bi));
                        bi++;
                        break;
                    case DELETE:
                        top.append(a.charAt(ai));
                        mid.append('-');
                        bot.append(' ');
                        ai++;
                        break;
                    case TRANSPOSE:
                        top.append(a.charAt(ai)).append(a.charAt(ai + 1));
                        mid.append('~').append('~');
                        bot.append(b.charAt(bi)).append(b.charAt(bi + 1));
                        ai += 2; bi += 2;
                        break;
                }
            }
            System.out.println("  对齐结果:");
            System.out.println("    " + top.toString());
            System.out.println("    " + mid.toString());
            System.out.println("    " + bot.toString());
        }

        void printDpTable() {
            int n = a.length(), m = b.length();
            System.out.print("      ");
            for (int j = 0; j < m; j++) System.out.printf("%3c ", b.charAt(j));
            System.out.println();
            for (int i = 0; i <= n; i++) {
                if (i == 0) System.out.print("  ");
                else System.out.printf("%2c ", a.charAt(i - 1));
                for (int j = 0; j <= m; j++) {
                    System.out.printf("%3d ", dp[i][j]);
                }
                System.out.println();
            }
        }
    }

    /** Damerau-Levenshtein 距离（增加相邻交换） */
    static class DamerauLevenshtein {
        String a, b;
        int distance;
        int[][] dp;

        DamerauLevenshtein(String a, String b) {
            this.a = a;
            this.b = b;
            int n = a.length(), m = b.length();
            dp = new int[n + 1][m + 1];

            for (int i = 0; i <= n; i++) dp[i][0] = i;
            for (int j = 0; j <= m; j++) dp[0][j] = j;

            for (int i = 1; i <= n; i++) {
                for (int j = 1; j <= m; j++) {
                    int cost = (a.charAt(i - 1) == b.charAt(j - 1)) ? 0 : 1;
                    dp[i][j] = Math.min(Math.min(
                            dp[i - 1][j] + 1,       // 删除
                            dp[i][j - 1] + 1),      // 插入
                            dp[i - 1][j - 1] + cost); // 匹配/替换

                    // 相邻交换（transposition）
                    if (i > 1 && j > 1
                            && a.charAt(i - 1) == b.charAt(j - 2)
                            && a.charAt(i - 2) == b.charAt(j - 1)) {
                        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + cost);
                    }
                }
            }
            distance = dp[n][m];
        }
    }

    // ============================================================
    //  测试
    // ============================================================
    public static void main(String[] args) {
        System.out.println("==========================================");
        System.out.println("  编辑距离演示");
        System.out.println("==========================================");
        System.out.println();

        // ----- 测试 1: kitten → sitting -----
        System.out.println("--- 测试 1: \"kitten\" → \"sitting\" ---");
        testEditDistance("kitten", "sitting");
        System.out.println();

        // ----- 测试 2: intention → execution -----
        System.out.println("--- 测试 2: \"intention\" → \"execution\" ---");
        testEditDistance("intention", "execution");
        System.out.println();

        // ----- 测试 3: Damerau-Levenshtein 交换演示 -----
        System.out.println("--- 测试 3: Damerau-Levenshtein 交换操作 ---");
        testDamerau("ab", "ba");
        testDamerau("kitten", "sitting");
        System.out.println();

        // ----- 测试 4: 典型的拼写纠错场景 -----
        System.out.println("--- 测试 4: 拼写纠错场景 ---");
        String[] dictionary = {"hello", "world", "help", "held", "the", "their", "there"};
        String misspelled = "teh";
        findClosestWords(misspelled, dictionary);
    }

    static void testEditDistance(String a, String b) {
        LevenshteinResult result = new LevenshteinResult(a, b);
        System.out.printf("  \"%s\" → \"%s\": 编辑距离 = %d%n", a, b, result.distance);

        System.out.println("  DP 表:");
        result.printDpTable();
        System.out.println();

        List<EditOp> ops = result.traceback();
        System.out.print("  编辑操作序列: ");
        for (EditOp op : ops) {
            switch (op) {
                case MATCH:      System.out.print("M "); break;
                case SUBSTITUTE: System.out.print("S "); break;
                case INSERT:     System.out.print("I "); break;
                case DELETE:     System.out.print("D "); break;
                default:         System.out.print("? ");
            }
        }
        System.out.println();
        result.printAlignment();
    }

    static void testDamerau(String a, String b) {
        LevenshteinResult lev = new LevenshteinResult(a, b);
        DamerauLevenshtein dam = new DamerauLevenshtein(a, b);
        System.out.printf("  \"%s\" → \"%s\": Levenshtein=%d, Damerau-Levenshtein=%d%n",
                a, b, lev.distance, dam.distance);
    }

    /** 在字典中查找最接近的单词（拼写纠错） */
    static void findClosestWords(String word, String[] dictionary) {
        System.out.printf("  输入: \"%s\"%n", word);
        System.out.println("  字典中最接近的单词:");
        List<WordDist> candidates = new ArrayList<>();
        for (String dictWord : dictionary) {
            int dist = new LevenshteinResult(word, dictWord).distance;
            candidates.add(new WordDist(dictWord, dist));
        }
        candidates.sort(Comparator.comparingInt(w -> w.distance));
        for (int i = 0; i < Math.min(3, candidates.size()); i++) {
            System.out.printf("    \"%s\" (距离=%d)%n",
                    candidates.get(i).word, candidates.get(i).distance);
        }
    }

    static class WordDist {
        String word;
        int distance;
        WordDist(String w, int d) { word = w; distance = d; }
    }
}