# 第3章 全参微调

## 3.1 什么是全参微调

全参微调（Full Fine-tuning）是指对预训练语言模型（Pre-trained Language Model, PLM）的**所有参数**进行更新训练的过程。与仅调整少量参数的参数高效微调（Parameter-Efficient Fine-Tuning, PEFT）不同，全参微调会修改模型中从嵌入层（Embedding Layer）到输出层（Output Layer）的每一个权重矩阵和偏置项。

形式上，对于一个预训练模型 $\theta_{\text{pretrained}}$，全参微调的目标是找到一组新参数 $\theta_{\text{ft}}$，使得在目标数据集 $D_{\text{target}}$ 上的损失函数最小化：

$$\theta_{\text{ft}} = \underset{\theta}{\arg\min} \; \mathbb{E}_{(x,y) \sim D_{\text{target}}} \left[ \mathcal{L}\left(f_\theta(x), y\right) \right]$$

其中 $\theta$ 的初始值为 $\theta_{\text{pretrained}}$，并且所有维度（通常为数十亿到数千亿个参数）都会参与梯度更新。

## 3.2 何时需要全参微调

全参微调并非在所有场景下都是最佳选择，但在以下情况中它是必要甚至不可替代的：

**大领域迁移（Large Domain Shift）**：当目标任务与预训练数据分布差异显著时。例如，将通用大模型微调为法律文书生成器或医学诊断模型。通用语料中的模式不足以覆盖专业领域的特殊表达方式，需要调整深层的语义表示。

**新知识注入（New Knowledge Injection）**：预训练模型存在知识截止日期（Knowledge Cut-off），无法知晓之后发布的新信息。全参微调可以将新的事实性知识编码到模型参数中。

**任务本质变化**：当预训练任务与下游任务差距过大时。例如，从文本生成模型微调为代码执行模型，或者从通用对话模型微调为特定格式的结构化输出模型。

| 场景 | 全参微调 | PEFT |
|------|---------|------|
| 领域适配（小幅调整） | 不必要 | 足够 |
| 领域适配（大幅迁移） | 推荐 | 可能不足 |
| 注入新知识 | 必要 | 有限的 |
| 资源受限（GPU < 24GB） | 不可行 | 推荐 |
| 需要快速迭代 | 太慢 | 合适 |
| 追求最高性能 | 可能有优势 | 接近全参 |

## 3.3 资源需求分析

### 3.3.1 显存分解（Memory Breakdown）

理解显存消耗是全参微调的第一步。以 LLaMA-7B（FP32 约 28GB）为例，训练时的显存消耗由以下部分组成：

| 组件 | 占用因素 | 7B 模型估算（FP32） | 7B 模型估算（FP16 + AdamW） |
|------|---------|-------------------|---------------------------|
| 模型参数 | 参数量 × 精度字节 | 28 GB | 14 GB |
| 梯度 | 同参数量 | 28 GB | 14 GB |
| 优化器状态（AdamW） | 参数 × 2（一阶/二阶动量） | 56 GB | 56 GB |
| 激活值（Activations） | 批次大小 × 序列长度 × 隐藏层维度 × 层数 | 变量（数GB~上百GB） | 变量 |
| **总计** | | ~140 GB+ | ~100 GB+ |

从中可以看出，**优化器状态是最大开销**，激活值则随序列长度和批次大小急剧增长。

### 3.3.2 GPU 需求估算公式

训练阶段所需显存近似为：

$$\text{Memory} \approx (4 + 4 + 8) \times \Phi + \text{Activations}$$

其中 $\Phi$ 为参数量，4 字节为参数（FP32）和梯度，8 字节为 AdamW 优化器状态（梯度的指数移动平均和平方梯度）。使用混合精度训练（Mixed Precision Training）时显存约 $(2 + 2 + 8) \times \Phi + \text{Activations}$。

## 3.4 关键技术

### 3.4.1 混合精度训练（Mixed Precision Training）

混合精度训练的核心思想是用 FP16 或 BF16 存储参数和梯度进行计算，同时保留 FP32 的优化器状态副本以维持数值稳定性。

```python
import torch
from transformers import AutoModelForCausalLM, TrainingArguments, Trainer

model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-2-7b-hf")

training_args = TrainingArguments(
    output_dir="./checkpoints",
    fp16=True,              # 使用 FP16（适用于 V100, A100）
    # bf16=True,            # 使用 BF16（适用于 A100 及以上，更稳定）
    per_device_train_batch_size=2,
    gradient_accumulation_steps=8,
    learning_rate=2e-5,
    logging_steps=10,
    save_steps=500,
)
```

