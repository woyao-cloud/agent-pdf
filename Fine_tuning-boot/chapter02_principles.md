# 第 2 章 微调的原理与基础

## 2.1 Transformer 架构回顾（微调相关部分）

理解微调的原理，首先需要回顾 Transformer 架构中与微调最相关的核心组件。虽然我们不从头讲解 Transformer，但以下概念对理解微调至关重要：

**自注意力机制（Self-Attention）**：自注意力是 Transformer 的核心操作，它允许序列中的每个位置关注所有其他位置。在微调过程中，自注意力层的权重调整直接影响模型如何在不同 token 之间建立关联。

```python
# 简化的自注意力计算
def self_attention(Q, K, V, mask=None):
    # Q, K, V: [batch_size, seq_len, d_model]
    scores = Q @ K.transpose(-2, -1) / (d_model ** 0.5)
    if mask is not None:
        scores = scores.masked_fill(mask == 0, -1e9)
    attention_weights = softmax(scores, dim=-1)
    output = attention_weights @ V
    return output
```

**残差连接（Residual Connections）与层归一化（Layer Normalization）**：残差连接允许梯度直接流过深层网络，使得深层 Transformer 的训练成为可能。在微调中，残差连接的存在意味着即使只更新顶层参数，底层的信息仍然可以被有效传递。

**前馈神经网络（Feed-Forward Network, FFN）**：每个 Transformer 层中的 FFN 是一个两层的 MLP。研究表明，FFN 层在存储事实性知识（factual knowledge）中扮演着关键角色。微调时 FFN 权重的变化与知识注入的效果密切相关。

**隐藏状态表示（Hidden State Representations）**：Transformer 每一层都输出一组隐藏状态向量，这些向量编码了输入序列在不同抽象层次上的特征。微调通过调整这些表示的生成方式来适应目标任务。

## 2.2 预训练如何创造通用知识

预训练阶段，模型通过在海量文本上执行自监督学习（self-supervised learning）任务来获得语言理解能力。对自回归模型（GPT 系列）而言，预训练任务是因果语言建模（causal language modeling, CLM）：给定前文 token，预测下一个 token。

从信息论的角度，预训练可以理解为模型在学习一个关于自然语言的高维概率分布 $P(x_1, x_2, ..., x_L)$。这个分布编码了语法规则、语义关系、事实知识、推理模式等丰富的语言知识。

预训练的关键特性包括：

**规模带来的质变**：随着模型参数和训练数据的增加，模型展现出涌现能力（emergent abilities）——即在小模型中不存在、只有在大模型中才会出现的能力。这些能力包括上下文学习（in-context learning）、思维链推理（chain-of-thought reasoning）等。

**分布式表示（Distributed Representation）**：语言知识以分布式的方式编码在整个模型的参数空间中，而非存储在特定的位置。这意味着微调时对部分参数的调整可以产生全局性的行为变化。

## 2.3 微调如何适配表示

微调的核心机制可以理解为：**在预训练学到的通用表示空间中，找到适用于目标任务的方向和尺度**。

为什么小学习率（learning rate）有效？预训练模型已经处在一个损失景观（loss landscape）中的局部最小值附近。微调不需要大幅移动参数，而是进行精细的局部调整。使用较小的学习率（通常为 $10^{-5}$ 到 $10^{-4}$ 量级）是为了在保持预训练知识的同时，将表示向目标任务方向偏移。

从优化角度看，微调的更新规则可以表示为：

$$\theta_{t+1} = \theta_t - \eta \nabla_\theta \mathcal{L}_{task}(\theta_t)$$

其中 $\eta$ 是学习率，$\nabla_\theta \mathcal{L}_{task}$ 是目标任务损失对参数的梯度。由于 $\eta$ 很小，每次更新的步长有限，参数在参数空间中移动的距离被约束在预训练初始点附近。

这意味着微调后的模型参数可以近似表示为：

$$\theta_{ft} \approx \theta_{pt} + \Delta\theta$$

