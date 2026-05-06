# 第13章 GPU 内存优化技术

显存是 PyTorch 训练中最紧张的资源。一旦 OOM，再聪明的模型也白搭。本章把显存优化技术按"投入产出比"排序，逐项展开 —— 从几乎免费的小调整，到牺牲速度的高级技术。

---

## 13.1 显存到底用在哪

训练时 GPU 显存的主要去向：

```
显存 = 参数 + 梯度 + 优化器状态 + 激活 + workspace + 缓存
```

以 fp16 + AdamW + 全量训练 7B 模型为例（数字仅示意）：

| 项 | 大小 |
|----|----|
| 参数（bf16） | 14 GB |
| 梯度（bf16） | 14 GB |
| 优化器状态（fp32 master + 一阶 + 二阶动量） | 84 GB |
| 激活（取决于 batch / seq） | 10-100 GB |
| 临时 workspace（cuDNN, NCCL） | 几 GB |
| **合计** | 100+ GB |

可见**优化器状态远大于参数**，**激活又可能远大于优化器状态**。优化策略要对症。

---

## 13.2 几乎免费的显存技巧

### 13.2.1 set_to_none 而非 zero_

```python
optimizer.zero_grad(set_to_none=True)   # PT 2.0+ 默认
```

对 N 个参数的模型，少占用 N 个 grad tensor 的显存（短暂时机）。

### 13.2.2 inference_mode + eval

推理时开 `torch.inference_mode()` 不构图，省全部激活显存：

```python
with torch.inference_mode():
    out = model(x)
```

### 13.2.3 检查不必要的中间变量

```python
# 不好：
out1 = layer1(x)
out2 = layer2(out1)
out3 = layer3(out2)
loss = criterion(out3, y)

# 同样能用，但显存峰值不同
out = layer1(x)
out = layer2(out)        # out1 立即释放
out = layer3(out)
loss = criterion(out, y)
```

Python 的引用计数会让 `out1` `out2` 在 `out2` 计算后立即释放（反向时仍由 autograd 自己保留）。这一改动对手写训练循环几乎无显存收益（autograd 仍持有），但避免**调试时**变量累积。

### 13.2.4 删除显式引用

调试代码中保存了大量 tensor 时：

```python
del large_tensor
torch.cuda.empty_cache()
```

`empty_cache()` 把空闲缓存返还 driver。**不解决碎片问题**，仅释放空闲块。生产训练循环不要每 step 调（影响性能）。

---

## 13.3 数据 dtype 优化

### 13.3.1 bf16 / fp16

激活与梯度从 fp32 → fp16/bf16 → 立省一半。详见第 14 章混合精度。

### 13.3.2 int8 / int4

推理常用，训练较少（FP8 训练已有但仍在演进）。

### 13.3.3 选择更小的 label dtype

```python
# label 是 [0, 1000) 的整数
labels = labels.long()       # int64，每个 8 字节
labels = labels.int()        # int32，每个 4 字节，足够
```

CrossEntropyLoss 接受 int32（但部分 op 强制 long，要测试）。

---

## 13.4 Gradient Checkpointing（激活重算）

激活是训练显存的最大头之一。**梯度检查点**用计算换显存：前向只缓存少量"检查点"，反向时重算被丢弃的中间值。

```python
from torch.utils.checkpoint import checkpoint

class TransformerBlock(nn.Module):
    def forward(self, x):
        return checkpoint(self._forward, x, use_reentrant=False)
    def _forward(self, x):
        # 真正的逻辑
        ...
```

或对一段 Sequential：

```python
from torch.utils.checkpoint import checkpoint_sequential
out = checkpoint_sequential(model.layers, segments=4, input=x, use_reentrant=False)
```

效果：

| 设置 | 显存 | 速度 |
|------|------|------|
| 无 checkpoint | 100% | 100% |
| 每个 transformer block 一个 checkpoint | ~40% | ~70% |
| 每 4 个 block 一个 checkpoint | ~60% | ~85% |

### 13.4.1 use_reentrant 的选择

