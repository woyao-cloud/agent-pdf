# 第01章 PyTorch 概述与解决的问题

PyTorch 不是凭空出现的框架。它的设计选择 —— 动态图、Pythonic API、Tensor-as-Variable —— 都是对前一代深度学习框架（Theano / Caffe / TensorFlow 1.x）的具体痛点做出的回应。要真正"精通" PyTorch，第一步是理解它**到底解决了哪些问题**，以及为此付出了什么代价。

---

## 1.1 深度学习框架要解决的核心问题

任何深度学习框架本质上要回答四个问题：

| 问题 | 内涵 |
|------|------|
| **张量计算** | 如何高效执行 N 维数组运算（CPU/GPU） |
| **自动求导** | 如何自动计算任意计算图的梯度 |
| **模型表达** | 如何方便地定义、组合、复用神经网络模块 |
| **训练-部署衔接** | 如何把训练好的模型搬到生产推理环境 |

PyTorch 给出的答案围绕一个核心选择：**动态计算图（define-by-run）**。这一选择牵动了全部后续设计。

---

## 1.2 PyTorch 出现前的痛点

### 1.2.1 静态图框架的工程负担（TensorFlow 1.x / Theano）

静态图（define-and-run）的工作流程：

```python
# TensorFlow 1.x 风格（伪代码）
g = tf.Graph()
with g.as_default():
    x = tf.placeholder(tf.float32, shape=[None, 784])
    W = tf.Variable(...)
    y = tf.matmul(x, W)
    loss = ...
    train_op = optimizer.minimize(loss)

with tf.Session(graph=g) as sess:
    sess.run(tf.global_variables_initializer())
    sess.run(train_op, feed_dict={x: batch})
```

它带来的实际工程问题：

1. **调试地狱**：错误堆栈指向 graph 构建期，而非真正出错的运行期。`print(tensor)` 打印的是符号占位符，不是数值。
2. **控制流别扭**：`if/while/for` 必须用 `tf.cond` / `tf.while_loop`，破坏 Python 直觉。
3. **变长输入难以表达**：每条样本长度不同时，要 padding 或自定义动态 shape，复杂模型（树结构、图结构）几乎无法自然表达。
4. **快速实验阻力大**：每改一行模型结构都要重建 graph，迭代速度慢。

### 1.2.2 Caffe / Caffe2 的配置式建模

Caffe 用 protobuf 描述网络：

```protobuf
layer {
  name: "conv1"
  type: "Convolution"
  bottom: "data"
  top: "conv1"
  convolution_param { num_output: 96 kernel_size: 11 stride: 4 }
}
```

适合工程部署，但研究迭代极不友好：自定义层要写 C++，配置文件无法编程构造。

### 1.2.3 Theano 的编译开销

Theano 在每次定义计算图后调用 C 编译器生成可执行代码。研究中常见的"改一个 op 试试效果"，在 Theano 里要等几十秒到几分钟的编译，严重打断思路。

---

## 1.3 PyTorch 的解决方案

PyTorch 的设计目标可以浓缩为一句话：**"让神经网络的代码看起来就像普通的 Python 数值代码"**。具体落到五条设计原则：

### 1.3.1 动态计算图（Dynamic Computation Graph）

计算图在**每次前向传播时按 Python 执行流即时构建**，反向传播完成后即丢弃。这意味着：

```python
import torch

x = torch.randn(3, requires_grad=True)
y = x * 2
# 此时计算图中存在节点 (Mul, x, 2) → y

if y.sum() > 0:        # 普通 Python 控制流，自然嵌入图
    z = y.mean()
else:
    z = y.sum()

z.backward()           # 沿即时构建的图反传梯度
```

设计后果：

| 收益 | 代价 |
|------|------|
| 控制流即写即跑，可任意嵌入 if/while/递归 | 无法像静态图那样做整体优化（融合、提前分配） |
| 报错堆栈直接指向 Python 行号 | 每步前向都有图构建开销 |
| `print(tensor)`、`pdb.set_trace()` 直接可用 | 部署到无 Python 环境（移动端、嵌入式）需要额外工作 |

