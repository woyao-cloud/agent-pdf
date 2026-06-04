# 第10章 训练性能调优

## 本章导读

"我的显卡是 RTX 4090，但训练一个 ResNet-50 比同事的 A100 慢 5 倍！"

这种情况通常不是因为显卡不够好，而是因为 **GPU 利用率太低**。很多初学者用 `nvidia-smi` 一看——GPU-Util 只有 20%，显存倒是占满了。CPU 在疯狂加载数据，GPU 在空等。

本章提供 3 个立竿见影的优化手段，把你的 GPU 利用率从 20% 拉到 90%+。

---

## 10.1 GPU 利用率优化

### DataLoader 多进程——最重要的优化

```python
# ❌ 错误做法：不设 num_workers
loader = DataLoader(dataset, batch_size=64)
# GPU 每次等 CPU 准备好数据 → GPU 空闲 → 利用率 20%

# ✅ 正确做法：多进程加载
loader = DataLoader(
    dataset,
    batch_size=64,
    num_workers=4,          # 4 个子进程同时加载数据
    pin_memory=True,         # 加速 CPU→GPU 数据传输
    prefetch_factor=2        # 每进程预取 2 批数据
)
# GPU 利用率从 20% → 90%+
```

### 混合精度训练（免费提速 2-3 倍）

```python
from torch.cuda.amp import autocast, GradScaler

scaler = GradScaler()

for inputs, labels in dataloader:
    inputs, labels = inputs.cuda(), labels.cuda()

    with autocast():
        outputs = model(inputs)             # float16 计算（快）
        loss = criterion(outputs, labels)   # float32 计算（稳）

    scaler.scale(loss).backward()
    scaler.step(optimizer)
    scaler.update()
    optimizer.zero_grad()

# 效果（A100/V100）：速度 +2x，显存 -40%
```

---

## 10.2 显存优化

### 梯度累积——用小 batch 模拟大 batch

```python
# 显卡只有 8GB，batch_size=128 会 OOM
# 但 batch_size=32 时模型收敛不稳定
# → 梯度累积：batch_size=32 × 累积 4 步 = 等效 batch_size=128

accumulation_steps = 4
optimizer.zero_grad()

for i, (inputs, labels) in enumerate(dataloader):
    outputs = model(inputs.cuda())
    loss = criterion(outputs, labels.cuda())
    loss = loss / accumulation_steps  # 梯度平均（不是 loss 平均）
    loss.backward()

    if (i + 1) % accumulation_steps == 0:
        optimizer.step()              # 累积了 4 步梯度后更新
        optimizer.zero_grad()
```

---

## 本章总结

```bash
# GPU 利用率检查命令
nvidia-smi -l 1
# GPU-Util > 80% → 正常
# GPU-Util < 50% → 增大 num_workers
```

| 手段 | 效果 | 改动成本 |
|------|------|---------|
| DataLoader 多进程 | 利用率 20%→90%+ | 加 3 行参数 |
| 混合精度 | 速度+2x，显存-40% | 加 5 行代码 |
| 梯度累积 | 等效 batch 翻 4 倍 | 加 10 行逻辑 |