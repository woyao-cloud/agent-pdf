# 第14章 训练加速：混合精度与 torch.compile

显存够了，下一个问题是**让训练跑得更快**。本章讲两件几乎"白拿"的加速：混合精度（AMP）与图编译（`torch.compile`），以及它们的边界、陷阱、与其它优化的组合。

---

## 14.1 加速空间的来源

PyTorch 默认是 fp32 + eager 模式，离硬件极限差很远：

| 方向 | 默认 | 优化后 | 来源 |
|------|------|--------|------|
| 算力 | fp32 CUDA Core | fp16/bf16 Tensor Core | 4-8x 峰值 |
| Launch overhead | 每 op 一次 launch | CUDA Graph / 编译 | 减 launch |
| 算子融合 | 分散 op | 编译融合 | 减内存读写 |
| 注意力 | 朴素实现 | Flash Attention | 2-4x、显存降 |

混合精度解决"算力浪费"；`torch.compile` 解决"调度浪费"和"算子未融合"。

---

## 14.2 混合精度训练（AMP）

### 14.2.1 fp16 vs bf16 vs tf32

第 2 章已介绍数值范围。训练上的关键差别：

| 类型 | 精度 | 范围 | 是否需要 loss scaling |
|------|------|------|---------------------|
| fp16 | 高 | 小（±6.5e4） | **是**，否则梯度下溢为 0 |
| bf16 | 较低 | 大（fp32 量级） | 否 |
| tf32（Ampere+） | 中 | fp32 | 否（仅 matmul 内部） |

经验法则：

- **NVIDIA Ampere+（A100/H100）+ Transformer/LLM** → bf16
- **老卡（V100/T4）/ 视觉 CNN** → fp16 + GradScaler
- **追求 fp32 但又想加速** → 默认 tf32（已开启）

### 14.2.2 bf16（推荐）

```python
from torch.amp import autocast

model = model.cuda()
optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4)

for x, y in loader:
    x, y = x.cuda(), y.cuda()
    optimizer.zero_grad(set_to_none=True)
    with autocast(device_type='cuda', dtype=torch.bfloat16):
        out = model(x)
        loss = criterion(out, y)
    loss.backward()
    optimizer.step()
```

注意：

- bf16 不需要 `GradScaler`
- forward 在 autocast 上下文里跑，部分 op 仍以 fp32 执行（softmax、log、norm 等数值敏感 op）
- backward 自动跟随 forward 的 dtype

### 14.2.3 fp16（带 GradScaler）

```python
from torch.amp import autocast, GradScaler
scaler = GradScaler('cuda')

for x, y in loader:
    optimizer.zero_grad(set_to_none=True)
    with autocast(device_type='cuda', dtype=torch.float16):
        out = model(x)
        loss = criterion(out, y)
    scaler.scale(loss).backward()
    scaler.unscale_(optimizer)                             # 还原梯度量级
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    scaler.step(optimizer)
    scaler.update()
```

GradScaler 的工作原理：

1. forward 后乘以一个大数 S（典型 2^16）
2. backward 反向后梯度也乘以 S，避免下溢
3. 优化器 step 前先除回 S（unscale）
4. 如果检测到 NaN/Inf（说明 S 太大），跳过 step 并降低 S
5. 训练稳定时逐渐升高 S

这个动态过程对训练发散有自我修复能力。

### 14.2.4 模型权重存什么

AMP 训练中：

- **权重通常仍存 fp32**（master weights）
- forward 时被 autocast 临时转 fp16/bf16
- backward 梯度也是 fp16/bf16
- optimizer step 时把 fp32 梯度（unscale 后）应用到 fp32 权重

如果你已经把模型 `.to(torch.bfloat16)`，就成了"全 bf16 训练"，没有 fp32 master 备份 —— 收敛性可能略差，仅在极端显存压力下用。

### 14.2.5 容易翻车的细节

- **Loss 异常 NaN**：fp16 可能溢出。先看 loss scale 是否被反复减小；常见诱因有 `exp`、`x.pow(2)` 中间值过大、未 normalize 的 attention scores
- **梯度全 0**：fp16 下溢；提高 GradScaler 初始值或换 bf16
- **某些算子不支持**：autocast 默认会回退 fp32；自定义 op 要明确支持
- **数据要不要 cast**：autocast 处理 op 内部，外部张量不必先转
- **embedding 权重的 dtype**：autocast 不动 nn.Embedding 的权重；如果手动 .half() 了 embedding，要测试 grad 是否正常

---

## 14.3 torch.compile：图编译加速

PT 2.0 起的标志性能力。一行代码：