其中 $\theta_{pt}$ 是预训练参数，$\Delta\theta$ 是微调带来的变化量。参数高效微调方法（如 LoRA）的核心洞察在于，这个 $\Delta\theta$ 具有低秩（low-rank）结构，可以用低秩矩阵分解来近似。

## 2.4 微调的损失函数

不同的模型架构使用不同的预训练目标，微调时也沿用相应的损失函数。

**因果语言建模损失（Causal LM Loss）**：用于自回归解码器模型（如 GPT、Llama、Qwen）。损失函数是预测 token 的交叉熵损失（cross-entropy loss）：

$$\mathcal{L}_{CLM} = -\frac{1}{L} \sum_{t=1}^L \log P(x_t | x_{<t}; \theta)$$

其中 $x_t$ 是第 $t$ 个位置的 token，$x_{<t}$ 是之前的所有 token。在微调中，每个训练样本通常包含输入和期望输出，损失只在输出部分计算。

```python
# 因果 LM 微调的损失计算
def compute_causal_lm_loss(model, input_ids, labels):
    outputs = model(input_ids=input_ids)
    logits = outputs.logits  # [batch, seq_len, vocab_size]
    
    # 只对标签部分计算损失（忽略输入部分的损失）
    shift_logits = logits[..., :-1, :].contiguous()
    shift_labels = labels[..., 1:].contiguous()
    
    loss_fct = nn.CrossEntropyLoss()
    loss = loss_fct(
        shift_logits.view(-1, shift_logits.size(-1)),
        shift_labels.view(-1)
    )
    return loss
```

**掩码语言建模损失（Masked LM Loss）**：用于编码器模型（如 BERT、RoBERTa）。损失函数是预测被掩码 token 的交叉熵损失：

$$\mathcal{L}_{MLM} = -\frac{1}{|\mathcal{M}|} \sum_{i \in \mathcal{M}} \log P(x_i | x_{\backslash \mathcal{M}}; \theta)$$

其中 $\mathcal{M}$ 是被掩码的位置集合，$x_{\backslash \mathcal{M}}$ 是未被掩码的 token。

**序列到序列损失（Seq2Seq Loss）**：用于编码器-解码器模型（如 T5、BART）。编码器处理输入序列，解码器以自回归方式生成输出序列。损失函数与因果 LM 损失类似。

## 2.5 微调的损失景观

损失景观（loss landscape）描述了模型参数与损失函数值之间的关系。理解微调过程中的损失景观有助于把握微调的本质。

在预训练完成后，模型参数 $\theta_{pt}$ 位于一个比较平坦的局部最小值区域。平坦最小值（flat minima）意味着参数的小幅扰动不会导致损失的大幅增加，这种性质使得模型具有良好的泛化能力。

微调将损失函数从预训练损失切换为任务损失，这相当于在参数空间中引入了一个新的损失景观。由于预训练模型已经具备了良好的初始化，新的任务损失景观在 $\theta_{pt}$ 附近通常也是平滑的。

研究表明，微调过程中模型参数的变化主要发生在以下几个层面：

**表示层级的重新加权（Representation Re-weighting）**：模型已经具备了完成任务所需的所有基本能力，微调的作用是"重新加权"这些能力——增强任务相关的能力，抑制不相关的能力。

**特征空间的重定向（Feature Space Redirection）**：对于预训练中没有明确优化的能力，微调会在特征空间中创建新的方向来编码任务特定的模式。

**决策边界的调整（Decision Boundary Adjustment）**：对于分类任务，微调本质上是在预训练学到的特征空间上调整决策边界的位置和形状。

## 2.6 各层参数的变化程度

微调过程中，模型不同层级的参数变化程度并不均匀。理解这种不均匀性对于选择微调策略至关重要。

**高层（靠近输出层）**：变化最大。这些层的表示更接近具体任务，因此需要更多调整以适应目标任务。研究表明，在大多数微调场景中，最后几层的参数变化幅度是前几层的 10-100 倍。

**中间层**：变化适中。中间层编码了更高层次的语义和句法特征，这些特征在多数 NLP 任务中具有通用性，因此需要的调整较少。

