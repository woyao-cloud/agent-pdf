# PyTorch 实战演示项目

## 前置条件

- Docker Desktop 4.0+（支持 docker compose）

## 快速开始

```bash
# 1. 启动 Jupyter Notebook
docker compose up jupyter-cpu -d
open http://localhost:8888  # token: 123456

# 2. 验证
python3 -c "import torch; print(torch.__version__)"

# 3. 运行某章节训练
cd ch03-classification
docker compose up train
```

## 目录

| 目录 | 章节 | 内容 |
|------|------|------|
| `ch03-classification/` | 第3章 | 图像分类 ResNet 训练 |
| `ch07-timeseries/` | 第7章 | 时间序列 LSTM 预测 |
| `ch09-serving/` | 第9章 | TorchServe 部署 |
| `workspace/` | — | Jupyter 工作目录 |

## 清理

```bash
docker compose down -v
```