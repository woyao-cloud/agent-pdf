# 第4章 参数高效微调

## 4.1 PEFT 概述

参数高效微调（Parameter-Efficient Fine-Tuning, PEFT）是一类在微调过程中仅更新**极少量额外参数**的方法，而预训练模型的绝大部分参数保持冻结（Frozen）。PEFT 的核心思想是：预训练模型已经学到了通用的语言表示能力，下游任务只需在该表示空间中找到合适的"方向"即可，无需重新学习整个表示空间。

PEFT 的主要优势：
- **显存需求低**：无需存储完整梯度和优化器状态
- **训练速度快**：仅少量参数参与反向传播
- **灾难性遗忘风险小**：基础模型参数不变
- **部署灵活**：一份基础模型可挂载多个不同的适配器
- **数据效率高**：只需数百至数千样本即可取得良好效果

## 4.2 LoRA（Low-Rank Adaptation）

### 4.2.1 数学原理

LoRA 基于一个关键观察：预训练模型在适应下游任务时，其权重更新的**本征秩（Intrinsic Rank）很低**。这意味着权重更新矩阵 $\Delta W$ 可以用两个低秩矩阵的乘积来近似。

对于预训练权重矩阵 $W_0 \in \mathbb{R}^{d \times k}$，LoRA 将其更新约束为：

$$W = W_0 + \Delta W = W_0 + AB$$

其中 $A \in \mathbb{R}^{d \times r}$，$B \in \mathbb{R}^{r \times k}$，且 $r \ll \min(d, k)$。在训练过程中，$W_0$ 被冻结，仅 $A$ 和 $B$ 参与梯度更新。

前向传播变为：

$$h = W_0 x + \Delta W x = W_0 x + ABx$$

### 4.2.2 秩的选择（Rank Selection）

秩 $r$ 是 LoRA 最重要的超参数，直接影响表达能力与效率的平衡：

| 秩 $r$ | 可训练参数占比 | 代表性任务 | 效果 |
|-------|--------------|-----------|------|
| 1-4 | 约 0.01%-0.05% | 简单分类任务 | 可能欠拟合 |
| 8-16 | 约 0.05%-0.2% | 通用对话、指令遵循 | 推荐默认选择 |
| 32-64 | 约 0.2%-1% | 复杂生成、领域适配 | 高资源场景 |
| 128+ | 约 1%+ | 接近全参微调 | 收益递减 |

实践中 $r=8$ 或 $r=16$ 是大多数任务的安全起点。研究表明，更大的 $r$ 并不总是带来更好的性能，因为低秩约束本身起到正则化（Regularization）作用。

### 4.2.3 应用位置

LoRA 可以应用于 Transformer 的不同模块：

- **注意力权重（Attention Weights）**：$W_q, W_k, W_v, W_o$ —— 最关键也是效果最明显的目标
- **前馈网络（FFN）**：$W_{up}, W_{down}, W_{gate}$ —— 在知识密集型任务中更重要
- **嵌入层（Embedding）**：通常不应用，参数量太大

**经验规则**：先对 Query 和 Value 投影使用 LoRA，如果效果不足再扩展到 Output 和 FFN 层。

### 4.2.4 Alpha 与 Scaling

LoRA 的缩放因子（Scaling Factor）控制低秩更新的幅度：

$$h = W_0 x + \frac{\alpha}{r} \cdot ABx$$

其中 $\alpha$ 是 LoRA alpha 超参数。$\frac{\alpha}{r}$ 控制更新幅度：

- $\alpha = r$：缩放因子为 1，初始化更新幅度适中
- $\alpha = 2r$（或更高）：更强的更新信号，适合需要大调整的任务
- $\alpha$ 与 $r$ 解耦：调整 $r$ 时保持 $\alpha$ 固定，缩放因子 $\alpha/r$ 会相应变化

```python
from peft import LoraConfig, get_peft_model

lora_config = LoraConfig(
    r=16,               # 低秩矩阵的秩
    lora_alpha=32,      # 缩放因子（实际缩放 = alpha / r = 2）
    target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
    lora_dropout=0.1,   # 防止过拟合
    bias="none",        # 是否训练偏置
    task_type="CAUSAL_LM",
)

model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-2-7b-hf")
peft_model = get_peft_model(model, lora_config)
peft_model.print_trainable_parameters()
# 输出: trainable params: 4,194,304 || all params: 6,738,415,616 || trainable%: 0.0622
```

### 4.2.5 LoRA 变体

