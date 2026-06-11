# 第13章 字符串算法

> **字符串**是计算机科学中最重要的数据类型之一。从搜索引擎的关键词匹配到基因序列比对，字符串算法无处不在。本章从最基础的字符串匹配出发，逐步深入到 Trie 树、AC 自动机、后缀数组与编辑距离等高级主题。

---

## 13.1 字符串匹配（暴力、KMP、BM、RK）

字符串匹配 (String Matching) 是最经典的问题：给定一个**文本串** (text) `T[0..n-1]` 和一个**模式串** (pattern) `P[0..m-1]`，找出 `P` 在 `T` 中出现的所有位置。

### 13.1.1 暴力匹配 (Brute Force)

最直观的方法——从每个位置开始逐个字符比较：

```
def brute_force(text, pattern):
    n, m = len(text), len(pattern)
    for i in range(n - m + 1):
        j = 0
        while j < m and text[i + j] == pattern[j]:
            j += 1
        if j == m:
            yield i
```

| 特性 | 说明 |
|---|---|
| **时间复杂度** | O(n·m) — 最坏情况（如 `T="AAAA...A"`, `P="AAA...B"`） |
| **空间复杂度** | O(1) |
| **优点** | 实现简单，无需预处理 |
| **缺点** | 大量重复比较，性能差 |

### 13.1.2 KMP 算法 (Knuth-Morris-Pratt)

KMP 的核心思想是**利用匹配失败时的已知信息**，将模式串向右滑动尽可能多的距离，避免从头部重新匹配。关键数据结构是 **π 数组**（前缀函数）：

**前缀函数 (Prefix Function)** `π[i]` 定义：对于模式串 `P[0..i]`，其最长相等真前缀与真后缀的长度。

```
def build_pi(pattern):
    m = len(pattern)
    pi = [0] * m
    j = 0  # 当前匹配的前缀长度
    for i in range(1, m):
        while j > 0 and pattern[i] != pattern[j]:
            j = pi[j - 1]
        if pattern[i] == pattern[j]:
            j += 1
            pi[i] = j
    return pi
```

**匹配过程**：维护指针 `i`（文本）和 `j`（模式），失配时 `j = pi[j-1]`，避免文本回溯。

| 特性 | 说明 |
|---|---|
| **时间复杂度** | O(n + m) — 线性 |
| **空间复杂度** | O(m) |
| **核心** | 前缀函数避免重复比较 |

> **理解 π 数组**：`π[i]` 表示 `P[0..i]` 这个子串中，前缀和后缀能有多长相等。比如 `P="ABABACA"`，`π[3]=2` 因为 `"ABAB"` 有最长相等前后缀 `"AB"`。

### 13.1.3 BM 算法 (Boyer-Moore)

BM 从模式串的**尾部**开始匹配，利用**坏字符规则** (Bad Character Rule) 和**好后缀规则** (Good Suffix Rule) 实现跳跃式移动。实践中 BM 通常比 KMP 更快，尤其是模式串较长时。

**坏字符规则**：当 `text[i+j] != pattern[j]` 时，将模式串右移到坏字符在模式串中最近出现的位置对齐。

**好后缀规则**：利用已匹配的后缀信息，计算安全移动距离。

BM 的效率在于：平均情况下 O(n/m)，最坏 O(n·m)（但实际几乎不出现）。

### 13.1.4 RK 算法 (Rabin-Karp)

RK 使用**滚动哈希** (Rolling Hash) 将字符串比较转化为哈希值比较：

```
def rabin_karp(text, pattern):
    n, m = len(text), len(pattern)
    if m > n: return
    d = 256       # 字符集大小
    q = 101       # 模数（质数）
    h = pow(d, m - 1, q)
    p_hash = 0    # 模式串哈希
    t_hash = 0    # 文本串哈希

    for i in range(m):
        p_hash = (p_hash * d + ord(pattern[i])) % q
        t_hash = (t_hash * d + ord(text[i])) % q

    for i in range(n - m + 1):
        if p_hash == t_hash:
            if text[i:i + m] == pattern:
                yield i
        if i < n - m:
            t_hash = (d * (t_hash - ord(text[i]) * h) + ord(text[i + m])) % q
```

滚动哈希的递推公式：
```
t_hash = (d * (t_hash - text[i] * d^{m-1}) + text[i+m]) mod q
```

| 特性 | 说明 |
|---|---|
| **时间复杂度** | 平均 O(n + m)，最坏 O(n·m)（哈希冲突多时） |
| **空间复杂度** | O(1) |
| **乘法/模运算** | 常数大，小规模可能不如暴力 |
| **适用场景** | 多模式匹配、指纹检测、去重 |

