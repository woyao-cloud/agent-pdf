# 第10章 训练性能调优

## 10.1 GPU 利用率优化

```python
# 1. DataLoader 多进程（最重要的优化！）
DataLoader(dataset, batch_size=64,
           num_workers=4,          # 4 个子进程加载数据
           pin_memory=True,        # 加速 CPU→GPU 传输
           prefetch_factor=2)      # 预取 2 批数据

# 2. 混合精度训练（A100/V100 上提速 2-3x）
from torch.cuda.amp import autocast, GradScaler

scaler = GradScaler()
for inputs, labels in dataloader:
    inputs, labels = inputs.cuda(), labels.cuda()

    with autocast():                        # 自动混合精度
        outputs = model(inputs)
        loss = criterion(outputs, labels)

    scaler.scale(loss).backward()            # 梯度缩放
    scaler.step(optimizer)
    scaler.update()
    optimizer.zero_grad()
```

## 10.2 显存优化

```python
# 1. 梯度累积（用小 batch 模拟大 batch）
accumulation_steps = 4
for i, (inputs, labels) in enumerate(dataloader):
    outputs = model(inputs.cuda())
    loss = criterion(outputs, labels.cuda())
    loss = loss / accumulation_steps  # 梯度平均
    loss.backward()
    if (i + 1) % accumulation_steps == 0:
        optimizer.step()
        optimizer.zero_grad()

# 2. 梯度检查点（用更少的 GPU 内存）
from torch.utils.checkpoint import checkpoint

# 在模型的某层使用 checkpoint，节省显存
def forward(self, x):
    x = checkpoint(self._forward_impl, x)  # 前向传播时丢弃中间激活
    return x                                # 反向传播时重新计算
```

## 10.3 小结

```bash
# GPU 利用率查看
nvidia-smi -l 1
# GPU-Util 应 > 80%，如果 < 50%，增大 num_workers
```