**DoRA（Weight-Decomposed Low-Rank Adaptation）**：将权重分解为幅度（Magnitude）和方向（Direction）两个分量，仅在方向分量上应用低秩更新。DoRA 在多个基准测试上表现优于标准 LoRA，尤其在小样本场景中。

$$W = m \cdot \frac{V}{\|V\|} \quad \text{其中} \quad V = W_0 + AB$$

**rsLoRA（Rank-Stabilized LoRA）**：修正了 LoRA 的缩放因子，使其在不同秩下保持稳定的学习动态。rsLoRA 使用 $\frac{\alpha}{\sqrt{r}}$ 替代 $\frac{\alpha}{r}$。

**LoRA+**：对 $A$ 和 $B$ 矩阵使用不同的学习率。由于 $B$ 的初始化接近零，其梯度远小于 $A$，因此给 $B$ 设置更大的学习率可以加速收敛。

## 4.3 QLoRA

QLoRA 将量化（Quantization）与 LoRA 结合，实现了在单张 24GB GPU 上微调 65B 模型。

### 4.3.1 核心技术

**4-bit NormalFloat（NF4）**：一种信息论最优的数据类型，假设权重服从正态分布。NF4 将正态分布的分位数映射到 4-bit 表示，比均匀量化更好地保留了权重信息。

**双重量化（Double Quantization）**：对量化常数（Scale Factor）进行二次量化，将每个参数的额外开销从 FP32 降低到 8-bit。对于 65B 模型，双重量化额外节省约 0.5GB 显存。

**分页优化器（Paged Optimizers）**：利用 CPU 内存和 GPU 显存之间的统一内存管理，当 GPU 显存不足时将优化器状态溢出到 CPU 内存。

### 4.3.2 显存节省对比

| 组件 | 全精度（FP16） | QLoRA（NF4 + LoRA） | 节省倍数 |
|------|---------------|--------------------|---------|
| 模型参数（7B） | 14 GB | 3.5 GB（NF4） | 4× |
| LoRA 参数 | 0 | ~80 MB | — |
| 梯度（LoRA） | 0 | ~80 MB | — |
| 优化器状态 | 0 | ~160 MB | — |
| **总计** | 14 GB+ | ~4 GB | 约 3.5× |

```python
from transformers import BitsAndBytesConfig

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_use_double_quant=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
)

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-2-7b-hf",
    quantization_config=bnb_config,
    device_map="auto",
)

# 配置 LoRA（基于量化模型）
lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
)

peft_model = get_peft_model(model, lora_config)
```

### 4.3.3 QLoRA 性能

在多项基准测试中，QLoRA（NF4 + 16-rank LoRA）达到了接近全参微调的性能。QLoRA 论文的实验表明，在 GSM8K、MMLU 等基准上，4-bit QLoRA 与 16-bit 全参微调的性能差距在 1% 以内。

## 4.4 Adapter 方法

Adapter 在 Transformer 层的子层之后插入**瓶颈结构（Bottleneck）**的神经网络模块：

$$\text{Adapter}(x) = x + f_{\text{up}}\left(\sigma\left(f_{\text{down}}(x)\right)\right)$$

其中 $f_{\text{down}}: \mathbb{R}^{d} \to \mathbb{R}^{r}$ 是下投影（Down-projection），$f_{\text{up}}: \mathbb{R}^{r} \to \mathbb{R}^{d}$ 是上投影（Up-projection），$\sigma$ 是非线性激活函数。

- **串行 Adapter（Series Adapter）**：插入在 Attention 和 FFN 子层之后（原始方法）
- **并行 Adapter（Parallel Adapter）**：与 Attention 或 FFN 并行计算，效率更高

## 4.5 Prefix Tuning

Prefix Tuning 在 Transformer 的每一层前添加一组可学习的虚拟 Token（Virtual Tokens），将输入序列扩展为：

$$z = [\text{PREFIX}; x]$$

其中 $\text{PREFIX} \in \mathbb{R}^{l_p \times d}$ 是可学习参数，$l_p$ 是前缀长度。前缀通过独立的 MLP（重参数化编码，Reparameterization Encoder）进行初始化，训练时直接优化前缀参数。

```python
from peft import PrefixTuningConfig

prefix_config = PrefixTuningConfig(
    task_type="CAUSAL_LM",
    num_virtual_tokens=20,
    encoder_hidden_size=128,
    prefix_projection=True,  # 使用重参数化编码
)

peft_model = get_peft_model(model, prefix_config)
```

