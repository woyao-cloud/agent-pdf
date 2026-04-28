# 附录：微调实验代码

> 本文档提供完整的、可直接运行的微调实验代码。所有示例基于 Hugging Face 生态系统（transformers、peft、trl、datasets、accelerate），使用 Python 实现。代码遵循最佳实践，包含详细的中文注释。

---

## A.1 环境准备

在运行实验之前，请确保安装以下依赖：

```bash
pip install torch transformers datasets accelerate peft trl bitsandbytes wandb scikit-learn scipy optuna
```

推荐使用 Python 3.10+ 和 CUDA 11.8+。如果显存有限（< 16GB），建议优先尝试实验一和实验二（QLoRA）。

---

## A.2 实验一：LoRA 微调 LLaMA/Llama-2 进行文本分类

本实验展示如何使用 LoRA（Low-Rank Adaptation）对 LLaMA 系列模型进行参数高效微调，适配二分类任务。核心思路是冻结原始权重，仅训练低秩适配矩阵，从而将可训练参数量减少到不足原模型的 1%。

```python
"""
实验一：LoRA 微调 LLaMA/Llama-2 文本分类
功能：使用 LoRA + 4-bit 量化微调 LLaMA 模型进行情感分类
运行：python experiment_01_lora_classification.py --model_name meta-llama/Llama-2-7b-hf
"""

import os
import sys
import json
import argparse
from dataclasses import dataclass
from typing import Optional

import torch
import numpy as np
from datasets import load_dataset, Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    BitsAndBytesConfig,
    TrainingArguments,
    Trainer,
    DataCollatorWithPadding,
    EarlyStoppingCallback,
)
from peft import (
    LoraConfig,
    get_peft_model,
    prepare_model_for_kbit_training,
    TaskType,
)
import evaluate


def parse_args():
    """解析命令行参数"""
    parser = argparse.ArgumentParser(description="LoRA 文本分类微调")
    parser.add_argument("--model_name", type=str, default="meta-llama/Llama-2-7b-hf",
                        help="预训练模型名称或路径")
    parser.add_argument("--dataset_name", type=str, default="imdb",
                        help="数据集名称（支持 imdb 或自定义 csv 路径）")
    parser.add_argument("--output_dir", type=str, default="./lora-classification-output",
                        help="模型保存路径")
    parser.add_argument("--num_epochs", type=int, default=3)
    parser.add_argument("--batch_size", type=int, default=4)
    parser.add_argument("--learning_rate", type=float, default=2e-4)
    parser.add_argument("--lora_r", type=int, default=8)
    parser.add_argument("--lora_alpha", type=int, default=16)
    parser.add_argument("--lora_dropout", type=float, default=0.05)
    parser.add_argument("--max_length", type=int, default=512)
    parser.add_argument("--use_4bit", action="store_true", default=True)
    parser.add_argument("--do_eval", action="store_true", default=True)
    return parser.parse_args()


def create_bnb_config(use_4bit: bool = True):
    """创建 BitsAndBytes 量化配置以降低显存占用"""
    return BitsAndBytesConfig(
        load_in_4bit=use_4bit,
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
    )


def load_and_prepare_dataset(dataset_name: str, tokenizer, max_length: int):
    """
    加载并预处理数据集。
    支持 Hugging Face 数据集名称或本地 CSV 文件路径。
    """
    if dataset_name.endswith(".csv"):
        # 自定义 CSV 格式：text, label 两列
        raw_dataset = Dataset.from_csv(dataset_name)
    else:
        raw_dataset = load_dataset(dataset_name, trust_remote_code=True)

    def tokenize_function(examples):
        """分词并截断到 max_length"""
        result = tokenizer(
            examples["text"],
            truncation=True,
            padding=False,
            max_length=max_length,
        )
        result["labels"] = examples["label"]
        return result

    # 对数据集进行分词处理
    if isinstance(raw_dataset, dict):
        tokenized = {
            split: ds.map(tokenize_function, batched=True, remove_columns=ds.column_names)
            for split, ds in raw_dataset.items()
        }
        return tokenized.get("train"), tokenized.get("test") or tokenized.get("validation")
    else:
        # 单数据集切分
        split_ds = raw_dataset.train_test_split(test_size=0.2, seed=42)
        train_tokenized = split_ds["train"].map(tokenize_function, batched=True, remove_columns=split_ds["train"].column_names)
        eval_tokenized = split_ds["test"].map(tokenize_function, batched=True, remove_columns=split_ds["test"].column_names)
        return train_tokenized, eval_tokenized


def setup_lora_model(model_name: str, bnb_config, num_labels: int, lora_config: LoraConfig):
    """
    加载基座模型并附加 LoRA 适配器。
    流程：加载量化模型 →  prepare for kbit → 添加 LoRA。
    """
    # 加载预训练模型（序列分类头）
    model = AutoModelForSequenceClassification.from_pretrained(
        model_name,
        quantization_config=bnb_config,
        device_map="auto",
        num_labels=num_labels,
        trust_remote_code=True,
    )
    model.config.use_cache = False  # 梯度检查点需要关闭缓存

    # 为 k-bit 训练做准备（梯度和输入归一化）
    model = prepare_model_for_kbit_training(model)

    # 应用 LoRA
    model = get_peft_model(model, lora_config)

    # 打印可训练参数量
    model.print_trainable_parameters()
    return model


def compute_metrics(eval_pred):
    """计算准确率和 F1 分数"""
    accuracy_metric = evaluate.load("accuracy")
    f1_metric = evaluate.load("f1")

    logits, labels = eval_pred
    predictions = np.argmax(logits, axis=-1)

    accuracy = accuracy_metric.compute(predictions=predictions, references=labels)
    f1 = f1_metric.compute(predictions=predictions, references=labels, average="binary")

    return {**accuracy, **f1}


def main():
    args = parse_args()

    # 1. 配置量化
    bnb_config = create_bnb_config(use_4bit=args.use_4bit)

    # 2. 加载 tokenizer
    tokenizer = AutoTokenizer.from_pretrained(args.model_name, trust_remote_code=True)
    # LLaMA 没有 pad_token，需要设置
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        tokenizer.pad_token_id = tokenizer.eos_token_id

    # 3. 加载并预处理数据
    train_dataset, eval_dataset = load_and_prepare_dataset(
        args.dataset_name, tokenizer, args.max_length
    )
    print(f"训练样本数: {len(train_dataset)}")
    print(f"评估样本数: {len(eval_dataset) if eval_dataset else 0}")

    # 4. 配置 LoRA
    # 对于 LLaMA 架构，target_modules 通常包括 q_proj, v_proj
    lora_config = LoraConfig(
        task_type=TaskType.SEQ_CLS,
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
        bias="none",
    )

    # 5. 加载模型
    model = setup_lora_model(
        args.model_name,
        bnb_config,
        num_labels=2,
        lora_config=lora_config,
    )

    # 6. 配置训练参数
    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.num_epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size * 2,
        gradient_accumulation_steps=4,
        learning_rate=args.learning_rate,
        warmup_ratio=0.1,
        logging_steps=10,
        evaluation_strategy="epoch" if args.do_eval else "no",
        save_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=True if args.do_eval else False,
        metric_for_best_model="eval_accuracy",
        bf16=torch.cuda.is_bf16_supported(),
        fp16=not torch.cuda.is_bf16_supported(),
        remove_unused_columns=False,
        report_to="none",
    )

    # 7. 初始化 Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        tokenizer=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer=tokenizer),
        compute_metrics=compute_metrics if args.do_eval else None,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)] if args.do_eval else None,
    )

    # 8. 开始训练
    trainer.train()

    # 9. 保存模型和 tokenizer
    model.save_pretrained(os.path.join(args.output_dir, "lora-adapter"))
    tokenizer.save_pretrained(os.path.join(args.output_dir, "lora-adapter"))

    # 10. 最终评估
    if args.do_eval and eval_dataset is not None:
        eval_results = trainer.evaluate()
        print(f"\n===== 最终评估结果 =====")
        for metric, value in eval_results.items():
            print(f"{metric}: {value:.4f}")

        # 保存指标到 JSON
        with open(os.path.join(args.output_dir, "eval_results.json"), "w") as f:
            json.dump(eval_results, f, indent=2)


def run_inference(model_path: str, texts: list[str], model_name: str = "meta-llama/Llama-2-7b-hf"):
    """
    推理函数：加载微调后的 LoRA 适配器进行预测。
    使用示例：
        results = run_inference("./lora-classification-output/lora-adapter", ["这部电影很棒！", "太无聊了"])
    """
    from peft import PeftModel

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # 加载基座模型 + LoRA 适配器
    base_model = AutoModelForSequenceClassification.from_pretrained(
        model_name,
        device_map="auto",
        num_labels=2,
        torch_dtype=torch.bfloat16,
    )
    model = PeftModel.from_pretrained(base_model, model_path)
    model.eval()

    inputs = tokenizer(texts, truncation=True, padding=True, max_length=512, return_tensors="pt").to("cuda")

    with torch.no_grad():
        outputs = model(**inputs)
        predictions = torch.argmax(outputs.logits, dim=-1).cpu().tolist()
        probs = torch.softmax(outputs.logits, dim=-1).cpu().numpy()

    results = []
    for text, pred, prob in zip(texts, predictions, probs):
        results.append({
            "text": text,
            "prediction": "正面" if pred == 1 else "负面",
            "confidence": float(max(prob)),
        })
    return results


if __name__ == "__main__":
    main()
```

