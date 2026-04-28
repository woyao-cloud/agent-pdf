# 第8章 微调过程优化

> 微调不仅仅是"把数据喂给模型"。成功的微调是一个系统工程，涉及数据质量、超参数调优、训练效率和推理优化的全方位优化。本章将深入每个环节，提供可立即执行的策略和代码。

## 8.1 数据质量优化

数据质量是微调效果的第一决定因素。**高质量的数据远胜于海量数据。**

### 8.1.1 数据清洗与去重

```python
import hashlib
from collections import defaultdict

def deduplicate_dataset(dataset, text_field="text"):
    """基于 MinHash 的近似去重"""
    seen_hashes = set()
    unique_data = []

    for item in dataset:
        text = item[text_field]
        # 计算文本的 MinHash 签名
        text_hash = hashlib.md5(text.encode("utf-8")).hexdigest()
        # 使用滑动窗口计算 N-gram 哈希
        ngram_hashes = set()
        for i in range(len(text) - 5):
            ngram = text[i:i+5]
            ngram_hashes.add(hashlib.md5(ngram.encode()).hexdigest())

        # Jaccard 相似度 > 0.8 视为重复
        if text_hash not in seen_hashes:
            seen_hashes.add(text_hash)
            unique_data.append(item)

    print(f"去重前: {len(dataset)} 条, 去重后: {len(unique_data)} 条")
    return unique_data
```

### 8.1.2 质量过滤

使用教师模型筛选高质量训练样本：

```python
def quality_filter(dataset, teacher_model="gpt-4", threshold=4.0):
    """使用 GPT-4 作为教师模型过滤低质量数据"""
    filtered_data = []

    for item in dataset:
        prompt = f"""评估以下训练样本的质量（1-5分）：
        标准：准确性、清晰度、教学价值、格式规范。

        输入：{item['instruction']}
        输出：{item['output']}

        输出 JSON：{{"score": float, "reason": str}}"""

        response = client.chat.completions.create(
            model=teacher_model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)

        if result["score"] >= threshold:
            filtered_data.append(item)

    return filtered_data
```

### 8.1.3 数据分布平衡

```python
def balance_categories(dataset, label_field="category", target_per_category=2000):
    """确保每个类别有足够且有代表性的样本"""
    from collections import Counter

    category_counts = Counter(item[label_field] for item in dataset)
    print("原始分布:", dict(category_counts))

    balanced_data = []
    for category in category_counts:
        category_items = [i for i in dataset if i[label_field] == category]
        if len(category_items) > target_per_category:
            # 多数类：下采样
            import random
            balanced_data.extend(random.sample(category_items, target_per_category))
        else:
            # 少数类：全部保留（考虑数据增强）
            balanced_data.extend(category_items)
            print(f"警告: {category} 仅有 {len(category_items)} 条样本, 建议补充")

    return balanced_data
```

### 8.1.4 数据增强策略

```python
def augment_instruction_data(data):
    """指令微调数据增强"""
    augmented = []

    for item in data:
        # 原始样本
        augmented.append(item)

        # 策略1: 改写指令（保持语义不变）
        augmented.append({
            "instruction": rephrase(item["instruction"]),
            "output": item["output"],
        })

        # 策略2: 反向任务（输出变输入）
        augmented.append({
            "instruction": f"根据以下回答，写出对应的问题：{item['output']}",
            "output": item["instruction"],
        })

        # 策略3: 难度变体
        augmented.append({
            "instruction": f"请详细解释：{item['instruction']}",
            "output": item["output"] + "\n\n补充说明：..." if len(item["output"]) > 50
                       else item["output"],
        })

    return augmented
```

## 8.2 超参数优化

### 8.2.1 学习率

学习率是最关键的超参数。以下是实战指南：

```python
from transformers import get_cosine_schedule_with_warmup

# 推荐：余弦退火 + 预热
def create_optimizer(model, learning_rate=2e-5, warmup_ratio=0.03, num_epochs=3):
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)

    total_steps = len(train_dataloader) * num_epochs
    warmup_steps = int(total_steps * warmup_ratio)

    scheduler = get_cosine_schedule_with_warmup(
        optimizer,
        num_warmup_steps=warmup_steps,
        num_training_steps=total_steps,
    )
    return optimizer, scheduler
```

**学习率经验值**：
- 全参数微调：`1e-5` ~ `5e-5`（从 `2e-5` 开始尝试）
- LoRA 微调：`1e-4` ~ `5e-4`（从 `3e-4` 开始尝试）
- 学习率太大 → loss 震荡 / 发散；太小 → 收敛极慢
- Warmup（3%~10% steps）是必需品，不是可选项

### 8.2.2 Batch Size 权衡

