# 第3章 图像分类（Image Classification）

## 本章导读

假设你接到一个任务：给一家电商平台做一个**商品图像分类系统**。用户在 App 上拍一张商品照片，系统自动识别出是"手机"、"电脑"还是"服装"。

你觉得这道题有多难？如果你用传统的图像处理方法（提取特征 → SVM 分类），你至少需要做以下工作：

```
传统方法：手动提取特征 → 分类
  1. 提取颜色直方图（256 维）
  2. 提取 SIFT 特征点（数量不定）
  3. 提取 HOG 特征（3780 维）
  4. 合并所有特征向量
  5. 用 SVM/LR 训练分类器
  6. 特征选不好 → 准确率 ≤ 70%
  7. 换个数据集 → 全部重来

深度学习方法：端到端学习
  1. 下载预训练模型（ResNet、MobileNet 等）
  2. 替换最后几层（迁移学习）
  3. 在商品图片上微调
  4. 准确率 ≥ 95%
  5. 换个数据集 → 重新微调（不需要改模型结构）
```

这就是迁移学习的威力。本章用 CIFAR-10 数据集（10 类、6 万张图）演示如何用 PyTorch 的预训练 ResNet-18 快速构建一个高精度的图像分类模型。

---

## 3.1 实现原理：CNN + 残差连接

### 卷积层在做什么？

卷积层的作用是**提取图像中的局部特征**。不同的卷积核提取不同的特征：

```
卷积核的可视化：

  输入图像（32×32 RGB）        第一个卷积核（3×3×3）
  ┌────────────────────┐     ┌─────┬─────┬─────┐
  │                    │     │ -1  │  0  │  1  │  ← 检测垂直边缘
  │                    │     ├─────┼─────┼─────┤
  │                    │     │ -1  │  0  │  1  │
  │                    │     ├─────┼─────┼─────┤
  │                    │     │ -1  │  0  │  1  │
  │                    │     └─────┴─────┴─────┘
  └────────────────────┘
          ↓
  ┌────────────────────┐     另一个卷积核（检测水平边缘）
  │                    │     ┌─────┬─────┬─────┐
  │  ██████████        │     │ -1  │ -1  │ -1  │
  │  ██████████        │     ├─────┼─────┼─────┤
  │  ██████████        │     │  0  │  0  │  0  │
  │  ██████████        │     ├─────┼─────┼─────┤
  │                    │     │  1  │  1  │  1  │
  └────────────────────┘     └─────┴─────┴─────┘
```

### 残差连接（ResNet）——解决"越深越差"的问题

直觉上，增加网络层数应该提高准确率。但实际中，层数太多时准确率反而下降——不是过拟合，而是**梯度消失**（梯度经过太多层后变得极小，参数几乎不动了）。

```
ResNet 的残差连接（跳跃连接）：

  传统网络（Plain Network）：
  输入 → Conv → ReLU → Conv → ReLU → 输出
         ↓                          ↑
         梯度在 ReLU 和 Conv 中不断衰减
         100 层后梯度几乎为 0 → 参数不更新 → 准确率不提升

  ResNet（带残差连接）：
  输入 ──────────────────────────────────┐
         ↓                                │
        Conv → ReLU → Conv → ReLU →  (+) → 输出
                                    ↑
  梯度可以走"捷径"跳过 Conv 层直接传回输入

  残差连接的效果：
  不加残差：50 层 ResNet 准确率 < 20 层（梯度消失）
  加残差：152 层 ResNet 准确率 > 50 层 ✓

  通俗理解：
  传统网络：爬楼梯 → 必须一步步走，中间断了就上不去
  残差网络：带电梯的楼梯 → 既可以走楼梯（学习复杂变换），
           也可以坐电梯（确保梯度能传回去）
```

---

## 3.2 完整代码

