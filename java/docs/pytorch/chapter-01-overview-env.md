# 第1章 PyTorch 概述与开发环境

## 本章导读

2017 年 1 月，Facebook AI Research 在 GitHub 上开源了一个深度学习框架——PyTorch。当时没人能预料到，这个"新来者"会在短短几年内成为学术界的主流选择，并逐渐在工业界蚕食 TensorFlow 的份额。

PyTorch 成功的主要原因只有一个：**动态图（Define-by-Run）**。

```
PyTorch 与 TensorFlow 1.x 的核心体验差异：

  TensorFlow 1.x 静态图时代（2015-2018）：
  ┌──────────────────────────────────────────────┐
  │  x = tf.placeholder(tf.float32, [None, 784])  │  ← 先声明"占位符"
  │  y = tf.matmul(x, w) + b                      │  ← 构建计算图
  │                                               │
  │  with tf.Session() as sess:                    │  ← 再启动 Session
  │      sess.run(y, feed_dict={x: data})          │  ← 才能跑起来
  │                                               │
  │  # 如果想打印中间结果：                         │
  │  y = tf.Print(y, [y], "y的值是：")             │  ← 必须用 tf.Print！
  │  # 不能用 print(y)！因为 y 只是一个图节点      │
  │  # 不能打断点调试！因为图还没执行               │
  └──────────────────────────────────────────────┘

  PyTorch 动态图时代（2017 至今）：
  ┌──────────────────────────────────────────────┐
  │  x = torch.randn(64, 784)                    │  ← 直接创建数据
  │  y = x @ w.t() + b                            │  ← 直接计算，立即执行
  │  print(y.shape)   # → torch.Size([64, 10])   │  ← 立即打印！没问题
  │                                               │
  │  # 可以用 if/for/while：                       │
  │  for i in range(5):                           │  ← 纯 Python 语法
  │      if y[i].sum() > 0:                       │
  │          print(f"第{i}个样本为正")             │
  │                                               │
  │  # 可以打断点：                                │
  │  import pdb; pdb.set_trace()                  │  ← 想停哪就停哪
  └──────────────────────────────────────────────┘
```

这段区别怎么强调都不过分。在 PyTorch 出现之前，研究者必须在一套"不写 Python、写 DSL"的框架中工作。PyTorch 让深度学习代码回到了正常的 Python 世界——你不需要学习一套新的"图构建语言"，写 PyTorch 就像写普通的 Python 程序一样。

---

## 1.1 PyTorch vs TensorFlow

### 2024 年的框架生态

```
当前深度学习框架生态格局：

  ┌──────────────────────────────────────────────────────────────┐
  │                       PyTorch（学术首选 + 工业增长）           │
  │  优点：动态图、pdb 调试、numpy 风格、HuggingFace 默认框架     │
  │  缺点：部署工具链不如 TF 成熟                                │
  ├──────────────────────────────────────────────────────────────┤
  │                    TensorFlow（工业界稳定选择）                │
  │  优点：TF Serving 成熟、TFLite 移动端覆盖广、Keras API 友好   │
  │  缺点：动态图支持晚于 PyTorch、调试体验略差                   │
  ├──────────────────────────────────────────────────────────────┤
  │                   JAX（Google 新一代，研究者追捧）             │
  │  优点：函数式编程、自动并行编译、XLA 编译优化                 │
  │  缺点：学习曲线陡峭、生态尚不完善                            │
  └──────────────────────────────────────────────────────────────┘
```

### PyTorch 的核心优势

```python
# 优势 1：动态图 = 灵活的模型结构
# 在 PyTorch 中，同一个 batch 的不同样本可以用不同的网络路径

class DynamicNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(10, 10)
        self.fc2 = nn.Linear(10, 10)
        self.fc3 = nn.Linear(10, 2)

    def forward(self, x):
        # 每条数据可以走不同的路径！
        if x.sum() > 0:
            return self.fc3(self.fc1(x))    # 正数走这条路径
        else:
            return self.fc3(self.fc2(x))    # 负数走这条路径
        # 在 TF 1.x 的静态图中完全做不到！

# 优势 2：和 NumPy 无缝互转（零学习成本）
import numpy as np
np_array = np.array([1, 2, 3])
torch_tensor = torch.from_numpy(np_array)  # 共享内存
back_to_np = torch_tensor.numpy()          # 零拷贝

# 优势 3：HuggingFace 默认后端
# 所有 HuggingFace 模型默认使用 PyTorch
# from transformers import AutoModel
# model = AutoModel.from_pretrained("bert-base-chinese")  # PyTorch 版本
```

---

## 1.2 PyTorch 生态全景

```
PyTorch 的核心组件：

  ┌──────────────────────────────────────────────────────────────────┐
  │                     PyTorch Core（torch）                        │
  │  Tensor 操作  │  Autograd  │  nn.Module  │  Optim  │  DataLoader │
  └──────────────────────────────┬───────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
  ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
  │  torchvision  │     │  torchaudio   │     │   torchtext      │
  │  图像/视频     │     │  音频处理      │     │   文本处理        │
  │  预训练模型    │     │  声学模型      │     │   词表/分词器    │
  └──────────────┘     └──────────────┘     └──────────────────┘

        ▼                       ▼                       ▼
  ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
  │  TorchServe  │     │  PyTorch     │     │   HuggingFace    │
  │  模型部署     │     │  Mobile      │     │   Transformers   │
  │  REST/gRPC   │     │  Android/iOS  │     │   BERT/GPT 等    │
  └──────────────┘     └──────────────┘     └──────────────────┘
```

