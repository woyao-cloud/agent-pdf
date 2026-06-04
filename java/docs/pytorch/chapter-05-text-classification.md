# 第5章 文本分类与情感分析

## 本章导读

你的手机每天收到几十条短信，其中有多少是垃圾广告？你的邮箱里有多少封钓鱼邮件？这些"自动识别垃圾"的功能，背后就是**文本分类**——这是 NLP 最基础也最实用的任务。

```
一个真实的故事：

  某电商平台上线了自动评论审核系统。
  第一天：准确率 95% → 产品经理很高兴
  第三天：准确率降到 70% → "怎么回事？！"

  排查发现：
  - 用户发现"差评"被删，于是改用"不怎么样"、"一般般"等委婉表达
  - 这些词在训练数据中很少出现 → 模型不认识
  - 原来的词表中只有"垃圾"、"恶心"、"垃圾"等词
  - 新出现的"一般"、"失望"都不在词表中

  这就是词表问题的典型场景：词表太大模型装不下，词表太小覆盖不了实际使用
```

本章从**文本转数字**开始，讲解 Embedding、LSTM、双向模型的完整实现，并重点解决词表失控和长文本 OOM 两个最常见的问题。

---

## 5.1 实现原理：从文本到分类

### 文本分类的数据流水线

```
原始文本 → 分词 → 查词典 → Embedding → LSTM → 分类

  "这部电影真好看"
    │
    ▼ 分词
  ["这", "部", "电影", "真", "好看"]
    │
    ▼ 查词典
  [12, 45, 678, 23, 9012]
    │
    ▼ Embedding（每个词 ID → 100 维向量）
  [[0.12, -0.45, ...], [0.78, 0.01, ...], ...]  (5 × 100)
    │
    ▼ 双向 LSTM（理解上下文）
  → "这"+"部"+"电影"+"真"+"好看" → 正面情感 0.92
```

### Embedding 层——从离散 ID 到连续向量

```python
# Embedding 的本质：一个查找表
# vocab_size=10000 → 有 10000 个词
# embed_dim=100    → 每个词用 100 维向量表示
# 形状：(10000, 100) → 100 万个参数

embedding = nn.Embedding(vocab_size=10000, embed_dim=100)

# "电影"的 ID 是 678
# embedding(tensor([678])) → tensor([0.12, -0.45, 0.78, ...])
# "影片"的 ID 是 234，embedding 在初始化后不远处
# embedding(tensor([234])) → tensor([0.11, -0.44, 0.80, ...])

# 语义相近的词 → 向量也相近（这是训练过程中学到的）
# 语义无关的词 → 向量距离远
```

### 双向 LSTM——同时看"前后文"

```
单向 LSTM 的问题：
  "这部电影真" + ___ 预测下一个词 → "好看"（已看到前面 5 个字）
  但对于情感分类，"真难看"和"真好看"完全相反
  只看前面不够，还要看后面！

双向 LSTM 的解决方案：
  第 1 层（正向）："这"→"部"→"电影"→"真"→"好看"
  第 2 层（反向）："好看"→"真"→"电影"→"部"→"这"
  
  在"真"这个位置：
  正向 LSTM 知道前面是"电影"
  反向 LSTM 知道后面是"好看"
  结合两者 → 确定情感是正面的
```

---

## 5.2 完整实现

```python
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader

# ===== 文本分类模型（双向 LSTM） =====
class TextClassifier(nn.Module):
    def __init__(self, vocab_size=10000, embed_dim=100, num_classes=2):
        super().__init__()
        # 词嵌入层：10000 个词的查找表，每个词 100 维
        self.embedding = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
        # 双向 LSTM：输出维度 = hidden_size * 2
        self.lstm = nn.LSTM(embed_dim, 128, batch_first=True, bidirectional=True)
        # Dropout 防过拟合
        self.dropout = nn.Dropout(0.3)
        # 分类层：256维 → 2类（正面/负面）
        self.fc = nn.Linear(128 * 2, num_classes)

    def forward(self, x):
        # x: (batch, seq_len) — 文本的整数 ID 序列
        x = self.embedding(x)           # (batch, seq_len, 100)
        x, _ = self.lstm(x)             # (batch, seq_len, 256)
        x = x[:, -1, :]                  # 取最后一个时间步的输出
        x = self.dropout(x)
        x = self.fc(x)                   # (batch, num_classes)
        return x

# ===== 训练 =====
model = TextClassifier(vocab_size=10000)
model = model.cuda()
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)

for epoch in range(10):
    for texts, labels in train_loader:
        texts, labels = texts.cuda(), labels.cuda()
        optimizer.zero_grad()
        outputs = model(texts)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()
    print(f'Epoch {epoch+1}, Loss: {loss.item():.4f}')
```

---

## 5.3 潜在风险

| 风险 | 原因 | 方案 |
|------|------|------|
| **词表失控** | 数据中 10 万个不同词 → 词表太大 | 限制 vocab_size=10000，罕见词替换为 <UNK> |
| **长文本 OOM** | 一篇 5000 字的新闻直接塞进 LSTM | `pad_sequence` 截断到 500 词 + `pack_padded_sequence` |
| **过拟合** | 小数据集训练大模型 | nn.Dropout(0.3) + weight_decay |
| **词语顺序忽略** | 只用单层 LSTM 不够 | 使用双向 LSTM |