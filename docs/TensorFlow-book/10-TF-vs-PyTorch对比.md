# 第 10 章 TensorFlow vs PyTorch 对比
> **本章导读**：这是 ML 工程师最常问的问题："TensorFlow 和 PyTorch 我该选哪个？" 本章不站队，只从多个维度客观对比，帮助你根据具体场景做决策。

## 1. 核心理念对比
### 1.1 设计哲学

| 维度 | TensorFlow | PyTorch |
|------|-----------|---------|
| **核心理念** | "一切皆 tensor，部署优先" | "Python 优先，研究优先" |
| **执行模式** | 静态图（默认）→ 动态图（Eager） | 动态图（默认）→ 静态图（TorchScript） |
| **API 风格** | 声明式（先定义图） | 命令式（像写 Python 一样） |
| **部署生态** | 一套模型，多端部署 | 研究强，部署靠 ONNX / TorchServe |
| **发展思路** | 生态全 + 稳定 | 灵活 + 快速迭代 |
| **维护方** | Google | Meta (Meta) + 社区 |

### 1.2 代码风格对比

```python
# PyTorch（动态图，命令式）
import torch

x = torch.randn(32, 10)
model = torch.nn.Linear(10, 2)
y = model(x)  # 立即执行
loss = y.sum()
loss.backward()  # 反向传播
model.step()     # 参数更新
```

```python
# TensorFlow 2.x（Eager + tf.function）
import tensorflow as tf

x = tf.random.normal([32, 10])
model = tf.keras.layers.Dense(2)
y = model(x)  # 立即执行

# 如果需要图优化，加上装饰器
@tf.function
def train_step(x):
    with tf.GradientTape() as tape:
        y = model(x)
        loss = tf.reduce_sum(y)
    grads = tape.gradient(loss, model.trainable_variables)
    model.optimizer.apply_gradients(zip(grads, model.trainable_variables))
```

### 1.3 Keras vs torch.nn.Module

```python
# PyTorch: torch.nn.Module
class MyModel(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.layer1 = torch.nn.Linear(10, 32)
        self.relu = torch.nn.ReLU()
        self.layer2 = torch.nn.Linear(32, 2)
    
    def forward(self, x):
        x = self.layer1(x)
        x = self.relu(x)
        return self.layer2(x)

# TensorFlow: tf.keras.Model
class MyModel(tf.keras.Model):
    def __init__(self):
        super().__init__()
        self.layer1 = tf.keras.layers.Dense(32, activation='relu')
        self.layer2 = tf.keras.layers.Dense(2)
    
    @tf.function
    def call(self, x):
        x = self.layer1(x)
        return self.layer2(x)
```

## 2. 生态对比
### 2.1 部署生态

**TensorFlow 完胜**：这是 TF 最大的护城河。

| 部署场景 | TensorFlow | PyTorch |
|---------|-----------|---------|
| 服务器 | TF Serving (gRPC/REST) | TorchServe |
| Android | TFLite (成熟) | PyTorch Mobile (新) |
| iOS | TFLite (成熟) | PyTorch Mobile (新) |
| 浏览器 | TFJS | - |
| 嵌入式/MCU | TFLite Micro | - |
| 模型格式 | SavedModel (标准化) | TorchScript |
| TFX 流水线 | 原生支持 | 需要自己集成 |

### 2.2 研究生态

**PyTorch 领先**：论文实现、模型库。

| 维度 | TensorFlow | PyTorch |
|--------|-----------|---------|
| 论文复现 | 一般（有些滞后） | 快（大多数新论文先出 PT） |
| Hugging Face | 支持但非首选 | 首选 |
| 模型库 | TF Model Garden | torch hub、timm |
| 社区活跃度 | 中 | 高 |
| 论文引用 | 下降中 | 持续上升 |

```python
# Hugging Face Transformers（PyTorch 优先）
from transformers import BertModel
model = BertModel.from_pretrained('bert-base-uncased')

# TF 版本（也有，但非主流）
# from transformers import TFBertModel
# model = TFBertModel.from_pretrained('bert-base-uncased')
```

### 2.3 工具链对比

| 工具 | TensorFlow | PyTorch |
|------|-----------|---------|
| 可视化 | TensorBoard | TensorBoard（也支持） + |
| 数据管道 | tf.data | torch.utils.data |
| 分布式 | tf.distribute | DDP / FSDP |
| 编译器 | XLA | torch.compile (TorchDynamo) |
| 量化 | TFLite (成熟) | PyTorch Quantization (实验) |
| AutoML | KerasTuner | PyTorch Lightning + Optuna |
| 概率编程 | TFP | Pyro |

## 3. 性能对比
### 3.1 训练性能

| 场景 | TensorFlow | PyTorch | 备注 |
|------|-----------|---------|------|
| 单 GPU 小模型 | 约等于 | 约等于 | 差异可忽略 |
| 单 GPU 大模型 | 略好 | - | 算子优化成熟 |
| 多 GPU | 略好 | - | NCCL 集成深 |
| TPU | 最佳 | 支持但弱 | TPU 是 TF 一等公民 |
| 混合精度 | 成熟 | 成熟 | 两者差不多 |
| XLA vs torch.compile | XLA 成熟 | TorchDynamo 新 | TF 略好 |

### 3.2 推理性能