**运行方式：**

```bash
# 使用 IMDB 数据集
python experiment_01_lora_classification.py --model_name meta-llama/Llama-2-7b-hf

# 使用自定义 CSV 数据
python experiment_01_lora_classification.py --model_name meta-llama/Llama-2-7b-hf --dataset_name ./my_data.csv

# 使用较小模型（适合 8GB 显存）
python experiment_01_lora_classification.py --model_name ybelkada/llama-2-7b-hf --lora_r 4 --batch_size 2
```

**关键说明：**

- `target_modules` 的选择对 LoRA 效果影响显著。对 LLaMA 架构，`q_proj` 和 `v_proj` 是最常见的选择；加入 `k_proj` 和 `o_proj` 可提升效果但增加显存开销。
- LoRA rank（r）控制表达能力与参数量的平衡。`r=8` 是良好默认值，分类任务中 `r=4` 通常已足够。
- 4-bit 量化使用 NF4（NormalFloat4）数据类型，这是专门为神经网络权重分布设计的量化格式，相比 FP4 能更好地保留模型能力。

---

## A.3 实验二：QLoRA 微调对话模型

本实验展示如何使用 QLoRA（Quantized Low-Rank Adaptation）对对话模型进行多轮对话微调。QLoRA 在 LoRA 的基础上增加了 4-bit NormalFloat 量化和双重量化（Double Quantization），使得在单卡 24GB 显存上微调 65B 模型成为可能。

```python
"""
实验二：QLoRA 微调对话模型
功能：使用 QLoRA 微调对话模型（如 Llama-2-chat、Mistral）
运行：python experiment_02_qlora_chat.py --model_name meta-llama/Llama-2-7b-chat-hf
"""

import os
import json
import argparse
from typing import Dict, List

import torch
from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    BitsAndBytesConfig,
    TrainingArguments,
    HfArgumentParser,
)
from peft import LoraConfig, prepare_model_for_kbit_training, get_peft_model
from trl import SFTTrainer, DataCollatorForCompletionOnlyLM
import evaluate


# ========== 对话模板定义 ==========

CHAT_TEMPLATE = """<|system|>
{system_prompt}</s>
<|user|>
{user_input}</s>
<|assistant|>
{assistant_response}</s>"""


def format_conversation(example: Dict) -> Dict:
    """
    将多轮对话格式化为标准模板。
    输入格式：{"messages": [{"role": "...", "content": "..."}, ...]}
    输出格式：拼接后的文本字符串
    """
    messages = example["messages"]
    system_prompt = messages[0]["content"] if messages[0]["role"] == "system" else "You are a helpful assistant."

    # 提取多轮对话
    formatted_turns = []
    current_user = ""
    for msg in messages:
        if msg["role"] == "system":
            continue
        elif msg["role"] == "user":
            current_user = msg["content"]
        elif msg["role"] == "assistant" and current_user:
            formatted_turns.append(CHAT_TEMPLATE.format(
                system_prompt=system_prompt,
                user_input=current_user,
                assistant_response=msg["content"],
            ))
            current_user = ""
    return {"text": "\n".join(formatted_turns)}


def parse_args():
    parser = argparse.ArgumentParser(description="QLoRA 对话模型微调")
    parser.add_argument("--model_name", type=str, default="meta-llama/Llama-2-7b-chat-hf")
    parser.add_argument("--dataset_path", type=str, required=True,
                        help="对话数据集 JSON 文件路径")
    parser.add_argument("--output_dir", type=str, default="./qlora-chat-output")
    parser.add_argument("--num_epochs", type=int, default=3)
    parser.add_argument("--batch_size", type=int, default=2)
    parser.add_argument("--learning_rate", type=float, default=2e-4)
    parser.add_argument("--lora_r", type=int, default=16)
    parser.add_argument("--lora_alpha", type=int, default=32)
    parser.add_argument("--max_seq_length", type=int, default=2048)
    parser.add_argument("--logging_steps", type=int, default=10)
    parser.add_argument("--save_steps", type=int, default=200)
    return parser.parse_args()


def create_qlora_config():
    """创建 QLoRA 特有的 4-bit 量化配置（NF4 + 双重量化）"""
    return BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_quant_type="nf4",          # NormalFloat4 量化
        bnb_4bit_use_double_quant=True,      # 双重量化（进一步压缩）
    )


def load_chat_dataset(path: str) -> Dataset:
    """加载对话数据集，支持 JSON 和 JSONL 格式"""
    if path.endswith(".jsonl"):
        with open(path, "r", encoding="utf-8") as f:
            data = [json.loads(line) for line in f if line.strip()]
    elif path.endswith(".json"):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        raise ValueError(f"不支持的文件格式: {path}，请使用 JSON 或 JSONL")

    dataset = Dataset.from_list(data)
    dataset = dataset.map(format_conversation, remove_columns=dataset.column_names)
    return dataset


def main():
    args = parse_args()

    # 1. 创建量化配置
    bnb_config = create_qlora_config()

    # 2. 加载 tokenizer
    tokenizer = AutoTokenizer.from_pretrained(args.model_name, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"  # 对话模型使用右侧填充

    # 3. 加载模型（4-bit 量化）
    model = AutoModelForCausalLM.from_pretrained(
        args.model_name,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
        torch_dtype=torch.bfloat16,
    )
    model.config.use_cache = False
    model.config.pretraining_tp = 1

    # 4. prepare_model_for_kbit_training
    model = prepare_model_for_kbit_training(model)

    # 5. 配置 LoRA
    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        target_modules=["q_proj", "v_proj", "k_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        lora_dropout=0.1,
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # 6. 加载数据
    dataset = load_chat_dataset(args.dataset_path)
    train_dataset, eval_dataset = dataset.train_test_split(test_size=0.05, seed=42).values()
    print(f"训练样本: {len(train_dataset)}, 评估样本: {len(eval_dataset)}")

    # 7. 配置训练参数
    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.num_epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size * 2,
        gradient_accumulation_steps=8,
        learning_rate=args.learning_rate,
        warmup_ratio=0.03,
        logging_steps=args.logging_steps,
        save_steps=args.save_steps,
        eval_steps=args.save_steps,
        evaluation_strategy="steps",
        save_strategy="steps",
        save_total_limit=3,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        bf16=torch.cuda.is_bf16_supported(),
        fp16=not torch.cuda.is_bf16_supported(),
        gradient_checkpointing=True,
        optim="paged_adamw_8bit",
        max_grad_norm=0.3,
        report_to="none",
    )

    # 8. 构造只对 assistant 部分计算损失的 collator
    # 使用 "###assistant" 作为 response 模板的起始标记
    response_template = "###assistant"
    collator = DataCollatorForCompletionOnlyLM(
        response_template=response_template,
        tokenizer=tokenizer,
    )

    # 9. SFTTrainer
    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        tokenizer=tokenizer,
        data_collator=collator,
        max_seq_length=args.max_seq_length,
        dataset_text_field="text",
    )

    # 10. 训练
    trainer.train()

    # 11. 保存
    model.save_pretrained(os.path.join(args.output_dir, "qlora-adapter"))
    tokenizer.save_pretrained(os.path.join(args.output_dir, "qlora-adapter"))

    # 12. 打印显存使用报告
    if torch.cuda.is_available():
        allocated = torch.cuda.max_memory_allocated() / 1024**3
        reserved = torch.cuda.max_memory_reserved() / 1024**3
        print(f"\n===== 显存使用报告 =====")
        print(f"最大分配显存: {allocated:.2f} GB")
        print(f"最大预留显存: {reserved:.2f} GB")


if __name__ == "__main__":
    main()
```

**数据集格式示例（JSON）：**

```json
[
  {
    "messages": [
      {"role": "system", "content": "你是一个专业的技术支持助手。"},
      {"role": "user", "content": "如何配置 Nginx 反向代理？"},
      {"role": "assistant", "content": "首先在 server 块中添加 proxy_pass 指令..."},
      {"role": "user", "content": "能给我一个示例配置吗？"},
      {"role": "assistant", "content": "以下是一个完整的示例配置..."}
    ]
  }
]
```

**显存对比（以 Llama-2-7B 为例）：**

