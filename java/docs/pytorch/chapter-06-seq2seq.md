# 第6章 序列到序列与机器翻译

## 6.1 实现原理：Transformer

```python
import torch
import torch.nn as nn
import torch.optim as optim
import math

# ===== Transformer 编码器层 =====
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

class PositionalEncoding(nn.Module):
    """位置编码——给模型"告诉"词的顺序"""
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
```

## 6.2 潜在风险

```
Beam Search 速度问题：
  beam_width=5 → 每次生成保留 5 个候选
  每个候选都要走一遍 decoder → 速度 = 5× 贪心搜索

  优化方案：
  - beam_width 从 5 降到 3（速度提升 40%，质量下降 < 1 BLEU）
  - 使用 batch beam search（一次处理多个候选）
```