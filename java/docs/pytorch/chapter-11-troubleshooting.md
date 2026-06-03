# 第11章 典型问题排查指南

## 11.1 Loss 不收敛

```python
# 排查清单：
# 1. 数据范围是否正确？
print(f"输入范围: {data.min():.4f} ~ {data.max():.4f}")   # 期望 [0,1] 或 [-1,1]
print(f"标签范围: {labels.min()} ~ {labels.max()}")         # 期望 0~9 (int)
print(f"标签类型: {labels.dtype}")                          # 期望 torch.long

# 2. Loss 函数是否正确？
# 分类 → CrossEntropyLoss（内部包含 softmax，模型输出不需要 softmax）
# 回归 → MSELoss

# 3. 学习率
# Adam 默认 lr=0.001，如果 loss 震荡，降到 0.0001
# SGD 默认 lr=0.01，配合 momentum=0.9

# 4. 梯度检查
total_norm = 0
for p in model.parameters():
    if p.grad is not None:
        param_norm = p.grad.data.norm(2)
        total_norm += param_norm.item() ** 2
total_norm = total_norm ** 0.5
print(f"梯度范数: {total_norm:.4f}")  # > 100 说明梯度爆炸
```

## 11.2 NaN Loss

```python
# 根因：log(0) 或除零错误

# 解决方案 1：CrossEntropyLoss 自带 log_softmax，不会有 NaN
# 但如果是自定义 loss，加上 epsilon：
loss = -torch.log(predictions + 1e-8) * targets

# 解决方案 2：梯度裁剪——防止梯度爆炸
torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)

# 解决方案 3：检查输入是否有 NaN
assert not torch.isnan(data).any(), "输入包含 NaN！"
```

## 11.3 GPU OOM

```python
# 1. 减小 batch_size（最快的方法）
# batch_size=64 → 32 → 16

# 2. 混合精度（减少 50% 显存）
scaler = GradScaler()

# 3. 梯度检查点（减少 20-30% 显存）
from torch.utils.checkpoint import checkpoint

# 4. 确认没有显存泄漏
# 每次循环后：
torch.cuda.empty_cache()
```

## 11.4 过拟合

| 方案 | PyTorch 实现 |
|------|-------------|
| Dropout | `nn.Dropout(0.5)` |
| L2 正则 | `optim.SGD(..., weight_decay=1e-4)` |
| 早停 | 手动监控 val_loss，连续 5 epoch 不下降就停止 |
| 数据增强 | `torchvision.transforms` 系列 |