| Batch Size | 优点 | 缺点 |
|-----------|------|------|
| 小 (4-8) | 内存友好，泛化性可能更好 | 梯度噪声大，训练不稳定 |
| 中 (16-32) | 训练稳定，收敛快 | 适中的显存需求 |
| 大 (64+) | 梯度准确 | 需要大内存，泛化性可能下降 |

经验法则：**用最大能容纳的 batch size**，如果 loss 不稳定则减小。

### 8.2.3 早停策略

```python
class EarlyStopping:
    def __init__(self, patience=3, min_delta=0.001):
        self.patience = patience
        self.min_delta = min_delta
        self.best_loss = float("inf")
        self.counter = 0

    def check(self, current_loss):
        if current_loss < self.best_loss - self.min_delta:
            self.best_loss = current_loss
            self.counter = 0
            return False  # 继续训练
        else:
            self.counter += 1
            if self.counter >= self.patience:
                return True  # 触发早停
            return False
```

### 8.2.4 LoRA Rank 与 Alpha 调优

| LoRA Rank (r) | 参数量 | 表达能力 | 推荐场景 |
|--------------|--------|---------|---------|
| 8 | 最小 | 较弱 | 简单任务、少量数据 |
| 16 | 适中 | 良好 | 大多数任务的起点 |
| 32 | 较大 | 强 | 复杂任务、充足数据 |
| 64 | 最大 | 最强 | 需要大幅调整行为 |

`lora_alpha`：通常设为 rank 的 1~2 倍（`alpha = rank * 2` 是常见起点）。

### 8.2.5 贝叶斯超参数搜索

```python
import optuna

def objective(trial):
    lr = trial.suggest_float("learning_rate", 1e-5, 5e-4, log=True)
    lora_r = trial.suggest_categorical("lora_r", [8, 16, 32])
    lora_alpha = trial.suggest_int("lora_alpha", 16, 64)
    weight_decay = trial.suggest_float("weight_decay", 0.0, 0.1)
    dropout = trial.suggest_float("dropout", 0.0, 0.3)

    # 使用这些参数训练并返回验证指标
    eval_score = train_with_params(
        lr=lr, lora_r=lora_r, lora_alpha=lora_alpha,
        weight_decay=weight_decay, dropout=dropout,
    )
    return eval_score

study = optuna.create_study(direction="maximize")
study.optimize(objective, n_trials=20)
print("最佳参数:", study.best_params)
```

## 8.3 训练效率优化

### 8.3.1 Flash Attention

```python
from transformers import AutoModelForCausalLM, BitsAndBytesConfig

model = AutoModelForCausalLM.from_pretrained(
    "model-name",
    # 启用 Flash Attention 2
    torch_dtype=torch.bfloat16,
    attn_implementation="flash_attention_2",
    use_cache=False,  # 训练时关闭 KV cache
)
```

> Flash Attention 2 可将训练速度提升 2-4 倍，显存占用减少 50%。要求 GPU 计算能力 >= 8.0（A100、H100）或 8.6+（RTX 4090）。

### 8.3.2 梯度检查点 (Gradient Checkpointing)

```python
model.gradient_checkpointing_enable()
# 代价：约 15-20% 的速度损失，换取 40-60% 的显存节约
```

### 8.3.3 混合精度训练

```python
from transformers import TrainingArguments

training_args = TrainingArguments(
    output_dir="./output",
    fp16=True,       # 如果使用 A100，使用 bf16=True 更稳定
    bf16=False,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=8,  # 等效 batch size = 32
    dataloader_num_workers=4,        # 加速数据加载
    optim="adamw_torch_fused",      # 融合优化器提升速度
)
```

### 8.3.4 Sequence Packing

将多个短序列打包成一个长序列，减少 padding 浪费：

```python
def pack_sequences(dataset, max_length=2048, tokenizer=None):
    """将短文本打包以减少 padding 开销"""
    packed_input_ids = []
    current_pack = []

    for item in dataset:
        tokens = tokenizer.encode(item["text"])
        if len(current_pack) + len(tokens) > max_length:
            # 当前包已满，写入并开始新包
            packed_input_ids.append(current_pack[:max_length])
            current_pack = tokens[:]
        else:
            current_pack.extend(tokens)

    if current_pack:
        packed_input_ids.append(current_pack)

    print(f"打包前: {len(dataset)} 条, 打包后: {len(packed_input_ids)} 条")
    return packed_input_ids
```

### 8.3.5 DeepSpeed ZeRO 配置

```python
# ds_config.json
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
    "contiguous_gradients": true,
    "reduce_bucket_size": 500000000,
    "stage3_prefetch_bucket_size": 500000000,
    "stage3_param_persistence_threshold": 10000000
  },
  "gradient_accumulation_steps": 8,
  "gradient_clipping": 1.0,
  "train_batch_size": 64
}
```

