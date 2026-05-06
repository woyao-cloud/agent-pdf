# 第12章 性能瓶颈识别与 Profiling

性能优化的第一原则：**不测量就优化等于猜**。本章从最朴素的计时讲到 PyTorch Profiler、Nsight、内存分析，建立"先定位再下药"的工作流。

---

## 12.1 性能瓶颈的四大类

一个 PyTorch 程序慢，根因不外乎四类：

| 类别 | 典型症状 | 主要工具 |
|------|---------|---------|
| **数据 pipeline 瓶颈** | GPU 利用率低，CPU 满 | nvidia-smi、profiler timeline |
| **计算瓶颈** | GPU 利用率高，但 wall-clock 慢 | profiler、Nsight Compute |
| **显存瓶颈** | OOM、reserved 远大于 allocated | memory profiler、`memory_summary` |
| **通信瓶颈**（多卡） | 单卡快，多卡线性加速比差 | NCCL profiler、Nsight Systems |

不同类的优化手段完全不同 —— 把数据瓶颈的训练加速度浪费在用 `torch.compile` 优化模型上，毫无效果。

---

## 12.2 第一步：粗看 nvidia-smi

```bash
watch -n 0.5 nvidia-smi
```

观察：

| 指标 | 健康值 | 异常含义 |
|------|------|---------|
| GPU-Util | 80-100% | < 50% 通常是数据瓶颈 |
| Memory-Util | 任意 | 显存使用情况看 Memory-Used |
| Memory-Used / Total | < 95% | 接近 100% 易 OOM |
| Power Draw | 接近 TDP | 远低于 TDP 可能是闲置 |

注意：`GPU-Util` 是采样时段内"有 kernel 在跑"的比例，**不等于算力使用率**。看到 95% 也可能是：

- 一直跑小 kernel，每个只用了一点点 SM
- 一直在做带宽受限的 pointwise op

---

## 12.3 同步问题：让计时正确

CUDA 异步导致最常见的计时错误：

```python
# 错误：t1 - t0 几乎是 0，因为 launch 立即返回
t0 = time.time()
out = model(x)
t1 = time.time()
print(t1 - t0)
```

正确做法：

```python
# 方法 1：CPU 同步
torch.cuda.synchronize()
t0 = time.time()
out = model(x)
torch.cuda.synchronize()
print(time.time() - t0)

# 方法 2：CUDA event（更精确）
start = torch.cuda.Event(enable_timing=True)
end = torch.cuda.Event(enable_timing=True)
start.record()
out = model(x)
end.record()
torch.cuda.synchronize()
print(start.elapsed_time(end), 'ms')
```

注意：**首次运行有 cuDNN / 编译器预热开销**。计时前先 warm-up 几次：

```python
for _ in range(5):
    _ = model(x)
torch.cuda.synchronize()
# 再开始计时
```

---

## 12.4 PyTorch Profiler：第一选择

PT 1.8+ 自带 `torch.profiler`，对接 TensorBoard / Chrome trace viewer：

```python
from torch.profiler import profile, ProfilerActivity, schedule, tensorboard_trace_handler

prof = profile(
    activities=[ProfilerActivity.CPU, ProfilerActivity.CUDA],
    schedule=schedule(wait=1, warmup=1, active=3, repeat=1),
    on_trace_ready=tensorboard_trace_handler('./log/run1'),
    record_shapes=True,
    profile_memory=True,
    with_stack=True,
)

prof.start()
for step, (x, y) in enumerate(loader):
    out = model(x.cuda())
    loss = criterion(out, y.cuda())
    loss.backward()
    optimizer.step()
    optimizer.zero_grad()
    prof.step()                  # 推进 profiler 状态机
    if step >= 10:
        break
prof.stop()

print(prof.key_averages().table(sort_by="cuda_time_total", row_limit=20))
```

### 12.4.1 解读 Profiler 输出

key_averages 表前几列含义：

- `Self CPU` / `Self CUDA`：本算子在 CPU/GPU 上耗时（不含子调用）
- `CPU total` / `CUDA total`：含子调用
- `# of Calls`：调用次数

最重要的两列：**`Self CUDA` 与 `# of Calls`**。如果某个不起眼的小 op 调用了 100 万次，就是优化目标。

### 12.4.2 TensorBoard 时间线

```bash
tensorboard --logdir=./log
```

打开 PyTorch Profiler 页签，会展示：

- **GPU Kernel View**：哪些 kernel 占时间
- **GPU Utilization**：不同时间段的 SM Active / Tensor Active
- **DataLoader View**：每 step 数据加载耗时占比
- **Memory View**：显存随时间变化曲线

