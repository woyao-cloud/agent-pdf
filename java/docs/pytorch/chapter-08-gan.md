# 第8章 生成对抗网络（GAN）

## 8.1 完整实现：DCGAN 生成 MNIST

```python
import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import datasets, transforms
from torch.utils.data import DataLoader

# ===== 生成器 =====
class Generator(nn.Module):
    def __init__(self, latent_dim=100):
        super().__init__()
        self.model = nn.Sequential(
            nn.Linear(latent_dim, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Linear(256, 512),
            nn.BatchNorm1d(512),
            nn.ReLU(),
            nn.Linear(512, 1024),
            nn.BatchNorm1d(1024),
            nn.ReLU(),
            nn.Linear(1024, 28*28),
            nn.Tanh()  # 输出 [-1, 1]
        )

    def forward(self, z):
        return self.model(z).view(-1, 1, 28, 28)

# ===== 判别器 =====
class Discriminator(nn.Module):
    def __init__(self):
        super().__init__()
        self.model = nn.Sequential(
            nn.Linear(28*28, 512),
            nn.LeakyReLU(0.2),
            nn.Dropout(0.3),
            nn.Linear(512, 256),
            nn.LeakyReLU(0.2),
            nn.Dropout(0.3),
            nn.Linear(256, 1),
            nn.Sigmoid()
        )

    def forward(self, x):
        return self.model(x.view(x.size(0), -1))

# ===== 训练 =====
latent_dim = 100
batch_size = 64

G = Generator(latent_dim)
D = Discriminator()
G = G.cuda(); D = D.cuda()

criterion = nn.BCELoss()
g_opt = optim.Adam(G.parameters(), lr=0.0002, betas=(0.5, 0.999))
d_opt = optim.Adam(D.parameters(), lr=0.0002, betas=(0.5, 0.999))

# 数据
transform = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize((0.5,), (0.5,))  # [-1, 1]
])
dataset = datasets.MNIST(root='./data', train=True, transform=transform, download=True)
loader = DataLoader(dataset, batch_size, shuffle=True, num_workers=4)

for epoch in range(100):
    for real_imgs, _ in loader:
        batch = real_imgs.size(0)
        real_imgs = real_imgs.cuda()

        # 真实标签和伪造标签
        real_labels = torch.ones(batch, 1).cuda()
        fake_labels = torch.zeros(batch, 1).cuda()

        # 训练判别器
        z = torch.randn(batch, latent_dim).cuda()
        fake_imgs = G(z)
        d_loss = criterion(D(real_imgs), real_labels) + \
                 criterion(D(fake_imgs.detach()), fake_labels)
        d_opt.zero_grad()
        d_loss.backward()
        d_opt.step()

        # 训练生成器
        z = torch.randn(batch, latent_dim).cuda()
        fake_imgs = G(z)
        g_loss = criterion(D(fake_imgs), real_labels)  # 希望 D 认错
        g_opt.zero_grad()
        g_loss.backward()
        g_opt.step()

    print(f'Epoch {epoch}, D Loss: {d_loss.item():.4f}, G Loss: {g_loss.item():.4f}')

# 保存
torch.save(G.state_dict(), '/models/gan_generator.pth')
```

## 8.2 潜在风险

| 风险 | 症状 | 方案 |
|------|------|------|
| 模式崩塌 | 只生成同一类数字 | WGAN-GP + 梯度惩罚 |
| 训练不稳定 | D Loss 降到 0 / G Loss 飙升 | 减小 lr (0.0002) + betas=(0.5, 0.999) |
| 判别器太强 | D 准确率 100% → G 梯度为 0 | 标签平滑 (0.9/0.1 替代 1.0/0.0) |