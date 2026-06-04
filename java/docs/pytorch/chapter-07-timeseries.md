# 第7章 时间序列预测

## 本章导读

"我用 LSTM 预测股票，测试集准确率 95%！"——这是初学者最常说的"谎言"。为什么？因为测试集中的"明天"数据被用来预测"昨天"了。

```
时间序列预测的"数据泄漏陷阱"：

  普通机器学习：数据集 = [猫, 狗, 猫, 狗]，可以随机打乱 ✓
  时间序列：    数据集 = [t1, t2, t3, t4, t5, t6, t7, t8, t9, t10]

  ❌ 错误做法（随机分割）：
  训练集: [t1, t2, t5, t6, t9, t10] → t9 的未来数据预测 t3 → 准确率虚高 100%！

  ✅ 正确做法（时间分割）：
  训练集: [t1, t2, t3, t4, t5, t6, t7, t8]
  测试集: [t9, t10]
  
  结论：时间序列永远不要随机分割！上线后准确率会从 95% 暴跌到 50%
```

---

## 7.1 实现原理

### 滑动窗口——把时间序列变成"监督学习"

```python
# 原始序列：[100, 110, 105, 120, 115, 130, 125]
# 窗口=3：
# X=[100,110,105] → y=120  (用前3天预测第4天)
# X=[110,105,120] → y=115
# X=[105,120,115] → y=130
# ...
```

### 完整实现

```python
import torch
import torch.nn as nn
import numpy as np

def create_sequences(data, window=24):
    X, y = [], []
    for i in range(len(data) - window):
        X.append(data[i:i+window])
        y.append(data[i+window])
    return np.array(X), np.array(y)

# 模拟电力负荷（日周期 + 趋势 + 噪声）
t = np.arange(2000)
data = 100 + 20*np.sin(2*np.pi*t/24) + t*0.01 + np.random.randn(2000)*3
X, y = create_sequences(data, window=24)

# ⚠️ 时间分割（不能shuffle！）
split = int(0.8 * len(X))
X_train, y_train = X[:split], y[:split]
X_test, y_test = X[split:], y[split:]
X_train = torch.FloatTensor(X_train).unsqueeze(-1)
y_train = torch.FloatTensor(y_train).unsqueeze(-1)

class LSTMPredictor(nn.Module):
    def __init__(self, input_size=1, hidden_size=64):
        super().__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, batch_first=True)
        self.fc = nn.Linear(hidden_size, 1)
    def forward(self, x):
        out, _ = self.lstm(x)
        return self.fc(out[:, -1, :])

model = LSTMPredictor()
criterion = nn.MSELoss()
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)

for epoch in range(50):
    optimizer.zero_grad()
    loss = criterion(model(X_train), y_train)
    loss.backward()
    optimizer.step()
    if epoch % 10 == 0:
        print(f'Epoch {epoch}, Loss: {loss.item():.4f}')

# 评估
model.eval()
with torch.no_grad():
    mae = torch.abs(model(X_test) - y_test).mean()
    print(f'Test MAE: {mae.item():.4f}')  # ≈ 3-5，合理
```

---

## 7.2 潜在风险

| 风险 | 原因 | 方案 |
|------|------|------|
| 数据泄露 | 随机分割 | 时间分割 |
| 误差累积 | 多步预测用前步预测 | Direct Multi-Step |
| 趋势未处理 | 序列非平稳 | 差分处理 |