| 方法 | 训练显存 | 可训练参数 | 训练速度 |
|------|---------|-----------|---------|
| 全参数 | ~56 GB | 100% | 1x |
| LoRA (FP16) | ~32 GB | ~0.3% | 1.2x |
| QLoRA (NF4) | ~12 GB | ~0.3% | 1.5x |

QLoRA 的核心创新在于：NF4 量化保留了权重的原始分布特征，而双重量化进一步减少了量化常数带来的额外开销。这使得在消费级 GPU 上微调大模型成为可行方案。

---

## A.4 实验三：使用 DPO 进行偏好对齐

DPO（Direct Preference Optimization）是一种无需强化学习的对齐方法。它直接在偏好数据上优化策略，通过二元偏好损失函数替代 PPO 中的奖励建模和策略优化两个阶段。

```python
"""
实验三：DPO 偏好对齐
功能：使用 DPO 算法对 SFT 后的模型进行偏好对齐
运行：python experiment_03_dpo_alignment.py --model_name ./sft-model-output
"""

import os
import json
import argparse
from typing import Dict

import torch
from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    BitsAndBytesConfig,
    TrainingArguments,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import DPOTrainer
import wandb


def parse_args():
    parser = argparse.ArgumentParser(description="DPO 偏好对齐")
    parser.add_argument("--model_name", type=str, required=True,
                        help="SFT 基座模型路径或名称")
    parser.add_argument("--dataset_path", type=str, required=True,
                        help="偏好数据集路径（JSON/JSONL）")
    parser.add_argument("--output_dir", type=str, default="./dpo-output")
    parser.add_argument("--num_epochs", type=int, default=3)
    parser.add_argument("--batch_size", type=int, default=2)
    parser.add_argument("--learning_rate", type=float, default=5e-6)
    parser.add_argument("--beta", type=float, default=0.1,
                        help="DPO 温度参数，控制对偏好的约束强度")
    parser.add_argument("--lora_r", type=int, default=8)
    parser.add_argument("--lora_alpha", type=int, default=16)
    parser.add_argument("--max_length", type=int, default=2048)
    parser.add_argument("--max_prompt_length", type=int, default=1024)
    parser.add_argument("--use_wandb", action="store_true", default=False)
    return parser.parse_args()


def prepare_dpo_dataset(path: str) -> Dataset:
    """
    准备 DPO 所需的数据集格式。
    每条数据必须包含三个字段：
    - prompt: 输入提示
    - chosen: 偏好的回答
    - rejected: 非偏好的回答
    """
    if path.endswith(".jsonl"):
        data = [json.loads(line) for line in open(path, "r", encoding="utf-8") if line.strip()]
    elif path.endswith(".json"):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        raise ValueError("不支持的文件格式")

    # 验证必要字段
    required_fields = {"prompt", "chosen", "rejected"}
    for i, item in enumerate(data):
        missing = required_fields - set(item.keys())
        if missing:
            raise ValueError(f"第 {i} 条数据缺少字段: {missing}")

    return Dataset.from_list(data)


def formatting_func(example: Dict) -> Dict:
    """
    格式化 DPO 数据：将 prompt/chosen/rejected 拼接为完整对话。
    DPO 模型需要看到完整的 prompt + response 序列，
    因此我们将 prompt 和 response 拼接，同时保留 prompt 用于计算隐含奖励。

    DPO 的 special_token 用于标记 chosen 和 rejected 对的起始。
    可选的做法是使用 ### Human: 和 ### Assistant: 格式。
    """
    # 可根据需要定制模板
    chosen_text = f"### Human:\n{example['prompt']}\n### Assistant:\n{example['chosen']}"
    rejected_text = f"### Human:\n{example['prompt']}\n### Assistant:\n{example['rejected']}"
    return {
        "prompt": f"### Human:\n{example['prompt']}\n### Assistant:\n",
        "chosen": chosen_text,
        "rejected": rejected_text,
    }


def main():
    args = parse_args()

    if args.use_wandb:
        wandb.init(project="dpo-alignment", name=args.output_dir.split("/")[-1])

    # 1. 量化配置
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
    )

    # 2. 加载 tokenizer
    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # 3. 加载基座模型（策略模型）
    model = AutoModelForCausalLM.from_pretrained(
        args.model_name,
        quantization_config=bnb_config,
        device_map="auto",
        torch_dtype=torch.bfloat16,
    )
    model.config.use_cache = False

    # 4. DPO 需要参考模型（用于计算 KL 散度）
    # 参考模型与策略模型共享基座权重，但冻结不变。
    # TRL 的 DPOTrainer 可以自动创建参考模型
    ref_model = AutoModelForCausalLM.from_pretrained(
        args.model_name,
        quantization_config=bnb_config,
        device_map="auto",
        torch_dtype=torch.bfloat16,
    )

    # 5. 配置 LoRA（只应用于策略模型）
    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
        lora_dropout=0.1,
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # 参考模型不需要 LoRA，保持冻结
    ref_model.eval()
    for param in ref_model.parameters():
        param.requires_grad = False

    # 6. 准备数据集
    dataset = prepare_dpo_dataset(args.dataset_path)
    dataset = dataset.map(formatting_func)

    # 切分训练/评估集
    split = dataset.train_test_split(test_size=0.05, seed=42)
    train_dataset = split["train"]
    eval_dataset = split["test"]

    # 7. 训练参数
    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.num_epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size * 2,
        gradient_accumulation_steps=8,
        learning_rate=args.learning_rate,
        warmup_ratio=0.1,
        logging_steps=10,
        save_steps=200,
        eval_steps=200,
        evaluation_strategy="steps",
        save_strategy="steps",
        save_total_limit=3,
        load_best_model_at_end=True,
        bf16=torch.cuda.is_bf16_supported(),
        fp16=not torch.cuda.is_bf16_supported(),
        gradient_checkpointing=True,
        optim="paged_adamw_8bit",
        max_grad_norm=0.3,
        report_to="wandb" if args.use_wandb else "none",
        remove_unused_columns=False,
    )

    # 8. 初始化 DPOTrainer
    dpo_trainer = DPOTrainer(
        model=model,
        ref_model=ref_model,
        args=training_args,
        beta=args.beta,                       # DPO 温度参数
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        tokenizer=tokenizer,
        max_length=args.max_length,
        max_prompt_length=args.max_prompt_length,
    )

    # 9. 训练
    dpo_trainer.train()

    # 10. 保存
    model.save_pretrained(os.path.join(args.output_dir, "dpo-adapter"))
    tokenizer.save_pretrained(os.path.join(args.output_dir, "dpo-adapter"))

    if args.use_wandb:
        wandb.finish()


if __name__ == "__main__":
    main()
```

**DPO 损失函数解读：**

DPO 的核心优化目标为：

```
L_DPO(π_θ; π_ref) = -E[log σ(β * (log(π_θ(y_w|x) / π_ref(y_w|x)) - log(π_θ(y_l|x) / π_ref(y_l|x))))]
```

其中：
- `π_θ` 是策略模型（待优化），`π_ref` 是参考模型（冻结）
- `y_w` 和 `y_l` 分别是 chosen（偏好）和 rejected（非偏好）回答
- `β` 控制对参考模型的约束强度，β 越大，策略模型越接近参考模型
- `σ` 是 sigmoid 函数

直觉上，DPO 在**增大偏好回答概率**的同时**减小非偏好回答概率**，并通过 β 参数控制偏离参考模型的程度。相比 RLHF，DPO 无需训练单独的奖励模型，也无需进行在线采样，训练更稳定。

**偏好数据集格式：**

```json
[
  {
    "prompt": "解释量子纠缠",
    "chosen": "量子纠缠是两个粒子之间的一种特殊关联...（高质量回答）",
    "rejected": "量子纠缠很复杂，不好说...（低质量回答）"
  }
]
```

---

## A.5 实验四：全参数微调小模型

全参数微调更新模型所有权重，效果最好但显存开销最大。本实验以 GPT-2（1.5B）或 Gemma-2B 为例，展示如何使用 FSDP（Fully Sharded Data Parallel）和梯度检查点等技术在小规模 GPU 集群上执行全参数微调。

