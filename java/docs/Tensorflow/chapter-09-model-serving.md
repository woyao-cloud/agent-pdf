# 第9章 模型部署与推理优化（Production）

## 本章导读

模型训练完成只是第一步——让模型在生产环境中**跑起来并跑得快**才是真正的挑战。TensorFlow Serving（TF Serving）是 Google 官方推出的生产级模型部署工具，专为低延迟、高吞吐的推理场景设计。

```
模型训练的"最后一公里"问题：

  训练环境（Jupyter）：                生产环境（K8s）：
  ┌────────────────────────────┐     ┌────────────────────────┐
  │  model.fit() → 准确率 95%  │     │  处理 10000 QPS        │
  │  单次预测：Python 直接调     │     │  每次 < 10ms           │
  │  不需要考虑并发              │     │  支持模型热更新          │
  │  不需要版本管理              │     │  GPU 共享               │
  └────────────────────────────┘     └────────────────────────┘

  TF Serving 解决了这个"最后一公里"问题 → 把训练好的模型变成线上服务
```

---

## 9.1 实现原理：TF Serving 架构

```
TF Serving 的请求处理流程：

  客户端                         TF Serving                     模型
    │                              │                           │
    │── gRPC/REST Request ────────►│                           │
    │                              │   加载模型到内存            │
    │                              │ ─────────────────────────►│
    │                              │                           │
    │                              │ 预处理（可选）             │
    │                              │ 批处理（批量推理优化）      │
    │                              │                           │
    │                              │◄── 推理结果 ──────────── │
    │                              │                           │
    │◄── gRPC/REST Response ──────│                           │
    │                              │                           │

  核心特性：
  1. 模型版本管理（同时加载多个版本，A/B 测试）
  2. 自动批处理（合并多个请求为一批，GPU 利用率最大化）
  3. 热加载（模型文件更新后自动加载新版）
```

---

## 9.2 潜在风险

### 模型过大导致内存不足

```
模型大小 vs 内存：

  模型            参数量     SavedModel 大小    加载到内存
  ──────────────────────────────────────────────────
  MobileNetV2     3.5M      14MB               ~30MB
  ResNet50        25M       98MB              ~200MB
  BERT-Base      110M      440MB              ~900MB
  GPT-2 XL       1.5B        6GB               ~12GB
  LLaMA 65B       65B      130GB              ~260GB

  如果你的服务器只有 16GB 内存：
  - 只能同时加载 MobileNetV2 或 ResNet50
  - BERT 进去就 OOM
```

### 推理延迟超时

```
推理延迟的组成：

  总延迟 = 网络传输 + 预处理 + 推理 + 后处理

  网络传输：REST API 每次请求 ~1ms（同机房）
  预处理：图像 decode + resize ~5ms（CPU）
  推理：模型 forward pass ~10ms（GPU）
  后处理：softmax + 排序 ~1ms（CPU）

  如果客户端设置超时 10ms → 大概率超时
  建议设置超时 50-100ms（给足余量）
```

---

## 9.3 优化方案

### 模型量化

```python
# 训练后量化（Post-Training Quantization）——最简单、最有效
import tensorflow as tf

# 加载训练好的模型
model = tf.keras.models.load_model('models/image_classifier.h5')

# 转换为 TFLite 格式（float16 量化）
converter = tf.lite.TFLiteConverter.from_keras_model(model)
converter.optimizations = [tf.lite.Optimize.DEFAULT]
converter.target_spec.supported_types = [tf.float16]
tflite_model = converter.convert()

# 保存量化后的模型
with open('models/model_quantized.tflite', 'wb') as f:
    f.write(tflite_model)
```

### TF Serving 批处理配置

```bash
# TF Serving 的批处理可以大幅提升吞吐量
# 在启动时指定：
tensorflow_model_server \
  --port=8500 \
  --rest_api_port=8501 \
  --model_name=my_model \
  --model_base_path=/models/my_model \
  --enable_batching=true \
  --batching_parameters_file=/models/batching_config.txt
```

```python
# batching_config.txt
max_batch_size { value: 256 }
batch_timeout_micros { value: 10000 }  # 最长等 10ms
num_batch_threads { value: 8 }
```

### 完整的 Docker Compose 部署

```yaml
# demos/ch09-model-serving/docker-compose.yml
version: "3.8"

services:
  # TF Serving（模型推理服务）
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
      --enable_batching=true
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  # REST API 客户端（测试用）
  client:
    image: python:3.9
    container_name: tf-client
    working_dir: /app
    volumes:
      - ./client.py:/app/client.py
      - ./test_image.jpg:/app/test_image.jpg
    command: python client.py
    depends_on:
      - tf-serving
```

```python
# client.py —— REST API 调用 TF Serving
import json
import requests
import numpy as np

# 准备测试数据（模拟图像）
test_data = np.random.randn(224, 224, 3).tolist()

# REST API 调用
response = requests.post(
    "http://tf-serving:8501/v1/models/default:predict",
    json={"instances": [test_data]}
)

result = response.json()
print(f"预测结果: {result['predictions'][0][:5]}")
```

---

## 本章总结

```bash
# 一键部署 TF Serving
cd demos/ch09-model-serving
docker compose up -d

# 验证
curl http://localhost:8501/v1/models/default
```

| 优化手段 | 效果 | 代价 |
|---------|------|------|
| float16 量化 | 模型大小减半，速度提升 2x | 精度下降 < 0.5% |
| 批处理 | 吞吐量提升 5-10x | 单次请求延迟增加 |
| GPU 推理 | 速度提升 10-50x | 需要 GPU 服务器 |