### 13.1.5 四种算法对比

| 维度 | 暴力 | KMP | BM | RK |
|---|---|---|---|---|
| 时间复杂度 | O(n·m) | O(n+m) | O(n/m)~O(n·m) | O(n+m) 平均 |
| 空间 | O(1) | O(m) | O(m+Σ) | O(1) |
| 预处理 | 无 | π 数组 | 坏字符/好后缀表 | 哈希值 |
| 匹配方向 | 左→右 | 左→右 | 右→左 | 左→右 |
| 实现复杂度 | ★☆☆ | ★★★ | ★★★★ | ★★☆ |
| 实际速度 | 慢 | 中 | 快（长模式） | 中 |

---

## 13.2 Trie 树与前缀匹配

### 13.2.1 Trie 的定义

**Trie**（字典树、前缀树）是一种多叉树结构，用于高效存储和检索字符串集合中的键。每个节点代表一个公共前缀，根节点为空。

```
class TrieNode:
    def __init__(self):
        self.children = {}
        self.is_end = False
```

### 13.2.2 基本操作

**插入 (Insert)**：从根节点出发，逐字符创建或沿已有路径下行，最后一个节点标记为结束。

```
def insert(root, word):
    node = root
    for ch in word:
        if ch not in node.children:
            node.children[ch] = TrieNode()
        node = node.children[ch]
    node.is_end = True
```

**查找 (Search)**：与插入流程类似，沿路径下行，若中途缺少字符或最后节点不是结束节点则返回 false。

**前缀查询 (StartsWith)**：只检查路径是否存在，不要求结束标记。

| 操作 | 时间复杂度 | 空间复杂度 |
|---|---|---|
| 插入 | O(L) — L 为单词长度 | O(总字符数 · Σ) |
| 查找 | O(L) | O(1) |
| 前缀查询 | O(L) | O(1) |

### 13.2.3 自动补全 (Autocomplete)

给定前缀，DFS 遍历子树收集所有单词：

```
def autocomplete(root, prefix):
    node = _find_node(root, prefix)
    if not node:
        return []
    result = []
    _dfs(node, prefix, result)
    return result

def _dfs(node, path, result):
    if node.is_end:
        result.append(path)
    for ch, child in node.children.items():
        _dfs(child, path + ch, result)
```

### 13.2.4 Trie vs 哈希表

| 维度 | Trie | 哈希表 |
|---|---|---|
| 前缀查询 | O(L) — 天生支持 | ❌ 不支持 |
| 有序遍历 | ✅ 天然有序 | ❌ 无序 |
| 内存 | 每个字符一个节点，可能较大 | 紧凑 |
| 哈希冲突 | 无 | 有 |
| 动态扩容 | 不需要 | 需要 |

> **实战启示**：当需要**前缀匹配**（如输入框自动补全、IP 路由表、T9 输入法）时，Trie 是首选；当仅需完整单词的精确查找时，哈希表更优。

---

## 13.3 AC 自动机（多模式匹配）

### 13.3.1 问题背景

给定一个文本串和**多个**模式串（如敏感词库），找出所有模式串在文本中的出现位置。KMP 只能处理一个模式串，逐一匹配效率 O(k·(n+m)) 不可接受。

**AC 自动机 (Aho-Corasick Automaton)** 在 Trie 的基础上添加 **fail 指针**（等价于 KMP 的 π 数组），将多模式匹配优化为 O(n + total_pattern_length)。

### 13.3.2 核心结构

AC 自动机包含三个部分：
1. **Trie 树** — 插入所有模式串
2. **fail 指针** — 当前节点失配时跳转到的节点（最长后缀匹配）
3. **输出表** — 记录每个节点对应的模式串（包括通过 fail 链间接匹配到的）

**构建 fail 指针**（BFS 层次遍历）：
- 根节点的直接子节点的 fail 指向根
- 对于节点 `u` 的子节点 `v`（对应字符 `c`），从 `u.fail` 开始，找到能匹配字符 `c` 的节点作为 `v.fail`

```
def build_fail(root):
    queue = deque()
    for ch, node in root.children.items():
        node.fail = root
        queue.append(node)

    while queue:
        cur = queue.popleft()
        for ch, child in cur.children.items():
            fail_to = cur.fail
            while fail_to and ch not in fail_to.children:
                fail_to = fail_to.fail
            child.fail = fail_to.children[ch] if fail_to else root
            child.output += child.fail.output  # 合并输出
            queue.append(child)
```

