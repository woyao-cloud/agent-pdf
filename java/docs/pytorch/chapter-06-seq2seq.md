# 第6章 序列到序列与机器翻译

## 本章导读

你每天都可能在使用机器翻译——打开 Google 翻译、在微信里"翻译英文"、甚至用 DeepL 写邮件。但你有没有想过：**为什么翻译后的句子语法正确、语序恰当？**

假设你要翻译 "I love this movie" 为中文：

```
输入（英文）: "I love this movie"  → 4 个词
输出（中文）: "我喜欢这部电影"    → 5 个词

问题：
  1. 输入和输出长度不一样（4 vs 5）
  2. 输入和输出的词顺序不一样（"this movie"→"这部电影"）
  3. "love" 翻译成"喜欢"还是"爱"取决于上下文
```

Seq2Seq（序列到序列）模型就是解决这个问题的标准框架。核心思路是：**先用编码器把输入"理解"成一个向量，再用解码器从这个向量"生成"输出。**

```
编码器：像你读一篇文章——从头到尾看完，形成"大意"
解码器：像你写出中文摘要——从"大意"开始，一个词一个词地写
Attention：像你在写摘要时回头看看原文的某一段——确认理解正确
```

---

## 6.1 实现原理：Encoder-Decoder + Attention

### 整体架构

```
"I love this movie" → 编码器(理解) → 解码器(生成) → "我喜欢这部电影"

Attention 在生成"喜欢"时，重点"看"了 "love" 位置
→ 权重: love=0.85, I=0.05, this=0.05, movie=0.05
```

### Transformer 的两个核心创新

**创新 1：自注意力（Self-Attention）**
每个词看一遍所有词，自己决定"哪些词对我来说更重要"。Transformer 在一次计算中帮每个词找到它的"重要邻居"。

**创新 2：位置编码（Positional Encoding）**
Transformer 不像 RNN 按顺序读词，它一次性看到所有词。如果不告诉它"位置"，
"I love you" 和 "you love I" 对它没有区别！
位置编码用 sin/cos 给每个位置生成一个独特的信号，越近的位置信号越相似。

---

## 6.2 完整代码实现

```python
import torch
import torch.nn as nn
import math

# ===== 位置编码 =====
class PositionalEncoding(nn.Module):
    def __init__(self, d_model, max_len=5000):
        super().__init__()
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2) * -(math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        self.register_buffer('pe', pe)

    def forward(self, x):
        return x + self.pe[:x.size(1)]

# ===== 编码器 =====
class TransformerEncoder(nn.Module):
    def __init__(self, vocab_size, d_model=256, nhead=4, num_layers=3):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, d_model)
        self.pos_encoder = PositionalEncoding(d_model)
        encoder_layer = nn.TransformerEncoderLayer(d_model, nhead, batch_first=True)
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers)

    def forward(self, x):
        x = self.embedding(x) * math.sqrt(self.embedding.embedding_dim)
        x = self.pos_encoder(x)
        return self.transformer(x)

# ===== 解码器 =====
class TransformerDecoder(nn.Module):
    def __init__(self, vocab_size, d_model=256, nhead=4, num_layers=3):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, d_model)
        self.pos_encoder = PositionalEncoding(d_model)
        decoder_layer = nn.TransformerDecoderLayer(d_model, nhead, batch_first=True)
        self.transformer = nn.TransformerDecoder(decoder_layer, num_layers)
        self.fc_out = nn.Linear(d_model, vocab_size)

    def forward(self, x, encoder_output):
        x = self.embedding(x) * math.sqrt(self.embedding.embedding_dim)
        x = self.pos_encoder(x)
        x = self.transformer(x, encoder_output)
        return self.fc_out(x)

# ===== 完整模型 =====
model = nn.Module()
model.encoder = TransformerEncoder(vocab_size=10000)
model.decoder = TransformerDecoder(vocab_size=10000)
print(f"参数量: {sum(p.numel() for p in model.parameters()):,}")
```

### Teacher Forcing——训练时"不走弯路"

```python
# Teacher Forcing：每一步都告诉模型"正确的上一步是什么"
# 闭卷考试 vs 开卷考试

tgt_input = tgt_batch[:, :-1]   # 去掉最后一个词（解码器输入）
tgt_output = tgt_batch[:, 1:]   # 去掉第一个词（目标输出）
logits = model(src_batch, tgt_input)
loss = criterion(logits.reshape(-1, logits.size(-1)), tgt_output.reshape(-1))
```

---

## 6.3 潜在风险

| 风险 | 原因 | 方案 |
|------|------|------|
| Beam Search 慢 | 保留多个候选 | beam_width=3（推荐平衡点） |
| OOV 未登录词 | 词表太小 | BPE 子词分词 |
| 训练慢 | 序列太长 | 梯度累积 + 混合精度 |
| 过拟合 | 数据少 | 标签平滑 + Dropout |

---

## 本章总结

| 概念 | 一句话 |
|------|--------|
| Encoder | 把原文"理解"成向量 |
| Decoder | 从向量"生成"目标语言 |
| Attention | 生成每个词时回头看原文重点 |
| Positional Encoding | sin/cos 给词标记位置 |
| Teacher Forcing | 训练时给正确答案，不让错误累积 |
| Beam Search | 保留多个候选，最后选最好的 |
| BPE | 把词拆子词，解决未登录词 |