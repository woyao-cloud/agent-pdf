# 第02章 Tensor 底层实现原理

`torch.Tensor` 是 PyTorch 中最基础的对象。表面上它像 NumPy 的 ndarray，但内部结构复杂得多 —— 它不仅要存数据，还要承担梯度追踪、设备调度、视图共享、stride 计算等职责。理解 Tensor 的内部布局是解释一切性能问题（拷贝、显存碎片、`view()` 报错）的根基。

---

## 2.1 Tensor 的逻辑视图与物理存储分离

PyTorch 把 Tensor 拆成**两层**：

```
+----------------+       +-----------------+
|  Tensor (元数据) | ----> | Storage (字节流) |
+----------------+       +-----------------+
| size           |       | data_ptr        |
| stride         |       | dtype size      |
| storage_offset |       | device          |
| dtype          |       | nbytes          |
| device         |       +-----------------+
| requires_grad  |       
| autograd meta  |       
+----------------+       
```

`Tensor` 是**轻量元数据视图**；`Storage` 是底层连续字节缓冲区。多个 Tensor 可以共享同一个 Storage —— 这正是 `view()` / `slice` / `transpose()` 不复制内存的原因。

### 2.1.1 验证存储共享

```python
import torch

a = torch.arange(12).view(3, 4)
b = a[:, 1:3]                # 切片得到子视图
print(a.data_ptr() == b.untyped_storage().data_ptr())  
# True：共享同一段内存

b[0, 0] = 99                 # 修改 b
print(a)                     
# a[0, 1] 也被改成了 99
```

> 这种共享是性能优势也是 bug 来源。第 16 章会列出常见的"以为复制了实际上共享"的陷阱。

### 2.1.2 Storage 真正存什么

```python
a = torch.tensor([[1, 2, 3], [4, 5, 6]], dtype=torch.float32)
print(a.untyped_storage().nbytes())   # 24 = 6 * 4 字节
print(a.untyped_storage().tolist()[:6])  # [底层字节...]
```

Storage 是一段**连续**的字节缓冲，不关心形状。"形状"由 Tensor 的 `size` 与 `stride` 描述。

---

## 2.2 size、stride、storage_offset

PyTorch 用三个量唯一确定一个 Tensor 视图：

- `size`：每个维度的长度，例如 `(3, 4)`
- `stride`：每个维度上跨过一个元素需要在 storage 中走多少个**元素**（不是字节）
- `storage_offset`：第一个元素相对 storage 起点的偏移

公式：`storage[storage_offset + i0*stride[0] + i1*stride[1] + ...]` 即第 `(i0, i1, ...)` 个元素。

### 2.2.1 contiguous Tensor

```python
a = torch.arange(12).view(3, 4)
print(a.size())     # torch.Size([3, 4])
print(a.stride())   # (4, 1)   行优先：跨一行 = 跨 4 个元素
print(a.storage_offset())  # 0
print(a.is_contiguous())   # True
```

### 2.2.2 transpose 后变 non-contiguous

```python
b = a.t()             # (4, 3)
print(b.size())       # torch.Size([4, 3])
print(b.stride())     # (1, 4)
print(b.is_contiguous())  # False
```

`b` 没有复制数据 —— 仅仅交换了 `size` 和 `stride`。但内存访问模式从行优先变成"跨行跳读"，对 cache 不友好，所以很多算子（特别是底层手写 kernel）会先 `.contiguous()` 再计算。

### 2.2.3 view 为什么有时报错

```python
a.t().view(-1)       # RuntimeError: view size is not compatible with input tensor's size and stride
a.t().reshape(-1)    # OK，自动复制
```

`view()` 要求新形状能与现有 stride 兼容（即仍然是同一段连续 storage 的合法视图）。`reshape()` 更宽松：能 view 就 view，不能 view 就拷贝成 contiguous 再 view。

> **实战建议**：在性能关键路径上，优先用 `view()`。它要么成功（零拷贝），要么报错让你显式 `contiguous()`，避免静默的内存拷贝。

---

## 2.3 dtype 与精度

PyTorch 支持的常用 dtype：