PT 2.0+ 推荐 `use_reentrant=False`：更现代的实现，与 `torch.compile`、动态控制流兼容更好。`True` 是历史默认，将弃用。

### 13.4.2 注意事项

- **不要**对带随机性的子模块 checkpoint（如 dropout）—— 重算时随机数不一致；用 `preserve_rng_state=True`
- 不要在 checkpoint 函数里有副作用（修改外部 state）
- BN 与 checkpoint 配合时要小心 running stats 的更新

---

## 13.5 减小 batch + 梯度累积

最朴素的省显存方式：

```python
accum_steps = 4
effective_batch = micro_batch * accum_steps

for i, (x, y) in enumerate(loader):
    out = model(x)
    loss = criterion(out, y) / accum_steps
    loss.backward()
    if (i + 1) % accum_steps == 0:
        optimizer.step()
        optimizer.zero_grad()
```

注意：

- BN 行为变了（统计量按 micro_batch 计算）；LayerNorm/RMSNorm 模型无影响
- 梯度累积**不能省优化器状态显存**，只省激活峰值
- 不能省梯度显存（仍是全部参数大小）

---

## 13.6 Channels-Last 内存格式

CNN 的 NCHW（默认）vs NHWC（channels_last）。Tensor Core 卷积在 NHWC 下性能更好且**激活显存可能略减**：

```python
model = model.to(memory_format=torch.channels_last)
x = x.to(memory_format=torch.channels_last)
```

适用：CNN（ResNet、ViT 的 patch embedding 等）。Transformer 不受益。

---

## 13.7 优化器状态优化

### 13.7.1 ZeRO / FSDP

把优化器状态、梯度、参数**切到多卡**。详见第 15 章。这是大模型训练的事实标准。

### 13.7.2 8bit 优化器

`bitsandbytes` 提供 8bit AdamW，把 momentum 从 fp32 (8 字节) 减到 8bit (1 字节)，省 ~75% 优化器状态显存：

```python
import bitsandbytes as bnb
optimizer = bnb.optim.AdamW8bit(model.parameters(), lr=3e-4)
```

精度损失非常小（论文与实践都已验证），LLM 微调常用。

### 13.7.3 Adafactor

不存二阶 momentum，只存"行 + 列"统计量，对大矩阵参数极省显存：

```python
from transformers import Adafactor
optimizer = Adafactor(model.parameters(), lr=None, scale_parameter=True, relative_step=True)
```

T5 系列预训练用此。普通 SFT 不一定收益。

### 13.7.4 单卡上的 CPU offload

```python
# torch FSDP 提供
from torch.distributed.fsdp import CPUOffload, FullyShardedDataParallel as FSDP
model = FSDP(model, cpu_offload=CPUOffload(offload_params=True))
```

把参数 / 梯度 / 优化器搬到 CPU，按需上 GPU。**速度大幅下降**（PCIe 带宽限制），仅在必须时使用。

---

## 13.8 Activation 压缩与 offload

### 13.8.1 LongNet / Dynamic Sparsity / xFormers

特定结构的 attention（局部窗口、稀疏）能省激活。`xformers` 提供高效注意力实现，长上下文必用。

### 13.8.2 Activation Offload

CPU 缓存激活，反向时取回。开销大于 checkpointing，但激活极大时（如长序列）有用。

```python
# torch native API（PT 2.1+）
from torch.utils.checkpoint import CheckpointPolicy
# 配合 selective activation checkpointing
```

---

## 13.9 显存碎片处理

问题：reserved 远大于 allocated，仍 OOM。

### 13.9.1 expandable_segments（PT 2.1+）

```bash
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
```

让分配器动态扩展段，减少碎片。**长时间训练 / 变长输入场景效果明显**，几乎免费。

### 13.9.2 max_split_size_mb

```bash
export PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512
```

超过此大小不切分缓存块，避免被切碎。需要根据具体 workload 调。

### 13.9.3 garbage_collection_threshold

```bash
export PYTORCH_CUDA_ALLOC_CONF=garbage_collection_threshold:0.8
```

reserved 超过 80% 时主动 GC。

