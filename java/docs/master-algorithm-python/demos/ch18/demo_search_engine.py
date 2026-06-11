"""
demo_search_engine.py — 搜索引擎核心算法：倒排索引 + TF-IDF + BM25

配合第18章"实际工程中的算法应用"之 18.1 使用。

演示内容：
  1. 构建倒排索引（Inverted Index）
  2. TF-IDF 权重计算
  3. BM25 评分
  4. 查询处理（AND/OR 合并 + 排序）
"""

import math
from collections import defaultdict, Counter
from typing import List, Tuple, Dict


# ============================================================
# 倒排索引构建
# ============================================================
def tokenize(text: str) -> List[str]:
    return text.lower().split()


def build_inverted_index(docs: Dict[int, str]):
    """
    构建倒排索引。

    返回：
      index: Dict[词, List[(文档ID, 词频, [位置列表])]]
      doc_lengths: Dict[文档ID, 总词数]
    """
    index: Dict[str, List[Tuple[int, int, List[int]]]] = defaultdict(list)
    doc_lengths: Dict[int, int] = {}

    for doc_id, text in docs.items():
        tokens = tokenize(text)
        doc_lengths[doc_id] = len(tokens)

        positions: Dict[str, List[int]] = defaultdict(list)
        for pos, token in enumerate(tokens):
            positions[token].append(pos)

        for token, pos_list in positions.items():
            index[token].append((doc_id, len(pos_list), pos_list))

    return dict(index), doc_lengths


def print_inverted_index(index: Dict):
    print(f"\n{'=' * 60}")
    print(f"倒排索引（Inverted Index）")
    print(f"{'=' * 60}")
    for term, postings in sorted(index.items()):
        print(f"  '{term}' → ", end="")
        entries = []
        for doc_id, tf, pos in postings:
            entries.append(f"doc{doc_id}(tf={tf}, pos={pos})")
        print("  ".join(entries))


# ============================================================
# TF-IDF 计算
# ============================================================
def compute_tf(tf_raw: int, doc_length: int) -> float:
    """原始词频 / 文档总词数"""
    return tf_raw / doc_length if doc_length > 0 else 0.0


def compute_idf(term: str, index: Dict, total_docs: int) -> float:
    """log(N / df)"""
    df = len(index.get(term, []))
    return math.log(total_docs / df) if df > 0 else 0.0


def compute_tfidf(tf: float, idf: float) -> float:
    return tf * idf


def rank_tfidf(query: str, index: Dict, doc_lengths: Dict, total_docs: int):
    """给定查询，返回所有文档的 TF-IDF 分数"""
    query_tokens = tokenize(query)
    scores: Dict[int, float] = defaultdict(float)

    for term in query_tokens:
        if term not in index:
            continue
        idf = compute_idf(term, index, total_docs)
        for doc_id, tf_raw, _ in index[term]:
            tf = compute_tf(tf_raw, doc_lengths[doc_id])
            scores[doc_id] += compute_tfidf(tf, idf)

    return sorted(scores.items(), key=lambda x: -x[1])


def print_ranked_results(ranked: List[Tuple[int, float]], docs: Dict[int, str], label: str):
    print(f"\n{label}：")
    print(f"{'排名':<6} {'文档':<8} {'得分':<12} {'内容片段'}")
    print("-" * 60)
    for rank, (doc_id, score) in enumerate(ranked, 1):
        snippet = docs[doc_id][:50].replace("\n", " ")
        print(f"{rank:<6} doc{doc_id:<4} {score:<12.4f} \"{snippet}...\"")


# ============================================================
# BM25 评分
# ============================================================
def compute_bm25(
    query: str,
    index: Dict,
    doc_lengths: Dict,
    total_docs: int,
    k1: float = 1.5,
    b: float = 0.75,
):
    """
    BM25 评分。

    BM25(t, d) = IDF(t) × [TF(t,d) × (k1+1)] / [TF(t,d) + k1 × (1 - b + b × |d|/avgdl)]
    """
    query_tokens = tokenize(query)
    avgdl = sum(doc_lengths.values()) / total_docs if total_docs > 0 else 1.0
    scores: Dict[int, float] = defaultdict(float)

    for term in query_tokens:
        if term not in index:
            continue
        idf = compute_idf(term, index, total_docs)
        for doc_id, tf_raw, _ in index[term]:
            doc_len = doc_lengths[doc_id]
            tf = tf_raw  # BM25 使用原始词频
            numerator = tf * (k1 + 1)
            denominator = tf + k1 * (1 - b + b * doc_len / avgdl)
            scores[doc_id] += idf * (numerator / denominator)

    return sorted(scores.items(), key=lambda x: -x[1])


# ============================================================
# 查询处理：AND / OR 合并
# ============================================================
def intersect(postings_a: List, postings_b: List) -> List:
    """两个 posting list 的 AND 合并（文档 ID 交集）"""
    ids_a = {p[0] for p in postings_a}
    ids_b = {p[0] for p in postings_b}
    return sorted(ids_a & ids_b)


def union(postings_a: List, postings_b: List) -> List:
    """两个 posting list 的 OR 合并（文档 ID 并集）"""
    ids_a = {p[0] for p in postings_a}
    ids_b = {p[0] for p in postings_b}
    return sorted(ids_a | ids_b)


