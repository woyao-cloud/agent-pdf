"""
demo_case_study.py — 算法选型案例研究：聚类算法对比

配合第21章"算法工程实践"之 21.3（算法选型与风险评估）使用。

核心问题：在真实场景中，不同的数据特征会影响算法的适用性。
本演示通过三种聚类算法在三种不同特征的数据集上的表现，
展示算法选型的决策过程。

演示内容：
  1. K-Means        — 快速、适合球形簇、需指定 K
  2. DBSCAN         — 任意形状、自动检测噪声、不需 K
  3. Hierarchical   — 层次结构、可视化的树状图

对比维度：
  - 聚类效果（NMI / Adjusted Rand Index）
  - 时间性能
  - 对参数选择的敏感性
  - 各算法的局限性
"""

import time
import numpy as np
try:
    from sklearn.datasets import make_blobs, make_moons, make_circles
    from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
    from sklearn.metrics import adjusted_rand_score, normalized_mutual_info_score
    from sklearn.preprocessing import StandardScaler
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False


# ============================================================
# 数据集生成
# ============================================================

def generate_datasets(random_seed: int = 42):
    """生成三种不同特征的聚类数据集"""
    rs = np.random.RandomState(random_seed)

    # 1. 球形簇 —— K-Means 的理想场景
    blobs, labels_blob = make_blobs(
        n_samples=1500, centers=4, cluster_std=1.2,
        random_state=random_seed
    )

    # 2. 月亮形状 —— 非凸簇，考验密度聚类
    moons, labels_moon = make_moons(
        n_samples=1500, noise=0.08, random_state=random_seed
    )

    # 3. 圆环形状 + 噪声 —— 需要处理噪声和复杂形状
    circles, labels_circle = make_circles(
        n_samples=1500, noise=0.05, factor=0.4,
        random_state=random_seed
    )
    circles_noise = np.vstack([
        circles,
        rs.uniform(low=-2.0, high=2.0, size=(200, 2))
    ])
    labels_circle_noise = np.concatenate([
        labels_circle, [-1] * 200  # -1 表示噪声
    ])

    datasets = [
        ("球形簇 (Blobs)", blobs, labels_blob),
        ("月牙形 (Moons)", moons, labels_moon),
        ("圆环 + 噪声 (Circles+Noise)", circles_noise, labels_circle_noise),
    ]
    return datasets


# ============================================================
# 聚类算法评估
# ============================================================

def evaluate_clustering(X, labels_true, algorithms: dict) -> dict:
    """
    在给定数据集上运行多个聚类算法并评估。

    返回：
        {algo_name: {"ari": float, "nmi": float, "time": float, ...}}
    """
    results = {}
    for name, algo in algorithms.items():
        start = time.perf_counter()
        try:
            y_pred = algo.fit_predict(X)
        except Exception as e:
            y_pred = None
            elapsed = time.perf_counter() - start
            results[name] = {
                "ari": None,
                "nmi": None,
                "time": elapsed,
                "n_clusters": None,
                "error": str(e)
            }
            print(f"  ⚠ {name} 执行失败: {e}")
            continue

        elapsed = time.perf_counter() - start

        # 排除噪声点（DBSCAN 标记为 -1）后再计算指标
        mask = y_pred != -1
        if mask.sum() == 0:
            ari = None
            nmi = None
        elif mask.sum() < len(X) * 0.5:
            ari = adjusted_rand_score(labels_true[mask], y_pred[mask])
            nmi = normalized_mutual_info_score(labels_true[mask], y_pred[mask])
        else:
            ari = adjusted_rand_score(labels_true, y_pred)
            nmi = normalized_mutual_info_score(labels_true, y_pred)

        n_clusters = len(set(y_pred) - {-1})
        n_noise = int((y_pred == -1).sum())

        results[name] = {
            "ari": ari,
            "nmi": nmi,
            "time": elapsed,
            "n_clusters": n_clusters,
            "n_noise": n_noise,
            "error": None
        }
    return results


# ============================================================
# 主测试流程
# ============================================================

