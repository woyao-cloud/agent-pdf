# 第8章 生成对抗网络（GAN）

## 本章导读

2014 年，Ian Goodfellow 在酒吧跟朋友讨论一个想法：**让两个神经网络互相博弈，共同进步**。这个想法后来成为 GAN（生成对抗网络）——被 Yann LeCun 称为"过去十年深度学习最酷的想法"。

GAN 的核心理学比喻非常直观：

```
GAN 的"造假者与警察"博弈：

  初始状态：
  造假者（生成器 G）→ 用蜡笔画了一幅"梵高"→ 一眼假
  警察（判别器 D）→ "这是假的！"  → 轻松识破

  第 100 轮：
  造假者经过训练 → 画得像一点了
  警察经过训练 → 能看出更细微的破绽

  第 1000 轮：
  造假者画得能以假乱真
  警察需要仔细看才能分辨

  第 10000 轮（平衡状态）：
  造假者画得和真画一模一样
  警察完全无法区分（准确率 = 50%，等于随机猜）

  此时 GAN 训练完成！
  生成器 G 可以产生以假乱真的图像
```

---

## 8.1 训练过程详解

### 判别器先练（看真假画），生成器再练（学画得更真）

```
GAN 的一个训练周期的两个步骤：

  步骤 1：训练判别器（警察）
  ┌────────────────────────────────────────────────────────┐
  │  输入 1：真实 MNIST 数字 → D 判断 → 标签: 真 (1.0)   │
  │  输入 2：G 生成的假数字  → D 判断 → 标签: 假 (0.0)   │
  │                                                        │
  │  D 的目标：让真实图片的预测接近 1，假图片接近 0          │
  │  D 的损失：BCE(真图预测, 1) + BCE(假图预测, 0)         │
  └────────────────────────────────────────────────────────┘

  步骤 2：训练生成器（造假者）
  ┌────────────────────────────────────────────────────────┐
  │  输入：随机噪声 z → G → 假数字 → D 判断 → 标签: ?     │
  │                                                        │
  │  G 的目标：让 D 把假数字误判为真（标签=1）               │
  │  G 的损失：BCE(D(假图), 1)   ← 让 D 认错！             │
  │                                                        │
  │  ⚠️ 注意：G 的损失用"真"标签！（希望骗过 D）           │
  └────────────────────────────────────────────────────────┘
```

### 完整代码

```python
import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import datasets, transforms
from torch.utils.data import DataLoader

# ===== 生成器（造假者）：从随机噪声生成图像 =====
class Generator(nn.Module):
    """输入：100 维随机噪声 → 输出：28×28 灰度图"""
    def __init__(self, latent_dim=100):
        super().__init__()
        self.model = nn.Sequential(
            nn.Linear(latent_dim, 256),
            nn.BatchNorm1d(256), nn.ReLU(),
            nn.Linear(256, 512),
            nn.BatchNorm1d(512), nn.ReLU(),
            nn.Linear(512, 1024),
            nn.BatchNorm1d(1024), nn.ReLU(),
            nn.Linear(1024, 28*28),
            nn.Tanh()  # 输出 [-1, 1] 范围
        )

    def forward(self, z):
        return self.model(z).view(-1, 1, 28, 28)

# ===== 判别器（警察）：判断图像是真是假 =====
class Discriminator(nn.Module):
    """输入：28×28 灰度图 → 输出：真/假概率"""
    def __init__(self):
        super().__init__()
        self.model = nn.Sequential(
            nn.Linear(28*28, 512),
            nn.LeakyReLU(0.2), nn.Dropout(0.3),
            nn.Linear(512, 256),
            nn.LeakyReLU(0.2), nn.Dropout(0.3),
            nn.Linear(256, 1),
            nn.Sigmoid()   # 输出 0-1 之间的概率
        )

    def forward(self, x):
        return self.model(x.view(x.size(0), -1))

# ===== 训练 =====
latent_dim = 100
batch_size = 64

G = Generator(latent_dim).cuda()
D = Discriminator().cuda()

criterion = nn.BCELoss()
g_opt = optim.Adam(G.parameters(), lr=0.0002, betas=(0.5, 0.999))
d_opt = optim.Adam(D.parameters(), lr=0.0002, betas=(0.5, 0.999))

# 加载 MNIST 数据
transform = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize((0.5,), (0.5,))  # [-1, 1]，与 G 输出的 Tanh 匹配
])
dataset = datasets.MNIST(root='./data', train=True, transform=transform, download=True)
loader = DataLoader(dataset, batch_size, shuffle=True, num_workers=4)

print("开始训练 GAN...")
for epoch in range(100):
    for real_imgs, _ in loader:
        batch = real_imgs.size(0)
        real_imgs = real_imgs.cuda()

        # 标签
        real_labels = torch.ones(batch, 1).cuda()
        fake_labels = torch.zeros(batch, 1).cuda()

        # ===== 训练判别器（尽量分清真假） =====
        z = torch.randn(batch, latent_dim).cuda()
        fake_imgs = G(z)
        d_loss = criterion(D(real_imgs), real_labels) + \
                 criterion(D(fake_imgs.detach()), fake_labels)
        d_opt.zero_grad()
        d_loss.backward()
        d_opt.step()

        # ===== 训练生成器（尽量骗过判别器） =====
        z = torch.randn(batch, latent_dim).cuda()
        fake_imgs = G(z)
        g_loss = criterion(D(fake_imgs), real_labels)  # 用"真"标签骗 D
        g_opt.zero_grad()
        g_loss.backward()
        g_opt.step()

    if epoch % 10 == 0:
        print(f'Epoch {epoch:3d}, D Loss: {d_loss.item():.4f}, G Loss: {g_loss.item():.4f}')

torch.save(G.state_dict(), '/models/gan_generator.pth')
print("生成器模型已保存")
```

---

## 8.2 潜在风险

| 风险 | 表现 | 原因 | 方案 |
|------|------|------|------|
| **模式崩塌** | G 只生成数字 1 | G 发现了 D 的漏洞 | WGAN-GP |
| **训练不稳定** | Loss 剧烈震荡 | D 太强或 G 太弱 | lr=0.0002, betas=(0.5, 0.999) |
| **判别器太强** | D Loss=0, G Loss=∞ | D 完美识别真假 | 标签平滑（0.9/0.1 替代 1.0/0.0）|

---

## 本章总结

| 组件 | 输入 → 输出 | 目标 |
|------|------------|------|
| 生成器 G | 随机噪声 → 图像 | 让 D 分不清真假 |
| 判别器 D | 图像 → 真/假 | 准确区分真假 |
| GAN 平衡 | — | D 准确率 = 50%（随机猜）|