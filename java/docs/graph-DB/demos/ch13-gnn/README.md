# 图神经网络 (GNN) 演示代码

## 环境要求

```bash
pip install torch torch-geometric networkx matplotlib numpy scikit-learn
```

## 演示内容

| 文件 | 说明 |
|------|------|
| `01_node_classification.py` | 使用GCN对Cora论文引用网络进行节点分类 |
| `02_link_prediction.py` | 使用GAE进行链接预测 |
| `03_node2vec_demo.py` | Node2Vec图嵌入 + 节点分类 |

## 运行方式

```bash
python 01_node_classification.py
python 02_link_prediction.py
python 03_node2vec_demo.py
```

## 注意事项

- 首次运行会自动下载Cora数据集
- PyTorch Geometric需要根据CUDA版本安装
- 建议在Python 3.9+环境中运行