```python
model = torch.compile(model)
```

底层栈：

```
TorchDynamo  → 字节码追踪 → FX Graph
AOTAutograd  → 同时追踪前向和反向
TorchInductor → 生成优化的 Triton kernel + CPU/GPU 代码
```

效果：1.3-2x 训练加速、推理可达 2-5x（大量算子融合）。

### 14.3.1 编译模式

```python
torch.compile(model, mode='default')        # 平衡
torch.compile(model, mode='reduce-overhead')# 用 CUDA Graph，省 launch
torch.compile(model, mode='max-autotune')   # 充分 autotune，编译时间长
```

### 14.3.2 backend

```python
torch.compile(model, backend='inductor')   # 默认，TorchInductor
torch.compile(model, backend='cudagraphs') # 仅 CUDA Graph
torch.compile(model, backend='eager')      # 仅 dynamo 追踪，不编译
torch.compile(model, backend='aot_eager')  # 含 backward
```

### 14.3.3 fullgraph 与 graph break

默认 `fullgraph=False` 允许"图断点" —— 遇到无法追踪的 Python 语句（动态 print、控制流依赖 tensor 数值）会回到 eager。`fullgraph=True` 强制全图编译，否则报错：

```python
model = torch.compile(model, fullgraph=True)   # 失败时抛异常，便于调试
```

### 14.3.4 dynamic shape

```python
torch.compile(model, dynamic=True)   # 允许 shape 变化
torch.compile(model, dynamic=False)  # 固定 shape，可能更快但每变一次重新编译
```

变长输入（如 NLP）建议 `dynamic=True`。

### 14.3.5 何时不要用 compile

- **debug 阶段**：编译错误堆栈不友好
- **小模型 + 大 batch**：本来就没多少 launch 开销，编译收益小
- **有大量动态控制流**：图频繁断，收益打折
- **PyTorch 版本太新而模型太旧**：不兼容
- **首次运行慢**：编译开销可达分钟级；不适合短任务

### 14.3.6 与 AMP / DDP / FSDP 配合

```python
# 一般顺序：先 compile 再包 DDP
model = torch.compile(model)
model = DDP(model)
```

或反过来 —— 都可以。但**已知 issue**：FSDP + compile 的组合在 PT 2.5- 仍有兼容性问题，要看版本说明。

混合精度 + compile：autocast 与 compile 兼容良好，几乎无障碍。

### 14.3.7 编译产物缓存

PT 2.4+ 默认开启编译缓存（基于 inductor 的 `cache_dir`），第二次启动相同模型不用重编。多机部署时可共享缓存目录加速冷启动。

---

## 14.4 SDPA 与 Flash Attention

PT 2.0+ 内置 `torch.nn.functional.scaled_dot_product_attention`：

```python
out = F.scaled_dot_product_attention(q, k, v, attn_mask=mask, is_causal=True)
```

PyTorch 自动从三个实现中选最优：

1. Flash Attention（最快，长序列首选）
2. Memory-efficient attention
3. 朴素 math fallback

### 14.4.1 显式指定后端

```python
from torch.nn.attention import SDPBackend, sdpa_kernel
with sdpa_kernel(SDPBackend.FLASH_ATTENTION):
    out = F.scaled_dot_product_attention(q, k, v)
```

### 14.4.2 注意

- Flash Attention 对 head_dim 有限制（通常 ≤ 256）
- 不支持任意 attention mask（causal / 非 causal 较好；自定义 mask 走 fallback）
- bf16 / fp16 性能最好；fp32 不一定有加速

---

## 14.5 量化（推理加速）

### 14.5.1 PTQ 动态量化

```python
quantized = torch.quantization.quantize_dynamic(
    model, {nn.Linear}, dtype=torch.qint8
)
```

只量化 Linear 权重，激活在运行时量化。简单，CPU 推理常用。

### 14.5.2 静态量化（PTQ + 校准）

需要校准数据集计算 activation 范围：

```python
import torch.ao.quantization as Q

model.qconfig = Q.get_default_qconfig('x86')   # 或 'qnnpack'
Q.prepare(model, inplace=True)
# run calibration with representative data
for x, _ in calib_loader:
    model(x)
Q.convert(model, inplace=True)
```

### 14.5.3 QAT（quantization-aware training）

训练时模拟量化误差，精度损失最小。但工程复杂。

### 14.5.4 LLM 推理量化（GPTQ / AWQ / BitsAndBytes）

LLM 走专门的量化路径：