| ZeRO Stage | 显存节省 | 通信开销 | 适用场景 |
|-----------|---------|---------|---------|
| Stage 1 | 优化器状态分片 | 低 | 4-8 GPU |
| Stage 2 | + 梯度分片 | 中 | 8-32 GPU |
| Stage 3 | + 参数分片 | 高 | 32+ GPU, 大模型 |

## 8.4 推理优化

### 8.4.1 量化推理

```python
from transformers import AutoModelForCausalLM, BitsAndBytesConfig

# 4-bit 量化加载
quant_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
    bnb_4bit_quant_type="nf4",
)

model = AutoModelForCausalLM.from_pretrained(
    "model-name",
    quantization_config=quant_config,
    device_map="auto",
)
```

**量化方案对比**：
- **GPTQ**：权重量化，推理速度快，适合 GPU 部署
- **AWQ**：感知重要性的量化，质量损失较小
- **GGUF**：CPU + GPU 混合推理，适合本地部署

### 8.4.2 推测解码 (Speculative Decoding)

```python
from transformers import AutoModelForCausalLM

# 使用小模型作为草稿模型，大模型作为验证模型
draft_model = AutoModelForCausalLM.from_pretrained("small-model")
target_model = AutoModelForCausalLM.from_pretrained("large-model")

# Transformers 自 4.40.0 版本支持原生推测解码
outputs = target_model.generate(
    **inputs,
    assistant_model=draft_model,  # 草稿模型
    max_new_tokens=256,
    do_sample=False,
)
# 可加速 2-3 倍，输出完全一致
```

### 8.4.3 KV-Cache 优化

- **PagedAttention** (vLLM)：消除 KV cache 碎片，提升吞吐 2-4 倍
- **Multi-Query Attention (MQA)** / **Grouped-Query Attention (GQA)**：减少 KV head 数量
- **KV cache 量化**：将 cache 降为 INT8 精度

### 8.4.4 vLLM 部署

```python
# vllm_server.py
from vllm import LLM, SamplingParams

llm = LLM(
    model="path/to/model",
    tensor_parallel_size=4,        # 4 张 GPU
    dtype="bfloat16",
    max_model_len=8192,
    gpu_memory_utilization=0.85,   # 保留 15% 显存用于 KV cache
    trust_remote_code=True,
)

sampling_params = SamplingParams(
    temperature=0.7,
    top_p=0.9,
    max_tokens=1024,
)

outputs = llm.generate(prompts, sampling_params)
```

### 8.4.5 LoRA 权重合并 vs 运行时加载

| 方案 | 优势 | 劣势 | 推荐场景 |
|-----|------|------|---------|
| **权重合并** | 推理无额外开销 | 需存储完整模型多个副本 | 生产环境 |
| **运行时加载** | 灵活切换不同 LoRA | 推理增加延迟，显存略增 | 多任务服务 |

```python
# 权重合并（部署前执行一次即可）
from peft import PeftModel

base_model = AutoModelForCausalLM.from_pretrained("base-model")
merged_model = PeftModel.from_pretrained(base_model, "lora-checkpoint")
merged_model = merged_model.merge_and_unload()  # 合并 LoRA 权重
merged_model.save_pretrained("merged-model")
```

## 8.5 内存优化技术

### 8.5.1 逐层量化微调 (QLoRA)

```python
from peft import LoraConfig, get_peft_model
from transformers import BitsAndBytesConfig

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_use_double_quant=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
)

model = AutoModelForCausalLM.from_pretrained(
    "model-name", quantization_config=bnb_config, device_map="auto",
)

lora_config = LoraConfig(
    r=16, lora_alpha=32, target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05, bias="none",
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()  # 仅训练约 0.1-1% 的参数
```

### 8.5.2 CPU Offloading

```python
# 当显存不足时，将部分层卸载到 CPU
model = AutoModelForCausalLM.from_pretrained(
    "model-name",
    device_map="auto",
    max_memory={0: "20GiB", 1: "20GiB", "cpu": "100GiB"},
    offload_folder="offload",
)
```

### 8.5.3 内存分析工具

```python
# 监控 GPU 显存使用
import torch.cuda as cuda

def print_memory_stats():
    print(f"已分配: {cuda.memory_allocated() / 1024**3:.2f} GB")
    print(f"已缓存: {cuda.memory_reserved() / 1024**3:.2f} GB")
    print(f"最大分配: {cuda.max_memory_allocated() / 1024**3:.2f} GB")

# 使用 PyTorch Profiler 分析瓶颈
from torch.profiler import profile, ProfilerActivity

with profile(activities=[ProfilerActivity.CUDA], record_shapes=True) as prof:
    outputs = model(**inputs, labels=inputs["input_ids"])
    outputs.loss.backward()

print(prof.key_averages().table(sort_by="cuda_time_total"))
```

