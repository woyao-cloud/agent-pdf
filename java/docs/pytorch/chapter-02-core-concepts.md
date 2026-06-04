# 第2章 PyTorch 核心概念速成

## 本章导读

别害怕——在开始写真正的深度学习模型之前，你只需要理解四个概念：**Tensor（张量）**、**Autograd（自动求导）**、**nn.Module（模型）**、**DataLoader（数据加载）**。

这四个概念就像开车需要理解的"方向盘、油门、刹车、挡位"——你不需要知道发动机内部的工作原理，但你需要知道怎么用它们来"开车"（训练模型）。

本章用 30 分钟让你掌握这四个概念，并且在最后写出一个**完整的训练脚本**。

---

## 2.1 Tensor——PyTorch 的"基本数据类型"

### Tensor 就是"能在 GPU 上跑的 NumPy 数组"

如果你用过 NumPy，你已经会了 Tensor 的 80%：

```python
import torch
import numpy as np

# ===== 创建 Tensor（和 NumPy 几乎一样） =====
t1 = torch.tensor([1, 2, 3])                  # 从列表创建
t2 = torch.from_numpy(np.array([1, 2, 3]))    # 从 NumPy 创建
t3 = torch.zeros(2, 3)                         # 全零
t4 = torch.ones(2, 3)                          # 全一
t5 = torch.randn(2, 3)                         # 正态分布随机
t6 = torch.arange(0, 10)                       # 0 到 9 的序列
t7 = torch.linspace(0, 1, steps=5)             # 0 到 1 的 5 个等分点

print(f"t5: \n{t5}")
print(f"t6: {t6}")
print(f"t7: {t7}")

# ===== Tensor 的属性 =====
print(f"形状: {t5.shape}")       # torch.Size([2, 3])
print(f"类型: {t5.dtype}")       # torch.float32
print(f"设备: {t5.device}")      # cpu

# ===== Tensor 的运算（和 NumPy 一样） =====
a = torch.tensor([[1, 2], [3, 4]])
b = torch.tensor([[5, 6], [7, 8]])

c = a + b           # 加法：每个元素相加
d = a * b           # 乘法：每个元素相乘（不是矩阵乘法！）
e = torch.mm(a, b)   # 矩阵乘法：[2,2] × [2,2] → [2,2]
f = a.matmul(b)     # 另一种矩阵乘法写法

print(f"加法:\n{c}")
print(f"矩阵乘法:\n{f}")

# ===== Tensor 的形状操作 =====
x = torch.randn(2, 3, 4)           # 3 维张量
x_flat = x.view(-1)                 # 展平为 1 维 (24,)
x_2d = x.view(2, -1)                # 变为 2 维 (2, 12)
x_transposed = x.transpose(0, 1)    # 转置 → (3, 2, 4)

# ===== GPU 迁移 =====
if torch.cuda.is_available():
    t_gpu = t5.cuda()                 # CPU → GPU
    t_cpu = t_gpu.cpu()               # GPU → CPU
    print(f"GPU 张量: {t_gpu.device}")

# ===== Tensor 与 NumPy 互转（共享内存！） =====
np_arr = t5.numpy()                    # Tensor → NumPy
# ⚠️ 重要：转换后的数组共享内存！
# 修改 tensor 会同时修改 numpy 数组
t5[0, 0] = 999
print(f"NumPy 也被改了: {np_arr[0, 0]}")  # → 999.0
```

### Tensor 的"4 个灵魂拷问"

```
使用 Tensor 前问自己 4 个问题：

  ① 形状（shape）对吗？
    全连接层输入形状: (batch_size, feature_dim)
    CNN 输入形状:     (batch_size, channels, height, width)
    LSTM 输入形状:    (batch_size, seq_len, feature_dim)

  ② 类型（dtype）对吗？
    nn.Linear 要求: float32（默认）
    交叉熵损失标签: int64（长整型）

  ③ 设备（device）对吗？
    模型在 GPU 上，数据也要在 GPU 上
    损失函数计算时，prediction 和 label 要在同一个设备

  ④ 梯度（requires_grad）对吗？
    模型参数: 自动设为 True（不需要手动设置）
    输入数据: 默认 False（设置 True 会浪费显存）
```

---

## 2.2 Autograd——自动求导

### 为什么需要自动求导？

训练神经网络的核心是**梯度下降**：计算 loss 对每个参数的偏导数（梯度），然后沿着梯度的反方向更新参数。