- 优点：参数量极小（通常数十万）
- 缺点：批处理效率降低（前缀改变了序列长度）；长文本任务效果不如 LoRA

## 4.6 Prompt Tuning

Prompt Tuning 是 Prefix Tuning 的简化版本，仅在嵌入层（Embedding Layer）添加可学习的 Soft Prompt Token：

$$\text{input} = [\text{SOFT_PROMPT}_1, \text{SOFT_PROMPT}_2, ..., \text{SOFT_PROMPT}_k, \text{original\_tokens}]$$

与 Prefix Tuning 的关键区别：Prompt Tuning 只在输入层添加虚拟 Token，不修改每层的隐藏状态；而 Prefix Tuning 修改所有 Transformer 层的输入。

## 4.7 P-Tuning v1/v2

**P-Tuning v1**：使用 LSTM 或 MLP 作为编码器生成连续提示的嵌入。编码器捕捉虚拟 Token 之间的依赖关系。

**P-Tuning v2**：将 Prefix Tuning 和 P-Tuning 的思想统一，在所有 Transformer 层添加可学习的提示嵌入。P-Tuning v2 在每个层前添加任务特定的提示，并在这些提示上加入可选的层间共享机制。v2 版本在 NLU 和 NLG 任务上均表现良好，缩小了与全参微调的差距。

## 4.8 IA3

IA3（Infused Adapter by Inhibiting and Amplifying Inner Activations）通过学习三个向量 $l_W, l_K, l_V$ 来重新缩放注意力层和 FFN 层的激活值：

$$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d}}\right)(l_V \odot V)$$

IA3 的参数量极低——仅有三个向量，维度等于隐藏层维度。这使得 IA3 成为**参数效率最高**的 PEFT 方法之一，适合资源极端受限的场景。

## 4.9 PEFT 方法对比

| 方法 | 可训练参数（7B 模型） | 显存（训练） | 性能（相对全参） | 推理开销 | 适用场景 |
|------|---------------------|------------|----------------|---------|---------|
| **Full FT** | 7B（100%） | ~100 GB | 100% | 无 | 高资源、最大性能 |
| **LoRA** | 4-40M（0.06-0.6%） | ~20 GB | 95-99% | 可合并 | 通用推荐 |
| **QLoRA** | 4-40M | ~6-10 GB | 93-98% | 需反量化 | 单卡场景 |
| **DoRA** | 同 LoRA | 同 LoRA | 96-99.5% | 可合并 | 追求更好性能 |
| **Prefix Tuning** | 0.2-2M | ~16 GB | 90-95% | 增加序列长度 | 生成任务 |
| **Prompt Tuning** | 0.01-0.1M | ~15 GB | 85-93% | 增加输入长度 | 简单分类 |
| **IA3** | 0.01M | ~15 GB | 85-95% | 可合并 | 极端低资源 |
| **Adapter** | 1-10M | ~18 GB | 90-97% | 额外计算 | 多层适配 |

## 4.10 LoRA 权重合并

训练完成后，LoRA 权重可以与基础模型合并，消除推理时的额外计算：

```python
from peft import PeftModel

# 加载基础模型和 LoRA 适配器
base_model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-2-7b-hf")
peft_model = PeftModel.from_pretrained(base_model, "./lora-checkpoint/final")

# 合并权重到基础模型
merged_model = peft_model.merge_and_unload()

# 保存合并后的模型
merged_model.save_pretrained("./merged-llama2-7b-ft-smaller")
tokenizer.save_pretrained("./merged-llama2-7b-ft-smaller")

# 合并后的模型推理速度与原始模型一致
```

**合并的适用场景**：
- 确定不再需要切换适配器
- 对推理速度敏感的生产环境
- 部署到不支持 LoRA 的推理框架

**不合并的场景**：
- 需要同时服务多个任务（多适配器路由）
- 持续微调和实验迭代中
- 基础模型有更新时（只需重新合并）

## 4.11 本章小结

PEFT 方法通过在冻结的基础模型上引入少量可训练参数，实现了接近全参微调的性能，同时大幅降低了显存和计算需求。LoRA 因其简单的实现、稳定的性能和可合并的特性，成为目前最广泛使用的 PEFT 方法。QLoRA 通过 4-bit 量化进一步降低了训练门槛，使得消费级 GPU 上微调数十亿参数模型成为可能。在选择 PEFT 方法时，应综合考虑可训练参数量、目标性能、硬件约束和部署场景。对于大多数实际应用，LoRA（$r=8\sim16$）是最佳起点，如有更高需求可升级到 DoRA 或全参微调。
