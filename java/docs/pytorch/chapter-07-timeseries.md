# 第7章 时间序列预测

## 7.1 完整实现

```python
import torch
import torch.nn as nn
import numpy as np

# ===== 1. 生成模拟数据 =====
def create_sequences(data, window=24):
    X, y = [], []
    for i in range(len(data) - window):
        X.append(data[i:i+window])
        y.append(data[i+window])
    return np.array(X), np.array(y)

# 模拟电力负荷（日周期 + 趋势 + 噪声）
t = np.arange(2000)
data = 100 + 20 * np.sin(2*np.pi*t/24) + t*0.01 + np.random.randn(2000)*3
X, y = create_sequences(data, window=24)

# 时间分割（不能打乱！）
split = int(0.8 * len(X))
X_train, y_train = X[:split], y[:split]
X_test, y_test = X[split:], y[split:]

X_train = torch.FloatTensor(X_train).unsqueeze(-1)  # (N, 24, 1)
y_train = torch.FloatTensor(y_train).unsqueeze(-1)  # (N, 1)
X_test = torch.FloatTensor(X_test).unsqueeze(-1)

# ===== 2. LSTM 模型 =====
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

# ===== 3. 训练 =====
for epoch in range(50):
    model.train()
    optimizer.zero_grad()
    outputs = model(X_train)
    loss = criterion(outputs, y_train)
    loss.backward()
    optimizer.step()
    if epoch % 10 == 0:
        print(f'Epoch {epoch}, Loss: {loss.item():.4f}')

# ===== 4. 预测 =====
model.eval()
with torch.no_grad():
    predictions = model(X_test)
    mae = torch.abs(predictions - y_test).mean()
    print(f'Test MAE: {mae.item():.4f}')
```

## 7.2 潜在风险

| 风险 | 原因 | 方案 |
|------|------|------|
| 数据泄露 | 时间顺序打乱 | 使用时间分割（不用随机分割）|
| 误差累积 | 多步预测用上一步的预测结果 | Direct Multi-Step（直接输出多个未来值）|
| 季节性 | 未处理周期性 | 加入 hour_of_day / day_of_week 特征 |