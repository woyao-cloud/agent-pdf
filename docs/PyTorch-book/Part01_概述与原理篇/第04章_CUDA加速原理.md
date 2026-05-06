# 第04章 CUDA 加速原理

PyTorch 用 GPU 跑得快，不只是因为"GPU 强"。它在 Python ↔ C++ ↔ CUDA 之间架设了一整套异步执行、内存调度、内核分发机制。理解这套机制，才能解释：
- 为什么 `time.time()` 计 GPU 时间是错的
- 为什么 `model.cuda()` 后第一次前向特别慢
- 为什么 `batch_size` 翻倍但训练时间没翻倍
- 为什么有时 CPU 占用 100% 但 GPU 利用率低

---

## 4.1 GPU 与 CPU 的根本差异

| 维度 | CPU | GPU |
|------|-----|-----|
| 核心数 | 几十个高频强核 | 数千个低频弱核 |
| 优化目标 | 单线程低延迟 | 大规模并行高吞吐 |
| 控制单元 | 庞大（分支预测、乱序执行） | 简化（一组核共享一个控制单元 = SIMT） |
| 内存层级 | 大 cache，主存带宽中等 | 小 cache，显存带宽极高（HBM） |
| 适合 | 复杂控制流、串行任务 | 大矩阵乘加、卷积等可并行算子 |

GPU 加速的前提：**问题足够并行 + 算术强度（compute / memory ratio）足够高**。深度学习的 GEMM、Conv、Attention 全部满足。

---

## 4.2 CUDA 编程模型简略

CUDA 把任务组织成三层：

```
Grid (整个 kernel 的所有线程)
 ├── Block (一组共享内存的线程，最多 1024)
 │    ├── Warp (32 个 SIMT 线程，一起执行)
 │    ├── Warp
 │    └── ...
 └── Block
```

PyTorch 用户**几乎不直接写**这层代码（除非自定义 CUDA kernel），但需要理解：

- **Warp 内分支发散** = 性能损失（同一 warp 32 线程走不同分支会串行执行）
- **Coalesced memory access**：相邻线程访问相邻地址 → 一次内存事务
- **Shared memory** 比全局显存快 100x，但只有 KB 级
- **Tensor Core**（Volta+）：专用矩阵乘单元，需要满足特定 shape / dtype

---

## 4.3 PyTorch 的 CUDA 调用链

一行 `c = a + b`（GPU tensor）的真实路径：

```
Python: c = a + b
  → C++ Dispatcher: 根据 (dtype, device, layout) 找到 CUDA add kernel
  → CUDA Kernel Launch: 把 grid/block 配置和指针入队 stream
  → GPU 异步执行
  → 立即返回（c 已分配，但内容尚未就绪）
```

关键事实：**Kernel launch 是异步的**。Python 拿到 `c` 时，GPU 可能还没算完。

### 4.3.1 这意味着什么

```python
t0 = time.time()
c = a @ b
elapsed = time.time() - t0   # 错！这只是 launch 时间
```

正确做法：

```python
torch.cuda.synchronize()
t0 = time.time()
c = a @ b
torch.cuda.synchronize()
elapsed = time.time() - t0
```

或用 CUDA event：

```python
start = torch.cuda.Event(enable_timing=True)
end = torch.cuda.Event(enable_timing=True)
start.record()
c = a @ b
end.record()
torch.cuda.synchronize()
print(start.elapsed_time(end), 'ms')
```

### 4.3.2 CPU-GPU 隐式同步

某些操作会**隐式触发同步**：

| 操作 | 触发原因 |
|------|---------|
| `tensor.item()` | 需要数值，必须等结果 |
| `tensor.cpu()` / `.numpy()` | 数据要传回 CPU |
| `print(tensor)` | 需要打印数值 |
| `tensor.tolist()` | 同上 |
| `if tensor > 0:` | Python 需要 bool 值 |

这些会**清空异步队列**，让 GPU "停一停"。训练循环里出现一次 `.item()` 通常没事，每个 batch 都调多次会显著拖慢。

> 调试技巧：`os.environ['CUDA_LAUNCH_BLOCKING'] = '1'` 强制每次 launch 都同步，便于让报错堆栈精确定位到出错的算子（默认异步下报错可能延迟几行才出现）。仅用于调试，**生产关闭**。

---

## 4.4 CUDA Stream 与并发

每个 CUDA stream 是一个**FIFO 命令队列**。同一 stream 内严格顺序，不同 stream 可并发。

PyTorch 默认所有操作走"默认 stream"，所以串行。需要并发时：

```python
s1 = torch.cuda.Stream()
s2 = torch.cuda.Stream()

with torch.cuda.stream(s1):
    a_gpu = a.to('cuda', non_blocking=True)
with torch.cuda.stream(s2):
    b_gpu = b.to('cuda', non_blocking=True)

torch.cuda.synchronize()    # 等两个 stream 都完成
```

