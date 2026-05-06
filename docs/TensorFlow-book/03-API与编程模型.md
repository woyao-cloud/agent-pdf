# 第 3 章 API 与编程模型

> **本章导读**：TensorFlow 2.x 的编程核心是 Keras + tf.data + 自定义训练循环。本章覆盖从"写完模型就能跑"的简单用法，到"完全掌控训练过程"的高级用法。

## 1. Keras 三层 API
### 1.1 Sequential API（顺序模型）

最简单的方式：层叠堆叠

```python
model = tf.keras.Sequential([
    tf.keras.layers.Flatten(input_shape=(28, 28)),
    tf.keras.layers.Dense(128, activation='relu'),
    tf.keras.layers.Dropout(0.2),
    tf.keras.layers.Dense(10)
])
model.compile(
    optimizer='adam',
    loss=tf.keras.losses.SparseCategoricalCrossentropy(from_logits=True),
    metrics=['accuracy']
)
model.fit(x_train, y_train, epochs=5)
model.evaluate(x_test, y_test)
```

> ✅ **最佳实践**：Sequential API 适合 90% 的简单场景（CNN、简单 MLP、RNN）。结构是线性的就用它。

### 1.2 Functional API（函数式模型）

当网络有多输入/多输出、共享层、或者非线性拓扑时：

```python
# 多输入：图片 + 元数据 → 预测
inputs_img = tf.keras.Input(shape=(28, 28, 1), name='img')
inputs_meta = tf.keras.Input(shape=(10,), name='meta')

# 共享的 CNN backbone
x = tf.keras.layers.Conv2D(32, 3, activation='relu')(inputs_img)
x = tf.keras.layers.GlobalAveragePooling2D()(x)

# 融合
combined = tf.keras.layers.Concatenate()([x, inputs_meta])
outputs = tf.keras.layers.Dense(1, activation='sigmoid')(combined)

model = tf.keras.Model(inputs=[inputs_img, inputs_meta], outputs=outputs)
```

**Functional API 的关键优势**：

| 能力 | Sequential | Functional |
|------|-----------|------------|
| 多输入多输出 | ❌ | ✅ |
| 共享层 | ❌ | ✅ |
| 条件分支 | ❌ | ✅ |
| 任意有向无环图 | ❌ | ✅ |
| 打印结构 | 简单 | 详细（model.summary()） |

### 1.3 Subclassing API（子类化模型）

完全自定义的动态模型：

```python
class CustomResNet(tf.keras.Model):
    def __init__(self, num_classes=10):
        super().__init__()
        self.block1 = ResidualBlock(64)
        self.block2 = ResidualBlock(128)
        self.pool = tf.keras.layers.GlobalAveragePooling2D()
        self.classifier = tf.keras.layers.Dense(num_classes)
    
    def call(self, x, training=False):
        x = self.block1(x, training=training)
        x = self.block2(x, training=training)
        x = self.pool(x)
        return self.classifier(x)
```

> ⚠️ **陷阱**：Subclassing 模型的 `__init__` 中只能创建层，不能在 `__init__` 中做前向传播（那是 `call` 的事）。另外，Subclassing 模型无法自动提供 `model.summary()`——除非你显式调用 `tf.keras.utils.plot_model()`。

### 1.4 三层 API 怎么选

| 场景 | 推荐 API |
|------|---------|
| 简单线性堆叠 | Sequential |
| 多输入/输出、共享层、分支 | Functional |
| 需要自定义前向逻辑、复杂控制流 | Subclassing |
| 生产环境求稳 | Functional（可序列化，易调试） |

## 2. tf.data 输入管道
### 2.1 为什么需要 tf.data

tf. data 是 TF 的数据加载框架，解决三个核心问题：
1. **解耦数据加载与训练**：避免 GPU 空闲等数据
2. **高效处理大数据**：流式加载，不用全部塞内存
3. **预处理管线**：map → batch → prefetch 全链路优化

### 2.2 基础用法

