# 第5章 文本分类与情感分析

## 5.1 完整实现

```python
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset
from torch.nn.utils.rnn import pad_sequence

# ===== 1. 构建模型 =====
class TextClassifier(nn.Module):
    def __init__(self, vocab_size, embed_dim=100, num_classes=2):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
        self.lstm = nn.LSTM(embed_dim, 128, batch_first=True, bidirectional=True)
        self.fc = nn.Linear(128 * 2, num_classes)  # *2 for bidirectional
        self.dropout = nn.Dropout(0.3)

    def forward(self, x):
        # x: (batch, seq_len)
        x = self.embedding(x)           # (batch, seq_len, embed_dim)
        x, _ = self.lstm(x)             # (batch, seq_len, 256)
        x = x[:, -1, :]                  # 取最后一个时间步
        x = self.dropout(x)
        x = self.fc(x)                   # (batch, num_classes)
        return x

# ===== 2. 训练 =====
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

## 5.2 潜在风险

| 风险 | 原因 | 方案 |
|------|------|------|
| 长文本 OOM | 序列长度过大 | `pad_sequence` 截断 + pack_padded_sequence |
| 词表失控 | 太多罕见词 | 限制 vocab_size=10000，罕见词用 <UNK> |
| 过拟合 | 小数据集 | nn.Dropout + weight_decay |