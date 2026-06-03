# 第5章 序列到序列与机器翻译（Seq2Seq）

## 本章导读

机器翻译是 Seq2Seq（Sequence-to-Sequence）模型最经典的应用。它的任务很直观：输入一种语言的句子，输出另一种语言的句子。

```
英中翻译示例：

  输入（英文）: "I love this movie"
  输出（中文）: "我喜欢这部电影"

  核心挑战：输入和输出的长度不一样、顺序不一样
  输入: [I] [love] [this] [movie]       → 4 个词
  输出: [我] [喜欢] [这] [部] [电影]     → 5 个词
  位置: I(1) → 我(1)  ✓
        love(2) → 喜欢(2)  ✓
        this movie(3-4) → 这部(3-4)  ✓
```

---

## 5.1 实现原理：Encoder-Decoder + Attention

```
Encoder-Decoder 架构：

  编码器（Encoder）        语义向量        解码器（Decoder）
  ┌──────────┐                            ┌──────────┐
  │  I       │──→                          │  我      │
  │  love    │──→      ┌────────┐          │  喜欢    │
  │  this    │──→─────►│ 语义向量 ├─────────→  这      │
  │  movie   │──→      │  (向量) │          │  部      │
  └──────────┘          └────────┘          │  电影    │
                                            └──────────┘

  Attention 机制（解码器在翻译每个词时"回头看"）：
  翻译"我"时：重点看 I        → Attention 权重: I=0.9, love=0.05, ...
  翻译"喜欢"时：重点看 love     → Attention 权重: I=0.1, love=0.85, ...
  翻译"电影"时：重点看 movie   → Attention 权重: movie=0.9, ...
```

---

## 5.2 潜在风险

### Beam Search 解码慢

```
Beam Search 的工作原理：
  width=3: 每一步保留 3 个最可能的候选
  第 1 步: [我, 我们, 他的]  → 保留 3 个
  第 2 步: [我喜欢, 我们喜欢, 我热爱]  → 保留 3 个
  第 3 步: [我喜欢这, 我喜欢看, 我们喜欢]  → 保留 3 个
  ...
  速度 = width × 每步计算量
  width 从 1 到 3 → 速度慢 3 倍
```

### 未登录词（OOV）

```
OOV 问题：
  训练词表中没有"Transformer"这个词
  翻译时遇到 Transformer → <UNK> → 翻译失败

  解决方案：BPE（字节对编码）
  "Transformer" → ["Trans", "former"]（拆成子词）
  如果"Trans"和"former"都在词表中 → 可以翻译
```

---

## 5.3 优化方案

```python
# ch05-seq2seq/translate.py（简化的英中翻译演示）
import tensorflow as tf
import numpy as np

# 模拟数据：中英文句子对（实际应用需要大量数据）
pairs = [
    ("hello", "你好"), ("world", "世界"),
    ("i love you", "我爱你"), ("how are you", "你好吗"),
    ("good morning", "早上好"), ("good night", "晚安"),
]

# 构建词表
en_vocab = ["<PAD>", "<START>", "<END>", "<UNK>"]
zh_vocab = ["<PAD>", "<START>", "<END>", "<UNK>"]

for en, zh in pairs:
    for word in en.split():
        if word not in en_vocab:
            en_vocab.append(word)
    for char in zh:
        if char not in zh_vocab:
            zh_vocab.append(char)

en_to_id = {w: i for i, w in enumerate(en_vocab)}
zh_to_id = {w: i for i, w in enumerate(zh_vocab)}

def encode_en(text):
    return [en_to_id.get(w, en_to_id["<UNK>"]) for w in text.split()]

def encode_zh(text):
    return [zh_to_id["<START>"]] + [zh_to_id.get(c, zh_to_id["<UNK>"]) for c in text] + [zh_to_id["<END>"]]

# 构建模型（简化版：使用 GRU）
embedding_dim = 16
units = 64
vocab_size_en = len(en_vocab)
vocab_size_zh = len(zh_vocab)

# 编码器
encoder_inputs = tf.keras.Input(shape=(None,))
encoder_embedding = tf.keras.layers.Embedding(vocab_size_en, embedding_dim)
encoder = tf.keras.layers.GRU(units, return_state=True)
encoder_outputs, state_h = encoder(encoder_embedding(encoder_inputs))

# 解码器
decoder_inputs = tf.keras.Input(shape=(None,))
decoder_embedding = tf.keras.layers.Embedding(vocab_size_zh, embedding_dim)
decoder_gru = tf.keras.layers.GRU(units, return_sequences=True, return_state=True)
decoder_outputs, _ = decoder_gru(decoder_embedding(decoder_inputs), initial_state=[state_h])
decoder_dense = tf.keras.layers.Dense(vocab_size_zh, activation='softmax')
decoder_outputs = decoder_dense(decoder_outputs)

model = tf.keras.Model([encoder_inputs, decoder_inputs], decoder_outputs)
model.compile(optimizer='adam', loss='sparse_categorical_crossentropy')

# 训练数据
X_en = []
X_zh = []
Y_zh = []
for en, zh in pairs:
    X_en.append(encode_en(en))
    for zh_text in [zh]:  # Teacher Forcing
        zh_ids = encode_zh(zh_text)
        X_zh.append(zh_ids[:-1])
        Y_zh.append(zh_ids[1:])

# 填充到相同长度
X_en = tf.keras.preprocessing.sequence.pad_sequences(X_en, padding='post')
X_zh = tf.keras.preprocessing.sequence.pad_sequences(X_zh, padding='post')
Y_zh = tf.keras.preprocessing.sequence.pad_sequences(Y_zh, padding='post')

model.fit([X_en, X_zh], np.expand_dims(Y_zh, -1), epochs=100, verbose=1)
```

---

## 本章总结

| 风险 | 解决方案 |
|------|---------|
| Beam Search 慢 | 减小 beam width (3-5) / 使用 TF Serving 批处理 |
| OOV 问题 | BPE 子词分词 |
| 训练慢 | Teacher Forcing + 梯度累积 |