> PyTorch 2.0 引入 `torch.compile` 后，部分弥补了"无法整体优化"的代价（详见第 14 章）。

### 1.3.2 Tensor 即 Variable（PT 0.4 后统一）

早期 PyTorch 区分 `Tensor`（普通张量）和 `Variable`（带梯度追踪的张量）。0.4 版本起合并：任意 Tensor 通过 `requires_grad=True` 即可参与求导。这一统一消除了大量样板代码。

### 1.3.3 Pythonic API

API 设计紧贴 NumPy 与 Python 习惯：

| NumPy | PyTorch |
|-------|---------|
| `np.zeros((2,3))` | `torch.zeros(2, 3)` |
| `a.reshape(...)` | `a.reshape(...)` 或 `a.view(...)` |
| `a @ b` | `a @ b`（同样支持矩阵乘） |
| `a.sum(axis=0)` | `a.sum(dim=0)` |

这种"零迁移成本"使大量 NumPy 用户能在数小时内开始训练神经网络。

### 1.3.4 模块化的 nn.Module

`nn.Module` 提供统一的"参数容器 + 前向函数"抽象：

```python
class MLP(torch.nn.Module):
    def __init__(self, in_dim, hid, out_dim):
        super().__init__()
        self.fc1 = torch.nn.Linear(in_dim, hid)
        self.fc2 = torch.nn.Linear(hid, out_dim)

    def forward(self, x):
        return self.fc2(torch.relu(self.fc1(x)))
```

`Module` 自动管理参数注册、子模块嵌套、设备搬迁、状态序列化（详见第 5 章）。

### 1.3.5 训练-部署一体化

PyTorch 提供多条从 Python 训练代码走向生产推理的路径：

| 路径 | 适用场景 | 关键 API |
|------|---------|---------|
| TorchScript（trace / script） | 服务端 C++ 推理、移动端 | `torch.jit.trace`、`torch.jit.script` |
| ONNX 导出 | 跨框架部署、TensorRT | `torch.onnx.export` |
| `torch.export` + AOTInductor | PT 2.x 原生导出 | `torch.export.export` |
| 直接 LibTorch C++ | 完整 PyTorch 行为，但更重 | `<torch/script.h>` |

第 8 章会详细对比这些路径。

---

## 1.4 PyTorch 解决的问题清单

把痛点和解决方案一一对应：

| 业界痛点 | PyTorch 的回应 |
|---------|---------------|
| 静态图调试困难 | 动态图 + Python 原生异常堆栈 |
| 控制流难表达 | Python 控制流即图控制流 |
| 自动求导只能预定义 | Autograd 引擎 + 自定义 `Function` |
| 研究迭代慢 | 即时执行，无编译等待 |
| GPU 加速门槛高 | `tensor.to('cuda')` 一行切换 |
| 数据并行复杂 | `DistributedDataParallel`、`FSDP` |
| 部署难 | TorchScript、ONNX、`torch.export` 多条路径 |
| 生态割裂 | 与 NumPy / Hugging Face / Lightning / Ray 等深度集成 |

---

## 1.5 PyTorch 不解决什么

知道边界比知道能力更重要。以下问题不是 PyTorch 的目标：

1. **不替代 NumPy 在科学计算中的位置**：PyTorch Tensor 主要为深度学习的可微分计算设计，纯 CPU 数值计算 NumPy 通常更快、API 更稳定。
2. **不直接提供 ML Pipeline 编排**：实验管理（MLflow / Weights & Biases）、特征存储、调度（Airflow）等都需要外部工具。
3. **不强制最优部署性能**：默认推理速度低于 TensorRT / ONNXRuntime / TVM 等专门推理框架，需要主动用 `torch.compile`、AOTInductor、量化才能接近。
4. **不保证"零代码 SOTA"**：PyTorch 是基础设施而非模型库；具体 SOTA 实现一般通过 timm / Hugging Face Transformers / TorchVision 等上层库提供。