> 这些环境变量都是**第一招**。没解决再考虑改代码。

---

## 13.10 模型结构层面的省显存

### 13.10.1 Flash Attention

把 attention 的 softmax + matmul 融合，**O(N²) 激活降到 O(N)**：

```python
from torch.nn.functional import scaled_dot_product_attention
# PT 2.0+ 内置，自动选 Flash / memory-efficient 实现
out = scaled_dot_product_attention(q, k, v, is_causal=True)
```

LLM 训练**必用**。8K 序列从 OOM 到正常训练只差这一行。

### 13.10.2 共享权重

embedding 和 LM head 共享：

```python
self.lm_head.weight = self.embedding.weight
```

Llama / GPT 系列做法（部分模型）。

### 13.10.3 LoRA 等 PEFT

只训部分参数，梯度与优化器状态显存大幅降低（详见第 10 章）。

---

## 13.11 推理时的显存优化

### 13.11.1 KV Cache

LLM 自回归生成时，**重用过去 token 的 K/V**，避免重复算：

```python
out = model.generate(input_ids, use_cache=True)   # transformers 默认
```

KV cache 大小 = `2 * num_layers * num_heads * head_dim * seq_len * batch * dtype_bytes`，对长上下文是巨大开销。

### 13.11.2 PagedAttention（vLLM）

把 KV cache 切成页块，类似 OS 的虚拟内存，消除 fragmentation。**长上下文推理必用**。

### 13.11.3 量化推理

INT4 / INT8 量化让 7B 模型能跑在消费级 GPU。第 14 章讨论。

---

## 13.12 排查 OOM 的标准流程

1. **确认 OOM 真的发生**：堆栈是否含 `CUDA out of memory`
2. **看分配器报告**：错误信息会附带 reserved / allocated / largest free block
3. **粗看哪个阶段 OOM**：模型构建？前向？反向？optimizer step？
4. **缩小 batch**：能跑吗？跑的住的最大 batch 是多少？
5. **打开内存历史**：
   ```python
   torch.cuda.memory._record_memory_history()
   # 跑到 OOM 前
   torch.cuda.memory._dump_snapshot('mem.pkl')
   ```
6. **加载到 memory_viz** 找峰值时刻的 alloc 调用栈
7. **按峰值类型选策略**：
   - 激活峰值大 → checkpointing / Flash Attention / 缩 seq
   - 优化器峰值大 → 8bit optimizer / Adafactor / FSDP
   - 参数 + 梯度大 → FSDP / DeepSpeed ZeRO
   - 碎片严重 → expandable_segments / 重启 / 整理代码

---

## 13.13 显存优化优先级（推荐顺序）

按"性价比"从高到低：

1. ✅ `expandable_segments=True`（环境变量，免费）
2. ✅ AMP（bf16/fp16）（一行代码，几乎无副作用）
3. ✅ Flash Attention / SDPA（attention 模型几乎必用）
4. ✅ `set_to_none=True`（默认）
5. ✅ Channels-Last（CNN）
6. ⚠️ 梯度累积（保持有效 batch 同时减 micro batch）
7. ⚠️ Gradient Checkpointing（牺牲计算换显存）
8. ⚠️ 8bit Optimizer（大模型微调几乎必用）
9. ⚠️ FSDP / ZeRO（大模型训练）
10. ⚠️ CPU Offload（最后手段，速度损失大）

---

## 13.14 本章小结

- 显存四大头：参数、梯度、优化器状态、激活；先搞清谁是大头再下药
- 几乎免费技巧：`expandable_segments`、AMP、SDPA、`set_to_none`
- 激活 → Gradient Checkpointing；优化器 → 8bit / Adafactor / FSDP
- 长序列 attention 用 Flash Attention 是数量级的差别
- 碎片用 `PYTORCH_CUDA_ALLOC_CONF` 缓解；不行再改代码
- OOM 排查靠 memory_viz 看 snapshot，找峰值的真正原因
- 优化按性价比顺序，不要直接上重武器

下一章看训练加速的另一支主力：混合精度与 `torch.compile`。