```python
# 从 numpy 数组创建
dataset = tf.data.Dataset.from_tensor_slices((x_train, y_train))
dataset = dataset.shuffle(10000).batch(32).prefetch(tf.data.AUTOTUNE)
model.fit(dataset, epochs=10)
```

### 2.3 完整的数据管线

```python
dataset = (
    tf.data.Dataset.from_generator(
        generator=your_data_generator,
        output_signature=(
            tf.TensorSpec(shape=(None, 224, 224, 3), dtype=tf.float32),
            tf.TensorSpec(shape=(None,), dtype=tf.int32)
        )
    )
    .shuffle(buffer_size=10000)           # 随机打乱
    .map(parse_and_augment, num_parallel_calls=tf.data.AUTOTUNE)  # 预处理
    .cache()                               # 缓存（内存或磁盘）
    .batch(32)                             # 分批
    .prefetch(tf.data.AUTOTUNE)            # 预取（GPU 读数据时加载下一批）
)
```

### 2.4 性能的关键参数

| 操作 | 参数 | 推荐值 | 作用 |
|------|------|--------|------|
| map | num_parallel_calls | AUTOTUNE | 并行预处理 |
| batch | drop_remainder | True（大模型训练） | 避免动态 batch size |
| prefetch | buffer_size | AUTOTUNE | 掩盖数据加载延迟 |
| cache | - | 第二次 epoch | 缓存 epoch 之间的数据 |

> ✅ **最佳实践**：始终在 `.map()` 和 `.prefetch()` 使用 `tf.data.AUTOTUNE`，让系统自动调优并行度。

### 2.5 处理大文件

```python
# TFRecord 格式（推荐大场景）
filenames = tf.data.Dataset.list_files('data/*.tfrecord')

def parse_example(example):
    feature_description = {
        'image': tf.io.FixedLenFeature([], tf.string),
        'label': tf.io.FixedLenFeature([], tf.int64),
    }
    parsed = tf.io.parse_example(example, feature_description)
    image = tf.io.decode_jpeg(parsed['image'], channels=3)
    return image, parsed['label']

dataset = filenames.interleave(
    lambda f: tf.data.TFRecordDataset(f).map(parse_example),
    cycle_length=4,
    num_parallel_calls=tf.data.AUTOTUNE
).batch(32).prefetch(tf.data.AUTOTUNE)
```

## 3. 自定义训练循环
### 3.1 为什么要自定义

Keras 的 `.fit()` 已经很强大，但遇到以下场景你需要自定义：

- **复杂的训练逻辑**：多任务学习、GAN 训练、多步优化器
- **自定义训练策略**：梯度裁剪、课程学习、warmup
- **调试需要**：每步打印中间状态、检查梯度

### 3.2 最简自定义循环

```python
# 准备
model = create_model()
optimizer = tf.keras.optimizers.Adam(1e-3)
loss_fn = tf.keras.losses.SparseCategoricalCrossentropy(from_logits=True)
metrics = [tf.keras.metrics.SparseCategoricalAccuracy()]

# 训练一步
@tf.function
def train_step(x, y):
    with tf.GradientTape() as tape:
        logits = model(x, training=True)
        loss = loss_fn(y, logits)
    
    gradients = tape.gradient(loss, model.trainable_variables)
    optimizer.apply_gradients(zip(gradients, model.trainable_variables))
    
    return loss

# 循环
for epoch in range(epochs):
    for batch in dataset:
        loss = train_step(batch['x'], batch['y'])
    print(f"Epoch {epoch}: loss = {loss.numpy():.4f}")
```

### 3.3 分布式自定义循环

```python
strategy = tf.distribute.MirroredStrategy()

with strategy.scope():
    model = create_model()
    optimizer = tf.keras.optimizers.Adam(1e-3)

# 分布式训练步骤
@tf.function
def distributed_train_step(iterator):
    def step_fn(batch):
        with tf.GradientTape() as tape:
            loss = compute_loss(model, batch)
        gradients = tape.gradient(loss, model.trainable_variables)
        optimizer.apply_gradients(zip(gradients, model.trainable_variables))
        return loss
    
    per_replica_losses = strategy.run(step_fn, args=(next(iterator),))
    return strategy.reduce(tf.distribute.ReduceOp.MEAN, per_replica_losses, axis=None)
```