典型场景：**数据传输与计算重叠**（H2D 拷贝走 stream A，计算走 stream B）。`DataLoader(pin_memory=True)` + `non_blocking=True` 是这一思想的常用组合。

---

## 4.5 cuDNN 与算法选择

卷积、RNN 等算子调用 NVIDIA 的 **cuDNN** 库。cuDNN 对每个卷积形状有多种算法（implicit GEMM、Winograd、FFT 等），性能差异可达数倍。

### 4.5.1 自动选择最快算法

```python
torch.backends.cudnn.benchmark = True
```

启用后，PyTorch 第一次遇到某个 (input_shape, kernel_shape, stride, ...) 组合时会**实测**所有候选算法选最快，缓存供后续使用。

注意：

- 输入形状变化频繁时反而更慢（频繁基准测试）
- 默认关闭，因为可能影响**确定性**
- 推理 / 固定 shape 训练 → 强烈推荐开启

### 4.5.2 确定性模式

```python
torch.backends.cudnn.deterministic = True
torch.use_deterministic_algorithms(True)   # 更严格，PyTorch 1.8+
```

关闭非确定性算法，用于结果可重现的场景（科研、医疗、金融审计）。代价：性能下降 10-30%。

---

## 4.6 Tensor Core 与混合精度

Volta（V100）开始引入 **Tensor Core** —— 专门做 4×4 矩阵乘加的硬件单元。要触发：

1. dtype 必须是 fp16 / bf16 / tf32 / fp8（看 GPU 代际）
2. 矩阵 shape 在 8 / 16 的倍数上对齐（H100 推荐 64 倍数）
3. 用 cuBLAS / cuDNN 的对应路径

PyTorch 通过 `torch.cuda.amp` 自动启用：

```python
from torch.cuda.amp import autocast, GradScaler

scaler = GradScaler()
for x, y in loader:
    optimizer.zero_grad()
    with autocast(dtype=torch.float16):       # 或 bfloat16
        out = model(x)
        loss = criterion(out, y)
    scaler.scale(loss).backward()
    scaler.step(optimizer)
    scaler.update()
```

或更新的 `torch.amp.autocast('cuda', dtype=...)`。详细对比见第 14 章。

### 4.6.1 TF32（Ampere+）

A100 / H100 支持 TF32 模式：fp32 精度的位宽对齐到 bf16 的指数 + 略减的尾数，输入 fp32 但内部用 Tensor Core 算。**默认开启**，对训练精度影响极小但显著加速：

```python
torch.backends.cuda.matmul.allow_tf32 = True   # 默认开启
torch.backends.cudnn.allow_tf32 = True
```

如果你需要严格 fp32 数值复现（罕见），手动关闭。

---

## 4.7 H2D / D2H 数据传输

GPU 加速最容易被忽略的瓶颈：CPU ↔ GPU 之间的 PCIe 传输。

### 4.7.1 pinned memory（页锁定内存）

普通 CPU 内存可被 OS 换页，GPU 拷贝必须先复制到 driver 缓冲区，慢一倍。pinned memory 不可换页，DMA 直接传输：

```python
# DataLoader 启用
DataLoader(dataset, batch_size=64, pin_memory=True, num_workers=4)
# 拷贝时
batch = batch.to('cuda', non_blocking=True)
```

`non_blocking=True` 仅在源是 pinned memory 时才真正异步。

### 4.7.2 PCIe 带宽对比

| 接口 | 单向带宽（理论） |
|------|---------------|
| PCIe 3.0 x16 | 16 GB/s |
| PCIe 4.0 x16 | 32 GB/s |
| PCIe 5.0 x16 | 64 GB/s |
| NVLink 3.0 (A100) | 600 GB/s（每张卡聚合） |
| NVLink 4.0 (H100) | 900 GB/s |

ImageNet 一张 224×224 RGB 图片解码后 ~150KB，batch=256 一次只需 ~38MB —— 但**整个数据 pipeline**包括磁盘 I/O、CPU 解码、归一化，常常成为真正瓶颈。第 6 章会详细讨论。

---

## 4.8 CUDA Graph：消除 launch 开销

每次 kernel launch 都有 ~5-20 微秒 CPU 开销。当 batch 很小或模型很深时，launch 开销甚至超过 kernel 实际计算时间。

CUDA Graph 把一段 kernel 序列**录制**成一张图，重放时只 launch 一次：

```python
# 1) 预热
g = torch.cuda.CUDAGraph()
with torch.cuda.graph(g):
    for _ in range(10):
        out = model(static_input)
        loss = criterion(out, static_target)
        loss.backward()
        optimizer.step()

# 2) 重放
g.replay()
```

