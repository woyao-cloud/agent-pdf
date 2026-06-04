# 第11章 典型问题排查指南

## 本章导读

PyTorch 训练中最常见的四个问题：**Loss 不收敛、NaN、GPU OOM、过拟合**。每个问题都有固定的排查步骤和解决方案。

---

## 11.1 Loss 不收敛

```python
# 按顺序排查：

# ① 数据范围是否正确？
print(f"输入: {data.min():.4f} ~ {data.max():.4f}")  # 应 [0,1] 或 [-1,1]
print(f"标签: {labels.min()} ~ {labels.max()}")        # 应 0~N-1 (int)

# ② Loss 函数是否匹配？
# 多分类 → nn.CrossEntropyLoss()（模型输出不需要 softmax）
# 二分类 → nn.BCEWithLogitsLoss()（模型输出不需要 sigmoid）
# 回归  → nn.MSELoss()

# ③ 学习率合适吗？
# 训练首几个 batch，观察 loss：
# - loss 缓慢下降（比如 2.3→2.2）→ 学习率 OK
# - loss 不动（2.3→2.3）→ 学习率太小，放大 10 倍
# - loss 飙升（2.3→3.5→NaN）→ 学习率太大，缩小 10 倍

# ④ 梯度爆炸了吗？
total_norm = sum(p.grad.norm(2).item()**2 for p in model.parameters() if p.grad is not None)**0.5
print(f"梯度范数: {total_norm:.4f}")  # > 100 → 梯度爆炸 → 加梯度裁剪
```

## 11.2 NaN Loss

```python
# NaN 的唯一根因：log(0) 或 除零

# 解决 1：使用数值稳定的 Loss（自带 epsilon）
loss = nn.CrossEntropyLoss()     # 内部做了 log_softmax，不会 NaN

# 解决 2：梯度裁剪（防止梯度爆炸）
torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)

# 解决 3：检查输入
assert not torch.isnan(data).any(), "输入有 NaN！"

# 解决 4：学习率太大
optimizer = torch.optim.Adam(model.parameters(), lr=0.0001)  # 降 10 倍
```

## 11.3 GPU OOM

```python
# 最常见的错误：CUDA out of memory

# 紧急方案（按速度排序）：
# 1. batch_size 减半（最快，效果直接）
# 2. 混合精度（显存减 40%，需要 A100/V100）
# 3. 梯度检查点（显存减 20-30%，速度稍慢）
# 4. 确认无泄漏：torch.cuda.empty_cache()
```

## 本章总结

| 问题 | 第一排查 | 第一方案 |
|------|---------|---------|
| Loss 不降 | 数据范围 + Loss 函数 | 调学习率 |
| NaN | log(0) | 梯度裁剪 |
| GPU OOM | batch_size | 减半 batch |