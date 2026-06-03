# 第11章 典型问题排查指南

## 11.1 模型不收敛

```python
# 症状：训练 Loss 不下降 / 准确率不提升
# 排查步骤：

# 1. 检查数据
print(f"Label 范围: {y_train.min()} - {y_train.max()}")  # 期望: 0-9
print(f"Label 类型: {y_train.dtype}")                    # 期望: int
print(f"特征范围: {x_train.min()} - {x_train.max()}")    # 期望: 0-1 或 -1~1

# 2. 检查损失函数与激活函数是否匹配
model.compile(loss='sparse_categorical_crossentropy')  # softmax + 整数标签 ✓
# model.compile(loss='categorical_crossentropy')       # softmax + one-hot 标签 ✓
# model.compile(loss='binary_crossentropy')            # sigmoid + 二分类 ✓

# 3. 检查学习率
# 太大：Loss NaN
# 太小：Loss 下降缓慢
# 建议从 0.001 (Adam) 开始，调整
```

## 11.2 NaN Loss

```python
# NaN 的常见原因和解决方案：

# 1. log(0) → log(0) = -inf → NaN
# 在损失函数中加 epsilon：
loss_fn = tf.keras.losses.BinaryCrossentropy(from_logits=True)
# from_logits=True 表示输入是 logits（未经过 sigmoid）
# 内部会做数值稳定的 sigmoid + cross-entropy，避免 log(0)

# 2. 学习率过大
# 将学习率从 0.01 降到 0.0001

# 3. 梯度爆炸
# 使用梯度裁剪
optimizer = tf.keras.optimizers.Adam(clipnorm=1.0)  # 梯度 L2 范数限制在 1.0
```

## 11.3 GPU OOM

```python
# 1. 减小 Batch Size（最直接的方法）
# batch_size=32 → batch_size=16

# 2. 混合精度（减少 50% 显存使用）
tf.keras.mixed_precision.set_global_policy('mixed_float16')

# 3. 梯度累积（用小 Batch 模拟大 Batch）
accumulation_steps = 4  # 累积 4 个小 Batch = 1 个大 Batch
```

---

## 本章总结

| 问题 | 最可能的根因 | 首选方案 |
|------|------------|---------|
| Loss 不下降 | 学习率设置不当 | 用 Adam + lr=0.001 |
| NaN Loss | log(0) | from_logits=True |
| GPU OOM | Batch Size 太大 | 减半 Batch Size |