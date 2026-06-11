package masteralgo.chapter08;

import java.util.*;

/**
 * 贪心算法经典问题合集
 *
 * 涵盖：
 * 1. 活动选择（Activity Selection）—— 选最多不重叠活动
 * 2. 分数背包（Fractional Knapsack）—— 物品可分割，按单位价值贪心
 * 3. Huffman 编码 —— 最优前缀码，编码/解码
 */
public class GreedyClassicProblems {

    // ============================================================
    //  1. 活动选择
    // ============================================================

    static class Activity {
        int start, end;
        Activity(int s, int e) { start = s; end = e; }
        public String toString() { return "(" + start + "," + end + ")"; }
    }

    /**
     * 活动选择——贪心算法
     * 策略：按结束时间排序，每次选结束最早且不与已选冲突的活动
     * @return 选中的活动下标列表（按执行顺序）
     */
    public static List<Integer> activitySelection(int[] start, int[] end) {
        int n = start.length;
        Integer[] idx = new Integer[n];
        for (int i = 0; i < n; i++) idx[i] = i;
        Arrays.sort(idx, (a, b) -> end[a] - end[b]);

        List<Integer> selected = new ArrayList<>();
        selected.add(idx[0]);
        int lastEnd = end[idx[0]];

        for (int i = 1; i < n; i++) {
            int cur = idx[i];
            if (start[cur] >= lastEnd) {
                selected.add(cur);
                lastEnd = end[cur];
            }
        }
        return selected;
    }

    // ============================================================
    //  2. 分数背包
    // ============================================================

    static class Item {
        int weight, value;
        double ratio; // 单位价值 = value / weight
        Item(int w, int v) { weight = w; value = v; ratio = (double) v / w; }
    }

    /**
     * 分数背包——贪心算法
     * 策略：按单位价值（value/weight）降序排列，优先拿单位价值高的物品
     * @param W  背包容量
     * @param w  物品重量数组
     * @param v  物品价值数组
     * @return   最大总价值（分数也计入）
     */
    public static double fractionalKnapsack(int W, int[] w, int[] v) {
        int n = w.length;
        Item[] items = new Item[n];
        for (int i = 0; i < n; i++) items[i] = new Item(w[i], v[i]);
        Arrays.sort(items, (a, b) -> Double.compare(b.ratio, a.ratio));

        double totalValue = 0;
        int remaining = W;

        System.out.println("  按单位价值排序后的物品：");
        for (Item it : items) {
            System.out.printf("    重量=%d, 价值=%d, 单位价值=%.2f%n", it.weight, it.value, it.ratio);
        }

        for (Item it : items) {
            if (remaining <= 0) break;
            if (it.weight <= remaining) {
                totalValue += it.value;
                remaining -= it.weight;
                System.out.printf("    全拿重量%d, 累计价值=%.2f%n", it.weight, totalValue);
            } else {
                double fraction = (double) remaining / it.weight;
                totalValue += it.value * fraction;
                System.out.printf("    拿重量%d(%.2f%%), 累计价值=%.2f%n", remaining, fraction * 100, totalValue);
                remaining = 0;
            }
        }
        return totalValue;
    }

    // ============================================================
    //  3. Huffman 编码
    // ============================================================

    static class HuffmanNode {
        char ch;
        int freq;
        HuffmanNode left, right;
        HuffmanNode(char c, int f) { ch = c; freq = f; }
        HuffmanNode(int f, HuffmanNode l, HuffmanNode r) { freq = f; left = l; right = r; }
    }

    /**
     * 构建 Huffman 树并生成编码表
     * @param chars  字符数组
     * @param freqs  对应频率
     * @return  Map<Character, String> 字符到二进制编码的映射
     */
    public static Map<Character, String> buildHuffmanCode(char[] chars, int[] freqs) {
        int n = chars.length;
        PriorityQueue<HuffmanNode> pq = new PriorityQueue<>(
                Comparator.comparingInt(a -> a.freq));

        for (int i = 0; i < n; i++) {
            pq.offer(new HuffmanNode(chars[i], freqs[i]));
        }

        // 构建 Huffman 树
        System.out.println("  Huffman 树构建过程：");
        int step = 1;
        while (pq.size() > 1) {
            HuffmanNode left = pq.poll();
            HuffmanNode right = pq.poll();
            HuffmanNode parent = new HuffmanNode(
                    left.freq + right.freq, left, right);
            pq.offer(parent);
            System.out.printf("    第%d步: 合并 %s(%d) 和 %s(%d) → 新节点(%d)%n",
                    step++,
                    left.ch == 0 ? '#' : left.ch, left.freq,
                    right.ch == 0 ? '#' : right.ch, right.freq,
                    parent.freq);
        }

        HuffmanNode root = pq.poll();
        Map<Character, String> codeMap = new HashMap<>();
        generateCodes(root, "", codeMap);
        return codeMap;
    }