```python
"""
实验四：全参数微调小模型（GPT-2 / Gemma-2B）
功能：使用 FSDP + 混合精度进行全参数微调
运行：python experiment_04_full_finetune.py --model_name google/gemma-2b
"""

import os
import math
import json
import argparse

import torch
import torch.distributed as dist
from datasets import load_dataset
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling,
    get_scheduler,
)
from accelerate import Accelerator


def parse_args():
    parser = argparse.ArgumentParser(description="全参数微调")
    parser.add_argument("--model_name", type=str, default="google/gemma-2b",
                        help="小模型名称，推荐 gemma-2b 或 gpt2-xl")
    parser.add_argument("--dataset_name", type=str, default="wikitext",
                        help="预训练数据集")
    parser.add_argument("--dataset_config", type=str, default="wikitext-2-raw-v1")
    parser.add_argument("--output_dir", type=str, default="./full-finetune-output")
    parser.add_argument("--num_epochs", type=int, default=3)
    parser.add_argument("--batch_size", type=int, default=4)
    parser.add_argument("--learning_rate", type=float, default=5e-5)
    parser.add_argument("--max_length", type=int, default=1024)
    parser.add_argument("--use_fsdp", action="store_true", default=True,
                        help="是否使用 FSDP 分片")
    parser.add_argument("--use_gradient_checkpointing", action="store_true", default=True)
    parser.add_argument("--use_wandb", action="store_true", default=False)
    return parser.parse_args()


def tokenize_function(examples, tokenizer, max_length: int):
    """批量 tokenize 并拼接为固定长度块"""
    # 先 tokenize 所有文本
    tokenized = tokenizer(examples["text"], truncation=False, padding=False)

    # 拼接所有 token IDs
    all_ids = []
    for ids in tokenized["input_ids"]:
        all_ids.extend(ids + [tokenizer.eos_token_id])

    # 切分为固定长度块
    chunks = []
    for i in range(0, len(all_ids) - max_length + 1, max_length):
        chunks.append(all_ids[i : i + max_length])

    return {"input_ids": chunks, "labels": chunks}


def main():
    args = parse_args()

    # 1. 初始化 accelerator（自动处理 FSDP/DeepSpeed 等）
    accelerator = Accelerator()

    # 2. 加载 tokenizer
    tokenizer = AutoTokenizer.from_pretrained(args.model_name, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # 3. 加载数据集
    raw_dataset = load_dataset(args.dataset_name, args.dataset_config, trust_remote_code=True)

    # 4. 分词处理
    tokenized_dataset = raw_dataset.map(
        lambda x: tokenize_function(x, tokenizer, args.max_length),
        batched=True,
        remove_columns=raw_dataset["train"].column_names,
        num_proc=4,
    )

    train_dataset = tokenized_dataset["train"]
    eval_dataset = tokenized_dataset.get("validation", None)

    if accelerator.is_main_process:
        print(f"训练样本数: {len(train_dataset)}")

    # 5. 加载模型
    model = AutoModelForCausalLM.from_pretrained(
        args.model_name,
        torch_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
        trust_remote_code=True,
    )
    model.config.use_cache = not args.use_gradient_checkpointing

    if args.use_gradient_checkpointing:
        model.gradient_checkpointing_enable()

    # 打印可训练参数量
    if accelerator.is_main_process:
        total_params = sum(p.numel() for p in model.parameters())
        trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
        print(f"总参数量: {total_params / 1e9:.2f}B")
        print(f"可训练参数量: {trainable_params / 1e9:.2f}B")

    # 6. 训练参数
    # FSDP 配置通过 accelerate 命令行或配置文件传入
    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.num_epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size * 2,
        gradient_accumulation_steps=4,
        learning_rate=args.learning_rate,
        weight_decay=0.1,
        warmup_ratio=0.05,
        lr_scheduler_type="cosine",
        logging_steps=10,
        evaluation_strategy="steps" if eval_dataset else "no",
        eval_steps=500,
        save_steps=500,
        save_total_limit=3,
        bf16=torch.cuda.is_bf16_supported(),
        fp16=not torch.cuda.is_bf16_supported(),
        gradient_checkpointing=args.use_gradient_checkpointing,
        gradient_checkpointing_kwargs={"use_reentrant": False} if args.use_gradient_checkpointing else None,
        ddp_find_unused_parameters=False if args.use_fsdp else None,
        fsdp=args.use_fsdp,
        fsdp_transformer_layer_cls_to_wrap=["GemmaDecoderLayer", "GPT2Block"],
        report_to="wandb" if args.use_wandb else "none",
        remove_unused_columns=False,
    )

    # 7. 数据 collator（语言模型任务：自动创建 labels）
    collator = DataCollatorForLanguageModeling(
        tokenizer=tokenizer,
        mlm=False,  # 因果语言模型，非掩码语言模型
    )

    # 8. Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        tokenizer=tokenizer,
        data_collator=collator,
    )

    # 9. 训练
    trainer.train()

    # 10. 计算困惑度
    if eval_dataset is not None:
        eval_results = trainer.evaluate()
        # 困惑度 = exp(交叉熵损失)
        perplexity = math.exp(eval_results["eval_loss"])
        eval_results["perplexity"] = perplexity
        print(f"\n===== 评估结果 =====")
        print(f"验证损失: {eval_results['eval_loss']:.4f}")
        print(f"困惑度 (PPL): {perplexity:.2f}")

        with open(os.path.join(args.output_dir, "eval_metrics.json"), "w") as f:
            json.dump(eval_results, f, indent=2)

    # 11. 保存完整模型（全参数微调保存全部权重）
    trainer.save_model(os.path.join(args.output_dir, "final-model"))
    tokenizer.save_pretrained(os.path.join(args.output_dir, "final-model"))


if __name__ == "__main__":
    main()
```

**FSDP 配置说明：**

FSDP 是 PyTorch 提供的分布式训练策略，它将模型参数、梯度和优化器状态分片到多个 GPU 上。全参数微调中的关键配置：

```yaml
# fsdp_config.yaml
compute_environment: LOCAL_MACHINE
distributed_type: FSDP
fsdp_config:
  fsdp_auto_wrap_policy: TRANSFORMER_BASED_LAYER
  fsdp_transformer_layer_cls_to_wrap: [GemmaDecoderLayer]
  fsdp_state_dict_type: SHARDED_STATE_DICT
  fsdp_sharding_strategy: FULL_SHARD
  fsdp_offload_params: false
  fsdp_cpu_ram_efficiency_effort: 1
```

**运行命令：**

```bash
# 单卡运行（适用于 Gemma-2B，需 ~16GB 显存）
python experiment_04_full_finetune.py --model_name google/gemma-2b

# 多卡 FSDP 运行
accelerate launch --config_file fsdp_config.yaml \
  experiment_04_full_finetune.py \
  --model_name google/gemma-2b \
  --batch_size 8
```

**全参数 vs. LoRA 对比：**

| 对比项 | 全参数微调 | LoRA |
|-------|-----------|------|
| 可训练参数 | 100% | < 1% |
| 显存需求（7B） | ~56 GB | ~16 GB |
| 多任务部署 | 每个任务一个完整副本 | 一个基座 + 多个适配器 |
| 领域偏移适应性 | 强 | 中（受限于低秩假设） |
| 灾难性遗忘风险 | 高 | 低 |

---

## A.6 实验五：P-Tuning / Prompt Tuning

Prompt Tuning 是另一种参数高效微调方法。与 LoRA 不同，它不是修改权重矩阵，而是在输入嵌入层前添加一组可学习的"软提示"（soft prompt）token。本实验对比 Prompt Tuning、P-Tuning 和 LoRA 三种方法的效果。

