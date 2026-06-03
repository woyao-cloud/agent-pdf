# 第3章 图像分类（Image Classification）

## 本章导读

图像分类是深度学习中最基础的任务。PyTorch 的 `torchvision` 模型库提供了丰富的预训练模型（ResNet、EfficientNet、ViT），使得迁移学习极其方便。PyTorch 的 ImageNet 预训练模型可以非常方便地迁移到医疗影像质检等场景。

## 3.1 实现原理：ResNet + 残差连接

```python
import torch
import torch.nn as nn
import torch.optim as optim
import torchvision
import torchvision.transforms as transforms
from torchvision.models import resnet18

# ===== 1. 数据加载与增强 =====
transform_train = transforms.Compose([
    transforms.RandomCrop(32, padding=4),      # 数据增强
    transforms.RandomHorizontalFlip(),
    transforms.ToTensor(),
    transforms.Normalize((0.4914, 0.4822, 0.4465),
                         (0.2023, 0.1994, 0.2010)),
])

transform_test = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize((0.4914, 0.4822, 0.4465),
                         (0.2023, 0.1994, 0.2010)),
])

trainset = torchvision.datasets.CIFAR10(root='./data', train=True,
                                        download=True, transform=transform_train)
trainloader = torch.utils.data.DataLoader(trainset, batch_size=128,
                                          shuffle=True, num_workers=4)
testset = torchvision.datasets.CIFAR10(root='./data', train=False,
                                       download=True, transform=transform_test)
testloader = torch.utils.data.DataLoader(testset, batch_size=128,
                                         shuffle=False, num_workers=4)

# ===== 2. 迁移学习：使用预训练 ResNet18 =====
model = resnet18(pretrained=True)
# 修改最后一层（CIFAR-10 是 10 类）
model.fc = nn.Linear(512, 10)
model = model.cuda()

# ===== 3. 训练 =====
criterion = nn.CrossEntropyLoss()
optimizer = optim.SGD(model.parameters(), lr=0.1, momentum=0.9, weight_decay=5e-4)
scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=200)

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
    print(f'Epoch {epoch+1}, Loss: {running_loss/len(trainloader):.4f}')

# ===== 4. 评估 =====
model.eval()
correct = total = 0
with torch.no_grad():
    for inputs, labels in testloader:
        inputs, labels = inputs.cuda(), labels.cuda()
        outputs = model(inputs)
        _, predicted = outputs.max(1)
        total += labels.size(0)
        correct += predicted.eq(labels).sum().item()

print(f'测试集准确率: {100.0 * correct / total:.2f}%')

# ===== 5. 保存模型 =====
torch.save(model.state_dict(), '/models/cifar10_resnet18.pth')
torch.save(model, '/models/cifar10_resnet18_full.pth')
```

## 3.2 Docker Compose

```yaml
# demos/ch03-classification/docker-compose.yml
version: "3.8"
services:
  train:
    image: pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime
    container_name: pt-ch03-train
    working_dir: /app
    volumes:
      - .:/app
      - ./data:/app/data
    command: >
      sh -c "pip install torchvision && python train.py"
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

| 风险 | 方案 |
|------|------|
| 过拟合 | RandomCrop + HorizontalFlip + weight_decay |
| GPU OOM | batch_size=128，如果爆了调为 64 |
| 类别不平衡 | `weight` 参数传入 CrossEntropyLoss |