时间线上：

- 中间出现大段 GPU 空白 → 数据 pipeline 瓶颈
- GPU 满但每 step 长 → 计算瓶颈
- 多卡 timeline 中通信 op 占比大 → 通信瓶颈

### 12.4.3 Chrome trace

```python
prof.export_chrome_trace('trace.json')
# 在 Chrome 打开 chrome://tracing 加载
```

更细粒度的可视化，适合极致分析。

---

## 12.5 Nsight Systems / Nsight Compute

NVIDIA 的官方 profiler，比 PyTorch profiler 更深入：

| 工具 | 层级 | 用途 |
|------|------|------|
| Nsight Systems (`nsys`) | 系统级时间线 | 通信、stream、CPU/GPU 协同 |
| Nsight Compute (`ncu`) | 单 kernel 级 | 寄存器、occupancy、warp 效率 |

使用：

```bash
nsys profile -o report --capture-range cudaProfilerApi python train.py
```

代码内：

```python
torch.cuda.cudart().cudaProfilerStart()
# 关注的代码段
torch.cuda.cudart().cudaProfilerStop()
```

打开 `report.nsys-rep` 在 Nsight Systems GUI 查看。

> 对绝大多数 PyTorch 用户，PyTorch Profiler + TensorBoard 已经够用。Nsight 是底层 kernel 优化（如自定义 CUDA op）才需要。

---

## 12.6 显存分析

### 12.6.1 当前显存

```python
torch.cuda.memory_allocated() / 1e9    # GB，当前已分配给 Tensor
torch.cuda.memory_reserved()  / 1e9    # GB，PyTorch 缓存池总量
torch.cuda.max_memory_allocated() / 1e9  # 历史峰值
```

### 12.6.2 详细 summary

```python
print(torch.cuda.memory_summary(device=0))
```

输出示例（节选）：

```
| Allocated memory      |  4321 MB    |
| Active memory         |  4321 MB    |
| Reserved memory       |  6144 MB    |
| Non-releasable memory |   123 MB    |
| ...
```

`Reserved - Allocated = 缓存池中的空闲块`。差值过大说明碎片严重。

### 12.6.3 内存事件追踪

PT 2.0+ 提供 `_memory_viz`：

```python
torch.cuda.memory._record_memory_history(max_entries=100000)
# 跑训练
torch.cuda.memory._dump_snapshot('mem.pickle')
```

