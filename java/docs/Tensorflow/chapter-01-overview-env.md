# 第1章 TensorFlow 概述与环境搭建

## 本章导读

2015 年 Google 开源 TensorFlow 时，深度学习框架的生态还是一片混战——Theano、Caffe、Torch、MXNet 各占一方。TensorFlow 凭借分布式训练能力、生产部署工具链（TF Serving）、以及 Google 的背书，迅速成为工业界的主流选择。

但 TensorFlow 1.x 有一个饱受诟病的问题：**静态计算图**。你必须在执行之前先用 Python 构建一个完整的计算图，然后启动 Session 运行它。这意味着你不能在 `for` 循环中 `print` 一个 tensor 的值——代码写起来不像正常的 Python 程序，调试极其困难。

TensorFlow 2.x（2019 年发布）彻底改变了这一点：**Eager Execution（动态图）** 默认开启，Keras 成为官方高级 API。你写 TF 2.x 的体验和写 NumPy + PyTorch 几乎一样——但 TensorFlow 仍然保留着它的核心优势：**完整的生产部署工具链（TF Serving、TFLite、TF.js）和分布式训练能力**。

---

## 1.1 TensorFlow 生态全景

### TensorFlow 2.x vs 1.x 核心变化

```
  TF 1.x（静态图）:                           TF 2.x（动态图）:
  ┌──────────────────┐                       ┌──────────────────┐
  │ import tensorflow│                       │ import tensorflow│
  │ as tf            │                       │ as tf            │
  │                  │                       │                  │
  │ # 构建图          │                       │ # 直接执行        │
  │ a = tf.constant(3)│                       │ a = tf.constant(3)│
  │ b = tf.constant(4)│                       │ b = tf.constant(4)│
  │ c = a + b         │                       │ c = a + b         │
  │                  │                       │ print(c.numpy())  │
  │ # 启动 Session    │                       │ # → 7             │
  │ with tf.Session() │                       │                  │
  │   as sess:        │                       │ # 可以用 if/for   │
  │   print(c.eval()) │                       │ for i in range(5):│
  │   # → 7           │                       │   print(i)        │
  └──────────────────┘                       └──────────────────┘
```

**TF 2.x 的三大变革**：

| 变革 | 说明 | 影响 |
|------|------|------|
| **Eager Execution** | 默认动态图，操作立即执行 | 调试像普通 Python 一样简单 |
| **Keras 集成** | `tf.keras` 成为官方高级 API | 不再需要在 Keras 和 TF 之间做选择 |
| **tf.function** | 通过装饰器将 Python 函数编译为计算图 | 兼顾动态图的灵活性和静态图的性能 |

### TF 生态核心组件

```
TensorFlow 生态全景：

  ┌─────────────────────────────────────────────────────────────────┐
  │                    TensorFlow 2.x Core                          │
  │  tf.keras (模型构建)  │  tf.data (数据管道)  │  tf.function (图编译) │
  └────────────────────────────┬────────────────────────────────────┘
                               │
           ┌───────────────────┼───────────────────────┐
           ▼                   ▼                       ▼
  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
  │  TF Serving   │    │    TFLite    │    │     TF.js        │
  │  模型部署      │    │  移动端/边缘   │    │  浏览器端推理     │
  │  gRPC/REST API│    │  量化/加速    │    │  WebGL/WebAssembly│
  └──────────────┘    └──────────────┘    └──────────────────┘

           ┌───────────────────┼───────────────────────┐
           ▼                   ▼                       ▼
  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
  │    TFX       │    │  TensorBoard │    │  TF Datasets     │
  │  生产级ML管道  │    │  可视化调试    │    │  预训练数据集     │
  └──────────────┘    └──────────────┘    └──────────────────┘
```

---

## 1.2 开发环境搭建

### Docker Compose 一键启动

```yaml
# demos/docker-compose.yml
version: "3.8"

services:
  # Jupyter Notebook（CPU 版本）
  jupyter-cpu:
    image: tensorflow/tensorflow:2.16.1-jupyter
    container_name: tf-jupyter-cpu
    ports:
      - "8888:8888"
    volumes:
      - ./workspace:/tf/workspace
    environment:
      - JUPYTER_TOKEN=123456
    command: >
      jupyter notebook --ip=0.0.0.0 --port=8888
      --allow-root --NotebookApp.token=123456
    networks:
      - tf-net

  # GPU 版本（需要 NVIDIA Docker）
  jupyter-gpu:
    image: tensorflow/tensorflow:2.16.1-gpu-jupyter
    container_name: tf-jupyter-gpu
    ports:
      - "8889:8888"
    volumes:
      - ./workspace:/tf/workspace
    environment:
      - JUPYTER_TOKEN=123456
      - NVIDIA_VISIBLE_DEVICES=all
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    command: >
      jupyter notebook --ip=0.0.0.0 --port=8888
      --allow-root --NotebookApp.token=123456
    networks:
      - tf-net
    profiles:
      - gpu

  # TensorFlow Serving（模型部署）
  tf-serving:
    image: tensorflow/serving:2.16.1
    container_name: tf-serving
    ports:
      - "8500:8500"   # gRPC
      - "8501:8501"   # REST
    volumes:
      - ./models:/models
    environment:
      - MODEL_NAME=default
    command: >
      --model_config_file=/models/models.config
      --model_config_file_poll_wait_seconds=60
    networks:
      - tf-net

networks:
  tf-net:
    driver: bridge
```