### 3.4 Keras + 自定义循环的最佳结合

```python
# 用 Keras 的 train_step，但自定义逻辑
class CustomModel(tf.keras.Model):
    def train_step(self, data):
        x, y = data
        with tf.GradientTape() as tape:
            y_pred = self(x, training=True)
            loss = self.compiled_loss(y, y_pred)
        
        gradients = tape.gradient(loss, self.trainable_variables)
        
        # 自定义梯度处理
        gradients = [tf.clip_by_norm(g, 1.0) for g in gradients]
        
        self.optimizer.apply_gradients(zip(gradients, self.trainable_variables))
        self.compiled_metrics.update_state(y, y_pred)
        return {m.name: m.result() for m in self.metrics}
```

## 4. 回调函数
### 4.1 内置回调

```python
callbacks = [
    tf.keras.callbacks.ModelCheckpoint(
        'model_{epoch:02d}_{val_loss:.2f}.h5',
        monitor='val_loss', save_best_only=True
    ),
    tf.keras.callbacks.EarlyStopping(
        monitor='val_loss', patience=5, restore_best_weights=True
    ),
    tf.keras.callbacks.LearningRateScheduler(
        lambda epoch: 1e-3 * 0.1 ** (epoch // 30)
    ),
    tf.keras.callbacks.TensorBoard(
        log_dir='./logs', histogram_freq=1
    ),
    tf.keras.callbacks.ReduceLROnPlateau(
        monitor='val_loss', factor=0.5, patience=3
    )
]
model.fit(x, y, callbacks=callbacks)
```

### 4.2 自定义回调

```python
class CustomCallback(tf.keras.callbacks.Callback):
    def on_epoch_end(self, epoch, logs=None):
        if logs.get('val_loss', float('inf')) < 0.1:
            print(f"\n目标达成，停止训练！")
            self.model.stop_training = True
    
    def on_train_batch_end(self, batch, logs=None):
        if batch % 100 == 0:
            print(f"Batch {batch}: loss={logs.get('loss', 0):.4f}")
```

## 5. 模型保存与加载
### 5.1 SavedModel（推荐格式）

```python
# 保存
model.save('my_model')

# 加载
restored = tf.keras.models.load_model('my_model')

# 导出为特定签名（用于 TF Serving）
model.save('exported_model', signatures={
    'serving_default': model.signatures.get('serving_default')
})
```

### 5.2 HDF5（遗留格式）

```python
# 保存
model.save('model.h5')

# 加载
model = tf.keras.models.load_model('model.h5')
```

> ⚠️ **注意**：HDF5 不支持自定义层/自定义模型的自定义方法，不支持某些新特性。生产环境优先用 SavedModel。

### 5.3 仅保存权重

```python
# 保存权重
model.save_weights('weights.ckpt')

# 加载权重
model.load_weights('weights.ckpt')
```

## 6. 小结与延伸阅读

**本章重点回顾**：
- **Keras 三层 API**：Sequential（简单）、Functional（多入多出/共享）、Subclassing（完全自定义）
- **tf.data**：from_tensor_slices → shuffle → map → batch → prefetch 是标准管线
- **自定义训练循环**：用 `GradientTape` 捕获梯度，`optimizer.apply_gradients` 更新参数
- **回调函数**：Checkpoint、EarlyStopping、TensorBoard 是必备三件套
- **模型保存**：SavedModel 是生产环境首选格式

**延伸阅读**：
- Keras 官方 Guide：https://keras.io/guides/
- tf.data 官方文档：https://www.tensorflow.org/guide/data

**下一章** → [04 典型使用场景](./04-典型使用场景.md)：CV、NLP、推荐、时序、强化学习、端侧推理的实战代码。