**BF16 vs FP16**：BF16 具有与 FP32 相同的指数范围（8位指数），但精度较低（7位尾数）。这使得 BF16 在训练时更少出现梯度下溢（Underflow），对损失缩放（Loss Scaling）的依赖更低。Anthropic 和 Google 的研究表明 BF16 在 LLM 训练中几乎与 FP32 无异。

### 3.4.2 梯度检查点（Gradient Checkpointing）

梯度检查点通过在反向传播时**重新计算**前向传播的中间激活值，牺牲计算时间换取显存。其原理是不保存所有激活值，而是在反向传播需要梯度时就地重算。

```python
model.gradient_checkpointing_enable()

# 或者通过 TrainingArguments 启用
training_args = TrainingArguments(
    output_dir="./checkpoints",
    gradient_checkpointing=True,
    # ...
)
```

启用梯度检查点通常会将激活值显存占用减少约 50%-70%，但会使训练速度降低约 20%-30%。这是一个值得的权衡，尤其在单卡训练大模型时。

### 3.4.3 梯度累积（Gradient Accumulation）

梯度累积将多个小批次（Micro-batch）的梯度累加后进行一次优化器更新，从而模拟大批次训练。

```python
training_args = TrainingArguments(
    output_dir="./checkpoints",
    per_device_train_batch_size=2,     # 每个设备的批次大小
    gradient_accumulation_steps=8,      # 累积步数
    # 等效批次大小 = 2 × 8 × num_gpus = 16 × num_gpus
)
```

总批次大小（Global Batch Size）= `per_device_train_batch_size × gradient_accumulation_steps × num_gpus`。在显存受限时，可以减少 `per_device_train_batch_size` 并增加 `gradient_accumulation_steps`，以维持等效批次大小不变。

### 3.4.4 分布式训练策略

#### DDP（Distributed Data Parallel）

DDP 在每个 GPU 上维护模型副本，数据分片后独立前向/反向计算，然后通过 AllReduce 通信同步梯度。DDP 在单机多卡场景下效率最高，但在模型无法装入单卡时不可用。

#### FSDP（Fully Sharded Data Parallel）

FSDP 将模型参数、梯度和优化器状态分片到多个 GPU 上，使大模型训练成为可能。FSDP 有三种分片策略：

- `FULL_SHARD`（ZeRO-3 等价）：参数、梯度、优化器状态全部分片
- `SHARD_GRAD_OP`（ZeRO-2）：梯度、优化器状态分片，参数全部复制
- `NO_SHARD`（DDP 等价）：不分片

```python
from transformers import TrainingArguments

training_args = TrainingArguments(
    output_dir="./checkpoints",
    fsdp="full_shard",        # FSDP 全分片策略
    fsdp_config={
        "activation_checkpointing": True,
        "limit_all_gathers": True,
        "xla": False,
    },
)
```

#### DeepSpeed ZeRO 优化

DeepSpeed 的 ZeRO（Zero Redundancy Optimizer）分为三个阶段：

- **ZeRO-1**：优化器状态分片，参数和梯度完整复制
- **ZeRO-2**：优化器状态 + 梯度分片
- **ZeRO-3**：参数 + 梯度 + 优化器状态全部分片

| 阶段 | 显存节省 | 通信开销 | 适用场景 |
|------|---------|---------|---------|
| ZeRO-1 | 约 4 倍 | 低 | 8 卡以内训练 13B 以下模型 |
| ZeRO-2 | 约 8 倍 | 中 | 13B-30B 模型 |
| ZeRO-3 | 约 16 倍+ | 高 | 30B+ 模型，需要结合 CPU offload |

```python
# deepspeed_config.json
{
    "zero_optimization": {
        "stage": 3,
        "offload_optimizer": {
            "device": "cpu",
            "pin_memory": true
        },
        "offload_param": {
            "device": "cpu",
            "pin_memory": true
        },
        "overlap_comm": true,
        "contiguous_gradients": true
    },
    "gradient_accumulation_steps": 8,
    "gradient_clipping": 1.0,
    "fp16": {
        "enabled": true,
        "auto_cast": true
    }
}
```

### 3.4.5 激活值卸载（Activation Offloading）

激活值卸载将中间激活值从 GPU 显存移动到 CPU 内存，在需要时再加载回 GPU。这进一步降低了显存峰值。DeepSpeed ZeRO-3 结合 CPU offload 可以实现单卡训练 13B+ 级别的模型。

## 3.5 数据准备与处理

全参微调对数据质量的要求极高。低质量数据不仅影响性能，还会导致灾难性遗忘（Catastrophic Forgetting）。