如果你手算梯度，对于一个有 100 万个参数的 ResNet——你可能需要一年时间。Autograd 自动帮你算好所有梯度。

```python
# ===== 最简单的自动求导例子 =====
x = torch.tensor([2.0], requires_grad=True)
w = torch.tensor([3.0], requires_grad=True)
b = torch.tensor([1.0], requires_grad=True)

# 前向计算：y = w × x + b = 3 × 2 + 1 = 7
y = w * x + b

# 反向传播：自动计算所有梯度
y.backward()

# 查看梯度
print(f"∂y/∂x = {x.grad.item()}")  # w = 3.0
print(f"∂y/∂w = {w.grad.item()}")  # x = 2.0
print(f"∂y/∂b = {b.grad.item()}")  # 1.0

# ===== 一个真实训练中的 autograd 使用 =====
model = torch.nn.Linear(10, 1)     # 10 个输入 → 1 个输出
optimizer = torch.optim.SGD(model.parameters(), lr=0.01)

for step in range(100):
    # 随机数据
    x = torch.randn(32, 10)         # 32 个样本，每个 10 维
    y = torch.randn(32, 1)          # 32 个目标值

    y_pred = model(x)                # 前向传播
    loss = ((y_pred - y) ** 2).mean()  # MSE 损失

    optimizer.zero_grad()            # ⚠️ 必须：清零梯度
    loss.backward()                  # 反向传播：计算梯度
    optimizer.step()                 # 更新参数
```

### ⚠️ 梯度累积——最常见的 Bug

```python
# PyTorch 的梯度是"累积"的，不是"覆盖"的
# 每次 backward() 会累加梯度，而不是替换

model = torch.nn.Linear(10, 1)
x = torch.randn(32, 10)
y = torch.randn(32, 1)

for step in range(3):
    y_pred = model(x)
    loss = ((y_pred - y) ** 2).mean()
    loss.backward()

    # 第 1 步后：参数有了梯度 g1
    # 第 2 步后：梯度 = g1 + g2（不是 g2！）
    # 第 3 步后：梯度 = g1 + g2 + g3（越来越大的原因！）

    # ✅ 正确做法：每次反向传播前清零梯度
    # optimizer.zero_grad()
    # loss.backward()
    # optimizer.step()
```

---

## 2.3 nn.Module——模型构建

### 三种构建方式

```python
import torch.nn as nn

# ===== 方式 1：Sequential——快速堆叠 =====
# 适合：简单的前向传播，没有分支
model = nn.Sequential(
    nn.Linear(784, 256),     # 输入 784 → 256
    nn.ReLU(),                # 激活函数
    nn.Dropout(0.2),          # 防过拟合
    nn.Linear(256, 10),       # 256 → 10（输出）
)
print(model)

# ===== 方式 2：自定义 nn.Module——最灵活 =====
# 适合：复杂的网络结构（多输入、多输出、分支、跳跃连接）
class MLP(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(784, 256)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(0.2)
        self.fc2 = nn.Linear(256, 10)

    def forward(self, x):
        # forward 就是纯 Python 方法，可以写任何逻辑
        x = self.fc1(x)
        x = self.relu(x)
        x = self.dropout(x)
        x = self.fc2(x)
        return x

model = MLP()
print(model)

# ===== 方式 3：Functional API——无状态层 =====
# 适合：不需要参数的运算（如激活函数）
class MyModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(10, 64)
        self.fc2 = nn.Linear(64, 2)

    def forward(self, x):
        x = self.fc1(x)
        x = torch.relu(x)        # 使用函数式 API（不需要 nn.ReLU）
        x = self.fc2(x)
        return torch.softmax(x, dim=-1)  # 函数式 softmax
```

### forward() 方法——模型的"灵魂"

```python
# forward() 是 nn.Module 中唯一必须实现的方法
# 它定义了一次前向传播的计算过程

class CustomModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(10, 10)
        self.fc2 = nn.Linear(10, 2)

    def forward(self, x, return_features=False):
        # forward 可以接受额外参数！
        x = torch.relu(self.fc1(x))

        if return_features:
            # 既返回特征，又返回分类结果
            return x, self.fc2(x)

        return self.fc2(x)

model = CustomModel()
x = torch.randn(4, 10)

# 正常调用
out = model(x)

# 返回特征
features, out = model(x, return_features=True)
```

---

## 2.4 DataLoader——高效数据加载

### Dataset 和 DataLoader 的分工

