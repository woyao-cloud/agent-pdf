# 第13章 字符串算法

> "字符串是计算机科学中最基础也最强大的数据结构之一。从文本编辑器中的查找替换，到基因序列的比对分析，字符串算法构建了我们理解文本世界的桥梁。"

---

## 13.1 字符串匹配

字符串匹配（Pattern Matching）是最经典的字符串问题：给定一个文本串 `text` 和一个模式串 `pattern`，在文本中找到所有模式出现的位置。

### 13.1.1 暴力匹配（Brute Force）

最直观的方法——将模式串与文本的每个位置对齐，逐字符比较。

```java
int bruteForce(String text, String pattern) {
    int n = text.length(), m = pattern.length();
    for (int i = 0; i <= n - m; i++) {
        int j = 0;
        while (j < m && text.charAt(i + j) == pattern.charAt(j)) j++;
        if (j == m) return i;  // 找到匹配
    }
    return -1;
}
```

**时间复杂度**：最坏情况 $O(nm)$（如 text="AAAAAB", pattern="AAAB"）。最好情况 $O(n)$。

### 13.1.2 KMP 算法（Knuth-Morris-Pratt）

KMP 的核心思想是**利用已匹配部分的信息，避免文本指针回溯**。当匹配失败时，模式串向右滑动到已匹配的前缀所能重新对齐的位置。

**前缀函数（Prefix Function）** $\pi[i]$ 表示模式串 `pattern[0..i]` 的最长相等真前缀和真后缀的长度。

```
模式串:  A B A B C A B A B A
π:       0 0 1 2 0 1 2 3 4 3
         ↑       ↑
        π[3]=2  π[8]=4
```

**匹配过程**：用指针 `i` 遍历文本，指针 `j` 表示当前已匹配的模式串长度。当 `text[i] != pattern[j]` 时，`j = π[j-1]`，而不是回退 `i`。

**时间复杂度**：$O(n + m)$，每个字符至多比较两次。

### 13.1.3 Boyer-Moore 算法

Boyer-Moore 从模式串的**末尾**开始向前比较，利用两个启发式规则跳过尽可能多的字符：

**坏字符规则（Bad Character Rule）**：当不匹配时，将模式串向右滑动，使文本中的坏字符与模式串中上一次出现的位置对齐。如果模式串中没有该字符，直接跳过整个模式串长度。

**好后缀规则（Good Suffix Rule）**：当匹配了部分后缀后发生失败，利用已匹配的后缀信息决定滑动距离。

**平均时间复杂度**：$O(n/m)$（亚线性）。最坏情况 $O(nm)$（但实际很少出现）。

Boyer-Moore 在实践中通常是最快的单模式匹配算法，尤其适合模式串较长的情况。

### 13.1.4 Rabin-Karp 算法

Rabin-Karp 使用**滚动哈希（Rolling Hash）** 将字符串比较转化为哈希值比较：

```
hash("abc") = a × B² + b × B¹ + c × B⁰
滚动更新: hash("bcd") = (hash("abc") - a × B²) × B + d
```

**算法步骤**：
1. 计算模式串的哈希值 `patHash`
2. 用滑动窗口计算文本每个长度为 m 的子串哈希值
3. 哈希值相同时，**逐字符验证**以处理哈希碰撞

**哈希碰撞处理**：使用双哈希（两个不同模数）或直接比较原始字符串。

```java
// 滚动哈希的快速更新
int rollHash(int oldHash, char outChar, char inChar, int base, int mod, int h) {
    long hash = (oldHash - outChar * h % mod + mod) % mod;
    hash = (hash * base + inChar) % mod;
    return (int) hash;
}
```

**平均时间复杂度**：$O(n + m)$。最坏 $O(nm)$（大量碰撞时）。

### 四算法对比

| 算法 | 预处理 | 匹配时间（平均） | 匹配时间（最坏） | 空间 | 特点 |
|------|--------|-----------------|-----------------|------|------|
| 暴力 | $O(1)$ | $O(n)$ | $O(nm)$ | $O(1)$ | 实现最简单 |
| KMP | $O(m)$ | $O(n+m)$ | $O(n+m)$ | $O(m)$ | 线性时间，无回退 |
| Boyer-Moore | $O(m+\sigma)$ | $O(n/m)$ 亚线性 | $O(nm)$ | $O(\sigma)$ | 实践中最快 |
| Rabin-Karp | $O(m)$ | $O(n+m)$ | $O(nm)$ | $O(1)$ | 多模式扩展友好 |

