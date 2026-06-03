# 第2章 PyTorch 核心概念速成

## 2.1 Tensor 基础

```python
import torch
import numpy as np

# 创建 Tensor
t1 = torch.tensor([1, 2, 3])                # 从列表
t2 = torch.from_numpy(np.array([1, 2, 3]))  # 从 NumPy
t3 = torch.zeros(3, 4)                       # 全 0
t4 = torch.ones(3, 4)                        # 全 1
t5 = torch.randn(3, 4)                       # 正态分布随机

# Tensor 的属性
print(t5.shape)       # torch.Size([3, 4])
print(t5.dtype)       # torch.float32
print(t5.device)      # cpu / cuda:0

# GPU 迁移
if torch.cuda.is_available():
    t5 = t5.cuda()    # CPU → GPU
    t5 = t5.cpu()     # GPU → CPU

# 与 NumPy 互转
arr = t5.numpy()                    # Tensor → NumPy（共享内存！）
t = torch.from_numpy(arr)            # NumPy → Tensor（共享内存！）
```

## 2.2 Autograd 自动求导

```python
# 核心：autograd 自动计算梯度

# 需要求导的张量设置 requires_grad=True
x = torch.tensor([2.0], requires_grad=True)
w = torch.tensor([3.0], requires_grad=True)
b = torch.tensor([1.0], requires_grad=True)

# 前向计算
y = w * x + b  # y = 3*2 + 1 = 7

# 反向传播
y.backward()

# 查看梯度
print(x.grad)  # ∂y/∂x = w = 3.0
print(w.grad)  # ∂y/∂w = x = 2.0
print(b.grad)  # ∂y/∂b = 1.0
```

## 2.3 nn.Module 模型构建

```python
import torch.nn as nn

# 方式一：Sequential（简单堆叠）
model = nn.Sequential(
    nn.Linear(784, 256),
    nn.ReLU(),
    nn.Dropout(0.2),
    nn.Linear(256, 10)
)

# 方式二：自定义 Module（最灵活，推荐）
class MLP(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(784, 256)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(0.2)
        self.fc2 = nn.Linear(256, 10)

    def forward(self, x):
        x = self.fc1(x)
        x = self.relu(x)
        x = self.dropout(x)
        x = self.fc2(x)
        return x

model = MLP()
print(model)
```

## 2.4 DataLoader 数据加载

```python
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms

# 自定义 Dataset
class MyDataset(Dataset):
    def __init__(self, images, labels, transform=None):
        self.images = images
        self.labels = labels
        self.transform = transform

    def __len__(self):
        return len(self.images)

    def __getitem__(self, idx):
        img = self.images[idx]
        label = self.labels[idx]
        if self.transform:
            img = self.transform(img)
        return img, label

# DataLoader——高效数据加载
dataset = MyDataset(images, labels, transform=transforms.ToTensor())
dataloader = DataLoader(
    dataset,
    batch_size=64,
    shuffle=True,
    num_workers=4,       # 多进程加载（GPU 训练的关键）
    pin_memory=True      # 加快 CPU→GPU 传输
)

# 训练循环
for epoch in range(10):
    for batch_x, batch_y in dataloader:
        batch_x = batch_x.cuda()  # 移到 GPU
        batch_y = batch_y.cuda()
        # ... 前向 + 反向 + 优化
```

---

## 本章总结

| 概念 | 一句话 | 代码 |
|------|--------|------|
| Tensor | 多维数组 + GPU 加速 | `torch.tensor(data).cuda()` |
| Autograd | 自动计算梯度 | `loss.backward()` |
| nn.Module | 模型构建基类 | `class MyModel(nn.Module)` |
| DataLoader | 多进程数据加载 | `DataLoader(dataset, num_workers=4)` |