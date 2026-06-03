# TensorFlow 实战演示项目

本书所有章节的可运行示例代码与配置。每个章节对应 `chXX-*/` 目录。

## 前置条件

- Docker Desktop 4.0+（支持 docker compose）
- GPU 章节需要 NVIDIA Docker Runtime（可选）

## 快速开始

```bash
# 1. 启动 Jupyter Notebook（CPU 版）
docker compose up jupyter-cpu -d

# 2. 打开 Jupyter
open http://localhost:8888  # token: 123456

# 3. 验证 TensorFlow
python3 -c "import tensorflow as tf; print(tf.__version__)"

# 4. 按需运行各章节训练（示例：第2章图像分类）
cd ch02-image-classification
docker compose up train
```

## 目录结构

| 目录 | 对应章节 | 内容 |
|------|---------|------|
| `ch02-image-classification/` | 第2章 | 图像分类（CIFAR-10 CNN 训练）|
| `ch04-text-classification/` | 第4章 | 文本分类（IMDB 情感分析）|
| `ch06-timeseries/` | 第6章 | 时间序列预测（电力负荷）|
| `ch09-model-serving/` | 第9章 | TF Serving 模型部署 |
| `workspace/` | — | Jupyter 工作目录 |
| `models/` | — | 导出的模型文件 |

## 清理

```bash
docker compose down -v
```