---

## 1.3 开发环境搭建

### 用 Docker Compose 一键启动

```yaml
# demos/docker-compose.yml —— PyTorch 开发环境
# 包含 CPU 和 GPU 两种配置

version: "3.8"

services:
  # CPU 版本（所有电脑都能跑）
  jupyter-cpu:
    image: pytorch/pytorch:2.2.0-cpu
    container_name: pt-jupyter
    ports:
      - "8888:8888"
    volumes:
      - ./workspace:/workspace
    working_dir: /workspace
    command: >
      sh -c "pip install jupyter torchvision torchtext torchinfo
      && jupyter notebook --ip=0.0.0.0 --port=8888
      --allow-root --NotebookApp.token=123456"
    networks:
      - pt-net

  # GPU 版本（需要 NVIDIA 显卡 + Docker 配置）
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
      sh -c "pip install jupyter torchvision torchtext torchinfo
      && jupyter notebook --ip=0.0.0.0 --port=8888
      --allow-root --NotebookApp.token=123456"
    networks:
      - pt-net

networks:
  pt-net:
    driver: bridge
```

### 启动和验证

```bash
# CPU 版
docker compose up jupyter-cpu -d
open http://localhost:8888  # token: 123456

# 在 Jupyter 中运行验证代码
```

```python
import torch
import torchvision
import numpy as np

print(f"PyTorch 版本: {torch.__version__}")
print(f"torchvision 版本: {torchvision.__version__}")
print(f"CUDA 可用: {torch.cuda.is_available()}")
print(f"GPU 数量: {torch.cuda.device_count()}")

# Tensor 基础操作
x = torch.tensor([[1, 2, 3], [4, 5, 6]])
y = torch.ones_like(x)
z = x + y
print(f"x + y = \n{z}")

# GPU 迁移测试
if torch.cuda.is_available():
    device = torch.device('cuda')
    x_gpu = x.to(device)
    print(f"在 {torch.cuda.get_device_name(0)} 上计算")
    print(f"GPU 结果: {(x_gpu * 2).cpu()}")

# 测试 torchvision 是否可用
model = torchvision.models.resnet18(pretrained=False)
print(f"ResNet-18 参数量: {sum(p.numel() for p in model.parameters()):,}")
```

### 常见安装问题

```bash
# 问题 1：Docker 中 GPU 不可用
# 检查：docker run --rm --gpus all nvidia/cuda:12.1-base nvidia-smi
# 解决：安装 NVIDIA Container Toolkit
#   distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
#   curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
#   sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
#   sudo systemctl restart docker

# 问题 2：torchvision 版本不匹配
# 检查：pip show torch torchvision
# 解决：使用官方的 `pytorch/pytorch` 镜像（自带版本匹配）

# 问题 3：显存不足
# 解决：用 CPU 版本开发调试，用 GPU 版本跑训练
```

---

## 1.4 第一个完整训练脚本

```python
"""一个完整的 PyTorch 训练循环（14 行核心代码）"""
import torch, torch.nn as nn

# 1. 数据
X = torch.randn(1000, 10)
y = torch.randn(1000, 1)

# 2. 模型 + 损失 + 优化器
model = nn.Sequential(nn.Linear(10, 64), nn.ReLU(), nn.Linear(64, 1))
loss_fn = nn.MSELoss()
optimizer = torch.optim.SGD(model.parameters(), lr=0.01)

# 3. 训练循环
for epoch in range(100):
    y_pred = model(X)                    # 前向传播
    loss = loss_fn(y_pred, y)            # 计算损失
    optimizer.zero_grad()                # 清零梯度
    loss.backward()                      # 反向传播
    optimizer.step()                     # 更新参数
    if epoch % 20 == 0:
        print(f'Epoch {epoch}: loss = {loss.item():.6f}')
```

---

## 本章总结

```bash
# 一键启动
cd demos && docker compose up jupyter-cpu -d
open http://localhost:8888

# GPU 版本（如有显卡）
docker compose --profile gpu up jupyter-gpu -d
open http://localhost:8889
```

| 特性 | PyTorch | 对比 TensorFlow |
|------|---------|----------------|
| **计算图** | 动态图（默认） | eager（默认）+ tf.function |
| **调试** | pdb 直接打断点 | eager 模式可调试 |
| **模型定义** | Python 类（nn.Module） | Keras 或 tf.Module |
| **数据加载** | DataLoader + Dataset | tf.data |
| **部署** | TorchServe | TF Serving |
| **移动端** | PyTorch Mobile | TFLite |
| **学术论文** | 90%+ 使用 | < 10% |

**PyTorch 的最大优势是灵活**。如果你在写新模型、尝试论文中的新结构、或者需要高度定制化的训练逻辑，PyTorch 就是不二之选。本章的 Docker Compose 环境将在后面所有章节中使用。下一章我们用 30 分钟掌握 PyTorch 最核心的四个概念。