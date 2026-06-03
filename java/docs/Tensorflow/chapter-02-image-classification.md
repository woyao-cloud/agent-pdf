# 第2章 图像分类（Image Classification）

## 本章导读

图像分类是计算机视觉中最基础、应用最广的任务。它的目标很简单：给定一张图片，输出它所属的类别。但在实际生产中有很多隐形的"坑"：

```
一个典型的生产环境故事：

  某电商平台上线了"以图搜图"功能，用 TensorFlow 训练了一个商品分类模型。
  测试集准确率 95%，上线后——只有 60%。

  排查发现：
  1. 用户拍摄的商品照片有各种光照角度、背景杂乱，训练数据全是白底产品图
  2. iPhone 拍的图是 3024×4032 像素，训练时 resize 到 224×224 信息损失严重
  3. 平台上新了 500 个新款，模型训练时只见过 50 个类

  这就是"过拟合 + 分布偏移"的典型案例
```

本章从零开始构建一个生产级的图像分类模型，覆盖数据预处理、模型构建、训练优化、评估预测全过程，并重点解决过拟合和类别不平衡这两个最常遇到的问题。

---

## 2.1 实现原理：CNN 卷积神经网络

### 卷积核如何"看"图片

CNN（卷积神经网络）的核心思想是：**用卷积核在图像上滑动，提取局部特征**。

```
卷积操作的可视化：

  输入图像（5×5灰度图）      卷积核（3×3）        输出特征图（3×3）
  ┌─┬─┬─┬─┬─┐              ┌─┬─┬─┐             ┌──┬──┬──┐
  │1│1│1│0│0│              │1│0│1│             │  │  │  │
  ├─┼─┼─┼─┼─┤              ├─┼─┼─┤             ├──┼──┼──┤
  │0│1│1│1│0│              │0│1│0│             │  │  │  │
  ├─┼─┼─┼─┼─┤              ├─┼─┼─┤             ├──┼──┼──┤
  │0│0│1│1│1│              │1│0│1│             │  │  │  │
  ├─┼─┼─┼─┼─┤              └─┴─┴─┘             └──┴──┴──┘
  │0│0│1│1│0│
  ├─┼─┼─┼─┼─┤
  │0│1│1│0│0│
  └─┴─┴─┴─┴─┘

  卷积核在输入上滑动，每次取 3×3 区域与核做点积：
  位置(0,0): 1×1 + 1×0 + 1×1 + 0×0 + 1×1 + 1×0 + 0×1 + 0×0 + 1×1 = 4
  位置(0,1): 1×1 + 1×0 + 0×1 + 1×0 + 1×1 + 1×0 + 0×1 + 1×0 + 1×1 = 3
  ...（输出中每个元素 = 输入 3×3 区域与卷积核的点积）

  不同卷积核提取不同特征：
  边缘检测核：[[-1,0,1],[-1,0,1],[-1,0,1]] → 检测垂直边缘
  模糊核：[[1/9,1/9,1/9],[1/9,1/9,1/9],[1/9,1/9,1/9]] → 平均模糊
```

### 标准 CNN 架构

```
典型的图像分类 CNN：

  输入 (224×224×3 RGB)
    │
    ▼
  ┌──────────────────────────────────────────────┐
  │  卷积层 Conv2D 64 (3×3) + ReLU              │
  │  提取 64 种低层特征（边缘、颜色、纹理）        │
  ├──────────────────────────────────────────────┤
  │  池化层 MaxPooling2D (2×2)                   │
  │  下采样，尺寸减半（224→112），减少参数量      │
  ├──────────────────────────────────────────────┤
  │  卷积层 Conv2D 128 (3×3) + ReLU             │
  │  提取 128 种中层特征（形状、部分）            │
  ├──────────────────────────────────────────────┤
  │  池化层 MaxPooling2D (2×2)                   │
  │  尺寸再减半（112→56）                        │
  ├──────────────────────────────────────────────┤
  │  ...（重复 3-5 次，特征图尺寸递减，深度递增）  │
  ├──────────────────────────────────────────────┤
  │  全局平均池化 / Flatten                       │
  │  将 2D 特征图展平为 1D 向量                  │
  ├──────────────────────────────────────────────┤
  │  全连接层 Dense 256 + ReLU + Dropout         │
  │  分类决策层                                  │
  ├──────────────────────────────────────────────┤
  │  输出层 Dense N (softmax)                     │
  │  N = 类别数，输出每个类别的概率               │
  └──────────────────────────────────────────────┘
```

---

## 2.2 潜在风险

### 风险一：过拟合——模型"背"数据而不是"学"规律