要求：输入/参数 shape 与地址固定（用 static buffer）。`torch.compile(mode="reduce-overhead")` 内部会自动尝试 CUDA Graph。

适合：极小模型推理、强化学习的 RL 循环、深度但形状固定的训练。

---

## 4.9 NCCL 与多卡通信

多 GPU 训练靠 NVIDIA Collective Communications Library（NCCL）做 all-reduce / all-gather / reduce-scatter 等集合通信。PyTorch `torch.distributed` 默认使用 NCCL backend：

```python
import torch.distributed as dist
dist.init_process_group(backend='nccl')
```

通信原语：

| 原语 | 作用 |
|------|------|
| all_reduce | 所有 rank 的张量加和后广播给所有 rank（DDP 同步梯度） |
| all_gather | 所有 rank 的张量拼接到所有 rank（FSDP 取参数） |
| reduce_scatter | 加和后切分到各 rank（FSDP 算梯度） |
| broadcast | 一个 rank 的张量送到所有 rank（参数初始化） |

性能取决于**拓扑**（PCIe / NVLink / IB）和**消息大小**。第 15 章会展开。

---

## 4.10 nvidia-smi 与 GPU 利用率的迷思

`nvidia-smi` 的"GPU-Util" 是**采样到的有 kernel 在跑的时间比例**，不等于"GPU 算力利用率"。看到 95% 也可能是：

- 一直在做带宽受限的 pointwise 算子，算力闲置
- launch 频繁但每次只跑 1us 的小 kernel

更细的指标用 Nsight Compute / DCGM：

- SM Active：有 warp 在跑的 SM 比例
- Memory Throughput：实际显存带宽使用
- Tensor Active：Tensor Core 占用率

第 12 章会详解 Profiling 工具链。

---

## 4.11 多 GPU 进程模型

PyTorch 多卡训练**强烈推荐每卡一个进程**（DDP / FSDP），而非一个进程多卡（DataParallel）。原因：

| DataParallel（已不推荐） | DistributedDataParallel |
|---------------------|------------------------|
| 单进程多线程，受 GIL 限制 | 多进程，无 GIL |
| 主卡梯度聚合，负载不均 | all-reduce 对称 |
| 通信经过 CPU | 直接 NVLink / NCCL |
| 比 DDP 慢 30%+ | 当前业界标准 |

---

## 4.12 ROCm / 国产 GPU

PyTorch 通过 dispatcher 抽象层支持：

- **AMD ROCm**：HIP 是 CUDA 的 API 兼容层；很多 PyTorch 代码改 `cuda` 为 `cuda`（PyTorch 2.x 上 ROCm device 仍叫 `cuda`，对用户透明）即可
- **华为昇腾**：通过 `torch_npu` 插件，device 类型为 `npu`
- **寒武纪**：通过 `torch_mlu`
- **苹果 M 系列**：`mps` device（Metal Performance Shaders），算子覆盖率比 CUDA 低

跨 GPU 厂商部署时，**算子覆盖率**是首要风险点。

---

## 4.13 实战 checklist

| 检查项 | 命令/做法 |
|-------|---------|
| GPU 是否真在用 | `nvidia-smi` 观察 GPU-Util、显存增长 |
| 是否启用 cuDNN benchmark | `torch.backends.cudnn.benchmark = True` |
| 是否启用 AMP | `with autocast(...)` |
| 数据是否 pinned + non_blocking | DataLoader + `.to(non_blocking=True)` |
| 是否被 H2D 卡住 | Profiler 看 stream 时间线 |
| 是否被 launch overhead 卡住 | 小模型 + `torch.compile(mode='reduce-overhead')` |
| 是否被 sync 阻断 | 检查 `.item()` `.cpu()` 频率 |
| 多卡是否用了 DDP 而非 DP | `nn.parallel.DistributedDataParallel` |

---

## 4.14 本章小结

- GPU 加速依赖**大并行 + 高算术强度**；不满足则可能比 CPU 还慢
- PyTorch 的 CUDA 调用是异步的；计时必须 sync，调试可设 `CUDA_LAUNCH_BLOCKING`
- cuDNN benchmark、TF32、Tensor Core、AMP 是几乎免费的加速开关
- H2D 传输是常被低估的瓶颈：pinned + non_blocking + 多 worker DataLoader
- CUDA Graph、`torch.compile` 用于消除 launch overhead
- 多卡训练用 DDP/FSDP，不要用 DataParallel
- `nvidia-smi` 的利用率只是粗指标，深入用 Nsight / DCGM

至此 Part01"概述与原理篇"完结。下一部分进入 PyTorch 的核心使用：从 `nn.Module` 开始构建你自己的模型。
