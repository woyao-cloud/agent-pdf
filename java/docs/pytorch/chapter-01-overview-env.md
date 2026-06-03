# 第1章 PyTorch 概述与开发环境

## 本章导读

PyTorch 在深度学习框架中的地位，可以类比 Linux 在操作系统中的地位——它不是用户最多的（TensorFlow 曾经用户更多），但它是"研究者最爱的"。PyTorch 在 2017 年由 Facebook AI Research 发布后迅速成为学术界的主流选择：**动态图（Define-by-Run）** 让调试像写普通 Python 一样自然，这在研究新模型时体现出了巨大的优势。

到 PyTorch 2.x（2023 年发布），通过 `torch.compile` 引入了图编译能力，在保持动态图灵活性的同时，性能上甚至可以超越 TensorFlow。

```
PyTorch vs TensorFlow 的"世纪之争"：

  ┌──────────────┬──────────────────┬──────────────────┐
  │              │     PyTorch      │   TensorFlow 2.x │
  ├──────────────┼──────────────────┼──────────────────┤
  │  计算图      │  动态图（即时执行）│  eager + tf.function │
  │  调试体验    │  pdb 直接打断点   │  需要 eager 模式    │
  │  学术界      │  ✅ 主流（论文）  │  ❌               │
  │  工业界      │  ✅ 快速增长      │  ✅ 成熟稳定       │
  │  部署        │  TorchServe      │  TF Serving       │
  │  移动端      │  PyTorch Mobile  │  TFLite           │
  │  分布式      │  DDP（原生支持）  │  MirroredStrategy │
  └──────────────┴──────────────────┴──────────────────┘
```

---

## 1.1 开发环境搭建

```yaml
# demos/docker-compose.yml
version: "3.8"

services:
  jupyter-cpu:
    image: pytorch/pytorch:2.2.0-cpu
    container_name: pt-jupyter
    ports:
      - "8888:8888"
    volumes:
      - ./workspace:/workspace
    working_dir: /workspace
    command: >
      sh -c "pip install jupyter torchvision torchtext
      && jupyter notebook --ip=0.0.0.0 --port=8888
      --allow-root --NotebookApp.token=123456"
    networks:
      - pt-net

  jupyter-gpu:
    image: pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime
    container_name: pt-jupyter-gpu
    profiles: ["gpu"]
    ports:
      - "8889:8888"
    volumes:
      - ./workspace:/workspace
    working_dir: /workspace
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    command: >
      sh -c "pip install jupyter torchvision torchtext
      && jupyter notebook --ip=0.0.0.0 --port=8888
      --allow-root --NotebookApp.token=123456"
    networks:
      - pt-net

networks:
  pt-net:
    driver: bridge
```

```bash
# 启动
docker compose up jupyter-cpu -d
open http://localhost:8888  # token: 123456

# 验证
import torch
print(f"PyTorch 版本: {torch.__version__}")
print(f"CUDA 可用: {torch.cuda.is_available()}")
# 简单计算
x = torch.randn(3, 4)
y = torch.randn(4, 5)
z = torch.mm(x, y)
print(f"矩阵乘法: {z.shape}")  # (3, 5)
```

---

## 1.2 PyTorch vs TensorFlow 核心差异

```python
# ① 动态图的调试体验
# PyTorch：直接写，直接执行，直接打断点
x = torch.tensor([1, 2, 3])
y = x + 1
print(y)  # → tensor([2, 3, 4])  立即输出！可在任意行打断点

# TF 2.x：虽然也是 eager，但 @tf.function 编译后不能打断点

# ② 模型定义风格
# PyTorch —— 面向对象，纯粹的 Python
class MyModel(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.fc = torch.nn.Linear(10, 2)

    def forward(self, x):
        return self.fc(x)  # 想怎么 debug 就怎么 debug

# TF/Keras —— 声明式
# model = keras.Sequential([keras.layers.Dense(2, input_shape=(10,))])
```

---

## 1.3 本章速查

```bash
# 一键启动 PyTorch 开发环境
docker compose up jupyter-cpu -d
open http://localhost:8888
```

## 本章总结

PyTorch 的最大优势是**灵活**。如果你在写新的模型、尝试论文中的新结构、或者需要高度定制化的训练逻辑，PyTorch 是不二之选。