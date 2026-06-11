package masteralgo.chapter13;

import java.util.*;

/**
 * Trie 树与 AC 自动机演示
 *
 * 功能：
 * 1. Trie：插入、搜索、前缀搜索（startsWith）
 * 2. Aho-Corasick 自动机：
 *    - 从模式串集合构建 Trie
 *    - BFS 构建失配链接（failure link）
 *    - 在文本中搜索，报告所有模式匹配位置
 * 3. 使用 patterns = ["he", "she", "his", "hers"] 在 text = "ushers" 上测试
 */
public class TrieAndACAutomaton {

    // ============================================================
    //  1. Trie 树
    // ============================================================
    static class TrieNode {
        TrieNode[] children = new TrieNode[26]; // 小写字母 a-z
        boolean isEnd;                          // 是否为单词结尾
        int count;                              // 以此结尾的单词数

        TrieNode() {}
    }

    static class Trie {
        TrieNode root;

        Trie() { root = new TrieNode(); }

        /** 插入单词 */
        void insert(String word) {
            TrieNode node = root;
            for (char ch : word.toCharArray()) {
                int idx = ch - 'a';
                if (node.children[idx] == null) {
                    node.children[idx] = new TrieNode();
                }
                node = node.children[idx];
            }
            node.isEnd = true;
            node.count++;
        }

        /** 精确搜索 */
        boolean search(String word) {
            TrieNode node = searchPrefix(word);
            return node != null && node.isEnd;
        }

        /** 前缀搜索 */
        boolean startsWith(String prefix) {
            return searchPrefix(prefix) != null;
        }

        private TrieNode searchPrefix(String prefix) {
            TrieNode node = root;
            for (char ch : prefix.toCharArray()) {
                int idx = ch - 'a';
                if (node.children[idx] == null) return null;
                node = node.children[idx];
            }
            return node;
        }

        /** 自动补全：根据前缀返回所有匹配的单词 */
        List<String> autocomplete(String prefix) {
            List<String> result = new ArrayList<>();
            TrieNode node = searchPrefix(prefix);
            if (node != null) {
                dfs(node, new StringBuilder(prefix), result);
            }
            return result;
        }

        private void dfs(TrieNode node, StringBuilder cur, List<String> result) {
            if (node.isEnd) result.add(cur.toString());
            for (int i = 0; i < 26; i++) {
                if (node.children[i] != null) {
                    cur.append((char) ('a' + i));
                    dfs(node.children[i], cur, result);
                    cur.deleteCharAt(cur.length() - 1);
                }
            }
        }
    }

    // ============================================================
    //  2. AC 自动机 (Aho-Corasick)
    // ============================================================
    static class ACNode {
        ACNode[] children = new ACNode[26]; // 子节点
        ACNode fail;                        // 失配链接
        int outputLen;                      // 如果该节点是某个模式结尾，记录模式长度
        int patternIndex;                   // 模式串在原始数组中的索引

        ACNode() { fail = null; outputLen = 0; patternIndex = -1; }
    }

    static class ACAutomaton {
        ACNode root;

        ACAutomaton() { root = new ACNode(); }

        /** 构建 Trie */
        void addPattern(String pattern, int index) {
            ACNode node = root;
            for (char ch : pattern.toCharArray()) {
                int idx = ch - 'a';
                if (node.children[idx] == null) {
                    node.children[idx] = new ACNode();
                }
                node = node.children[idx];
            }
            node.outputLen = pattern.length();
            node.patternIndex = index;
        }

        /** BFS 构建失配链接 */
        void buildFailureLinks() {
            Queue<ACNode> q = new LinkedList<>();
            root.fail = root;

            // 第一层：每个直接子节点的 fail 指向 root
            for (int i = 0; i < 26; i++) {
                if (root.children[i] != null) {
                    root.children[i].fail = root;
                    q.offer(root.children[i]);
                } else {
                    root.children[i] = root; // 字典图优化：空转移指向 root
                }
            }

            while (!q.isEmpty()) {
                ACNode u = q.poll();
                for (int i = 0; i < 26; i++) {
                    ACNode v = u.children[i];
                    if (v == null) {
                        // 字典图：如果子节点不存在，指向 fail 的对应子节点
                        u.children[i] = u.fail.children[i];
                        continue;
                    }
                    // 计算 v 的失配链接：沿 u 的 fail 链向上找有 i 子节点的节点
                    v.fail = u.fail.children[i];
                    q.offer(v);
                }
            }
        }

        /** 在文本中搜索所有模式串 */
        List<MatchResult> search(String text) {
            List<MatchResult> results = new ArrayList<>();
            ACNode node = root;

            for (int i = 0; i < text.length(); i++) {
                int idx = text.charAt(i) - 'a';
                // 沿转移移动（字典图保证了一定有子节点）
                node = node.children[idx];

                // 检查当前节点及沿 fail 链的所有输出
                ACNode temp = node;
                while (temp != root) {
                    if (temp.outputLen > 0) {
                        int start = i - temp.outputLen + 1;
                        results.add(new MatchResult(temp.patternIndex, start, i));
                    }
                    temp = temp.fail;
                }
            }
            return results;
        }
    }

    /** 匹配结果：模式索引、起始位置、结束位置 */
    static class MatchResult {
        int patternIndex;
        int start;
        int end;

        MatchResult(int pi, int s, int e) {
            patternIndex = pi;
            start = s;
            end = e;
        }
    }

    // ============================================================
    //  测试
    // ============================================================
    public static void main(String[] args) {
        System.out.println("==========================================");
        System.out.println("  Trie 树与 AC 自动机演示");
        System.out.println("==========================================");
        System.out.println();

        // ----- Trie 测试 -----
        System.out.println("--- 1. Trie 树基本操作 ---");
        Trie trie = new Trie();
        trie.insert("apple");
        trie.insert("app");
        trie.insert("application");
        trie.insert("apt");
        trie.insert("banana");

        System.out.println("  search(\"apple\"): " + trie.search("apple"));
        System.out.println("  search(\"app\"): " + trie.search("app"));
        System.out.println("  search(\"appy\"): " + trie.search("appy"));
        System.out.println("  startsWith(\"app\"): " + trie.startsWith("app"));
        System.out.println("  startsWith(\"xyz\"): " + trie.startsWith("xyz"));

        System.out.println("  autocomplete(\"app\"): " + trie.autocomplete("app"));
        System.out.println("  autocomplete(\"a\"): " + trie.autocomplete("a"));
        System.out.println();

        // ----- AC 自动机测试 -----
        System.out.println("--- 2. AC 自动机多模式匹配 ---");
        String[] patterns = {"he", "she", "his", "hers"};
        String acText = "ushers";

        ACAutomaton ac = new ACAutomaton();
        for (int i = 0; i < patterns.length; i++) {
            ac.addPattern(patterns[i], i);
        }
        ac.buildFailureLinks();

        System.out.println("  模式串: " + Arrays.toString(patterns));
        System.out.println("  文本: " + acText);
        System.out.println();

        List<MatchResult> matches = ac.search(acText);
        System.out.println("  找到 " + matches.size() + " 个匹配:");
        for (MatchResult m : matches) {
            System.out.printf("    \"%s\" 在 [%d, %d]%n",
                    patterns[m.patternIndex], m.start, m.end);
        }
    }
}