```
Dataset：定义"如何读一条数据"
DataLoader：定义"如何批量加载"

  你的硬盘                        DataLoader                          GPU
  ┌──────────┐                  ┌────────────────┐                ┌──────┐
  │ 图片 1    │  Dataset.__getitem__   │  线程 1: 加载图片 │        │      │
  │ 图片 2    │ ──────────────►  │  线程 2: 加载图片  │──batch──►│ 模型  │
  │ 图片 3    │                  │  线程 3: 加载图片  │          │      │
  │ ...       │                  │  线程 4: 加载图片  │          └──────┘
  └──────────┘                  └────────────────┘
                                 num_workers=4 → 4 个线程并加载
```

### 完整代码

```python
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from PIL import Image
import os

# ===== 自定义 Dataset——告诉 PyTorch 怎么读你的数据 =====
class ImageFolderDataset(Dataset):
    def __init__(self, root_dir, transform=None):
        self.samples = []
        self.transform = transform

        # 遍历目录：class_folder/ 下的所有图片
        for label, class_name in enumerate(sorted(os.listdir(root_dir))):
            class_path = os.path.join(root_dir, class_name)
            for img_name in os.listdir(class_path):
                self.samples.append((os.path.join(class_path, img_name), label))

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        img_path, label = self.samples[idx]
        img = Image.open(img_path).convert('RGB')
        if self.transform:
            img = self.transform(img)
        return img, label

# ===== 数据增强管道（训练时使用） =====
train_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.RandomHorizontalFlip(),     # 随机翻转——数据增强
    transforms.RandomRotation(10),         # 随机旋转——数据增强
    transforms.ColorJitter(0.2, 0.2),      # 随机颜色——数据增强
    transforms.ToTensor(),                  # 转为 Tensor
    transforms.Normalize([0.485, 0.456, 0.406],   # ImageNet 标准化
                         [0.229, 0.224, 0.225]),
])

# ===== DataLoader——高性能批量加载 =====
dataset = ImageFolderDataset('data/train', transform=train_transform)
dataloader = DataLoader(
    dataset,
    batch_size=64,
    shuffle=True,            # 每个 epoch 打乱数据
    num_workers=4,           # ⚠️ 4 个进程并行加载
    pin_memory=True,         # ⚠️ 加速 CPU→GPU 传输
    drop_last=True,          # 丢弃最后一个不完整的 batch
)

print(f"数据集大小: {len(dataset)}")
print(f"每个 epoch 的 batch 数: {len(dataloader)}")

# 标准训练循环
for epoch in range(10):
    for batch_x, batch_y in dataloader:
        batch_x = batch_x.cuda()   # 移到 GPU
        batch_y = batch_y.cuda()
        # ... 前向 + 反向 + 优化
```

---

## 2.5 完整训练循环（14 行核心代码）

```python
"""PyTorch 训练循环的标准格式——记住这个模板就够了"""
import torch
import torch.nn as nn

# 1. 数据
X = torch.randn(1000, 10)
y = torch.randn(1000, 1)

# 2. 模型 + 损失 + 优化器
model = nn.Sequential(nn.Linear(10, 64), nn.ReLU(), nn.Linear(64, 1))
loss_fn = nn.MSELoss()
optimizer = torch.optim.SGD(model.parameters(), lr=0.01)

# 3. 训练循环（核心 5 行）
for epoch in range(100):
    y_pred = model(X)                    # ① 前向传播
    loss = loss_fn(y_pred, y)            # ② 计算损失
    optimizer.zero_grad()                # ③ 清零梯度
    loss.backward()                      # ④ 反向传播
    optimizer.step()                     # ⑤ 更新参数

    if epoch % 20 == 0:
        print(f'Epoch {epoch}: loss = {loss.item():.6f}')
```

---

## 本章总结

| 概念 | 一句话 | 关键代码 | 常见错误 |
|------|--------|---------|---------|
| **Tensor** | GPU 上跑的 NumPy 数组 | `t = torch.tensor(data).cuda()` | 忘了 `.cuda()` → 在 CPU 上跑 |
| **Autograd** | 自动算梯度 | `loss.backward()` | 忘了 `zero_grad()` → 梯度累积 |
| **nn.Module** | 模型 = Python 类 | `class MyModel(nn.Module)` | `__init__` 里忘了 `super().__init__()` |
| **DataLoader** | 多进程加载数据 | `DataLoader(ds, num_workers=4)` | `num_workers=0` → GPU 空等 |

下一章将用这些知识解决一个真实的图像分类问题——给 CIFAR-10 的 10 类图片分类。