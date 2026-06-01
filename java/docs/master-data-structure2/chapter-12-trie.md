# 第12章 Trie树（字典树）

## 12.1 Trie原理与实现

### 解决的问题

Trie树（前缀树）解决的是**字符串的前缀匹配**问题。在传统的BST或哈希表中，查找一个字符串是否存在需要与完整字符串比较。而Trie树按照字符串的每个字符逐层匹配，查找效率只取决于字符串长度，与数据量无关。

> **核心价值**：Trie树是搜索引擎自动补全、拼写检查、IP路由表、敏感词过滤等场景的核心数据结构。

### 实现原理

**Trie树的结构**：

```
Trie树（插入"cat", "car", "dog"）：
         root
       /      \
      c        d
     /          \
    a            o
   / \            \
  t   r            g
 (cat)(car)       (dog)
```

**核心特性**：
- 根节点不保存字符
- 每个节点保存一个字符
- 从根到叶子节点的路径表示一个完整的字符串
- 每个节点的所有子节点包含不同的字符
- 查找时间O(m)，其中m是字符串长度，与数据量n无关

### 代码实现

```java
/**
 * Trie树的完整实现
 */
public class Trie {
    
    private static class TrieNode {
        TrieNode[] children = new TrieNode[26];  // 假设只包含小写字母
        boolean isEnd;  // 标记是否是一个完整单词的结尾
        int count;      // 经过该节点的单词数（用于前缀统计）
    }
    
    private final TrieNode root;
    
    public Trie() {
        root = new TrieNode();
    }
    
    // 插入 —— O(m)
    public void insert(String word) {
        TrieNode node = root;
        for (char ch : word.toCharArray()) {
            int idx = ch - 'a';
            if (node.children[idx] == null) {
                node.children[idx] = new TrieNode();
            }
            node = node.children[idx];
            node.count++;
        }
        node.isEnd = true;
    }
    
    // 精确查找 —— O(m)
    public boolean search(String word) {
        TrieNode node = searchPrefix(word);
        return node != null && node.isEnd;
    }
    
    // 前缀查找 —— O(m)
    public boolean startsWith(String prefix) {
        return searchPrefix(prefix) != null;
    }
    
    // 统计以prefix为前缀的单词数
    public int countPrefix(String prefix) {
        TrieNode node = searchPrefix(prefix);
        return node == null ? 0 : node.count;
    }
    
    private TrieNode searchPrefix(String prefix) {
        TrieNode node = root;
        for (char ch : prefix.toCharArray()) {
            int idx = ch - 'a';
            if (node.children[idx] == null) {
                return null;
            }
            node = node.children[idx];
        }
        return node;
    }
    
    // 删除 —— O(m)
    public boolean delete(String word) {
        if (!search(word)) return false;
        TrieNode node = root;
        for (char ch : word.toCharArray()) {
            int idx = ch - 'a';
            node = node.children[idx];
            node.count--;
        }
        node.isEnd = false;
        return true;
    }
    
    // 获取所有以prefix为前缀的单词
    public List<String> autocomplete(String prefix) {
        List<String> result = new ArrayList<>();
        TrieNode node = searchPrefix(prefix);
        if (node == null) return result;
        dfs(node, new StringBuilder(prefix), result);
        return result;
    }
    
    private void dfs(TrieNode node, StringBuilder sb, List<String> result) {
        if (node.isEnd) {
            result.add(sb.toString());
        }
        for (char ch = 'a'; ch <= 'z'; ch++) {
            int idx = ch - 'a';
            if (node.children[idx] != null) {
                sb.append(ch);
                dfs(node.children[idx], sb, result);
                sb.deleteCharAt(sb.length() - 1);
            }
        }
    }
    
    public static void main(String[] args) {
        Trie trie = new Trie();
        trie.insert("apple");
        trie.insert("app");
        trie.insert("application");
        trie.insert("apt");
        
        System.out.println("search(app): " + trie.search("app"));       // true
        System.out.println("search(appl): " + trie.search("appl"));     // false
        System.out.println("startsWith(app): " + trie.startsWith("app")); // true
        
        System.out.println("autocomplete(app): " + trie.autocomplete("app"));
        // [app, apple, application]
        
        System.out.println("countPrefix(app): " + trie.countPrefix("app")); // 3
    }
}
```

### 使用场景

- **搜索引擎自动补全**：输入前缀提示可能的搜索词
- **拼写检查**：检查单词是否在字典中
- **IP路由表**：最长前缀匹配
- **敏感词过滤**：快速检测文本中是否包含敏感词
- **字典压缩**：共享公共前缀，节省空间

### 潜在风险与问题

- **空间消耗大**：每个节点可能有一个长度为26的数组
- **字符集限制**：Unicode字符集导致数组过大
- **只适合字符串**：不适合数字、对象等其他类型

### 优化策略

- 使用HashMap<Character, TrieNode>代替数组存储子节点
- 使用压缩Trie（Radix Tree）合并单分支节点
- 使用双数组Trie（Double-Array Trie）节省空间

### 典型问题处理

**面试题：Trie树和HashMap在字符串查找中的对比？**

- HashMap：需要完整的字符串做hash；不支持前缀匹配；空间占用与key个数相关
- Trie：逐字符匹配；天然支持前缀匹配；空间占用与总字符数相关
- 精确查找时HashMap更快（O(1) vs O(m)），但前缀匹配时Trie完胜

---

## 12.2 手写Trie实现

### 优化版Trie（使用Map）