> $\sigma$ 为字符集大小。

---

## 13.2 Trie 树与前缀匹配

### 13.2.1 Trie 树结构

Trie（字典树、前缀树）是一种**多叉树结构**，用于高效存储和检索字符串集合中的键。每个节点代表一个字符，从根到叶的路径组合成一个字符串。

```
            root
          /  |   \
         a   b    c
        /    |     \
       p     a      a
      / \    |       \
     p   t   t        t
    /    |    \        \
   l     e     r        s
   e          s
```

**节点结构**：
```java
class TrieNode {
    TrieNode[] children = new TrieNode[26];  // 假设小写字母
    boolean isEnd;                            // 是否为单词结尾
    int count;                                // 以该节点为结尾的单词数
}
```

### 13.2.2 基本操作

**插入（Insert）**：从根开始，对每个字符检查子节点是否存在，不存在则创建，最后标记结尾。

**搜索（Search）**：从根开始，按字符链查找，如果中途节点缺失或最终节点不是结尾，返回 false。

**前缀搜索（StartsWith）**：与搜索类似，但不要求 `isEnd` 为 true。

**删除（Delete）**：递归删除。只有当节点不再被其他单词共享时才实际删除。

```
插入 "cat":   root → c → a → t (isEnd)
插入 "car":   root → c → a → r (isEnd)
                  共享路径 "ca"

搜索 "cat":   c→a→t ✓ 是结尾 → true
搜索 "ca":    c→a ✓ 但不是结尾 → false
前缀搜索 "ca": c→a ✓ → true
```

### 13.2.3 自动补全（Autocomplete）

Trie 天然支持前缀补全——找到前缀节点后，DFS 遍历所有后续路径：

```java
void dfs(TrieNode node, String prefix, List<String> result) {
    if (node.isEnd) result.add(prefix);
    for (char c = 'a'; c <= 'z'; c++) {
        if (node.children[c - 'a'] != null) {
            dfs(node.children[c - 'a'], prefix + c, result);
        }
    }
}
```

### 13.2.4 压缩 Trie（Radix Tree / Patricia Trie）

压缩 Trie 将没有分支的连续节点合并成一条边（压缩路径），大幅减少节点数：

```
标准 Trie:  root → a → p → p → l → e
压缩 Trie:  root → "apple"
```

每个节点存储一个字符串片段而非单个字符。适合存储大量公共前缀的字符串集合，用于 IP 路由表查找（最长前缀匹配）。

### 13.2.5 应用场景

| 应用 | 说明 |
|------|------|
| **字典存储** | 单词拼写检查、自动补全 |
| **IP 路由** | 最长前缀匹配（CIDR） |
| **搜索引擎** | 关键词提示、搜索建议 |
| **编译器** | 词法分析中的关键字识别 |

---

## 13.3 AC 自动机（Aho-Corasick）

AC 自动机是多模式匹配的经典算法，能在 $O(n + \sum len(pattern_i))$ 时间内同时匹配多个模式串。

### 13.3.1 算法结构

AC 自动机 = **Trie 树 + 失配链接（Failure Link）**

```
模式串: {"he", "she", "his", "hers"}
构建 Trie 树:
        root
       /    \
      h      s
     / \     |
    e   i    h
    |   |    |
    r*  s*   e*
    |        |
    s*       r*
    (* 表示单词结尾)
```

**失配链接**：当在某个节点没有字符对应的子节点时，通过失配链接跳转到其他分支，利用已经匹配的前缀信息。类似于 KMP 的前缀函数，但作用于多模式 Trie 上。

### 13.3.2 构建过程

**BFS 构建失配链接**：
1. 根的所有直接子节点的 fail 指向根
2. 对 BFS 队列中的每个节点 `u`：
   - 对每个字符 `c`，设 `v = u.children[c]`
   - 如果 `v` 存在，`v.fail = u.fail.go(c)`（沿 u 的失败链向上找有 c 子节点的节点）
   - 如果 `v` 不存在，`u.children[c] = u.fail.children[c]`（构建字典图优化）