    private static void generateCodes(HuffmanNode node, String code,
                                       Map<Character, String> map) {
        if (node == null) return;
        if (node.left == null && node.right == null) {
            map.put(node.ch, code);
            return;
        }
        generateCodes(node.left, code + "0", map);
        generateCodes(node.right, code + "1", map);
    }

    /**
     * Huffman 编码：将字符串编码为二进制串
     */
    public static String huffmanEncode(String text, Map<Character, String> codeMap) {
        StringBuilder sb = new StringBuilder();
        for (char c : text.toCharArray()) {
            sb.append(codeMap.get(c));
        }
        return sb.toString();
    }

    /**
     * Huffman 解码：将二进制串解码为原始字符串
     */
    public static String huffmanDecode(String encoded, HuffmanNode root) {
        StringBuilder sb = new StringBuilder();
        HuffmanNode cur = root;
        for (char bit : encoded.toCharArray()) {
            cur = (bit == '0') ? cur.left : cur.right;
            if (cur.left == null && cur.right == null) {
                sb.append(cur.ch);
                cur = root;
            }
        }
        return sb.toString();
    }

    /** 用于解码：重建 Huffman 树 */
    public static HuffmanNode buildHuffmanTree(char[] chars, int[] freqs) {
        PriorityQueue<HuffmanNode> pq = new PriorityQueue<>(
                Comparator.comparingInt(a -> a.freq));
        for (int i = 0; i < chars.length; i++) {
            pq.offer(new HuffmanNode(chars[i], freqs[i]));
        }
        while (pq.size() > 1) {
            HuffmanNode l = pq.poll(), r = pq.poll();
            pq.offer(new HuffmanNode(l.freq + r.freq, l, r));
        }
        return pq.poll();
    }

    // ============================================================
    //  main 测试
    // ============================================================

    public static void main(String[] args) {
        System.out.println("================================================");
        System.out.println("  GreedyClassicProblems —— 贪心经典问题演示");
        System.out.println("================================================\n");

        // ---------- 1. 活动选择 ----------
        System.out.println("----- 1. 活动选择 -----");
        int[] start = {1, 3, 0, 5, 3, 5, 6, 8, 8, 2, 12};
        int[] end   = {4, 5, 6, 7, 9, 9, 10, 11, 12, 14, 16};
        System.out.print("  所有活动 (开始,结束): ");
        for (int i = 0; i < start.length; i++) {
            System.out.print("(" + start[i] + "," + end[i] + ") ");
        }
        System.out.println();

        List<Integer> selected = activitySelection(start, end);
        System.out.print("  贪心选择的活动: ");
        for (int i : selected) {
            System.out.print("(" + start[i] + "," + end[i] + ") ");
        }
        System.out.println();
        System.out.println("  最大活动数量: " + selected.size() + "\n");

        // ---------- 2. 分数背包 ----------
        System.out.println("----- 2. 分数背包 -----");
        int[] w = {10, 20, 30};
        int[] v = {60, 100, 120};
        int W = 50;
        System.out.println("  物品: (重量,价值) = (10,60), (20,100), (30,120)");
        System.out.println("  背包容量: " + W);
        double maxVal = fractionalKnapsack(W, w, v);
        System.out.println("  最大总价值: " + maxVal + " (期望=240: A全拿60 + B全拿100 + C拿20价值80)\n");

        // ---------- 3. Huffman 编码 ----------
        System.out.println("----- 3. Huffman 编码 -----");
        char[] chars = {'A', 'B', 'C', 'D', 'E', 'F'};
        int[] freqs = {45, 13, 12, 16, 9, 5};
        System.out.println("  字符频率: A=45, B=13, C=12, D=16, E=9, F=5");

        Map<Character, String> huffmanCodes = buildHuffmanCode(chars, freqs);
        System.out.println("\n  Huffman 编码表:");
        int weightedLen = 0;
        for (char c : chars) {
            String code = huffmanCodes.get(c);
            System.out.printf("    %c: %s%n", c, code);
            weightedLen += code.length() * freqs[c - 'A'];
        }
        System.out.println("  加权编码长度: " + weightedLen + " 位");
        System.out.println("  定长编码长度: " + 3 * Arrays.stream(freqs).sum() + " 位");
        System.out.println("  压缩率: " + (1 - (double) weightedLen / (3 * Arrays.stream(freqs).sum())) * 100 + "%");

        // 编码/解码测试
        String testStr = "ABCDEF";
        HuffmanNode huffTree = buildHuffmanTree(chars, freqs);
        String encoded = huffmanEncode(testStr, huffmanCodes);
        String decoded = huffmanDecode(encoded, huffTree);
        System.out.println("\n  编码/解码测试:");
        System.out.println("    原始字符串: " + testStr);
        System.out.println("    编码结果: " + encoded);
        System.out.println("    解码结果: " + decoded);
        System.out.println("    匹配: " + testStr.equals(decoded));

        System.out.println("\n================================================");
        System.out.println("  演示结束");
        System.out.println("================================================");
    }
}