```
过拟合的表现：

  训练集准确率 99%  vs  测试集准确率 60%
  ┌──────────────────────────────────────────────┐
  │  训练曲线                                    │
  │  准确率 ▲            ─── 训练集              │
  │        │        ┌────                        │
  │        │    ┌───┘                            │
  │        │ ┌──┘                                │
  │        │─┘   ──── 测试集                     │
  │        │         └────┐                      │
  │        │              └──┐                   │
  │        └─────────────────── Epoch            │
  │        过拟合从验证集准确率不再提升的那刻开始   │
  └──────────────────────────────────────────────┘

  原因：
  - 数据量太少（1000 张图就要训练 1000 类？不可能）
  - 模型太大（参数数量 >> 样本数量）
  - 没有数据增强（模型记住了"白底商品图"，不会处理"真人拍摄"）
```

### 风险二：类别不平衡

```
类别不平衡的后果：

  类别分布：
  类别 A：10,000 张（衣服）→ 占比 90%
  类别 B：500 张（鞋子）   → 占比 4.5%
  类别 C：500 张（帽子）   → 占比 4.5%
  类别 D：100 张（围巾）   → 占比 1%

  模型学到：全部预测为 A 就能达到 90% 准确率
  → B、C、D 的准确率为 0%！

  更隐蔽的问题：测试集虽然是均衡的
  但模型对 B/C/D 的预测几乎没有置信度
```

---

## 2.3 优化与应对方案

### 方案一：数据增强——用有限数据生成无限样本

```python
import tensorflow as tf

# 方法 A：使用 Sequential 数据增强层（推荐，GPU 上执行）
data_augmentation = tf.keras.Sequential([
    tf.keras.layers.RandomFlip("horizontal"),           # 水平翻转
    tf.keras.layers.RandomRotation(0.1),                # 随机旋转 ±10%
    tf.keras.layers.RandomZoom(0.1),                    # 随机缩放
    tf.keras.layers.RandomContrast(0.1),                # 随机对比度
])

# 方法 B：使用 tf.image 函数（在 tf.data pipeline 中）
def augment(image, label):
    image = tf.image.random_flip_left_right(image)
    image = tf.image.random_brightness(image, 0.2)
    image = tf.image.random_contrast(image, 0.8, 1.2)
    return image, label

dataset = dataset.map(augment, num_parallel_calls=tf.data.AUTOTUNE)
```

```
数据增强的效果：

  原始图：一张正面拍摄的白底商品图
        ┌──────────────────┐
        │     🧢            │
        │   (白底)          │
        └──────────────────┘

  增强后（每 epoch 不同）：
  ┌──────┬──────┬──────┬──────┐
  │ 翻转  │ 旋转  │ 缩放  │ 调色  │
  ├──────┼──────┼──────┼──────┤
  │  🧢  │  🧢  │ 🧢   │  🧢 │
  │      │  ↙   │ 大   │  色差│
  └──────┴──────┴──────┴──────┘

  效果：1 张图 → 每 epoch 相当于 N 张不同图
  泛化能力大幅提升
```

### 方案二：迁移学习——站在巨人的肩膀上

```python
# 加载预训练模型（在 ImageNet 上训练过的权重）
base_model = tf.keras.applications.MobileNetV2(
    input_shape=(224, 224, 3),
    include_top=False,           # 去掉顶部分类层
    weights='imagenet'           # 使用 ImageNet 预训练权重
)

# 冻结基础模型（前几轮不训练，保留预训练特征）
base_model.trainable = False

# 在基础模型上添加自定义分类头
inputs = tf.keras.Input(shape=(224, 224, 3))
x = tf.keras.applications.mobilenet_v2.preprocess_input(inputs)
x = base_model(x, training=False)
x = tf.keras.layers.GlobalAveragePooling2D()(x)
x = tf.keras.layers.Dropout(0.2)(x)
outputs = tf.keras.layers.Dense(10, activation='softmax')(x)

model = tf.keras.Model(inputs, outputs)

# 第一阶段：只训练顶部分类层
model.compile(optimizer='adam',
              loss='sparse_categorical_crossentropy',
              metrics=['accuracy'])
model.fit(train_dataset, epochs=10)

# 第二阶段：解冻部分基础层，联合微调
base_model.trainable = True
# 只解冻最后 50 层（前面的层提取的是通用特征，不需要改动）
for layer in base_model.layers[:100]:
    layer.trainable = False

model.compile(optimizer=tf.keras.optimizers.Adam(1e-5),  # 用更小的学习率
              loss='sparse_categorical_crossentropy',
              metrics=['accuracy'])
model.fit(train_dataset, epochs=5)
```