```python
from datasets import Dataset, load_dataset
from transformers import AutoTokenizer

def prepare_training_data(data_path: str, tokenizer_name: str, max_length: int = 2048):
    tokenizer = AutoTokenizer.from_pretrained(tokenizer_name)
    tokenizer.pad_token = tokenizer.eos_token

    dataset = load_dataset("json", data_files=data_path)["train"]

    def tokenize_function(examples):
        texts = []
        for instruction, output in zip(examples["instruction"], examples["output"]):
            text = f"### Instruction:\n{instruction}\n\n### Response:\n{output}"
            texts.append(text)

        tokenized = tokenizer(
            texts,
            truncation=True,
            padding="max_length",
            max_length=max_length,
            return_tensors=None,
        )
        tokenized["labels"] = tokenized["input_ids"].copy()
        return tokenized

    tokenized_dataset = dataset.map(
        tokenize_function,
        batched=True,
        remove_columns=dataset.column_names,
        num_proc=8,
    )

    return tokenized_dataset
```

**数据质量关键检查点**：
1. 去除重复数据（Deduplication）：重复数据会偏置训练分布
2. 过滤低质量文本：包含乱码、过短文本、无意义重复
3. 格式统一：确保指令-输出的格式一致性
4. 序列长度分布分析：确定合理的 `max_length` 值，避免过度填充（Padding）

## 3.6 训练循环设计

使用 Hugging Face `Trainer` 可以大幅简化训练循环：

```python
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    DataCollatorForSeq2Seq,
)
from datasets import load_from_disk

# 加载模型和 tokenizer
model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-2-7b-hf",
    torch_dtype=torch.bfloat16,
    device_map="auto",
)

# 加载处理好的数据集
train_dataset = load_from_disk("./processed_data/train")
eval_dataset = load_from_disk("./processed_data/eval")

# 配置训练参数
training_args = TrainingArguments(
    output_dir="./llama2-7b-ft-checkpoints",
    run_name="llama2-7b-full-ft",
    num_train_epochs=3,
    per_device_train_batch_size=2,
    per_device_eval_batch_size=4,
    gradient_accumulation_steps=8,
    gradient_checkpointing=True,
    learning_rate=2e-5,
    warmup_ratio=0.03,
    lr_scheduler_type="cosine",
    logging_steps=10,
    eval_steps=200,
    save_steps=500,
    save_total_limit=5,
    evaluation_strategy="steps",
    fp16=False,
    bf16=True,
    deepspeed="ds_config.json",
    report_to="wandb",
)

# 数据整理器
data_collator = DataCollatorForSeq2Seq(
    tokenizer=tokenizer,
    model=model,
    padding=True,
)

# 创建 Trainer
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=eval_dataset,
    data_collator=data_collator,
    tokenizer=tokenizer,
)

# 开始训练
trainer.train()
```

## 3.7 检查点与模型保存

```python
# 训练完成后保存最终模型
trainer.save_model("./final-llama2-7b-ft")
tokenizer.save_pretrained("./final-llama2-7b-ft")

# 从检查点恢复训练
trainer.train(resume_from_checkpoint="./llama2-7b-ft-checkpoints/checkpoint-1000")
```

检查点策略建议：
- `save_total_limit`：限制保留的检查点数量以节省磁盘
- `save_steps`：每 N 步保存一次，建议 500-1000 步
- 保存 optimizer 状态以便恢复训练
- 定期评估验证集，保存最佳模型

## 3.8 全参微调 vs PEFT：选择指南

| 考量维度 | 选择全参微调 | 选择 PEFT |
|---------|------------|----------|
| 领域迁移幅度 | 大（医疗、法律、代码） | 小（对话风格调整） |
| 可用 GPU 资源 | 多卡集群（8×A100 80GB+） | 单卡（RTX 4090/4090D） |
| 训练时间 | 数天至数周 | 数小时至数天 |
| 数据量 | 10K+ 高质量样本 | 数百至数千样本 |
| 部署需求 | 需要一份全量模型副本 | 基础模型 + 适配器即可 |
| 灾难性遗忘风险 | 高，需要精心设计 | 低，基础模型不受影响 |

**建议**：在实际项目中，常见的做法是先用 PEFT（如 LoRA）快速验证任务可行性和数据质量，然后再投入资源进行全参微调以获得最佳性能。此策略可以避免因数据问题导致的大规模训练资源浪费。

## 3.9 本章小结

全参微调是 LLM 适配中最强大的方法，允许模型在所有参数空间中寻找最优解。然而，其高昂的显存和计算成本使其在资源受限场景下难以实施。混合精度训练、梯度检查点、梯度累积和分布式训练策略（FSDP、DeepSpeed ZeRO）是支撑全参微调的关键技术。在实际应用中，应当根据领域迁移幅度、可用资源和数据量综合评估是否采用全参微调。在下一章中，我们将探讨参数高效微调方法，这些方法在保持接近全参微调性能的同时大幅降低了资源需求。