| dtype | 字节 | 用途 |
|-------|------|------|
| `torch.float32` (`float`) | 4 | 训练默认精度 |
| `torch.float64` (`double`) | 8 | 数值科学，训练几乎不用 |
| `torch.float16` (`half`) | 2 | 混合精度训练（有溢出风险） |
| `torch.bfloat16` | 2 | 大模型训练首选（指数位宽=fp32） |
| `torch.int64` (`long`) | 8 | 索引、分类 label |
| `torch.int32` | 4 | 节省内存的整数 |
| `torch.bool` | 1 | mask |
| `torch.int8` / `uint8` | 1 | 量化 |
| `torch.float8_e4m3fn` / `e5m2` | 1 | FP8（H100/B200 训练） |

### 2.3.1 dtype 自动提升规则

```python
torch.tensor(1) + torch.tensor(1.0)   # int + float → float
torch.tensor(1.0, dtype=torch.float16) + torch.tensor(1.0)  # half + float → float
```

规则简化版：**dtype 类别取较高，size 取较大**。完整规则参考 [PyTorch type promotion 文档](https://pytorch.org/docs/stable/tensor_attributes.html#type-promotion-doc)。

### 2.3.2 fp16 vs bf16 的关键差异

```
fp16:   sign(1) + exp(5)  + mantissa(10)   范围约 ±6.5e4
bf16:   sign(1) + exp(8)  + mantissa(7)    范围约 ±3.4e38
fp32:   sign(1) + exp(8)  + mantissa(23)   范围约 ±3.4e38
```

bf16 的指数位与 fp32 一致 —— 这意味着**几乎不会溢出**，无需 loss scaling；但精度更低。在 LLM / 大模型训练中，bf16 已成事实标准；视觉小模型仍常用 fp16 + AMP。详见第 14 章。

---

## 2.4 device 与设备调度

Tensor 的 `device` 属性决定它存在哪儿：

```python
x = torch.zeros(3, device='cpu')
y = torch.zeros(3, device='cuda:0')
z = torch.zeros(3, device='cuda:1')
```

### 2.4.1 跨设备运算的限制

```python
x + y   # RuntimeError: Expected all tensors to be on the same device
```

PyTorch **不自动跨设备同步** —— 跨设备运算要显式 `.to()`：

```python
(x.to('cuda:0') + y).cpu()
```

这是显式优于隐式的设计：自动跨设备会引入难以察觉的性能黑洞（H2D / D2H 拷贝）。

### 2.4.2 device 索引与默认 device

```python
torch.cuda.is_available()           # 是否有可用 GPU
torch.cuda.device_count()           # GPU 数量
torch.cuda.current_device()         # 当前默认 GPU id

with torch.cuda.device(1):
    z = torch.zeros(3, device='cuda')  # 在 cuda:1 上
```

### 2.4.3 异步执行模型（CUDA Stream）

CUDA 算子默认**异步**：调用立即返回，实际计算入队 stream。这意味着：

```python
import time
x = torch.randn(10000, 10000, device='cuda')

t0 = time.time()
y = x @ x          # 立即返回，不等真正算完
print(time.time() - t0)  # 微秒级，假象！

torch.cuda.synchronize()    # 等所有 stream 任务完成
print('真实耗时:', time.time() - t0)
```

> **首要陷阱**：未加 `synchronize` 的 GPU 计时几乎一定是错的。详见第 12 章 Profiling。

---

## 2.5 Tensor 的创建路径

### 2.5.1 工厂函数

```python
torch.zeros(3, 4)
torch.ones(3, 4)
torch.empty(3, 4)              # 不初始化，更快但内容随机
torch.full((3, 4), 7.0)
torch.arange(0, 10, 2)
torch.linspace(0, 1, 11)
torch.randn(3, 4)              # 标准正态
torch.randint(0, 10, (3, 4))
```

### 2.5.2 从已有数据

```python
torch.tensor([1, 2, 3])             # 复制数据
torch.from_numpy(np_array)          # 与 numpy 共享内存（CPU only）
torch.as_tensor(data, device=...)   # 尽量不复制
```

### 2.5.3 like 系列保持元属性

```python
x = torch.randn(3, 4, device='cuda', dtype=torch.bfloat16)
y = torch.zeros_like(x)        # 自动同 device、dtype、shape
z = torch.empty_like(x)
```

写库代码时大量使用 `*_like` 可以避免硬编码 `device='cuda'`，让 CPU/GPU 通用。

---

## 2.6 内存分配器：CUDA Caching Allocator

GPU 显存分配比 CPU 慢得多。PyTorch 自带一个**显存缓存分配器**：

1. 第一次申请 N 字节 → 调 `cudaMalloc`，慢
2. 释放时**不还给 CUDA Driver**，留在 PyTorch 的内部池
3. 下次申请大小相近的块 → 直接复用，快

这就是为什么：

```python
torch.cuda.memory_allocated()    # 当前已分配给 Tensor 的显存
torch.cuda.memory_reserved()     # PyTorch 从 driver 申请的总显存（含缓存）
```

`reserved` 通常比 `allocated` 大，差额就是缓存池。

### 2.6.1 显存碎片问题

长时间训练后，缓存池可能被切成大量小块，新的大块申请失败而 OOM —— 但 `nvidia-smi` 显示总显存还有富余。这就是**显存碎片**。

排查与缓解（详见第 13、17 章）：

```python
torch.cuda.empty_cache()          # 把缓存还给 driver（仅释放空闲块）
torch.cuda.memory_summary()       # 详细分配统计
# 设置环境变量缓解碎片：
# PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True   (PT 2.1+)
```

---

## 2.7 Tensor 与 NumPy 的零拷贝桥

CPU Tensor 与 NumPy ndarray 可以共享内存：

```python
import numpy as np
a = np.array([1.0, 2.0, 3.0])
t = torch.from_numpy(a)
t[0] = 99
print(a)   # [99., 2., 3.]  共享！
```

这一桥梁的代价：

- 仅适用于 CPU Tensor
- 修改任一侧另一侧立即变化（埋雷）
- 不能跨进程

GPU Tensor 转 NumPy 必须先 `.cpu()`，会触发 D2H 拷贝。

---

## 2.8 自定义 dtype / 设备：dispatcher 简介

PyTorch 的算子分发系统（dispatcher）按 (dtype, device, layout, autograd) 路由到具体内核。新增一种硬件（如 NPU、TPU）只需：

1. 注册新 device key（如 `PrivateUse1`）
2. 为每个算子提供该 device 上的实现
3. PyTorch 自动调用

这正是国产 AI 芯片（华为昇腾、寒武纪等）能"无侵入"接入 PyTorch 的原因。dispatcher 详细机制见 [PyTorch Dispatcher 教程](https://pytorch.org/tutorials/advanced/dispatcher.html)。

---

## 2.9 实战速查

| 操作 | 方法 | 是否复制 |
|------|------|---------|
| 转 dtype | `t.to(torch.float16)` | 复制 |
| 转 device | `t.to('cuda')` | 复制（跨设备） |
| 转视图 | `t.view(...)` | 不复制（要求 contiguous） |
| 转视图（宽松） | `t.reshape(...)` | 可能复制 |
| 切片 | `t[1:3]` | 不复制 |
| 转置 | `t.t()` / `t.transpose()` | 不复制（变 non-contiguous） |
| 强制连续 | `t.contiguous()` | 必要时复制 |
| 升维 / 降维 | `t.unsqueeze() / t.squeeze()` | 不复制 |
| 与 NumPy 互转 | `from_numpy / .numpy()` | CPU 不复制 |

---

## 2.10 本章小结

- Tensor = 元数据 + Storage；多个 Tensor 可共享 Storage
- `size / stride / storage_offset` 三元组定义视图，理解它们就理解了 view / reshape / transpose 的边界
- dtype 选择直接影响显存与精度：bf16 是大模型时代的默认
- CUDA 算子异步执行；计时必须 `synchronize`
- PyTorch 显存缓存分配器是性能保证也是碎片来源
- CPU Tensor 与 NumPy 零拷贝；GPU Tensor 必须先回传

下一章进入 Tensor 之上的核心机制：Autograd —— PyTorch 究竟如何"自动"求导。
