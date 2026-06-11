"""
demo_trie.py
Trie（字典树）完整实现与演示。

包含：
  - 插入 / 查找 / 前缀查询
  - 自动补全 (Autocomplete)
  - IP 路由表最长前缀匹配演示
"""


class TrieNode:
    def __init__(self):
        self.children = {}
        self.is_end = False
        self.count = 0  # 经过该节点的单词数


class Trie:
    def __init__(self):
        self.root = TrieNode()

    # ----------------------------------------------------------
    # 基本操作
    # ----------------------------------------------------------
    def insert(self, word):
        node = self.root
        for ch in word:
            if ch not in node.children:
                node.children[ch] = TrieNode()
            node = node.children[ch]
            node.count += 1
        node.is_end = True

    def search(self, word):
        node = self._traverse(word)
        return node is not None and node.is_end

    def starts_with(self, prefix):
        return self._traverse(prefix) is not None

    def _traverse(self, prefix):
        node = self.root
        for ch in prefix:
            if ch not in node.children:
                return None
            node = node.children[ch]
        return node

    # ----------------------------------------------------------
    # 自动补全
    # ----------------------------------------------------------
    def autocomplete(self, prefix):
        node = self._traverse(prefix)
        if node is None:
            return []
        result = []
        self._dfs(node, prefix, result)
        return result

    def _dfs(self, node, path, result):
        if node.is_end:
            result.append(path)
        for ch in sorted(node.children.keys()):
            self._dfs(node.children[ch], path + ch, result)

    # ----------------------------------------------------------
    # 删除（需确认单词存在）
    # ----------------------------------------------------------
    def delete(self, word):
        if not self.search(word):
            return False
        self._delete(self.root, word, 0)
        return True

    def _delete(self, node, word, depth):
        if depth == len(word):
            node.is_end = False
            return len(node.children) == 0
        ch = word[depth]
        child = node.children[ch]
        should_delete_child = self._delete(child, word, depth + 1)
        if should_delete_child:
            del node.children[ch]
            node.count -= child.count
            return len(node.children) == 0 and not node.is_end
        node.count -= 1
        return False

    # ----------------------------------------------------------
    # 辅助：打印全部单词
    # ----------------------------------------------------------
    def all_words(self):
        return self.autocomplete("")

    def __repr__(self):
        words = self.all_words()
        return f"Trie({len(words)} words: {words})"


# ============================================================
# Demo 入口
# ============================================================
if __name__ == "__main__":
    print("=" * 60)
    print("  Trie 字典树演示  Trie Data Structure")
    print("=" * 60)

    # 1. 基本操作
    print("\n" + "-" * 60)
    print("  [1] 基本插入与查找")
    trie = Trie()
    words = ["cat", "car", "care", "careful", "dog", "dot", "dodge"]
    for w in words:
        trie.insert(w)
    print(f"    已插入: {trie}")

    tests = ["cat", "car", "carpet", "dog", "do"]
    for t in tests:
        print(f"    search({t!r:>8}) → {trie.search(t)}")
        print(f"    starts_with({t!r:>8}) → {trie.starts_with(t)}")

    # 2. 自动补全
    print("\n" + "-" * 60)
    print("  [2] 自动补全 (Autocomplete)")
    for prefix in ["ca", "car", "do", "z"]:
        suggestions = trie.autocomplete(prefix)
        print(f"    autocomplete({prefix!r}) → {suggestions}")

    # 3. 删除操作
    print("\n" + "-" * 60)
    print("  [3] 删除操作")
    print(f"    删除前: {trie}")
    trie.delete("care")
    print(f"    删除 'care' 后: {trie}")
    print(f"    search('care')     → {trie.search('care')}")
    print(f"    search('careful')  → {trie.search('careful')}")
    print(f"    autocomplete('ca') → {trie.autocomplete('ca')}")

    # 4. 自动补全场景演示
    print("\n" + "-" * 60)
    print("  [4] 搜索引擎自动补全模拟")
    search_trie = Trie()
    queries = [
        "algorithm", "data structure", "python",
        "algorithm design", "algorithm analysis",
        "data mining", "database", "data visualization",
        "python programming", "python web",
    ]
    for q in queries:
        search_trie.insert(q)

    for prefix in ["algo", "data", "python", "da"]:
        suggestions = search_trie.autocomplete(prefix)
        print(f"    输入 '{prefix}' → 建议: {suggestions}")

    # 5. 前缀计数
    print("\n" + "-" * 60)
    print("  [5] 前缀统计")
    count_trie = Trie()
    census = ["john", "johnny", "johanna", "james", "jason", "jenny"]
    for name in census:
        count_trie.insert(name)

    for prefix in ["jo", "joh", "ja", "je"]:
        node = count_trie._traverse(prefix)
        cnt = node.count if node else 0
        print(f"    前缀 '{prefix}' → {cnt} 个单词")

    # 6. 边界情况
    print("\n" + "-" * 60)
    print("  [6] 边界情况")
    empty_trie = Trie()
    print(f"    空 Trie 查找 'a': {empty_trie.search('a')}")
    print(f"    空 Trie 前缀 'a': {empty_trie.starts_with('a')}")
    print(f"    空 Trie 补全 '':  {empty_trie.autocomplete('')}")
    empty_trie.insert("")
    print(f"    插入空串后 search(''):  {empty_trie.search('')}")

    print("\n" + "=" * 60)
    print("  演示完成!")
    print("=" * 60)