def query_processing(query: str, index: Dict, mode: str = "or"):
    """处理布尔查询（AND / OR）"""
    tokens = tokenize(query)
    if not tokens:
        return []

    result_ids = None
    for term in tokens:
        postings = index.get(term, [])
        current_ids = {p[0] for p in postings}
        if result_ids is None:
            result_ids = current_ids
        elif mode == "and":
            result_ids &= current_ids
        else:
            result_ids |= current_ids

    return sorted(result_ids) if result_ids else []


# ============================================================
# TF-IDF 表打印
# ============================================================
def print_tfidf_table(index: Dict, doc_lengths: Dict, total_docs: int):
    print(f"\n{'=' * 60}")
    print(f"TF-IDF 权重表")
    print(f"{'=' * 60}")
    print(f"{'词':<10} {'文档':<8} {'TF':<10} {'IDF':<10} {'TF-IDF':<10}")
    print("-" * 48)
    for term, postings in sorted(index.items()):
        idf = compute_idf(term, index, total_docs)
        for doc_id, tf_raw, _ in postings:
            tf = compute_tf(tf_raw, doc_lengths[doc_id])
            tfidf = compute_tfidf(tf, idf)
            print(f"'{term:<6}' doc{doc_id:<4} {tf:<10.4f} {idf:<10.4f} {tfidf:<10.4f}")


# ============================================================
# 测试
# ============================================================
def _test():
    print("=" * 72)
    print("搜索引擎核心算法演示")
    print("=" * 72)

    # ---- 语料库 ----
    docs = {
        1: "the cat sat on the mat",
        2: "the dog sat on the log",
        3: "cats and dogs are great pets",
        4: "machine learning is the future of technology",
        5: "deep learning and machine learning are related",
        6: "the cat and the dog are friends",
    }

    print(f"\n语料库（6 个文档）：")
    for doc_id, text in docs.items():
        print(f"  doc{doc_id}: \"{text}\"")

    # ---- 1. 构建倒排索引 ----
    print("\n" + "-" * 72)
    print("1. 构建倒排索引")
    print("-" * 72)

    index, doc_lengths = build_inverted_index(docs)
    total_docs = len(docs)

    print_inverted_index(index)

    # ---- 2. TF-IDF 权重 ----
    print("\n" + "-" * 72)
    print("2. TF-IDF 权重分析")
    print("-" * 72)

    print_tfidf_table(index, doc_lengths, total_docs)

    # ---- 3. TF-IDF 检索排名 ----
    print("\n" + "-" * 72)
    print("3. TF-IDF 查询排名")
    print("-" * 72)

    queries = ["cat dog", "machine learning", "sat on"]
    for q in queries:
        ranked = rank_tfidf(q, index, doc_lengths, total_docs)
        print_ranked_results(ranked, docs, f"查询 \"{q}\" (TF-IDF)")

    # ---- 4. BM25 检索排名 ----
    print("\n" + "-" * 72)
    print("4. BM25 查询排名")
    print("-" * 72)

    for q in queries:
        ranked = compute_bm25(q, index, doc_lengths, total_docs, k1=1.5, b=0.75)
        print_ranked_results(ranked, docs, f"查询 \"{q}\" (BM25)")

    # ---- 5. TF-IDF vs BM25 对比 ----
    print("\n" + "-" * 72)
    print("5. TF-IDF vs BM25 对比")
    print("-" * 72)

    q = "the cat dog"
    tfidf_ranked = rank_tfidf(q, index, doc_lengths, total_docs)
    bm25_ranked = compute_bm25(q, index, doc_lengths, total_docs)

    print(f"\n查询 \"{q}\"：")
    print(f"\n{'排名':<6} {'文档':<8} {'TF-IDF':<12} {'BM25':<12} {'内容片段'}")
    print("-" * 70)
    for (tid, ts), (bid, bs) in zip(tfidf_ranked, bm25_ranked):
        snippet = docs[tid][:45].replace("\n", " ")
        print(f"{'':<4} doc{tid:<4} {ts:<12.4f} {bs:<12.4f} \"{snippet}...\"")

    # ---- 6. 布尔查询 ----
    print("\n" + "-" * 72)
    print("6. 布尔查询（AND / OR）")
    print("-" * 72)

    bool_queries = [
        ("cat dog", "and"),
        ("cat dog", "or"),
        ("machine learning", "and"),
        ("machine sat", "and"),
    ]

    for q, mode in bool_queries:
        result = query_processing(q, index, mode)
        print(f"  \"{q}\" ({mode.upper()}): docs {result}" if result
              else f"  \"{q}\" ({mode.upper()}): (无匹配)")

    # ---- 7. 附加：BM25 参数影响 ----
    print("\n" + "-" * 72)
    print("7. BM25 参数 k1 的影响")
    print("-" * 72)

    q = "cat dog"
    for k1 in [0.5, 1.5, 3.0]:
        ranked = compute_bm25(q, index, doc_lengths, total_docs, k1=k1, b=0.75)
        scores_str = "  ".join(f"doc{id}={s:.2f}" for id, s in ranked[:3])
        print(f"  k1={k1:.1f}: {scores_str}")

    print()


if __name__ == "__main__":
    _test()