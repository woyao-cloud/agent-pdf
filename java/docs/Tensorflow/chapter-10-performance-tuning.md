# 第10章 模型训练性能调优

## 本章导读

在 TensorFlow 中，"模型跑得起来"和"模型跑得快"是两回事。GPU 利用率不到 20% 的情况很常见——不是因为 GPU 不够好，而是数据加载慢、预处理在 CPU 上串行、频繁的 CPU↔GPU 数据传输。

本章提供 3 个立竿见影的优化手段。

---

## 10.1 GPU 利用率优化

### tf.data 流水线优化

```python
# ❌ 低效的数据加载
dataset = tf.data.Dataset.from_tensor_slices((images, labels))
dataset = dataset.batch(32)
# GPU 每次等 CPU 把数据准备好 → GPU 利用率可能只有 20%

# ✅ 高效的数据加载
dataset = tf.data.Dataset.from_tensor_slices((images, labels))
dataset = dataset.shuffle(10000)
dataset = dataset.map(preprocess, num_parallel_calls=tf.data.AUTOTUNE)  # 并行预处理
dataset = dataset.batch(32)
dataset = dataset.prefetch(tf.data.AUTOTUNE)  # CPU 提前准备下一批数据
# GPU 利用率达到 90%+
```

### 混合精度训练

```python
# 混合精度训练——在 A100/V100 上免费提速 2-3 倍
from tensorflow.keras import mixed_precision

# 设置混合精度策略
mixed_precision.set_global_policy('mixed_float16')

# 模型中的部分操作自动用 float16 执行
# 部分操作用 float32 执行（如 loss 计算）
# GPU 的 Tensor Core 加速 float16 运算
```

---

## 10.2 显存管理

```python
# 显存增长模式——只在需要时分配显存
import tensorflow as tf

gpus = tf.config.list_physical_devices('GPU')
if gpus:
    for gpu in gpus:
        tf.config.experimental.set_memory_growth(gpu, True)
    # 效果：初始占用 ~200MB，训练时逐步增长到 ~6GB
    # 而不是一开始就占用全部 8GB
```

---

## 本章总结

```bash
# GPU 利用率检查
nvidia-smi -l 1  # 每秒刷新
# GPU-Util 应 > 80%，否则需要优化数据流水线
```