---

## 1.6 PyTorch vs 其他主流框架

### 1.6.1 PyTorch vs TensorFlow 2.x

TF 2.x 引入 Eager Mode + `tf.function`，与 PyTorch 趋同，但仍有差异：

| 维度 | PyTorch | TensorFlow 2.x |
|------|---------|---------------|
| 默认执行模式 | Eager | Eager + `@tf.function` 编译 |
| 控制流图化 | `torch.compile`（TorchDynamo 字节码追踪） | AutoGraph（源码转换） |
| 工业部署生态 | TorchServe、Triton、ONNX | TF Serving、TFLite、TF.js |
| 研究社区主流 | 是（NeurIPS / ICML 论文 70%+ 使用 PyTorch） | 较少 |
| 移动端 | PyTorch Mobile（弱于 TFLite） | TFLite（成熟） |
| 端侧 / Web | LibTorch + ExecuTorch | TFLite + TF.js（领先） |

### 1.6.2 PyTorch vs JAX

JAX 走的是另一条路：函数式 + XLA 编译 + 显式变换（`jit/grad/vmap/pmap`）。

| 维度 | PyTorch | JAX |
|------|---------|-----|
| 执行模型 | 命令式、有状态（参数存在 Module） | 函数式、无状态（参数显式传入） |
| 求导 | Autograd 即时记录 | `jax.grad` 函数变换 |
| 编译器 | TorchInductor（PT 2.0+） | XLA |
| 最佳场景 | 工业模型、灵活研究、生态广 | 数值科学计算、大规模 TPU 训练 |
| 调试 | 较容易 | 函数式追踪需理解 traced abstract values |

`torch.func`（前身 `functorch`）借鉴了 JAX 的函数式变换思路，在 PyTorch 中提供 `vmap` / `grad`。

### 1.6.3 PyTorch vs MindSpore / PaddlePaddle / OneFlow

国产框架在某些垂直场景（端云协同、超大规模并行）有优势，但生态广度（论文复现、第三方库丰富度）目前与 PyTorch 仍有差距。一般原则：

- 研究、跨团队协作、跨平台部署 → PyTorch
- 国产化合规、特定硬件深度协同 → 对应国产框架

---

## 1.7 PyTorch 适用与不适用的场景

### 适用

- 深度学习模型研究与原型迭代
- 中小规模到超大规模的训练（ImageNet → GPT-4 级别均有先例）
- 服务端 GPU 推理（配合 `torch.compile` / TensorRT-LLM 等）
- 多模态、生成式、强化学习等需要灵活控制流的任务

### 不适用或需谨慎

- **极致低延迟移动端推理**：考虑 TFLite、ONNXRuntime Mobile、CoreML
- **资源受限嵌入式（< 64MB RAM）**：PyTorch 运行时仍偏重，考虑 ExecuTorch 或更轻量框架
- **纯传统机器学习任务**：决策树/SVM/线性模型 用 scikit-learn / XGBoost / LightGBM 通常更合适
- **需要确定性强的金融、医疗审计场景**：PyTorch 默认不保证位级可重现，需要专门配置（详见第 18 章）

---

## 1.8 本章小结

- PyTorch 用**动态图 + Pythonic API + 模块化设计**回应了上一代深度学习框架的工程痛点
- 它的核心设计选择带来的代价是：默认性能不如静态图框架；PT 2.x 通过 `torch.compile` 部分弥补
- PyTorch 是基础设施，不是"端到端 ML 解决方案"，需要与上层库（Transformers、Lightning、Ray 等）配合
- 选择 PyTorch 之前，先看场景：**研究 / GPU 训练 / 服务端推理 = 优先**；**移动端低功耗 / 极致部署 / 传统 ML = 慎重**

下一章我们进入 PyTorch 的"骨架"——Tensor 的底层实现，看一个简单的 `torch.tensor([1, 2, 3])` 在 C++ 层到底发生了什么。
