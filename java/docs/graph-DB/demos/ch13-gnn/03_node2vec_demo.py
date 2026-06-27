# -*- coding: utf-8 -*-
"""
Node2Vec图嵌入演示 - 使用随机游走生成节点嵌入
"""
import networkx as nx
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

print("构建Karate Club图...")
G = nx.karate_club_graph()
print(f"节点数: {G.number_of_nodes()}")
print(f"边数: {G.number_of_edges()}")

# 简单的Node2Vec实现：使用随机游走生成序列，然后用SVD降维
def random_walk(graph, start_node, walk_length):
    walk = [start_node]
    for _ in range(walk_length - 1):
        neighbors = list(graph.neighbors(walk[-1]))
        if not neighbors:
            break
        walk.append(np.random.choice(neighbors))
    return walk

def generate_walks(graph, num_walks, walk_length):
    walks = []
    nodes = list(graph.nodes())
    for _ in range(num_walks):
        np.random.shuffle(nodes)
        for node in nodes:
            walks.append(random_walk(graph, node, walk_length))
    return walks

print("生成随机游走序列...")
walks = generate_walks(G, num_walks=10, walk_length=20)
print(f"生成 {len(walks)} 条游走序列")

# 构建共现矩阵
from collections import defaultdict, Counter
co_occur = defaultdict(Counter)
window_size = 3

for walk in walks:
    for i, node in enumerate(walk):
        for j in range(max(0, i - window_size), min(len(walk), i + window_size + 1)):
            if i != j:
                co_occur[node][walk[j]] += 1

# 构建邻接矩阵并做SVD降维
nodes = list(G.nodes())
n = len(nodes)
node_to_idx = {n: i for i, n in enumerate(nodes)}
co_matrix = np.zeros((n, n))
for node, neighbors in co_occur.items():
    for neighbor, count in neighbors.items():
        co_matrix[node_to_idx[node], node_to_idx[neighbor]] = count

# SVD降维到16维
U, S, Vt = np.linalg.svd(co_matrix, full_matrices=False)
embeddings = U[:, :16] * S[:16]

print(f"嵌入维度: {embeddings.shape}")

# 使用嵌入进行节点分类
labels = [0 if G.nodes[n]['club'] == 'Mr. Hi' else 1 for n in nodes]
X_train, X_test, y_train, y_test = train_test_split(embeddings, labels, test_size=0.3, random_state=42)

clf = LogisticRegression(max_iter=1000)
clf.fit(X_train, y_train)
y_pred = clf.predict(X_test)
acc = accuracy_score(y_test, y_pred)
print(f"\n节点分类准确率 (使用Node2Vec嵌入): {acc:.4f} ({acc*100:.2f}%)")
print("演示完成！")