### 13.3.3 匹配过程

```
def ac_search(root, text):
    node = root
    for i, ch in enumerate(text):
        while node != root and ch not in node.children:
            node = node.fail
        if ch in node.children:
            node = node.children[ch]
        if node.output:
            for pattern in node.output:
                yield (i - len(pattern) + 1, pattern)
```

### 13.3.4 性能分析

| 特性 | 说明 |
|---|---|
| **预处理** | O(total_len) — 构建 Trie 和 fail 指针 |
| **匹配** | O(n + total_matches) — 线性于文本长度 |
| **空间** | O(total_len · Σ) |
| **适用** | 敏感词过滤、病毒扫描、生物序列多模式匹配 |

> **真实案例**：Linux 的 `fgrep` 命令、Snort 入侵检测系统、各大平台的敏感词过滤均基于 AC 自动机。

---

## 13.4 后缀数组与 SAM

### 13.4.1 后缀数组 (Suffix Array)

**后缀数组** `SA[i]` 是将字符串 `T` 的所有后缀按字典序排序后，第 `i` 小的后缀的起始位置。配套的 **LCP 数组** (Longest Common Prefix) `LCP[i] = lcp(T[SA[i]:], T[SA[i-1]:])`。

```
T = "banana"
后缀列表：
  0: banana
  1: anana
  2: nana
  3: ana
  4: na
  5: a

排序后 (SA):
  5: a        SA[0] = 5
  3: ana      SA[1] = 3
  1: anana    SA[2] = 1
  0: banana   SA[3] = 0
  4: na       SA[4] = 4
  2: nana     SA[5] = 2
```

| 操作 | 时间复杂度 |
|---|---|
| **构建 SA** | O(n log n) — 倍增法；O(n) — SA-IS 算法 |
| **构建 LCP** | O(n) — Kasai 算法 |
| **模式匹配** | O(m log n) — 二分查找；O(m) — 结合 LCP |

**典型应用**：
- **子串查找**：在 SA 上二分定位所有出现位置
- **最长重复子串**：LCP 数组的最大值
- **最长公共子串**：拼接两个串，SA+LCP 扫描
- **不同子串个数**：`n·(n+1)/2 - ΣLCP[i]`

### 13.4.2 后缀自动机 (Suffix Automaton, SAM)

**SAM** 是能接受字符串 `T` 的所有子串的**最小**确定性有限自动机 (DFA)。它压缩了所有子串信息，是字符串算法的"瑞士军刀"。

**核心性质**：
- 状态数 ≤ 2n - 1，转移边数 ≤ 3n - 4
- 每个状态对应一组**结束位置相同** (endpos 等价类) 的子串
- `link` 指针指向最长后缀状态（类似 AC 自动机的 fail）

```
def build_sam(text):
    last = 0
    sz = 1
    # maxlen[state] = 状态代表的最长子串长度
    # link[state]   = 后缀链接
    # next[state]   = 转移表
    maxlen = [0] * (2 * len(text))
    link = [-1] * (2 * len(text))
    next = [{} for _ in range(2 * len(text))]

    for ch in text:
        cur = sz; sz += 1
        maxlen[cur] = maxlen[last] + 1
        p = last
        while p != -1 and ch not in next[p]:
            next[p][ch] = cur
            p = link[p]
        if p == -1:
            link[cur] = 0
        else:
            q = next[p][ch]
            if maxlen[p] + 1 == maxlen[q]:
                link[cur] = q
            else:
                clone = sz; sz += 1
                maxlen[clone] = maxlen[p] + 1
                next[clone] = next[q].copy()
                link[clone] = link[q]
                while p != -1 and next[p].get(ch) == q:
                    next[p][ch] = clone
                    p = link[p]
                link[q] = link[cur] = clone
        last = cur
    return maxlen, link, next
```

| 特性 | 说明 |
|---|---|
| **构建** | O(n) — 在线算法，逐个字符扩展 |
| **空间** | O(n·Σ) — 约 2n 个状态 |
| **子串查询** | 任意子串出现次数、首次/末次出现位置等 |
| **最长公共子串** | 两个串拼接，沿 SAM 走另一个串 |

> **SAM vs SA**：SAM 构建更直观（在线），支持更多查询（如子串出现次数），但常数较大。SA+LCP 对于只需求排序相关操作（如最长重复子串）更简洁。

---

## 13.5 编辑距离与模糊匹配

### 13.5.1 Levenshtein 距离