```java
/**
 * 支持任意字符集的Trie树
 */
public class GeneralTrie {
    
    private static class TrieNode {
        Map<Character, TrieNode> children = new HashMap<>();
        boolean isEnd;
        int count;
    }
    
    private final TrieNode root = new TrieNode();
    
    public void insert(String word) {
        TrieNode node = root;
        for (char ch : word.toCharArray()) {
            node = node.children.computeIfAbsent(ch, k -> new TrieNode());
            node.count++;
        }
        node.isEnd = true;
    }
    
    public boolean search(String word) {
        TrieNode node = root;
        for (char ch : word.toCharArray()) {
            node = node.children.get(ch);
            if (node == null) return false;
        }
        return node.isEnd;
    }
    
    public boolean startsWith(String prefix) {
        TrieNode node = root;
        for (char ch : prefix.toCharArray()) {
            node = node.children.get(ch);
            if (node == null) return false;
        }
        return true;
    }
    
    // 通配符搜索（. 匹配任意字符）
    public boolean searchWithWildcard(String pattern) {
        return searchWithWildcard(root, pattern, 0);
    }
    
    private boolean searchWithWildcard(TrieNode node, String pattern, int index) {
        if (node == null) return false;
        if (index == pattern.length()) return node.isEnd;
        
        char ch = pattern.charAt(index);
        if (ch == '.') {
            // 匹配任意字符
            for (TrieNode child : node.children.values()) {
                if (searchWithWildcard(child, pattern, index + 1)) {
                    return true;
                }
            }
            return false;
        }
        
        return searchWithWildcard(node.children.get(ch), pattern, index + 1);
    }
}
```

### 典型问题处理

**面试题：敏感词过滤系统的设计**

```java
// 使用Trie树 + AC自动机实现高效敏感词过滤
// 1. 构建敏感词Trie树
// 2. 添加失败指针（BFS构建AC自动机）
// 3. 扫描文本时，根据失败指针跳转
// 时间复杂度：O(n + m) 扫描一遍即可找出所有敏感词
```

---

## 12.3 使用场景与风险分析

### 典型应用

| 领域 | 应用 | 说明 |
|------|------|------|
| 搜索 | 搜索建议 | 前缀查询 + 频率排序 |
| 安全 | DFA敏感词过滤 | 基于Trie的确定性有限自动机 |
| 网络 | IP路由 | 最长前缀匹配 |
| NLP | 词性标注 | 基于Trie的词典匹配 |
| 生物 | 基因序列匹配 | DNA序列的AC自动机 |

### 潜在风险与问题

- **内存开销**：每个字符一个节点，对于长字符串开销大
- **中文支持**：中文字符集大，使用Map存储子节点
- **并发读写**：需要加锁或使用并发数据结构

### 优化策略

- 使用Radix Tree压缩路径
- 使用Double-Array Trie压缩内存
- 使用AC自动机实现多模式匹配

### 典型问题处理

**工程实践：百万级敏感词的过滤系统设计？**

1. 使用Trie构建敏感词库
2. AC自动机实现多模式匹配
3. 使用布隆过滤器快速排除非敏感词
4. 分段处理大文本，避免单次处理耗时过长

---

## 12.4 典型问题：前缀匹配、敏感词过滤

### 前缀匹配与AC自动机

```java
/**
 * AC自动机简化版
 */
public class ACAutomaton {
    
    private static class Node {
        Map<Character, Node> children = new HashMap<>();
        Node fail;        // 失败指针
        boolean isEnd;    // 是否是一个敏感词的结尾
        int depth;
    }
    
    private final Node root = new Node();
    
    // 构建Trie树
    public void addWord(String word) {
        Node node = root;
        for (char ch : word.toCharArray()) {
            node = node.children.computeIfAbsent(ch, k -> new Node());
        }
        node.isEnd = true;
    }
    
    // 构建失败指针（BFS）
    public void buildFailPointer() {
        Queue<Node> queue = new LinkedList<>();
        root.fail = root;
        
        // 第一层节点的失败指针指向root
        for (Node child : root.children.values()) {
            child.fail = root;
            queue.offer(child);
        }
        
        while (!queue.isEmpty()) {
            Node parent = queue.poll();
            for (Map.Entry<Character, Node> entry : parent.children.entrySet()) {
                char ch = entry.getKey();
                Node child = entry.getValue();
                
                // 计算失败指针
                Node fail = parent.fail;
                while (fail != root && !fail.children.containsKey(ch)) {
                    fail = fail.fail;
                }
                child.fail = fail.children.containsKey(ch) ? 
                            fail.children.get(ch) : root;
                
                // 如果失败指针指向的是结束节点，当前节点也是结束节点
                if (child.fail.isEnd) {
                    child.isEnd = true;
                }
                
                queue.offer(child);
            }
        }
    }
    
    // 扫描文本，找出所有敏感词
    public List<String> search(String text) {
        List<String> result = new ArrayList<>();
        Node node = root;
        
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            
            // 沿着失败指针找到可以匹配的节点
            while (node != root && !node.children.containsKey(ch)) {
                node = node.fail;
            }
            
            if (node.children.containsKey(ch)) {
                node = node.children.get(ch);
            }
            
            // 检查是否匹配到敏感词
            if (node.isEnd) {
                // 找到了敏感词
                result.add("发现敏感词在位置: " + i);
            }
        }
        
        return result;
    }
    // AC自动机的核心：在一次扫描中同时匹配所有模式串
    // 时间复杂度：O(n + m) 其中n为文本长度，m为所有模式串总长度
}
```

---

> **本章总结**：Trie树通过逐字符匹配实现了高效的字符串前缀查询，是所有字符串匹配算法的基础。其查找时间复杂度与数据量无关（仅取决于字符串长度），特别适合搜索建议、拼写检查等场景。AC自动机在Trie树基础上加入失败指针，实现了多模式串的一次扫描匹配，是敏感词过滤系统的核心技术。