```python
"""
实验五：Prompt Tuning / P-Tuning v2
功能：使用 PEFT 进行 Soft Prompt 微调，并与 LoRA 对比
运行：python experiment_05_prompt_tuning.py --method p_tuning
"""

import os
import json
import argparse
from typing import Optional

import torch
import numpy as np
from datasets import load_dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    BitsAndBytesConfig,
    TrainingArguments,
    Trainer,
    DataCollatorWithPadding,
)
from peft import (
    PromptTuningConfig,
    PromptTuningInit,
    P tuningConfig,
    TaskType,
    get_peft_model,
    PeftModel,
)
import evaluate


def parse_args():
    parser = argparse.ArgumentParser(description="Prompt Tuning 实验")
    parser.add_argument("--method", type=str, default="prompt_tuning",
                        choices=["prompt_tuning", "p_tuning", "lora"],
                        help="PEFT 方法选择")
    parser.add_argument("--model_name", type=str, default="google/gemma-2b")
    parser.add_argument("--dataset_name", type=str, default="imdb")
    parser.add_argument("--output_dir", type=str, default="./prompt-tuning-output")
    parser.add_argument("--num_virtual_tokens", type=int, default=20,
                        help="软提示 token 数量（Prompt Tuning 核心超参数）")
    parser.add_argument("--num_epochs", type=int, default=5)
    parser.add_argument("--batch_size", type=int, default=8)
    parser.add_argument("--learning_rate", type=float, default=3e-5)
    parser.add_argument("--max_length", type=int, default=512)
    return parser.parse_args()


def main():
    args = parse_args()

    # 1. 加载 tokenizer 和模型
    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # 2. 加载数据集
    raw_dataset = load_dataset(args.dataset_name, trust_remote_code=True)

    def tokenize_fn(examples):
        result = tokenizer(examples["text"], truncation=True, max_length=args.max_length, padding=False)
        result["labels"] = examples["label"]
        return result

    tokenized = raw_dataset.map(tokenize_fn, batched=True, remove_columns=raw_dataset["train"].column_names)
    train_dataset = tokenized["train"]
    eval_dataset = tokenized.get("test", None)

    # 3. 加载模型（不使用量化以保持公平对比）
    model = AutoModelForSequenceClassification.from_pretrained(
        args.model_name,
        num_labels=2,
        torch_dtype=torch.bfloat16,
        device_map="auto",
    )
    model.config.use_cache = False

    # 4. 配置 PEFT 方法
    if args.method == "prompt_tuning":
        # Prompt Tuning：在输入嵌入前添加虚拟 token
        peft_config = PromptTuningConfig(
            task_type=TaskType.SEQ_CLS,
            num_virtual_tokens=args.num_virtual_tokens,
            prompt_tuning_init=PromptTuningInit.RANDOM,
            tokenizer_name_or_path=args.model_name,
        )
        print(f"[Prompt Tuning] 虚拟 token 数: {args.num_virtual_tokens}")
        print(f"[Prompt Tuning] 可训练参数: {args.num_virtual_tokens * model.config.hidden_size}")

    elif args.method == "p_tuning":
        # P-Tuning v2：在每一层 Transformer 层前添加可学习前缀
        peft_config = P tuningConfig(
            task_type=TaskType.SEQ_CLS,
            num_virtual_tokens=args.num_virtual_tokens,
            num_transformer_submodules=1,
            tokenizer_name_or_path=args.model_name,
        )
        print(f"[P-Tuning v2] 虚拟 token 数（每层）: {args.num_virtual_tokens}")

    elif args.method == "lora":
        # LoRA：低秩适配（用于对比）
        from peft import LoraConfig
        peft_config = LoraConfig(
            task_type=TaskType.SEQ_CLS,
            r=8,
            lora_alpha=16,
            target_modules=["q_proj", "v_proj"],
            lora_dropout=0.05,
        )
        print(f"[LoRA] rank=8")

    # 5. 应用 PEFT
    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()

    # 6. 训练参数
    training_args = TrainingArguments(
        output_dir=os.path.join(args.output_dir, args.method),
        num_train_epochs=args.num_epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size * 2,
        learning_rate=args.learning_rate,
        warmup_ratio=0.1,
        logging_steps=10,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="eval_accuracy",
        bf16=torch.cuda.is_bf16_supported(),
        fp16=not torch.cuda.is_bf16_supported(),
        report_to="none",
        remove_unused_columns=False,
    )

    # 7. 指标
    accuracy_metric = evaluate.load("accuracy")
    f1_metric = evaluate.load("f1")

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        predictions = np.argmax(logits, axis=-1)
        return {
            **accuracy_metric.compute(predictions=predictions, references=labels),
            **f1_metric.compute(predictions=predictions, references=labels, average="binary"),
        }

    # 8. Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        tokenizer=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer=tokenizer),
        compute_metrics=compute_metrics,
    )

    # 9. 训练
    trainer.train()

    # 10. 保存
    model.save_pretrained(os.path.join(args.output_dir, args.method, "adapter"))
    tokenizer.save_pretrained(os.path.join(args.output_dir, args.method, "adapter"))

    # 11. 最终评估
    eval_results = trainer.evaluate()
    print(f"\n===== [{args.method}] 最终评估 =====")
    for k, v in eval_results.items():
        print(f"  {k}: {v:.4f}")

    # 12. 分析学到的软提示（仅 Prompt Tuning）
    if args.method == "prompt_tuning":
        print("\n===== 学习到的软提示分析 =====")
        # 获取 soft embeddings
        prompt_encoder = model.get_base_model().get_prompt_encoder()
        if hasattr(prompt_encoder, 'embedding'):
            soft_prompt_weights = prompt_encoder.embedding.weight.detach().cpu()
            print(f"软提示权重形状: {soft_prompt_weights.shape}")

            # 找到最接近的词汇
            embedding_matrix = model.get_base_model().model.get_input_embeddings().weight.detach().cpu()
            for i in range(min(args.num_virtual_tokens, 5)):
                # 余弦相似度搜索
                sims = torch.nn.functional.cosine_similarity(
                    soft_prompt_weights[i].unsqueeze(0),
                    embedding_matrix,
                    dim=-1,
                )
                top_k = sims.topk(5)
                tokens = [tokenizer.decode([idx.item()]) for idx in top_k.indices]
                print(f"  Token {i}: 最近邻词汇 = {tokens}")


def compare_methods(base_dir: str = "./prompt-tuning-output"):
    """
    对比不同 PEFT 方法的效果。
    运行所有三种方法后，调用此函数生成对比表格。
    """
    methods = ["prompt_tuning", "p_tuning", "lora"]
    results = {}
    for method in methods:
        result_path = os.path.join(base_dir, method, "eval_results.json")
        if os.path.exists(result_path):
            with open(result_path) as f:
                results[method] = json.load(f)

    if results:
        print("\n===== PEFT 方法对比 =====")
        print(f"{'方法':<20} {'准确率':<15} {'F1':<15}")
        print("-" * 50)
        for method, metrics in results.items():
            acc = metrics.get("eval_accuracy", 0)
            f1 = metrics.get("eval_f1", 0)
            print(f"{method:<20} {acc:<15.4f} {f1:<15.4f}")


if __name__ == "__main__":
    main()
```

**三种 PEFT 方法的核心区别：**

| 方法 | 参数量 | 额外推理开销 | 适用场景 |
|------|-------|-------------|---------|
| Prompt Tuning | ~20K | 无 | 大规模多任务、需要快速切换任务 |
| P-Tuning v2 | ~500K | 每层增加计算 | 复杂语义理解任务 |
| LoRA | ~1M+ | 无 | 综合性能最佳，大多数场景 |

Prompt Tuning 的核心思想是：**在输入序列前端添加一组可学习的嵌入向量**，这些向量的参数远少于 LoRA 的秩分解矩阵，因此适合需要大量任务分支的场景（如 SaaS 平台为每个客户维护独立的任务头）。

---

## A.7 实验六：多任务微调

多任务微调让一个模型同时学习多个相关任务，通过共享表示提升各任务的泛化能力。本实验实现一个支持分类和生成的多任务框架。