```python
import torch
import torch.nn as nn
import torch.optim as optim
import torchvision
import torchvision.transforms as transforms
from torchvision.models import resnet18

# ===== 1. 数据加载与增强 =====
#
# 关键点：数据增强可以显著提升模型泛化能力
# CIFAR-10 只有 5000 张/类 → 通过增强"生成"更多训练样本
#
transform_train = transforms.Compose([
    transforms.RandomCrop(32, padding=4),       # 随机裁剪——产生不同视角
    transforms.RandomHorizontalFlip(),           # 随机翻转——学习对称性
    transforms.ToTensor(),
    transforms.Normalize(                        # 标准化到 N(0,1)
        (0.4914, 0.4822, 0.4465),
        (0.2023, 0.1994, 0.2010)),
])

transform_test = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize(
        (0.4914, 0.4822, 0.4465),
        (0.2023, 0.1994, 0.2010)),
])

trainset = torchvision.datasets.CIFAR10(
    root='./data', train=True, download=True, transform=transform_train)
trainloader = torch.utils.data.DataLoader(
    trainset, batch_size=128, shuffle=True, num_workers=4)

testset = torchvision.datasets.CIFAR10(
    root='./data', train=False, download=True, transform=transform_test)
testloader = torch.utils.data.DataLoader(
    testset, batch_size=128, shuffle=False, num_workers=4)

print(f"训练集: {len(trainset)} 张, 测试集: {len(testset)} 张")

# ===== 2. 迁移学习：使用预训练 ResNet18 =====
#
# pretrained=True 表示使用在 ImageNet（1400 万张图）上训练好的权重
# 这些权重已经学会了"如何提取图像特征"
# 我们只需要修改最后一层（分类层）来适配 CIFAR-10 的 10 类
#
model = resnet18(pretrained=True)

# 修改最后一层：512 维 → 10 类
model.fc = nn.Linear(512, 10)

# 移到 GPU
model = model.cuda()

print(f"模型参数量: {sum(p.numel() for p in model.parameters()):,}")

# ===== 3. 训练配置 =====
criterion = nn.CrossEntropyLoss()
optimizer = optim.SGD(model.parameters(), lr=0.1, momentum=0.9, weight_decay=5e-4)

# 余弦退火学习率调度——学习率从 0.1 逐渐降低到 0
scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=200)

# ===== 4. 训练循环 =====
for epoch in range(30):
    model.train()
    running_loss = 0.0

    for inputs, labels in trainloader:
        inputs, labels = inputs.cuda(), labels.cuda()

        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        running_loss += loss.item()

    scheduler.step()

    if epoch % 5 == 0:
        print(f'Epoch {epoch+1}, Loss: {running_loss/len(trainloader):.4f}')

# ===== 5. 评估 =====
model.eval()
correct = total = 0
with torch.no_grad():
    for inputs, labels in testloader:
        inputs, labels = inputs.cuda(), labels.cuda()
        outputs = model(inputs)
        _, predicted = outputs.max(1)
        total += labels.size(0)
        correct += predicted.eq(labels).sum().item()

print(f'\n测试集准确率: {100.0 * correct / total:.2f}%')
# CIFAR-10 上用 ResNet18 迁移学习：
# - 不微调（随机初始化分类层）：~85%
# - 微调全部层：~92-95%
# - 从头训练（不迁移）：~75-80%

# ===== 6. 保存模型 =====
torch.save(model.state_dict(), 'cifar10_resnet18.pth')
print("模型已保存")
```

---

## 3.3 潜在风险

| 风险 | 原因 | 症状 | 方案 |
|------|------|------|------|
| 过拟合 | CIFAR-10 数据量小（5000/类） | 训练 99% / 测试 70% | 数据增强 + Dropout + weight_decay |
| GPU OOM | Batch Size 太大 | CUDA out of memory | batch_size=128→64→32 |
| 类别不平衡 | 某些类样本少 | 该类准确率 0% | `class_weight` 参数 |
| 迁移学习负迁移 | 预训练任务差异过大 | 从头训练比迁移好 | 解冻更多层微调 |

---

## 本章总结

| 概念 | 作用 | 代码 |
|------|------|------|
| 数据增强 | 用有限数据生成更多训练样本 | `RandomCrop`, `RandomFlip` |
| 迁移学习 | 借用已学好的特征提取器 | `resnet18(pretrained=True)` |
| 残差连接 | 解决深度网络的梯度消失 | ResNet 内置 |
| 余弦退火 | 学习率逐渐降低，精细化收敛 | `CosineAnnealingLR` |