```python
from transformers import AutoModelForCausalLM, BitsAndBytesConfig
bnb_cfg = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4',
                             bnb_4bit_compute_dtype=torch.bfloat16)
model = AutoModelForCausalLM.from_pretrained('Qwen/Qwen2.5-7B', quantization_config=bnb_cfg)
```

主流路径：

| 方法 | 工具 | 特点 |
|------|------|------|
| GPTQ | auto-gptq | 已知精度好；部署快 |
| AWQ | autoawq | 同 GPTQ 量级；激活 outlier-aware |
| BitsAndBytes 4bit | bitsandbytes | 训练/微调友好（QLoRA） |
| GGUF | llama.cpp | 端侧 CPU/Mac |

### 14.5.5 FP8 训练（H100+）

H100 的 Tensor Core 支持 FP8（E4M3 / E5M2），可用于训练（NV TransformerEngine）。可获得 1.5-2x 加速 vs bf16，需要专门库支持。社区正逐步采纳。

---

## 14.6 算子级优化技巧

### 14.6.1 Fused Optimizer

```python
torch.optim.AdamW(model.parameters(), lr=3e-4, fused=True)
```

把所有参数的更新融合成一个 CUDA kernel，参数多时（LLM）显著加速。

### 14.6.2 Foreach 优化器

```python
torch.optim.AdamW(model.parameters(), lr=3e-4, foreach=True)
```

把所有参数的更新合并到 multi-tensor 内核，比逐 tensor 快。`fused=True` 比 `foreach=True` 更激进。

### 14.6.3 Channels-Last（CNN）

第 13 章已讨论；同时有显存与性能收益。

### 14.6.4 cuDNN benchmark

```python
torch.backends.cudnn.benchmark = True
```

固定 shape 训练时几乎免费的加速。

### 14.6.5 移除多余同步

```python
# 不好：每 step 同步
print(f'loss: {loss.item()}')   # .item() 是同步点

# 好：累积后批量打印
losses.append(loss.detach())
if step % 100 == 0:
    print(f'loss: {torch.stack(losses).mean().item()}')
    losses.clear()
```

---

## 14.7 多种加速的组合

正确顺序：

```python
# 1) 模型移动到 cuda
model = model.cuda()

# 2) 优化器（fused=True 最佳）
optim = torch.optim.AdamW(model.parameters(), lr=3e-4, fused=True)

# 3) 编译模型
model = torch.compile(model, mode='default')

# 4) DDP / FSDP 包装（多卡）
model = DDP(model)

# 5) 训练循环用 autocast (bf16)
with autocast(device_type='cuda', dtype=torch.bfloat16):
    out = model(x)
    loss = criterion(out, y)
loss.backward()
optim.step()
```

不同组合的兼容性矩阵（PT 2.5 状态）：

| A + B | 兼容 |
|-------|------|
| AMP + compile | ✅ |
| compile + DDP | ✅ |
| compile + FSDP | ⚠️ 部分模型 |
| AMP + DDP | ✅ |
| AMP + FSDP | ✅ |
| Flash Attention + compile | ✅ |
| LoRA + compile | ⚠️ peft + compile 仍在改善 |

每次升级 PyTorch 后建议重测组合，issue tracker 偶有变化。

---

## 14.8 一个真实优化案例

> ViT-Base，单 A100，batch=128，初始 step time 800ms。

| 步骤 | 改动 | step time |
|------|------|----------|
| 0 | baseline (fp32, eager) | 800ms |
| 1 | `torch.backends.cudnn.benchmark=True` | 750ms |
| 2 | bf16 autocast | 380ms |
| 3 | `torch.compile()` | 270ms |
| 4 | SDPA / Flash Attention | 220ms |
| 5 | `fused=True` optimizer | 210ms |
| 6 | channels_last + fp32 → bf16 input | 190ms |

总加速 ~4.2x。**前 3 步贡献了 ~85%**，后续的优化是边际递减。

---

## 14.9 本章小结

- bf16 是 Ampere+ 训练的事实标准；老卡用 fp16 + GradScaler
- AMP 几乎免费，但要懂 fp16 的下溢、scaler 的工作原理、autocast 的 op 黑白名单
- `torch.compile` 是 PT 2.x 的关键能力，1.3-2x 加速；遇错误时用 `fullgraph=True` 暴露问题
- SDPA / Flash Attention 是 attention 模型必用
- 量化：训练用 8bit AdamW；推理 LLM 走 GPTQ/AWQ；非 LLM 走 PTQ/QAT
- 优化要分层：先 AMP 与 compile，再 SDPA、fused、cuDNN benchmark
- 不要一次开太多新东西 —— 加错出问题难定位

下一章是性能优化的最后一战：当单卡不够用时，多卡分布式训练。