```python
"""
实验六：多任务微调
功能：在一个模型中同时学习文本分类和生成两个任务
运行：python experiment_06_multitask.py --model_name google/gemma-2b
"""

import os
import json
import argparse
from dataclasses import dataclass
from typing import Dict, List, Optional, Union

import torch
import torch.nn as nn
from datasets import Dataset, load_dataset, concatenate_datasets
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    BitsAndBytesConfig,
    TrainingArguments,
    Trainer,
    TrainerCallback,
    PreTrainedModel,
)
from peft import LoraConfig, get_peft_model, TaskType


def parse_args():
    parser = argparse.ArgumentParser(description="多任务微调")
    parser.add_argument("--model_name", type=str, default="google/gemma-2b")
    parser.add_argument("--output_dir", type=str, default="./multitask-output")
    parser.add_argument("--num_epochs", type=int, default=3)
    parser.add_argument("--batch_size", type=int, default=4)
    parser.add_argument("--learning_rate", type=float, default=2e-4)
    parser.add_argument("--max_length", type=int, default=512)
    parser.add_argument("--lora_r", type=int, default=8)
    return parser.parse_args()


# ========== 多任务数据准备 ==========

TASK_PREFIXES = {
    "classification": "将以下文本分类为正面或负面：\n{text}\n情感类别：",
    "summarization": "总结以下文本：\n{text}\n摘要：",
}


def prepare_multitask_dataset(classification_samples: List[Dict], summarization_samples: List[Dict]) -> Dataset:
    """
    准备多任务数据集。
    分类样本：{"text": "...", "label": 0/1}
    摘要样本：{"text": "...", "summary": "..."}
    """
    clf_data = []
    for item in classification_samples:
        clf_data.append({
            "input": TASK_PREFIXES["classification"].format(text=item["text"]),
            "output": "正面" if item["label"] == 1 else "负面",
            "task": "classification",
        })

    summ_data = []
    for item in summarization_samples:
        summ_data.append({
            "input": TASK_PREFIXES["summarization"].format(text=item["text"]),
            "output": item["summary"],
            "task": "summarization",
        })

    all_data = clf_data + summ_data
    dataset = Dataset.from_list(all_data)

    # 打乱（防止任务偏见）
    dataset = dataset.shuffle(seed=42)
    return dataset


def tokenize_multitask(examples, tokenizer, max_length: int):
    """分词：将 input 和 output 拼接为完整序列"""
    texts = [inp + out + tokenizer.eos_token for inp, out in zip(examples["input"], examples["output"])]

    tokenized = tokenizer(
        texts,
        truncation=True,
        max_length=max_length,
        padding=False,
    )

    # labels 与 input_ids 相同（因果 LM 的常规做法）
    tokenized["labels"] = tokenized["input_ids"].copy()

    # 对 input 部分的 loss 进行掩码（可选）：如果只希望计算 output 部分的损失
    # 下面的实现中，我们对所有 token 计算损失（简化）
    tokenized["task"] = examples["task"]
    return tokenized


# ========== 多任务模型包装 ==========

class MultiTaskModel(nn.Module):
    """
    多任务模型包装器。
    使用共享的 LoRA 基座，为不同任务添加可选的分类头。
    对于生成任务直接用基座生成；对于分类任务使用额外的分类头。
    """
    def __init__(self, base_model: PreTrainedModel, num_labels: int = 2):
        super().__init__()
        self.base_model = base_model
        self.hidden_size = base_model.config.hidden_size
        self.num_labels = num_labels

        # 分类头（只有全参数微调时才需要，LoRA 模式下可直接用基座 + 分类 prompt）
        self.classifier = nn.Sequential(
            nn.Dropout(0.1),
            nn.Linear(self.hidden_size, num_labels),
        )
        self._is_peft = hasattr(base_model, "peft_config")

    def forward(
        self,
        input_ids: torch.LongTensor,
        attention_mask: Optional[torch.Tensor] = None,
        labels: Optional[torch.LongTensor] = None,
        task: Optional[List[str]] = None,
        **kwargs,
    ):
        """前向传播：根据任务类型选择不同 head"""
        outputs = self.base_model(
            input_ids=input_ids,
            attention_mask=attention_mask,
            output_hidden_states=True,
            **kwargs,
        )

        if task is not None and "classification" in task:
            # 分类任务
            hidden_states = outputs.hidden_states[-1]
            # 使用最后一个 token 的表示（需要 attention_mask）
            last_token_idx = attention_mask.sum(dim=1) - 1
            batch_indices = torch.arange(hidden_states.size(0), device=hidden_states.device)
            pooled = hidden_states[batch_indices, last_token_idx]
            logits = self.classifier(pooled)

            loss = None
            if labels is not None:
                loss_fct = nn.CrossEntropyLoss()
                loss = loss_fct(logits, labels)
            return {"loss": loss, "logits": logits} if loss is not None else {"logits": logits}
        else:
            # 生成任务：直接返回 LM 输出
            return outputs


def main():
    args = parse_args()

    # 1. 加载 tokenizer
    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # 2. 加载模型（4-bit）
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_quant_type="nf4",
    )
    model = AutoModelForCausalLM.from_pretrained(
        args.model_name,
        quantization_config=bnb_config,
        device_map="auto",
        torch_dtype=torch.bfloat16,
    )
    model.config.use_cache = False

    # 3. 应用 LoRA
    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=16,
        target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
        lora_dropout=0.1,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # 4. 准备多任务数据（使用 imdb 和 xsum 作为示例）
    print("加载多任务数据...")
    clf_dataset = load_dataset("imdb", split="train[:2000]", trust_remote_code=True)
    clf_data = [{"text": row["text"], "label": row["label"]} for row in clf_dataset]

    # 用同样的数据构造简化的摘要任务（实际使用中请替换为真实摘要数据）
    summ_data = [{"text": row["text"], "summary": row["text"][:100]} for row in clf_dataset[:1000]]

    dataset = prepare_multitask_dataset(clf_data, summ_data)
    tokenized_dataset = dataset.map(
        lambda x: tokenize_multitask(x, tokenizer, args.max_length),
        batched=True,
        remove_columns=dataset.column_names,
    )

    split_ds = tokenized_dataset.train_test_split(test_size=0.1, seed=42)

    # 6. 训练
    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.num_epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size * 2,
        gradient_accumulation_steps=4,
        learning_rate=args.learning_rate,
        warmup_ratio=0.1,
        logging_steps=10,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        bf16=torch.cuda.is_bf16_supported(),
        fp16=not torch.cuda.is_bf16_supported(),
        report_to="none",
        remove_unused_columns=False,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=split_ds["train"],
        eval_dataset=split_ds["test"],
        tokenizer=tokenizer,
    )

    trainer.train()
    model.save_pretrained(os.path.join(args.output_dir, "multitask-adapter"))
    tokenizer.save_pretrained(os.path.join(args.output_dir, "multitask-adapter"))

    # 7. 多任务推理示例
    print("\n===== 多任务推理示例 =====")
    model.eval()
    test_texts = [
        "这部电影的剧情非常出色，演员表演也很到位。",
        "产品功能不错，但客户服务有待改进。",
    ]

    for text in test_texts:
        # 分类任务
        clf_prompt = TASK_PREFIXES["classification"].format(text=text)
        inputs = tokenizer(clf_prompt, return_tensors="pt").to("cuda")
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=10,
                do_sample=False,
            )
        result = tokenizer.decode(outputs[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)
        print(f"文本: {text}")
        print(f"  分类结果: {result.strip()}")
        print()


if __name__ == "__main__":
    main()
```

**多任务微调的两种策略对比：**

1. **共享编码器 + 任务特定头**：适用于分类、序列标注等任务，每个任务有独立的输出头
2. **指令前缀 + 共享模型**：通过不同的指令前缀（如 `分类：`、`摘要：`）区分任务，共享全部参数

本实验采用策略 2，因为它更灵活且与 LoRA 配合更好。实践中，多任务微调的关键在于**任务之间的平衡**——数据量大的任务不应主导训练。常用技巧包括：
- 基于任务难度的采样权重调节
- 任务特定的学习率
- 渐进式训练（先训练简单任务，再加入困难任务）

---

## A.8 实验七：模型评估流水线

评估是微调流程中不可或缺的一环。本实验构建一个完整的评估流水线，支持困惑度计算、任务特定指标评估和 LLM-as-judge 自动评价。