### 方案三：类别不平衡——加权损失 + Focal Loss

```python
# 计算类别权重（给少数类更高的权重）
import numpy as np

labels = np.array([...])  # 所有训练标签
class_counts = np.bincount(labels)
total = len(labels)
class_weights = {i: total / (len(class_counts) * count)
                 for i, count in enumerate(class_counts)}
# 少数类权重 > 1，多数类权重 < 1

model.fit(train_dataset, epochs=50,
          class_weight=class_weights)  # 传参给 fit 即可
```

---

## 2.4 完整训练代码

```python
# ch02-image-classification/train.py
import tensorflow as tf
from tensorflow import keras
import numpy as np

# ===== 1. 加载数据 =====
# 使用 CIFAR-10 数据集（10 类，60000 张 32×32 彩色图）
(x_train, y_train), (x_test, y_test) = keras.datasets.cifar10.load_data()
x_train, x_test = x_train / 255.0, x_test / 255.0  # 归一化到 [0,1]

# ===== 2. 数据增强 =====
data_augmentation = keras.Sequential([
    keras.layers.RandomFlip("horizontal"),
    keras.layers.RandomRotation(0.1),
    keras.layers.RandomZoom(0.1),
])

# ===== 3. 构建模型 =====
model = keras.Sequential([
    # 数据增强层
    keras.layers.Input(shape=(32, 32, 3)),
    data_augmentation,

    # Conv Block 1
    keras.layers.Conv2D(32, (3, 3), padding='same'),
    keras.layers.BatchNormalization(),
    keras.layers.Activation('relu'),
    keras.layers.Conv2D(32, (3, 3), padding='same'),
    keras.layers.BatchNormalization(),
    keras.layers.Activation('relu'),
    keras.layers.MaxPooling2D((2, 2)),
    keras.layers.Dropout(0.25),

    # Conv Block 2
    keras.layers.Conv2D(64, (3, 3), padding='same'),
    keras.layers.BatchNormalization(),
    keras.layers.Activation('relu'),
    keras.layers.Conv2D(64, (3, 3), padding='same'),
    keras.layers.BatchNormalization(),
    keras.layers.Activation('relu'),
    keras.layers.MaxPooling2D((2, 2)),
    keras.layers.Dropout(0.25),

    # 分类头
    keras.layers.Flatten(),
    keras.layers.Dense(512, activation='relu'),
    keras.layers.Dropout(0.5),
    keras.layers.Dense(10, activation='softmax')
])

# ===== 4. 编译与训练 =====
model.compile(optimizer='adam',
              loss='sparse_categorical_crossentropy',
              metrics=['accuracy'])

# 回调函数
callbacks = [
    keras.callbacks.EarlyStopping(patience=5, restore_best_weights=True),
    keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=3),
    keras.callbacks.TensorBoard(log_dir='./logs')
]

history = model.fit(
    x_train, y_train,
    batch_size=64,
    epochs=50,
    validation_split=0.2,
    callbacks=callbacks
)

# ===== 5. 评估 =====
test_loss, test_acc = model.evaluate(x_test, y_test)
print(f'测试集准确率: {test_acc:.4f}')

# ===== 6. 保存模型 =====
model.save('/models/image_classifier.h5')
model.save('/models/image_classifier_savedmodel')
print('模型已保存')
```

---

## 2.5 Docker Compose 运行

```yaml
# demos/ch02-image-classification/docker-compose.yml
version: "3.8"
services:
  train:
    image: tensorflow/tensorflow:2.16.1-gpu
    container_name: tf-ch02-train
    working_dir: /app
    volumes:
      - ./train.py:/app/train.py
      - ./models:/app/models
      - ./logs:/app/logs
    command: python train.py
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

```bash
# 启动训练
cd demos/ch02-image-classification
docker compose up train

# 查看 TensorBoard
tensorboard --logdir logs --port 6006
# 打开 http://localhost:6006
```

---

## 本章总结

```bash
# 速查：运行图像分类训练
cd demos/ch02-image-classification
docker compose up train
```

| 风险 | 解决方案 | 效果 |
|------|---------|------|
| 过拟合 | 数据增强 + Dropout + 早停 | 测试集准确率提升 5-15% |
| 数据不足 | 迁移学习（MobileNetV2 等） | 小数据集也能达到 85%+ |
| 类别不平衡 | class_weight / Focal Loss | 少数类召回率提升 2-3 倍 |
| 训练太慢 | 使用 GPU 版 Docker Compose | 训练时间缩短 10-50 倍 |