# 附录

## 附录A：Docker Compose 环境速查

```bash
# CPU 版 Jupyter
docker compose -f demos/docker-compose.yml up jupyter-cpu -d

# GPU 版 Jupyter
docker compose -f demos/docker-compose.yml --profile gpu up jupyter-gpu -d

# 某章节训练
docker compose -f demos/ch02-image-classification/docker-compose.yml up train

# 模型部署
docker compose -f demos/ch09-model-serving/docker-compose.yml up -d
```

## 附录B：常用 API 速查

| 分类 | API | 说明 |
|------|-----|------|
| Layer | `keras.layers.Dense(64)` | 全连接层 |
| Layer | `keras.layers.Conv2D(32, 3)` | 卷积层 |
| Layer | `keras.layers.LSTM(64)` | LSTM 层 |
| Layer | `keras.layers.Embedding(10000, 64)` | 词嵌入层 |
| Loss | `keras.losses.BinaryCrossentropy()` | 二分类损失 |
| Loss | `keras.losses.SparseCategoricalCrossentropy()` | 多分类损失 |
| Loss | `keras.losses.MeanSquaredError()` | 回归损失 |
| Optimizer | `keras.optimizers.Adam(lr=0.001)` | Adam 优化器 |
| Metric | `keras.metrics.Accuracy()` | 准确率 |
| Metric | `keras.metrics.MeanAbsoluteError()` | 平均绝对误差 |

## 附录C：TensorBoard 可视化指南

```bash
# 启动 TensorBoard
tensorboard --logdir ./logs --port 6006 --bind_all
# 打开 http://localhost:6006

# 主要面板
# Scalars: Loss/Accuracy 曲线
# Graphs: 计算图
# Histograms: 权重分布
# Images: 输入图片预览
# Projector: Embedding 可视化（PCA/t-SNE）
```

## 附录D：面试高频问题

| 问题 | 回答要点 |
|------|---------|
| 为什么用 CNN 而不是全连接网络做图像？ | 局部连接 + 权重共享 + 平移不变性 |
| LSTM 如何解决梯度消失？ | 遗忘门/输入门/输出门 + 细胞状态直连 |
| GAN 训练不稳定的原因？ | 判别器太强/太弱 + 模式崩塌，用 WGAN-GP |
| 迁移学习为什么要冻结前几层？ | 前几层提取通用特征（边缘/颜色），后几层提取任务特定特征 |
| TF Serving 如何实现零停机更新？ | 多版本同时加载 → 旧版本流量逐步切到新版本 |