```python
"""
实验七：模型评估流水线
功能：对微调后的模型进行多维度评估
运行：python experiment_07_evaluation.py --model_path ./lora-classification-output/lora-adapter --base_model meta-llama/Llama-2-7b-hf
"""

import os
import json
import math
import argparse
from typing import Dict, List, Optional, Callable

import torch
import numpy as np
from datasets import load_dataset
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    AutoModelForSequenceClassification,
)
from peft import PeftModel
import evaluate
from tqdm import tqdm


def parse_args():
    parser = argparse.ArgumentParser(description="模型评估流水线")
    parser.add_argument("--model_path", type=str, required=True,
                        help="微调后的模型路径（LoRA 适配器或完整模型）")
    parser.add_argument("--base_model", type=str, required=True,
                        help="基座模型名称")
    parser.add_argument("--output_dir", type=str, default="./eval-results")
    parser.add_argument("--tasks", type=str, nargs="+",
                        default=["perplexity", "classification", "generation", "llm_judge"],
                        help="评估任务列表")
    parser.add_argument("--device", type=str, default="cuda" if torch.cuda.is_available() else "cpu")
    return parser.parse_args()


# ===== 1. 困惑度评估 =====

def evaluate_perplexity(
    model: AutoModelForCausalLM,
    tokenizer: AutoTokenizer,
    dataset_name: str = "wikitext",
    dataset_config: str = "wikitext-2-raw-v1",
    max_length: int = 1024,
    stride: int = 512,
) -> Dict:
    """
    使用滑动窗口方法计算困惑度（Perplexity）。
    滑动窗口避免因序列过长而超出上下文窗口。
    参考：https://huggingface.co/docs/transformers/perplexity
    """
    dataset = load_dataset(dataset_name, dataset_config, split="test", trust_remote_code=True)

    # 拼接所有文本
    text = " ".join(dataset["text"])
    encodings = tokenizer(text, return_tensors="pt")
    input_ids = encodings.input_ids.to(model.device)
    seq_len = input_ids.size(1)

    model.eval()
    nlls = []  # 负对数似然
    prev_end_loc = 0

    with torch.no_grad():
        for begin_loc in tqdm(range(0, seq_len, stride), desc="计算 PPL"):
            end_loc = min(begin_loc + max_length, seq_len)
            trg_len = end_loc - prev_end_loc  # 避免重复计算

            input_chunk = input_ids[:, begin_loc:end_loc]
            target_chunk = input_chunk.clone()
            # 对重叠部分设置 labels = -100（不计入损失）
            target_chunk[:, :-trg_len] = -100

            outputs = model(input_chunk, labels=target_chunk)
            neg_log_likelihood = outputs.loss * trg_len

            nlls.append(neg_log_likelihood)
            prev_end_loc = end_loc

            if end_loc == seq_len:
                break

    ppl = torch.exp(torch.stack(nlls).sum() / prev_end_loc)
    return {"perplexity": ppl.item(), "avg_loss": (torch.stack(nlls).sum() / prev_end_loc).item()}


# ===== 2. 分类任务评估 =====

def evaluate_classification(
    model: AutoModelForSequenceClassification,
    tokenizer: AutoTokenizer,
    dataset_name: str = "imdb",
    max_samples: int = 500,
) -> Dict:
    """评估文本分类准确率"""
    dataset = load_dataset(dataset_name, split="test", trust_remote_code=True)
    if max_samples:
        dataset = dataset.select(range(min(max_samples, len(dataset))))

    accuracy_metric = evaluate.load("accuracy")
    f1_metric = evaluate.load("f1")

    model.eval()
    all_preds = []
    all_labels = []

    for example in tqdm(dataset, desc="分类评估"):
        inputs = tokenizer(
            example["text"],
            truncation=True,
            max_length=512,
            return_tensors="pt",
        ).to(model.device)

        with torch.no_grad():
            outputs = model(**inputs)
            pred = torch.argmax(outputs.logits, dim=-1).item()

        all_preds.append(pred)
        all_labels.append(example["label"])

    return {
        **accuracy_metric.compute(predictions=all_preds, references=all_labels),
        **f1_metric.compute(predictions=all_preds, references=all_labels, average="binary"),
    }


# ===== 3. 生成任务评估 =====

def evaluate_generation(
    model: AutoModelForCausalLM,
    tokenizer: AutoTokenizer,
    prompts: List[str],
    reference_outputs: Optional[List[str]] = None,
    max_new_tokens: int = 128,
) -> Dict:
    """评估生成质量：支持 BLEU、ROUGE 等指标"""
    model.eval()
    generations = []

    for prompt in tqdm(prompts, desc="生成评估"):
        inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                do_sample=True,
                temperature=0.7,
                top_p=0.9,
            )
        generated = tokenizer.decode(outputs[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)
        generations.append(generated)

    results = {"generations": generations}

    if reference_outputs:
        bleu = evaluate.load("bleu")
        rouge = evaluate.load("rouge")

        results["bleu"] = bleu.compute(predictions=generations, references=reference_outputs)
        results["rouge"] = rouge.compute(predictions=generations, references=reference_outputs)

    return results


# ===== 4. LLM-as-Judge 评估 =====

def llm_as_judge_evaluation(
    model: AutoModelForCausalLM,
    tokenizer: AutoTokenizer,
    prompts: List[str],
    judge_model_name: str = "meta-llama/Llama-3-8B-Instruct",
) -> Dict:
    """
    使用 LLM 作为评判者（LLM-as-Judge）评估生成质量。
    这是一种自动化评估方法，用一个强模型来评价目标模型的输出。
    评估维度包括：有用性、安全性、准确性等。
    """
    judge_tokenizer = AutoTokenizer.from_pretrained(judge_model_name)
    judge_model = AutoModelForCausalLM.from_pretrained(
        judge_model_name,
        torch_dtype=torch.bfloat16,
        device_map="auto",
    )

    judge_template = """你是一个专业的 AI 评估员。请评估以下回答的质量。

用户问题：{prompt}

AI 回答：{response}

请从以下维度评分（1-5分）：
1. 准确性：回答是否正确
2. 完整性：是否全面覆盖了问题
3. 清晰度：表达是否清晰易懂

请以 JSON 格式输出评分和简短理由。"""

    scores = []
    for prompt in tqdm(prompts, desc="LLM-as-Judge"):
        # 先用目标模型生成回答
        inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
        with torch.no_grad():
            output_ids = model.generate(**inputs, max_new_tokens=128, do_sample=False)
        response = tokenizer.decode(output_ids[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)

        # 用评判模型评分
        judge_prompt = judge_template.format(prompt=prompt, response=response)
        judge_inputs = judge_tokenizer(judge_prompt, return_tensors="pt").to(judge_model.device)
        with torch.no_grad():
            judge_output = judge_model.generate(**judge_inputs, max_new_tokens=256, do_sample=False)
        judge_result = judge_tokenizer.decode(judge_output[0][judge_inputs.input_ids.shape[1]:], skip_special_tokens=True)

        scores.append({"prompt": prompt, "response": response, "judge_result": judge_result})

    return {"judge_scores": scores}


# ===== 主评估函数 =====

def load_model_for_eval(model_path: str, base_model_name: str, device: str):
    """智能加载模型：自动检测是 LoRA 适配器还是完整模型"""
    # 检查是否为 LoRA 适配器路径
    adapter_files = ["adapter_config.json", "adapter_model.safetensors"]
    is_lora = any(os.path.exists(os.path.join(model_path, f)) for f in adapter_files)

    tokenizer = AutoTokenizer.from_pretrained(base_model_name if is_lora else model_path)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    if is_lora:
        print("检测到 LoRA 适配器，正在加载基座模型 + 适配器...")
        base_model = AutoModelForCausalLM.from_pretrained(
            base_model_name,
            torch_dtype=torch.bfloat16,
            device_map=device,
        )
        model = PeftModel.from_pretrained(base_model, model_path)
    else:
        print("检测到完整模型，正在加载...")
        model = AutoModelForCausalLM.from_pretrained(
            model_path,
            torch_dtype=torch.bfloat16,
            device_map=device,
        )

    return model, tokenizer


def main():
    args = parse_args()
    os.makedirs(args.output_dir, exist_ok=True)

    # 加载模型
    model, tokenizer = load_model_for_eval(args.model_path, args.base_model, args.device)
    all_results = {}

    # 逐任务评估
    if "perplexity" in args.tasks:
        print("\n===== 困惑度评估 =====")
        all_results["perplexity"] = evaluate_perplexity(model, tokenizer)
        print(f"Perplexity: {all_results['perplexity']['perplexity']:.2f}")

    if "classification" in args.tasks:
        print("\n===== 分类评估 =====")
        all_results["classification"] = evaluate_classification(model, tokenizer)
        print(f"Accuracy: {all_results['classification']['accuracy']:.4f}")

    if "generation" in args.tasks:
        print("\n===== 生成评估 =====")
        test_prompts = [
            "Explain quantum computing in simple terms.",
            "Write a short poem about artificial intelligence.",
        ]
        all_results["generation"] = evaluate_generation(model, tokenizer, test_prompts)

    if "llm_judge" in args.tasks:
        print("\n===== LLM-as-Judge 评估 =====")
        eval_prompts = [
            "What are the benefits of renewable energy?",
        ]
        all_results["llm_judge"] = llm_as_judge_evaluation(model, tokenizer, eval_prompts)

    # 保存结果
    results_path = os.path.join(args.output_dir, "eval_report.json")
    with open(results_path, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2, default=str)

    print(f"\n评估报告已保存至: {results_path}")


if __name__ == "__main__":
    main()
```

**评估指标选择指南：**

| 任务类型 | 主要指标 | 补充指标 | 说明 |
|---------|---------|---------|------|
| 语言建模 | Perplexity | Loss | 越低越好，反映模型对数据的拟合程度 |
| 文本分类 | Accuracy | F1, Precision, Recall | 注意类别不平衡时以 F1 为主 |
| 文本生成 | BLEU, ROUGE | BERTScore, METEOR | BLEU 偏向 n-gram 精确匹配 |
| 对话/指令 | LLM-as-Judge | Human Evaluation | 自动评估的补充，最能反映实际质量 |

困惑度计算中的**滑动窗口**是一个关键细节：当评估序列超出模型的最大上下文长度时，通过 stride 参数控制窗口移动步长，对重叠部分的损失进行掩码，从而准确计算长文本的困惑度。

---

## A.9 超参数搜索实验

超参数搜索是提升模型性能的关键步骤。本实验使用 Optuna 框架对 LoRA 微调的关键超参数进行自动搜索和可视化分析。