**底层（靠近输入层）**：变化最小。底层主要学习词法、语法等基础语言特征，这些特征在不同任务中具有高度通用性。冻结底层参数通常不会显著影响微调性能。

```python
# 分析各层参数更新幅度的示例代码
def analyze_layer_updates(model_before, model_after):
    layer_updates = {}
    for (name_before, param_before), (name_after, param_after) in \
        zip(model_before.named_parameters(), model_after.named_parameters()):
        
        update_magnitude = torch.norm(param_after - param_before).item()
        layer_name = '.'.join(name_before.split('.')[:3])
        
        if layer_name not in layer_updates:
            layer_updates[layer_name] = []
        layer_updates[layer_name].append(update_magnitude)
    
    for layer, updates in layer_updates.items():
        avg_update = sum(updates) / len(updates)
        print(f"{layer}: avg update magnitude = {avg_update:.6f}")
```

这一观察结果直接支持了部分微调策略的有效性：通过只微调顶层或特定层，可以在显著降低计算成本的同时保持大部分微调性能。

## 2.7 灾难性遗忘

灾难性遗忘（Catastrophic Forgetting, CF）是指模型在学习新任务时，丢失了之前学到的知识和能力。在微调语境中，灾难性遗忘表现为模型在微调后，其在通用任务上的性能显著下降。

灾难性遗忘的发生机制可以理解为：微调数据分布与预训练数据分布之间存在差异，模型在优化任务损失的驱动下，从预训练参数空间中偏离。当偏离过大时，模型覆盖的预训练知识区域被"覆盖"。

影响灾难性遗忘严重程度的关键因素包括：

**微调数据量**。数据量越大，遗忘越严重。这是因为更多的更新步骤使模型偏离预训练参数更远。当数据量很小（数百到数千条）时，遗忘通常不显著。

**学习率**。学习率越大，每一步的更新幅度越大，模型偏离预训练参数的速度越快，遗忘越严重。

**模型规模**。较大的模型通常具有更好的抗遗忘能力。这可能是因为大模型的参数空间更大，有更多的"容量"同时容纳预训练知识和任务特定知识。

**任务差异度**。微调任务与预训练任务的差异越大（如将通用对话模型微调为代码生成模型），遗忘越严重。

缓解灾难性遗忘的常用策略包括：

1. **使用较小的学习率**，限制参数更新的幅度。
2. **混合微调（Mix-tuning）**：在任务数据中混合一部分预训练数据，同时优化任务损失和预训练损失。
3. **弹性权重巩固（Elastic Weight Consolidation, EWC）**：对重要参数施加更大的正则化惩罚，限制其变化。
4. **参数高效微调**：通过限制可训练参数的数量（如 LoRA 的低秩适配器），从结构上限制模型的偏离能力。

## 2.8 微调中的过拟合问题

微调通常在相对较小的数据集上进行，这带来了过拟合（overfitting）的风险。过拟合表现为模型在训练集上表现良好，但在验证集和测试集上表现欠佳。

微调中过拟合的特殊性在于：**模型在预训练阶段已经学会了强大的通用表示，微调时数据量虽小，但模型容量（capacity）却很大。这种"大模型、小数据"的组合天然容易过拟合。**

微调中的过拟合通常呈现以下特征：

**训练损失快速下降**。由于预训练模型的初始化质量很高，微调初始阶段损失就会快速下降，这可能导致过早地记住训练样本中的噪声。

**验证损失先降后升**。验证损失在初期下降，然后开始上升，这是过拟合的典型信号。

**任务性能先升后降**。任务指标（如准确率、BLEU 分数）在验证集上达到峰值后开始下降。

应对微调过拟合的策略包括：