**编辑距离 (Edit Distance)** 衡量两个字符串的相似度，定义为将一个串转换为另一个串所需的最少编辑操作次数。标准操作有三种：
- **插入** (Insert) — 在位置 i 插入字符
- **删除** (Delete) — 删除位置 i 的字符  
- **替换** (Substitute) — 将位置 i 的字符替换为另一个字符

**DP 定义**：设 `dp[i][j]` 为 `A[0..i-1]` 到 `B[0..j-1]` 的编辑距离：

```
dp[i][j] = min(
    dp[i-1][j] + 1,       # 删除 A[i-1]
    dp[i][j-1] + 1,       # 插入 B[j-1]（等价于删除 B[j-1]）
    dp[i-1][j-1] + cost   # 替换（cost=0 若 A[i-1]==B[j-1], 否则 1）
)
```

**初始条件**：
- `dp[0][j] = j` — 空串到 B[0..j-1] 需插入 j 次
- `dp[i][0] = i` — A[0..i-1] 到空串需删除 i 次

```
def levenshtein(a, b):
    n, m = len(a), len(b)
    dp = [[0] * (m + 1) for _ in range(n + 1)]

    for i in range(n + 1): dp[i][0] = i
    for j in range(m + 1): dp[0][j] = j

    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = 0 if a[i-1] == b[j-1] else 1
            dp[i][j] = min(
                dp[i-1][j] + 1,
                dp[i][j-1] + 1,
                dp[i-1][j-1] + cost
            )
    return dp[n][m]
```

| 特性 | 说明 |
|---|---|
| **时间复杂度** | O(n·m) |
| **空间复杂度** | O(n·m)，可优化至 O(min(n,m)) |
| **适用场景** | 拼写纠错、DNA 序列比对、抄袭检测 |

### 13.5.2 变体与优化

**空间优化**：只需保留两行（上一行和当前行）：

```
def levenshtein_optimized(a, b):
    if len(a) < len(b): a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            curr[j] = min(curr[j-1] + 1, prev[j] + 1, prev[j-1] + cost)
        prev = curr
    return prev[-1]
```

**加权编辑距离**：不同操作赋予不同代价，例如 DNA 序列中替换可能比插入更"昂贵"。

**Damerau–Levenshtein 距离**：增加**交换** (Transposition) 操作，如 `"ab" → "ba"` 代价为 1（而非 2）。

### 13.5.3 模糊匹配与近似搜索

**模糊匹配**指允许模式串与文本子串之间存在一定编辑距离的匹配。经典方法：

1. **DP 模糊匹配**：`dp[i][j]` 表示模式串 `P[0..i-1]` 与文本 `T[0..j-1]` 的编辑距离，扫描 `dp[m][j] ≤ k` 的位置
2. **BK 树 (Burkhard-Keller Tree)**：利用三角不等式，在度量空间中进行快速近似查找
3. **基于 N-gram 的过滤**：将字符串切分为长度为 k 的子串集合，利用 Jaccard 相似度过滤

### 13.5.4 三种距离对比

| 距离类型 | 操作集合 | 时间复杂度 | 适用场景 |
|---|---|---|---|
| **Levenshtein** | 插入、删除、替换 | O(n·m) | 通用文本相似度 |
| **Damerau–Levenshtein** | + 交换相邻字符 | O(n·m) | 打字纠错（常见笔误） |
| **最长公共子序列 (LCS)** | 仅插入、删除 | O(n·m) | 序列比对、diff 工具 |

---

## 总结与思维导图

```
字符串算法
├── 单模式匹配
│   ├── 暴力匹配 — O(n·m)，简单直观
│   ├── KMP — O(n+m)，前缀函数避免回溯
│   ├── BM — 尾部匹配，实际速度最快
│   └── RK — 滚动哈希，适合多模式
├── 前缀结构
│   ├── Trie 树 — 前缀匹配、自动补全
│   └── AC 自动机 — Trie + fail 指针，多模式匹配
├── 子串索引
│   ├── 后缀数组 — 排序后缀，配合 LCP
│   └── 后缀自动机 — 最小 DFA，所有子串信息
└── 模糊匹配
    └── 编辑距离 — DP 求解，拼写纠错
```

**实战建议**：
- 单模式匹配选 KMP（稳定性）或 BM（平均性能）
- 多模式匹配首选 AC 自动机
- 需要前缀匹配/自动补全用 Trie
- 需要分析子串结构（重复、出现次数）用 SA 或 SAM
- 模糊匹配/拼写纠错用编辑距离