```python
"""
实验八：超参数搜索实验
功能：使用 Optuna 对 LoRA 微调进行超参数优化
运行：python experiment_08_hyperparameter_search.py --model_name google/gemma-2b
"""

import os
import json
import argparse
from typing import Dict, List, Tuple

import torch
import numpy as np
import optuna
from optuna.visualization import plot_contour, plot_param_importances
from datasets import load_dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    BitsAndBytesConfig,
    TrainingArguments,
    Trainer,
    DataCollatorWithPadding,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training, TaskType
import evaluate


def parse_args():
    parser = argparse.ArgumentParser(description="Optuna 超参数搜索")
    parser.add_argument("--model_name", type=str, default="google/gemma-2b")
    parser.add_argument("--dataset_name", type=str, default="imdb")
    parser.add_argument("--output_dir", type=str, default="./hpo-results")
    parser.add_argument("--n_trials", type=int, default=20,
                        help="Optuna 尝试次数")
    parser.add_argument("--n_startup_trials", type=int, default=5,
                        help="随机搜索阶段试验数（之后使用 TPE）")
    parser.add_argument("--eval_max_samples", type=int, default=200,
                        help="评估时使用的样本数（加速搜索）")
    parser.add_argument("--max_length", type=int, default=256)
    return parser.parse_args()


def create_model_and_tokenizer(model_name: str, lora_r: int, lora_alpha: int, lora_dropout: float):
    """
    根据超参数创建模型。
    每次 Optuna 试验都会调用此函数，使用不同的超参数组合。
    """
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_quant_type="nf4",
    )

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForSequenceClassification.from_pretrained(
        model_name,
        quantization_config=bnb_config,
        device_map="auto",
        num_labels=2,
        torch_dtype=torch.bfloat16,
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model)

    lora_config = LoraConfig(
        task_type=TaskType.SEQ_CLS,
        r=lora_r,
        lora_alpha=lora_alpha,
        lora_dropout=lora_dropout,
        target_modules=["q_proj", "v_proj"],
        bias="none",
    )
    model = get_peft_model(model, lora_config)
    return model, tokenizer


def objective(trial: optuna.Trial, model_name: str, dataset_name: str,
              max_length: int, eval_max_samples: int) -> float:
    """
    Optuna 目标函数。
    需要最大化/最小化的返回值。这里返回评估准确率（最大化）。

    搜索空间：
    - learning_rate: 对数均匀分布 [1e-5, 5e-4]
    - lora_r: 整数 [2, 32]
    - lora_alpha: 整数 [8, 64]
    - lora_dropout: 连续 [0.0, 0.3]
    - batch_size: 整数 [2, 8]
    """
    # 定义搜索空间
    learning_rate = trial.suggest_float("learning_rate", 1e-5, 5e-4, log=True)
    lora_r = trial.suggest_int("lora_r", 2, 32, step=2)
    lora_alpha = trial.suggest_int("lora_alpha", 8, 64, step=8)
    lora_dropout = trial.suggest_float("lora_dropout", 0.0, 0.3, step=0.05)
    batch_size = trial.suggest_categorical("batch_size", [2, 4, 8])

    # 记录本次试验的超参数
    trial.set_user_attr("lora_r", lora_r)
    trial.set_user_attr("lora_alpha", lora_alpha)
    trial.set_user_attr("lora_dropout", lora_dropout)

    # 创建模型
    model, tokenizer = create_model_and_tokenizer(
        model_name, lora_r, lora_alpha, lora_dropout
    )

    # 加载数据（子采样加速搜索）
    dataset = load_dataset(dataset_name, trust_remote_code=True)

    def tokenize_fn(examples):
        result = tokenizer(examples["text"], truncation=True, max_length=max_length)
        result["labels"] = examples["label"]
        return result

    train_subset = dataset["train"].select(range(min(500, len(dataset["train"]))))
    eval_subset = dataset["test"].select(range(min(eval_max_samples, len(dataset["test"]))))

    train_tokenized = train_subset.map(tokenize_fn, batched=True, remove_columns=train_subset.column_names)
    eval_tokenized = eval_subset.map(tokenize_fn, batched=True, remove_columns=eval_subset.column_names)

    # 训练参数（少量 epoch 加速搜索）
    training_args = TrainingArguments(
        output_dir=f"./hpo-trials/trial_{trial.number}",
        num_train_epochs=2,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size * 2,
        gradient_accumulation_steps=4,
        learning_rate=learning_rate,
        warmup_ratio=0.1,
        logging_steps=50,
        evaluation_strategy="epoch",
        save_strategy="no",
        bf16=torch.cuda.is_bf16_supported(),
        fp16=not torch.cuda.is_bf16_supported(),
        report_to="none",
        remove_unused_columns=False,
    )

    accuracy_metric = evaluate.load("accuracy")

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        predictions = np.argmax(logits, axis=-1)
        return accuracy_metric.compute(predictions=predictions, references=labels)

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_tokenized,
        eval_dataset=eval_tokenized,
        tokenizer=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer=tokenizer),
        compute_metrics=compute_metrics,
    )

    trainer.train()
    eval_results = trainer.evaluate()

    # 记录中间指标
    trial.set_user_attr("eval_loss", eval_results.get("eval_loss", 0))
    trial.set_user_attr("eval_accuracy", eval_results.get("eval_accuracy", 0))

    # 返回准确率（Optuna 默认最大化）
    return eval_results.get("eval_accuracy", 0)


def visualize_results(study: optuna.Study, output_dir: str):
    """
    可视化超参数搜索结果。
    生成参数重要性图和参数-指标关系图。
    """
    try:
        # 参数重要性
        fig_importance = plot_param_importances(study)
        fig_importance.write_image(os.path.join(output_dir, "param_importance.png"))

        # 学习率 vs 准确率
        fig_contour = plot_contour(study, params=["learning_rate", "lora_r"])
        fig_contour.write_image(os.path.join(output_dir, "lr_vs_r.png"))

        print(f"可视化结果已保存至 {output_dir}")
    except Exception as e:
        print(f"可视化生成失败（可能需要安装 plotly kaleido）: {e}")


def main():
    args = parse_args()
    os.makedirs(args.output_dir, exist_ok=True)
    os.makedirs("./hpo-trials", exist_ok=True)

    # 创建 Optuna study（使用 TPE 采样器）
    study = optuna.create_study(
        direction="maximize",  # 最大化准确率
        sampler=optuna.samplers.TPESampler(
            n_startup_trials=args.n_startup_trials,
            multivariate=True,
        ),
        pruner=optuna.pruners.MedianPruner(
            n_startup_trials=5,
            n_warmup_steps=1,
        ),
    )

    # 运行搜索
    study.optimize(
        lambda trial: objective(
            trial, args.model_name, args.dataset_name,
            args.max_length, args.eval_max_samples,
        ),
        n_trials=args.n_trials,
        show_progress_bar=True,
    )

    # 输出最佳结果
    best_trial = study.best_trial
    print(f"\n===== 超参数搜索完成 =====")
    print(f"最佳试验编号: {best_trial.number}")
    print(f"最佳准确率: {best_trial.value:.4f}")
    print(f"最佳超参数:")
    for key, value in best_trial.params.items():
        print(f"  {key}: {value}")

    # 保存搜索历史
    trials_data = []
    for trial in study.trials:
        trials_data.append({
            "number": trial.number,
            "value": trial.value,
            "params": trial.params,
            "state": str(trial.state),
        })

    with open(os.path.join(args.output_dir, "hpo_results.json"), "w") as f:
        json.dump({
            "best_params": best_trial.params,
            "best_value": best_trial.value,
            "n_trials": args.n_trials,
            "trials": trials_data,
        }, f, indent=2)

    # 可视化
    visualize_results(study, args.output_dir)

    # 清理临时文件
    import shutil
    if os.path.exists("./hpo-trials"):
        shutil.rmtree("./hpo-trials")

    print(f"\n搜索结果已保存至 {args.output_dir}")


if __name__ == "__main__":
    main()
```

**Optuna 搜索策略说明：**

本实验使用 TPE（Tree-structured Parzen Estimator）采样器，其工作流程如下：

1. **随机探索阶段**（前 `n_startup_trials` 次试验）：在搜索空间中均匀采样，建立初始模型
2. **贝叶斯优化阶段**：根据历史结果构建两个密度函数——表现好的参数分布和表现差的参数分布，通过最大化两者的比值来选择下一组参数
3. **早停剪枝**（MedianPruner）：如果在中间 epoch 的表现低于历史中位数，提前终止该试验，避免无效计算

**典型搜索空间及推荐范围：**

| 参数 | 范围 | 搜索类型 | 对效果的影响 |
|------|------|---------|-------------|
| learning_rate | [1e-5, 5e-4] | 对数均匀 | 最重要，决定收敛速度和质量 |
| lora_r | [2, 32] (step=2) | 整数 | 越大表达能力越强，但显存增加 |
| lora_alpha | [8, 64] (step=8) | 整数 | 与 r 配合，通常 alpha = 2r |
| lora_dropout | [0.0, 0.3] | 连续 | 正则化，小数据集需要较大 dropout |
| batch_size | [2, 4, 8] | 分类 | 影响梯度估计的稳定性 |

**运行命令：**

```bash
# 20 次搜索试验
python experiment_08_hyperparameter_search.py \
  --model_name google/gemma-2b \
  --n_trials 20

# 快速验证（5 次试验）
python experiment_08_hyperparameter_search.py \
  --model_name google/gemma-2b \
  --n_trials 5 \
  --eval_max_samples 50
```

---

## 总结

本附录提供了七个完整的微调实验代码，覆盖了从参数高效微调（LoRA、QLoRA、Prompt Tuning）到全参数微调、从有监督微调到偏好对齐（DPO）、从单任务到多任务训练、从训练到评估的完整流程。每个实验都设计为可直接复制运行的独立脚本，配有详细的中文注释和说明。

**实验选择建议：**

- **资源有限（< 16GB 显存）**：实验一（LoRA）和实验二（QLoRA）
- **需要最高性能**：实验三（DPO 对齐）+ 实验四（全参数微调）
- **需要多任务支持**：实验六（多任务微调）
- **研究探索**：实验五（Prompt Tuning 对比）和实验八（超参数搜索）
- **上生产环境前**：实验七（评估流水线）

所有代码遵循 Hugging Face 生态系统的最佳实践，可作为实际项目的基础模板直接使用。