def run_case_study():
    if not SKLEARN_AVAILABLE:
        print("=" * 72)
        print("算法选型案例研究：聚类算法对比（需要 scikit-learn）")
        print("=" * 72)
        print("\n  scikit-learn 未安装，请运行: pip install scikit-learn")
        print("  或者使用 demo_risk_analysis.py（无需外部依赖）\n")
        return

    print("=" * 72)
    print("算法选型案例研究：聚类算法对比")
    print("=" * 72)

    # ---- 定义待评估的算法 ----
    algorithms = {
        "K-Means(k=4)": KMeans(n_clusters=4, random_state=42, n_init=10),
        "K-Means(k=2)": KMeans(n_clusters=2, random_state=42, n_init=10),
        "DBSCAN(eps=0.3)": DBSCAN(eps=0.3, min_samples=5),
        "DBSCAN(eps=0.5)": DBSCAN(eps=0.5, min_samples=5),
        "Hierarchical(ward,k=4)": AgglomerativeClustering(
            n_clusters=4, linkage="ward"
        ),
        "Hierarchical(single,k=2)": AgglomerativeClustering(
            n_clusters=2, linkage="single"
        ),
    }

    # ---- 生成测试数据 ----
    datasets = generate_datasets()

    # ---- 逐数据集评估 ----
    all_results = {}
    for data_name, X, y_true in datasets:
        print(f"\n{'─' * 72}")
        print(f"数据集: {data_name}")
        print(f"样本数: {X.shape[0]:>6}, 特征数: {X.shape[1]}")
        print(f"{'─' * 72}")

        # 标准化（对基于距离的算法很重要）
        X_scaled = StandardScaler().fit_transform(X)

        results = evaluate_clustering(X_scaled, y_true, algorithms)
        all_results[data_name] = results

        # ---- 打印对比表格 ----
        header = f"{'算法':<28} {'ARI':>8} {'NMI':>8} {'耗时(ms)':>10} {'簇数':>6} {'噪声':>6}"
        print(header)
        print("-" * len(header))
        for algo_name in algorithms:
            r = results[algo_name]
            ari_str = f"{r['ari']:.4f}" if r['ari'] is not None else "  N/A"
            nmi_str = f"{r['nmi']:.4f}" if r['nmi'] is not None else "  N/A"
            time_str = f"{r['time'] * 1000:.1f}"
            n_clu_str = str(r['n_clusters']) if r['n_clusters'] is not None else "N/A"
            n_noise_str = str(r['n_noise']) if r['n_noise'] is not None else "N/A"
            print(f"{algo_name:<28} {ari_str:>8} {nmi_str:>8} {time_str:>10} {n_clu_str:>6} {n_noise_str:>6}")
            if r['error']:
                print(f"{'':>28} ⚠ {r['error']}")

    # ---- 综合分析 ----
    print(f"\n{'=' * 72}")
    print("综合分析")
    print(f"{'=' * 72}")

    summarize(all_results)


def summarize(all_results: dict):
    """打印综合分析报告"""
    for data_name, results in all_results.items():
        print(f"\n▶ {data_name}")

        # 找到最佳算法
        best_ari = -1
        best_algo_ari = None
        best_nmi = -1
        best_algo_nmi = None

        for name, r in results.items():
            if r['ari'] is not None and r['ari'] > best_ari:
                best_ari = r['ari']
                best_algo_ari = name
            if r['nmi'] is not None and r['nmi'] > best_nmi:
                best_nmi = r['nmi']
                best_algo_nmi = name

        if best_algo_ari:
            print(f"  ARI 最佳: {best_algo_ari} (ARI={best_ari:.4f})")
        if best_algo_nmi:
            print(f"  NMI 最佳: {best_algo_nmi} (NMI={best_nmi:.4f})")

        # 分析各算法表现
        for name, r in results.items():
            if r['error']:
                print(f"  ⚠ {name}: 失败 — {r['error']}")
            elif r['ari'] is not None and r['ari'] < 0.3:
                print(f"  ! {name}: ARI={r['ari']:.4f} 效果差，不适合此类数据")


def _test():
    run_case_study()


if __name__ == "__main__":
    _test()