| 场景 | TensorFlow | PyTorch |
|------|-----------|---------|
| 服务器 | TF Serving + XLA | TorchServe |
| 移动端 | TFLite (成熟，量化好) | 发展中 |
| 延迟敏感 | XLA + TFLite | TorchScript |

> 📊 根据 MLPerf 推理基准，两者差距在实际应用中通常 < 10%，关键看优化水平。

## 4. 学习曲线对比
### 4.1 新手入门

| 维度 | TensorFlow | PyTorch |
|------|-----------|---------|
| 入门难度 | 中（API 多） | 低（Pythonic） |
| 调试 | 难（Eager 模式好一些） | 易（标准 Python 调试） |
| 文档质量 | 中（有些散） | 好（集中） |
| 错误信息 | 一般 | 更友好 |
| 教程质量 | 够用 | 多且新 |

```python
# PyTorch 调试（像普通 Python）
# 打断点、单步执行都可以

# TensorFlow 调试（需要开启 Eager）
tf.config.run_functions_eagerly(True)  # 才能断点调试
```

### 4.2 迁移成本

| 方向 | 迁移难度 |
|------|---------|
| PyTorch → TensorFlow | 低（概念相似） |
| TensorFlow → PyTorch | 低（概念相似） |
| TF 1.x → TF 2.x | 高（API 变化大） |

## 5. 选型决策指南
### 5.1 选 TensorFlow 的场景

| 场景 | 理由 |
|------|------|
| **生产部署为主** | SavedModel + TFLite + TF Serving 一条龙 |
| **移动端/嵌入式** | TFLite 成熟度高 |
| **TPU 训练** | TF 是 TPU 一等公民 |
| **企业级项目** | 稳定、版本兼容好、文档全 |
| **需要端到端 MLOps** | TFX 成熟 |
| **已有 TF 技术栈** | 迁移成本高 |

### 5.2 选 PyTorch 的场景

| 场景 | 理由 |
|------|------|
| **学术研究** | 论文实现快、社区活跃 |
| **快速原型** | Pythonic、调试方便 |
| **最新模型** | Hugging Face 先支持 |
| **小团队/个人项目** | 上手快、灵活 |
| **非 TPU 硬件** | 两者差不多，PyTorch 更灵活 |
| **非生产部署** | 研究为主不需要部署 |

### 5.3 判断流程图

```
我该选哪个框架？
│
├─ 模型要部署到移动端/浏览器/IoT？
│   └─ 是 → TF（TFLite 最成熟）
│
├─ 需要用 TPU 训练？
│   └─ 是 → TF（对 TPU 支持最好）
│
├─ 主要做学术研究/发论文？
│   └─ 是 → PyTorch（社区、HF 都更方便）
│
├─ 需要完整的 MLOps 流水线？
│   └─ 是 → TF（TFX 成熟）
│
├─ 团队已经用 PyTorch？
│   └─ 是 → 继续 PyTorch（迁移成本）
│
├─ 团队已经用 TF？
│   └─ 是 → 继续 TF（除非有明确理由换）
│
├─ 两者都可以？
│   └─ 选 PyTorch（趋势、社区活跃）
│
└─ 其他 → 看团队熟悉度、招聘市场
```

## 6. 招聘市场对比
### 6.1 市场需求

| 地区 | TensorFlow | PyTorch |
|------|-----------|---------|
| 中国 | 约 60% JD 提 TF | 约 40% JD 提 PT |
| 美国 | 两者相当 | 略多（尤其科技公司） |
| 硅谷大厂 | 两者都要 | 两者都要 |

### 6.2 薪资影响

两个框架的薪资差异不大，精通任何一个都有市场。**建议**：主力学一个，跨框架能力是加分项。

## 7. 两个都要：混合使用
### 7.1 方案一：PyTorch 训练 + TF Serving 部署

```python
# 1. PyTorch 训练
model = MyModel()
# ... 训练代码
torch.save(model.state_dict(), 'model.pt')

# 2. 转换为 ONNX
dummy_input = torch.randn(1, 3, 224, 224)
torch.onnx.export(model, dummy_input, 'model.onnx')

# 3. TF Serving 加载 ONNX（需要 onnx-tf）
import onnx
from onnx_tf.backend import prepare
onnx_model = onnx.load('model.onnx')
tf_rep = prepare(onnx_model)
tf_rep.export_graph('saved_model/1')
```

### 7.2 方案二：Hugging Face + TF

```python
from transformers import TFBertForSequenceClassification

# 直接用 TF 版本
model = TFBertForSequenceClassification.from_pretrained('bert-base-uncased')
model.compile(optimizer='adam', loss='sparse_categorical_crossentropy')
```

## 8. 小结

| 维度 | TensorFlow | PyTorch |
|------|-----------|---------|
| **部署** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **研究** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **TPU 支持** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **易用性** | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **文档** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **社区** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **性能** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

**最终建议**：
- **生产为主**：选 TF
- **研究为主**：选 PyTorch
- **都要**：主力学一个，跨框架能力加分
- **新人**：选 PyTorch（门槛低，资源多）

**延伸阅读**：
- TensorFlow 官网：https://www. tensorflow. org
- PyTorch 官网：https://pytorch. org
- Hugging Face：https://huggingface. co

**下一章** → [11 附录](./11-附录. md)