**输出链接**：除了失配链接外，还有输出链接指向包含模式串结尾的节点。当某个节点通过失配链可以到达一个单词结尾节点时，该节点也需要输出。

### 13.3.3 匹配过程

遍历文本字符，从根开始沿 Trie 边移动：
- 如果当前节点有字符对应的子节点，移动过去
- 否则沿失配链接跳转
- 每到一个节点，检查该节点及沿输出链接可达的所有节点是否为单词结尾

```
文本: "ushers"
      u → s → h → e → r → s
      ↓    ↓    ↓    ↓    ↓    ↓
  匹配:  she   he   hers
```

### 13.3.4 应用场景

| 应用 | 说明 |
|------|------|
| **敏感词过滤** | 同时检测多个敏感词，替换为 *** |
| **病毒特征检测** | 在数据流中同时匹配多个病毒签名 |
| **入侵检测系统** | Snort 等 NIDS 使用 AC 算法匹配规则 |
| **基因序列匹配** | 在 DNA 序列中同时查找多个基因标志 |

---

## 13.4 后缀数组与后缀自动机

### 13.4.1 后缀数组（Suffix Array）

后缀数组是字符串所有后缀按字典序排序后的数组，配合 LCP 数组可以解决大部分字符串问题。

```
文本串: "banana"
所有后缀:
  0: banana
  1: anana
  2: nana
  3: ana
  4: na
  5: a

排序后:
  5: a
  3: ana
  1: anana
  0: banana
  4: na
  2: nana

SA = [5, 3, 1, 0, 4, 2]
```

### 13.4.2 构造方法

**前缀倍增法（Prefix Doubling）** $O(n \log n)$：
- 按长度为 1, 2, 4, 8, ... 的前缀排序
- 每轮利用上一轮排序结果的 rank 对作为关键字排序

```java
// 前缀倍增法核心思想
for (int k = 1; k < n; k *= 2) {
    // 按 (rank[i], rank[i+k]) 对后缀排序
    sortSuffixesByTwoKeys(sa, rank, k);
    // 分配新的 rank
    assignNewRanks(sa, rank, k);
}
```

**SA-IS 算法** $O(n)$：基于诱导排序（Induced Sorting）的线性时间构造算法，实现较为复杂，但在竞赛和工程中广泛应用。

### 13.4.3 LCP 数组（Kasai 算法）

LCP[i] = 后缀 `SA[i]` 和 `SA[i-1]` 的最长公共前缀长度。

```
SA排序后的后缀:
  a       5
  ana     3   LCP[1]=1 (a vs ana)
  anana   1   LCP[2]=3 (ana vs anana)
  banana  0   LCP[3]=0 (anana vs banana)
  na      4   LCP[4]=0 (banana vs na)
  nana    2   LCP[5]=2 (na vs nana)
```

**Kasai 算法** $O(n)$：利用性质——后缀 `i` 和 `i+1` 的 LCP 至少为后缀 `i-1` 和 `i` 的 LCP 减 1。

### 13.4.4 应用

| 问题 | 解法 | 复杂度 |
|------|------|--------|
| **最长重复子串** | LCP 数组的最大值 | $O(n)$ |
| **最长公共子串** | 两个字符串拼接 → 后缀数组 → 跨越分隔符的最大 LCP | $O(n)$ |
| **不同子串个数** | $\frac{n(n+1)}{2} - \sum LCP[i]$ | $O(n)$ |
| **模式串出现次数** | 二分查找 SA 范围 | $O(m \log n)$ |
| **最长回文子串** | 反转后求 LCP | $O(n)$ |

### 13.4.5 后缀自动机（Suffix Automaton, SAM）

SAM 是能接受字符串所有子串的最小 DFA（确定有限状态自动机）。每个状态对应一组 **endpos 等价类**。

**核心性质**：
- 节点数不超过 $2n - 1$，边数不超过 $3n - 4$
- 在线构造，每添加一个字符只需常数时间
- 每个状态记录了能够到达该状态的最长子串长度 `len` 和失配链接 `link`

