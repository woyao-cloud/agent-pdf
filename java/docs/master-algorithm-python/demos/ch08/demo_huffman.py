"""
demo_huffman.py — Huffman 编码：前缀码树的贪心构造

配合第8章"贪心算法"之 8.3（经典问题）使用。

演示内容：
  1. Huffman 编码树构造（最小优先队列合并）
  2. 生成字符的编码表
  3. 编码/解码字符串
  4. 与定长编码的压缩率对比
  5. 前缀码性质验证
"""

from typing import Dict, List, Tuple
import heapq


# ============================================================
# Huffman 树节点
# ============================================================
class HuffmanNode:
    def __init__(self, char: str, freq: int):
        self.char = char
        self.freq = freq
        self.left: "HuffmanNode | None" = None
        self.right: "HuffmanNode | None" = None

    def __lt__(self, other: "HuffmanNode") -> bool:
        return self.freq < other.freq

    def __repr__(self) -> str:
        return f"Node('{self.char}', {self.freq})"


# ============================================================
# Huffman 编码器
# ============================================================
class HuffmanCoder:
    """
    Huffman 编码器。

    用法：
        coder = HuffmanCoder({'A': 5, 'B': 9, 'C': 12, 'D': 13, 'E': 16, 'F': 45})
        encoded = coder.encode("ABCDEF")
        decoded = coder.decode(encoded)
    """

    def __init__(self, freq_map: Dict[str, int]):
        if not freq_map:
            raise ValueError("频率表不能为空")

        self.freq_map = freq_map
        self.root: HuffmanNode | None = None
        self.encode_map: Dict[str, str] = {}  # char -> binary code
        self.decode_map: Dict[str, str] = {}  # binary code -> char

        self._build_tree()
        self._build_maps()

    # ----------------------------------------------------------
    # 构建 Huffman 树
    # ----------------------------------------------------------
    def _build_tree(self):
        """贪心合并最小频率节点，构造 Huffman 树"""
        heap = []
        for char, freq in self.freq_map.items():
            heapq.heappush(heap, HuffmanNode(char, freq))

        print("\n构建 Huffman 树过程:")
        print(f"  初始堆: {[(n.char, n.freq) for n in heap]}")

        step = 1
        while len(heap) > 1:
            left = heapq.heappop(heap)
            right = heapq.heappop(heap)

            merged = HuffmanNode("", left.freq + right.freq)
            merged.left = left
            merged.right = right

            heapq.heappush(heap, merged)
            print(f"  步骤{step}: 合并 '{left.char}'({left.freq}) + "
                  f"'{right.char}'({right.freq}) → "
                  f"新节点({merged.freq})")
            step += 1

        self.root = heapq.heappop(heap)
        print(f"\nHuffman 树根节点频率: {self.root.freq}")

    # ----------------------------------------------------------
    # 生成编码表
    # ----------------------------------------------------------
    def _build_maps(self):
        """DFS 遍历 Huffman 树，生成每个字符的编码"""
        def _dfs(node: HuffmanNode | None, code: str):
            if node is None:
                return
            if node.char:  # 叶子节点
                self.encode_map[node.char] = code
                self.decode_map[code] = node.char
                return
            _dfs(node.left, code + "0")
            _dfs(node.right, code + "1")

        _dfs(self.root, "")

    # ----------------------------------------------------------
    # 打印树结构
    # ----------------------------------------------------------
    def print_tree(self):
        """打印 Huffman 树的结构"""
        def _print(node: HuffmanNode | None, prefix: str, is_left: bool):
            if node is None:
                return
            label = f"'{node.char}'" if node.char else ""
            print(f"{prefix}{'├── ' if is_left else '└── '}"
                  f"{label}({node.freq})")
            child_prefix = prefix + ("│   " if is_left else "    ")
            if node.left:
                _print(node.left, child_prefix, True)
            if node.right:
                _print(node.right, child_prefix, False)

        if self.root:
            print(f"\nHuffman 树结构:")
            print(f"  Root({self.root.freq})")
            if self.root.left:
                _print(self.root.left, "  ", True)
            if self.root.right:
                _print(self.root.right, "  ", False)

    # ----------------------------------------------------------
    # 编码 / 解码
    # ----------------------------------------------------------
    def encode(self, text: str) -> str:
        """将字符串编码为二进制字符串"""
        return "".join(self.encode_map[ch] for ch in text)

    def decode(self, encoded: str) -> str:
        """将二进制字符串解码为原始字符串"""
        result = []
        code = ""
        for bit in encoded:
            code += bit
            if code in self.decode_map:
                result.append(self.decode_map[code])
                code = ""
        if code:
            raise ValueError(f"解码失败: 存在未完成的编码 '{code}'")
        return "".join(result)

    # ----------------------------------------------------------
    # 压缩信息
    # ----------------------------------------------------------
    def get_compression_info(self, text: str) -> dict:
        """获取压缩信息：定长 vs 变长编码的位数对比"""
        n_chars = len(text)
        n_unique = len(self.freq_map)

        fixed_bits_per_char = (n_unique - 1).bit_length() or 1
        fixed_total = n_chars * fixed_bits_per_char

        encoded = self.encode(text)
        huffman_total = len(encoded)

        return {
            "原始文本长度": n_chars,
            "不同字符数": n_unique,
            "定长编码位/字符": fixed_bits_per_char,
            "定长编码总位数": fixed_total,
            "Huffman 编码总位数": huffman_total,
            "压缩率": f"{huffman_total / fixed_total * 100:.1f}%",
            "节省": f"{fixed_total - huffman_total} bits ({((fixed_total - huffman_total) / fixed_total * 100):.1f}%)"
        }