打开 [https://pytorch.org/memory_viz](https://pytorch.org/memory_viz) 加载 pickle，可视化每次 alloc/free，**精确定位**哪行代码导致显存峰值。这是诊断 OOM 与显存激增的最强工具。

### 12.6.4 profile_memory 选项

profiler 开启 `profile_memory=True` 后，可以看到每个 op 的显存增量：

```python
print(prof.key_averages().table(sort_by="self_cuda_memory_usage", row_limit=10))
```

---

## 12.7 数据 pipeline 瓶颈定位

### 12.7.1 简单实验

```python
# 把数据加载固定为常量
fixed_x = torch.randn(B, 3, 224, 224, device='cuda')
fixed_y = torch.randint(0, 1000, (B,), device='cuda')
torch.cuda.synchronize()
t0 = time.time()
for _ in range(100):
    out = model(fixed_x)
    loss = criterion(out, fixed_y)
    loss.backward()
    optimizer.step()
    optimizer.zero_grad()
torch.cuda.synchronize()
print('pure compute:', time.time() - t0)
# 对比真实 loader 的耗时；差额就是数据 pipeline 开销
```

### 12.7.2 Profiler timeline

profiler 时间线上 GPU stream 出现"间隔" + CPU 上 dataloader 进程在忙 → 数据瓶颈。

### 12.7.3 处理方案

第 6 章已详述：增加 num_workers / pin_memory / non_blocking / 预解码 / 改用更快的图像库。

---

## 12.8 计算瓶颈定位

GPU 满 + 训练慢 = 计算瓶颈。优化方向：

| 方法 | 适用 | 效果 |
|------|------|------|
| 混合精度（AMP） | 几乎所有训练 | 2-3x |
| `torch.compile` | PT 2.0+ 模型 | 1.3-2x |
| Flash Attention | 长序列 attention | 2-4x（attention 部分） |
| cuDNN benchmark | 卷积固定 shape | 1.1-1.5x |
| 移除 `.item()` 同步 | 频繁的同步点 | 视情况 |
| batch 增大 | 计算受限的小模型 | 线性 |
| 算子融合（fused optimizer） | 大量小参数 | 1.1-1.3x |

第 14 章详细展开。

---

## 12.9 通信瓶颈定位（多卡）

### 12.9.1 简单判断

```
单卡 step time: T
N 卡 step time: T_N

理想线性加速比 = 1（即 T_N = T）
实际 = T_N / T，越接近 1 越好
```

加速比 < 0.7 时通常存在通信问题。

### 12.9.2 Nsight Systems 看 NCCL

`nsys` 报告里能看到 NCCL all-reduce 的耗时与 GPU 计算重叠情况。如果 all-reduce 占了 30%+ 且不与计算重叠，应：

- 启用 DDP 的 `gradient_as_bucket_view=True`（PT 1.8+ 默认）
- 调大 `bucket_cap_mb`（默认 25MB）
- 用 NVLink / IB 而不是 PCIe
- FSDP 时用 `BACKWARD_PRE` prefetch（详见第 15 章）

---

## 12.10 同步点排查

频繁同步 = 异步流水线断裂。常见同步点：

```python
# 显式
.item()  .tolist()  .cpu()  .numpy()  print(tensor)

# 隐式
if tensor > 0:           # Python 需要 bool
torch.allclose(...)      # 需要数值
.to('cpu')               # D2H 同步
torch.save(tensor)       # 保存前同步

# 调试时设置
import os
os.environ['CUDA_LAUNCH_BLOCKING'] = '1'   # 强制每个 launch 同步，调试用
```

排查思路：profiler 看是否 GPU 在频繁短停顿。

---

## 12.11 启动开销与 launch overhead

每个 CUDA kernel launch ~5-20μs CPU 开销。深度但 batch 小的模型可能 launch 比 kernel 计算还久。

诊断：

```python
# 把所有 op 替换成 no-op，看耗时是否还大
# 或在 profiler 上看 cudaLaunchKernel 调用占比
```

解决：

- `torch.compile(mode='reduce-overhead')` —— 用 CUDA Graph 减少 launch
- 增大 batch
- 算子融合

---

## 12.12 一个完整的 profiling 工作流

### 12.12.1 步骤

1. **粗判**：`nvidia-smi` 看 GPU 利用率
2. **粗测**：写一个 fixed-tensor benchmark 看纯计算耗时；对比真实 loader 找数据瓶颈
3. **细测**：PT Profiler 拿 timeline，看主要时间花在哪
4. **决策**：根据瓶颈类别选优化路径
5. **回归**：每次优化后重新 profile，避免误优化

### 12.12.2 一个真实场景

> 训练一个 ViT，单卡 batch=128，每 step 800ms。

诊断：

```
nvidia-smi: GPU-Util 60%
Profiler timeline: 每 step 中有 200ms GPU 空白
DataLoader View: 数据加载 250ms, 训练 550ms
```

行动：

```
1. num_workers 从 4 增到 8 → step time 700ms
2. pin_memory + non_blocking → 660ms
3. 增加 prefetch_factor → 640ms
4. 仍然 100ms 空白 → 数据增强是瓶颈
5. 改用 torchvision v2 + Pillow-SIMD → 580ms
6. 已无空白 → 切换到计算优化
7. AMP bf16 → 380ms
8. torch.compile → 290ms
9. 完毕，加速比 ~2.8x
```

这个流程的关键是**每一步只动一个变量**，并 profile 验证效果。

---

## 12.13 持续监控

生产训练应集成持续监控：

| 指标 | 工具 |
|------|------|
| 训练 loss / 学习率 / 梯度范数 | Weights & Biases / TensorBoard |
| GPU 利用率 / 温度 / 功耗 | DCGM / Prometheus exporter |
| 显存 / 内存 | psutil / nvidia-smi 周期采样 |
| step time / throughput | 自定义 logger |

发现 step time 突然变长（数据迁移到慢盘？数据中出现极长样本？）能第一时间定位。

---

## 12.14 本章小结

- 性能瓶颈分四类：数据 / 计算 / 显存 / 通信，先定位再下药
- CUDA 异步导致 `time.time()` 计时几乎一定错；用 `torch.cuda.synchronize()` 或 CUDA event
- PyTorch Profiler + TensorBoard 是日常工具；Nsight 是极致优化才用
- `_record_memory_history` + `memory_viz` 是定位 OOM 的最强武器
- 数据瓶颈靠 fixed-tensor 实验最易识别；GPU 满但慢 = 计算瓶颈
- 同步点（`.item()`、`.cpu()`）是隐性性能杀手
- 优化要循环：profile → 一个改动 → re-profile

下一章针对最常出现的具体瓶颈 —— GPU 显存 —— 给出系统化的优化技术。