- **早停（Early Stopping）**：监控验证损失，当验证损失不再下降时停止训练。这是最简单有效的方法。
- **数据增强（Data Augmentation）**：通过同义词替换、回译（back-translation）、随机掩码等方式扩充训练数据。
- **正则化（Regularization）**：使用权重衰减（weight decay）、dropout 等技术减少过拟合。
- **LoRA 秩的选择**：较小的秩 $r$ 限制了适配器的表达能力，天然具有正则化效果。
- **对抗训练（Adversarial Training）**：在输入或 embedding 层面添加扰动，提高模型的鲁棒性。

```python
# 早停的实现示例
class EarlyStopping:
    def __init__(self, patience=3, min_delta=0.0):
        self.patience = patience
        self.min_delta = min_delta
        self.best_loss = float('inf')
        self.counter = 0
        
    def step(self, val_loss):
        if val_loss < self.best_loss - self.min_delta:
            self.best_loss = val_loss
            self.counter = 0
            return False  # 继续训练
        else:
            self.counter += 1
            if self.counter >= self.patience:
                return True  # 停止训练
            return False
```

## 2.9 参数高效微调的理论基础

参数高效微调（PEFT）方法之所以有效，其理论基础可以归纳为以下几个关键洞察：

### 本征维度（Intrinsic Dimension）

Aghajanyan 等人（2020）的研究表明，预训练语言模型的本征维度——即完成任务所需的最小参数空间维度——远低于模型的实际参数数量。这意味着，虽然在表面上模型有数十亿参数，但完成特定任务只需要在远低维的子空间中进行优化。

这一发现是 LoRA 等方法的直接理论依据。如果任务相关的变化本质上发生在低维子空间中，那么使用低秩矩阵来参数化这些变化就是合理的。

### 低秩假设（Low-Rank Hypothesis）

LoRA（Hu et al., 2021）的核心假设是：预训练模型权重的更新量 $\Delta W$ 在微调过程中具有低秩性质。形式化地：

$$W_{ft} = W_{pt} + \Delta W = W_{pt} + BA$$

其中 $B \in \mathbb{R}^{d \times r}$，$A \in \mathbb{R}^{r \times k}$，且 $r \ll \min(d, k)$。这样，可训练参数从 $d \times k$ 减少到 $r \times (d + k)$，缩减了几个数量级。

```python
# LoRA 前向传播的概念性实现
class LoRALayer(nn.Module):
    def __init__(self, original_weight, r=8, alpha=16):
        super().__init__()
        self.original_weight = original_weight  # 冻结的预训练权重
        d, k = original_weight.shape
        # 低秩分解矩阵
        self.lora_A = nn.Parameter(torch.randn(r, k) * 0.01)
        self.lora_B = nn.Parameter(torch.zeros(d, r))
        self.scaling = alpha / r
        
    def forward(self, x):
        # 原始路径（冻结）+ 低秩适配路径（可训练）
        return x @ self.original_weight.T + \
               (x @ self.lora_A.T @ self.lora_B.T) * self.scaling
```

### 优化几何（Optimization Geometry）

从优化几何的角度看，全参数微调在高维参数空间中搜索最优解，而 PEFT 方法将搜索空间限制在一个低维流形（low-dimensional manifold）上。这个低维流形包含了大部分任务相关的优化方向，同时天然过滤掉了与任务无关的噪声方向。

### 表征相似性（Representation Similarity）

研究发现，经过 PEFT 微调的模型与全参数微调的模型在隐藏层表示上具有高度相似性。这意味着 PEFT 方法确实找到了与全参数微调相似的优化方向，只是以更紧凑的形式表示。

## 本章小结

本章深入探讨了微调的理论基础。我们从 Transformer 架构中与微调相关的核心组件出发，分析了预训练如何创造通用知识以及微调如何在此基础上进行适配。我们详细讨论了微调的损失函数、损失景观、各层参数变化规律，以及灾难性遗忘和过拟合这两个关键挑战。最后，我们从理论层面解释了参数高效微调方法为何有效。

理解这些原理将帮助你在实际微调任务中做出更明智的决策——如何选择学习率、哪些层需要微调、如何防止过拟合和遗忘、以及何时应该选择 PEFT 方法。

下一章将进入实践环节，讨论微调数据的准备和处理。