# ============================================================
# 定长编码（对比用）
# ============================================================
class FixedLengthCoder:
    """定长编码器，用于对比 Huffman 压缩率"""

    def __init__(self, chars: List[str]):
        self.chars = sorted(set(chars))
        n = len(self.chars)
        self.bits_per_char = max(1, (n - 1).bit_length())
        self.encode_map = {
            ch: format(i, f'0{self.bits_per_char}b')
            for i, ch in enumerate(self.chars)
        }
        self.decode_map = {v: k for k, v in self.encode_map.items()}

    def encode(self, text: str) -> str:
        return "".join(self.encode_map[ch] for ch in text)

    def decode(self, encoded: str) -> str:
        bc = self.bits_per_char
        return "".join(
            self.decode_map[encoded[i:i + bc]]
            for i in range(0, len(encoded), bc)
        )


# ============================================================
# 前缀码验证
# ============================================================
def _is_prefix_free(codes: Dict[str, str]) -> bool:
    """验证编码是否是前缀码（任意编码都不是另一个编码的前缀）"""
    code_list = list(codes.values())
    for i, c1 in enumerate(code_list):
        for j, c2 in enumerate(code_list):
            if i != j and c2.startswith(c1):
                return False
    return True


# ============================================================
# 测试
# ============================================================
def _test():
    print("=" * 72)
    print("Huffman 编码演示")
    print("=" * 72)

    # ---- 1. 基本案例 ----
    print("-" * 72)
    print("1. 基本案例：字符频率表")
    print("-" * 72)

    freq_map = {
        'A': 5,
        'B': 9,
        'C': 12,
        'D': 13,
        'E': 16,
        'F': 45,
    }

    print(f"\n字符频率表: {freq_map}")
    print(f"总字符数: {sum(freq_map.values())}")

    coder = HuffmanCoder(freq_map)
    coder.print_tree()

    print(f"\n编码表:")
    print(f"  {'字符':>4} {'频率':>6} {'编码':>10} {'长度':>6}")
    print(f"  {'-' * 28}")
    for ch in sorted(coder.encode_map.keys()):
        code = coder.encode_map[ch]
        freq = freq_map[ch]
        print(f"  {ch:>4} {freq:>6} {code:>10} {len(code):>6}")

    # ---- 2. 前缀码验证 ----
    print("-" * 72)
    print("2. 前缀码性质验证")
    print("-" * 72)

    is_prefix_free = _is_prefix_free(coder.encode_map)
    codes_str = ", ".join(f"'{ch}':{code}" for ch, code in sorted(coder.encode_map.items()))
    print(f"\n编码: {{{codes_str}}}")
    print(f"是否满足前缀码性质: {'[Yes]' if is_prefix_free else '[No]'}")
    print(f"（前缀码性质 = 任意编码都不是另一个编码的前缀）")

    # ---- 3. 编码/解码 ----
    print("-" * 72)
    print("3. 编码与解码")
    print("-" * 72)

    test_text = "ABCDEF"
    print(f"\n原始文本: \"{test_text}\"")

    encoded = coder.encode(test_text)
    print(f"Huffman 编码: {encoded}")
    print(f"编码位数: {len(encoded)}")

    decoded = coder.decode(encoded)
    print(f"解码结果: \"{decoded}\"")
    print(f"解码正确: {'OK' if decoded == test_text else 'FAIL'}")

    # ---- 4. 与定长编码对比（压缩率） ----
    print("-" * 72)
    print("4. 压缩率对比")
    print("-" * 72)

    fixed = FixedLengthCoder(list(freq_map.keys()))

    fixed_encoded = fixed.encode(test_text)
    huffman_encoded = coder.encode(test_text)

    print(f"\n定长编码（{fixed.bits_per_char} bits/char）: {fixed_encoded}")
    print(f"Huffman 编码: {huffman_encoded}")

    info = coder.get_compression_info(test_text)
    print(f"\n压缩信息:")
    for key, val in info.items():
        print(f"  {key}: {val}")

    # ---- 5. 更长文本测试 ----
    print("-" * 72)
    print("5. 更长文本测试")
    print("-" * 72)

    # 模拟英文文本的典型频率
    english_freq = {
        ' ': 18,
        'E': 12, 'T': 9, 'A': 8, 'O': 7, 'I': 7,
        'N': 7, 'S': 6, 'H': 6, 'R': 6, 'D': 4,
        'L': 4, 'C': 3, 'U': 3, 'M': 3, 'W': 2,
        'F': 2, 'G': 2, 'Y': 2, 'P': 2, 'B': 1,
        'V': 1, 'K': 1, 'J': 0.5, 'X': 0.5,
        'Q': 0.3, 'Z': 0.2,
    }
    # 转为整数频率
    eng_freq = {ch: max(1, int(f * 10)) for ch, f in english_freq.items()}

    print(f"模拟英文频率表（{len(eng_freq)} 个字符）")

    eng_coder = HuffmanCoder(eng_freq)

    sample_text = "THIS IS A SAMPLE TEXT FOR HUFFMAN ENCODING DEMONSTRATION"
    eng_encoded = eng_coder.encode(sample_text)
    eng_decoded = eng_coder.decode(eng_encoded)

    print(f"\n示例文本: \"{sample_text}\"")
    print(f"编码长度: {len(eng_encoded)} bits")
    print(f"解码正确: {'OK' if eng_decoded == sample_text else 'FAIL'}")

    # 压缩率
    fixed_eng = FixedLengthCoder(list(eng_freq.keys()))
    fixed_len = len(fixed_eng.encode(sample_text))
    huff_len = len(eng_encoded)
    ratio = huff_len / fixed_len * 100
    print(f"定长编码: {fixed_len} bits")
    print(f"Huffman: {huff_len} bits")
    print(f"压缩率: {ratio:.1f}%")

    # ---- 6. 边界情况 ----
    print("-" * 72)
    print("6. 边界情况")
    print("-" * 72)

    # 6a. 单字符
    single_coder = HuffmanCoder({'A': 100})
    print(f"\n单字符频率 {{'A': 100}}:")
    print(f"  编码表: {single_coder.encode_map}")
    single_encoded = single_coder.encode("AAA")
    single_decoded = single_coder.decode(single_encoded)
    print(f"  编码 'AAA': {single_encoded}")
    print(f"  解码: '{single_decoded}'")

    # 6b. 等频率
    equal_freq = {'A': 1, 'B': 1, 'C': 1, 'D': 1}
    equal_coder = HuffmanCoder(equal_freq)
    print(f"\n等频率 {{'A':1, 'B':1, 'C':1, 'D':1}}:")
    equal_encoded = equal_coder.encode("ABCD")
    equal_decoded = equal_coder.decode(equal_encoded)
    print(f"  编码表: {equal_coder.encode_map}")
    print(f"  编码 'ABCD': {equal_encoded}")
    print(f"  解码正确: '{equal_decoded}'")


if __name__ == "__main__":
    _test()