**在线构造算法**：
```
SAM 构造伪代码（每次添加字符 c）：
  1. 创建新状态 cur，len[cur] = len[last] + 1
  2. 沿 last 的 link 链回溯，添加 c 的转移
  3. 如果遇到已有转移且 len[p] + 1 == len[q]，直接设置 link[cur] = q
  4. 否则克隆状态 q 为 clone，调整 len 和转移
```

**匹配**：在 SAM 上沿字符转移走，如果走不通则沿 link 回溯。每次匹配的时间复杂度 $O(m)$。

**应用**：检查模式串是否为文本子串（$O(m)$）、计算不同子串个数、最长公共子串等。

---

## 13.5 编辑距离与模糊匹配

### 13.5.1 Levenshtein 距离

编辑距离（Edit Distance）衡量两个字符串之间的差异，定义为将一个字符串转换为另一个所需的最少编辑操作次数：

- **插入**（Insert）：在位置 i 插入一个字符
- **删除**（Delete）：删除位置 i 的字符
- **替换**（Substitute）：将位置 i 的字符替换为另一个字符

**DP 解法**：$dp[i][j]$ 表示 `A[0..i)` 转换为 `B[0..j)` 的最小编辑距离。

```java
if (A[i-1] == B[j-1]) {
    dp[i][j] = dp[i-1][j-1];           // 字符相同，无需操作
} else {
    dp[i][j] = 1 + min(
        dp[i-1][j],                     // 删除 A[i-1]
        dp[i][j-1],                     // 插入 B[j-1]
        dp[i-1][j-1]                    // 替换 A[i-1] → B[j-1]
    );
}
```

```
编辑距离 DP 表: "kitten" → "sitting"
       ""  s  i  t  t  i  n  g
""     0  1  2  3  4  5  6  7
k      1  1  2  3  4  5  6  7
i      2  2  1  2  3  4  5  6
t      3  3  2  1  2  3  4  5
t      4  4  3  2  1  2  3  4
e      5  5  4  3  2  2  3  4
n      6  6  5  4  3  3  2  3

编辑距离 = dp[6][7] = 3
操作序列: 替换(k→s), 插入(i), 插入(g)
```

**时间复杂度**：$O(nm)$，空间可以优化到 $O(\min(n, m))$。

### 13.5.2 Damerau-Levenshtein 距离

在 Levenshtein 基础上增加了**相邻字符交换（Transposition）**操作，如 "ab" → "ba" 算一次操作。

```
原始 Levenshtein: "ab" → "ba" = 2 (替换a→b, 替换b→a)
Damerau-Levenshtein: "ab" → "ba" = 1 (交换ab)
```

DP 递推增加 transposition 分支：
```java
// 当 i>1 && j>1 && A[i-1]==B[j-2] && A[i-2]==B[j-1]
dp[i][j] = min(dp[i][j], dp[i-2][j-2] + 1);  // 交换
```

**应用**：拼写检查中，交换是最常见的打字错误之一（如 "teh" → "the"）。

### 13.5.3 近似字符串匹配（k-差异匹配）

给定文本 T、模式 P 和整数 k，在文本中找到所有与模式编辑距离 ≤ k 的子串。

**DP 变体**：列递推，每列计算当前窗口与模式的编辑距离：
- $dp[i][j]$ 是模式的前 i 个字符与文本窗口的前 j 个字符的编辑距离
- 当最后一行的最小值 ≤ k 时，该位置匹配

**优化**：利用编辑距离的上下界性质，当某行最小值已经大于 k 时提前剪枝。

```
文本: "abcdefg"，模式: "acf"，k=1
位置 3 ("abc"): 编辑距离 1 (删除b) → 匹配
位置 5 ("cde"): 编辑距离 2 → 不匹配
```

### 13.5.4 应用场景

| 应用 | 方法 | 说明 |
|------|------|------|
| **拼写检查** | Damerau-Levenshtein | 对字典中的每个词计算距离，返回最近的 |
| **DNA 序列比对** | 编辑距离 | 衡量两条基因序列的进化距离 |
| **抄袭检测** | k-差异匹配 | 在文档中查找近似匹配的段落 |
| **语音识别** | 编辑距离 | 将识别结果与标准转录比对 |
| **自然语言处理** | 词级编辑距离 | 用于机器翻译评估（BLEU 的变体） |

---