## 8.6 实验追踪

没有记录的实验 = 没有做过的实验。系统化追踪是快速迭代的基础。

```python
import wandb
import mlflow
from dataclasses import dataclass

@dataclass
class ExperimentConfig:
    model_name: str = "Qwen2.5-7B"
    learning_rate: float = 2e-5
    lora_r: int = 16
    lora_alpha: int = 32
    batch_size: int = 4
    num_epochs: int = 3
    max_length: int = 2048
    dataset: str = "domain_instructions_v2"
    scheduler: str = "cosine"
    warmup_ratio: float = 0.03

config = ExperimentConfig()

# 初始化 wandb
wandb.init(
    project="llm-finetune",
    name=f"{config.model_name}_lr{config.learning_rate}_r{config.lora_r}",
    config=config.__dict__,
    tags=["qlora", "instruction-tuning", "chinese"],
)

# 训练循环中记录
for step, batch in enumerate(train_dataloader):
    loss = train_step(batch)
    if step % 100 == 0:
        wandb.log({
            "loss": loss,
            "lr": scheduler.get_last_lr()[0],
            "grad_norm": grad_norm,
            "epoch": epoch,
            "step": global_step,
        })

# 评估后记录
eval_results = evaluate_model(model, eval_dataset)
wandb.log(eval_results)

# 保存模型和配置
wandb.save("best_model/*")
wandb.config.update({"final_metrics": eval_results})
wandb.finish()
```

**实验比较清单**：
- 每次实验记录完整配置（参数、数据版本、代码版本）
- 自动保存模型 checkpoint 和 tokenizer
- 对比不同实验的评估指标表格
- 标记失败的实验及其失败原因

## 8.7 迭代优化工作流

```
┌─────────────────────────────────────────────────┐
│              迭代优化循环                          │
│                                                   │
│  1. 微调 → 2. 评估 → 3. 分析错误                  │
│         ↑                        │               │
│         └──── 5. 重复 ← 4. 优化数据 ┘             │
└─────────────────────────────────────────────────┘
```

### 错误分析模板

```python
def analyze_errors(model, eval_dataset, tokenizer, num_samples=50):
    """系统化分析模型错误模式"""
    error_cases = []

    for i, item in enumerate(eval_dataset.select(range(num_samples))):
        inputs = tokenizer(item["prompt"], return_tensors="pt")
        outputs = model.generate(**inputs, max_new_tokens=100)
        prediction = tokenizer.decode(outputs[0], skip_special_tokens=True)

        if not is_correct(prediction, item["reference"]):
            error_cases.append({
                "prompt": item["prompt"],
                "expected": item["reference"],
                "got": prediction,
                "error_type": classify_error(prediction, item["reference"]),
            })

    # 统计错误类型
    from collections import Counter
    error_types = Counter(e["error_type"] for e in error_cases)
    print("错误类型分布:")
    for error_type, count in error_types.most_common():
        print(f"  {error_type}: {count} ({count/len(error_cases)*100:.1f}%)")

    return error_cases

def classify_error(pred, ref):
    """对错误进行分类"""
    if len(pred) < len(ref) * 0.5:
        return "不完整 (Incomplete)"
    elif len(pred) > len(ref) * 1.5:
        return "冗余 (Verbose)"
    elif any(kw in pred for kw in ["我不确定", "我不知道", "无法回答"]):
        return "拒绝回答 (Refusal)"
    elif len(set(pred) & set(ref)) / max(len(set(ref)), 1) < 0.3:
        return "内容错误 (Wrong Content)"
    else:
        return "部分正确 (Partially Correct)"
```

### 基于错误分析的数据改进

| 错误模式 | 根因 | 改进措施 |
|---------|------|---------|
| 不完整回答 | 训练数据过短 | 增加长样本，调整 max_length |
| 过度冗余 | 训练数据啰嗦 | 引入简洁样本，添加长度惩罚 |
| 拒绝回答 | 安全过滤过严 | 平衡安全与帮助的数据比例 |
| 内容错误 | 训练数据有错 | 清理训练数据质量 |

### 快速迭代清单

1. **每次实验记录**：超参数、数据版本、评估结果
2. **一次只改一个变量**：不要同时改学习率和数据
3. **保留多个 checkpoint**：每个 epoch 的模型都保留，便于回溯
4. **最小可行性验证**：先用 500 条数据验证方向，再全量训练
5. **建立回归基线**：每次新实验都要与最佳历史结果对比

> **核心思想**：微调优化是一个迭代工程，不是一次性任务。建立系统化的数据管理、实验追踪和错误分析流程，比寻找"最佳超参数"重要得多。持续的小步改进累积起来，远胜于一次性的激进改动。