```bash
# .env
TF_VERSION=2.16.1
JUPYTER_TOKEN=123456
```

### 验证安装

```bash
# 启动 Jupyter
docker compose up jupyter-cpu -d

# 打开浏览器
open http://localhost:8888  # token: 123456

# 在 Jupyter 中运行验证代码
import tensorflow as tf
print(f"TensorFlow 版本: {tf.__version__}")
print(f"GPU 可用: {tf.config.list_physical_devices('GPU')}")
print(f"Eager Execution: {tf.executing_eagerly()}")

# 快速矩阵运算
a = tf.constant([[1, 2], [3, 4]])
b = tf.constant([[5, 6], [7, 8]])
c = tf.matmul(a, b)
print(f"矩阵乘法结果:\n{c.numpy()}")
```

---

## 1.3 TensorFlow 基础概念速成

### Tensor（张量）

Tensor 是 TensorFlow 的核心数据单元——可以理解为 NumPy 数组的"升级版"：

```python
import tensorflow as tf
import numpy as np

# 从 Python 列表创建
t1 = tf.constant([1, 2, 3])           # 形状 (3,)
t2 = tf.constant([[1, 2], [3, 4]])    # 形状 (2, 2)

# 从 NumPy 数组创建
t3 = tf.constant(np.array([1, 2, 3]))  # 自动转换

# 特殊张量
t4 = tf.zeros((3, 4))                  # 全 0
t5 = tf.ones((2, 3))                   # 全 1
t6 = tf.random.normal((100, 10))       # 正态分布随机

# 张量属性
print(f"形状: {t2.shape}")             # (2, 2)
print(f"数据类型: {t2.dtype}")         # <dtype: 'int32'>
print(f"设备: {t2.device}")            # CPU/GPU

# 张量与 NumPy 互转
numpy_arr = t2.numpy()                 # Tensor → NumPy
tf_tensor = tf.convert_to_tensor(numpy_arr)  # NumPy → Tensor
```

### Keras 模型构建三板斧

```python
# ===== 方式一：Sequential API（最简单，适合线性堆叠） =====
model = tf.keras.Sequential([
    tf.keras.layers.Dense(64, activation='relu', input_shape=(784,)),
    tf.keras.layers.Dropout(0.2),
    tf.keras.layers.Dense(10, activation='softmax')
])
model.compile(optimizer='adam',
              loss='sparse_categorical_crossentropy',
              metrics=['accuracy'])

# ===== 方式二：Functional API（适合多输入/多输出） =====
inputs = tf.keras.Input(shape=(784,))
x = tf.keras.layers.Dense(64, activation='relu')(inputs)
x = tf.keras.layers.Dropout(0.2)(x)
outputs = tf.keras.layers.Dense(10, activation='softmax')(x)
model = tf.keras.Model(inputs=inputs, outputs=outputs)

# ===== 方式三：Subclassing API（完全自定义，灵活度最高） =====
class MyModel(tf.keras.Model):
    def __init__(self):
        super().__init__()
        self.d1 = tf.keras.layers.Dense(64, activation='relu')
        self.d2 = tf.keras.layers.Dense(10, activation='softmax')

    def call(self, inputs, training=False):
        x = self.d1(inputs)
        return self.d2(x)

model = MyModel()
```

### tf.data.Dataset——数据管道

```python
# 从 NumPy 数据创建 Dataset
dataset = tf.data.Dataset.from_tensor_slices((features, labels))

# 数据管道——性能关键
dataset = dataset.shuffle(10000)    # 打乱
dataset = dataset.batch(32)         # 分批
dataset = dataset.prefetch(1)       # 预取（关键！大幅提升 GPU 利用率）

# 数据增强
dataset = dataset.map(lambda x, y: (tf.image.random_flip_left_right(x), y))

# 训练
model.fit(dataset, epochs=10)
```

---

## 1.4 本章总结

```bash
# 一键启动开发环境
docker compose -f demos/docker-compose.yml up jupyter-cpu -d

# 验证
curl http://localhost:8888  # token: 123456

# GPU 版（如有 NVIDIA 显卡）
docker compose -f demos/docker-compose.yml --profile gpu up jupyter-gpu -d
```

| 组件 | 端口 | 用途 |
|------|------|------|
| Jupyter CPU | 8888 | 开发调试 |
| Jupyter GPU | 8889 | GPU 训练 |
| TF Serving | 8500(gRPC)/8501(REST) | 模型部署 |