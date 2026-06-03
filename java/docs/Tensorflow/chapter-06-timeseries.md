# 第6章 时间序列预测（Time Series）

## 本章导读

时间序列预测可能是"看起来最简单，实际最坑"的机器学习任务。简单在哪？——输入和输出都是数字序列，不需要图像或文本那样的复杂预处理。坑在哪？——**时间依赖**。你不能像图像分类那样随机打乱数据，因为未来的数据不能用来预测过去。

```
时间序列预测 vs 标准机器学习的核心差异：

  图像分类（标准 ML）：
  ┌──────┐  ┌──────┐  ┌──────┐
  │ 图片A │  │ 图片B │  │ 图片C │
  │ →猫  │  │ →狗  │  │ →猫  │
  └──────┘  └──────┘  └──────┘
  可以随机打乱顺序 ✓

  时间序列预测：
  t=1 ──→ t=2 ──→ t=3 ──→ ... ──→ t=100
  │预测   │预测   │预测
  t=2    t=3    t=4
  不能打乱！必须按时间顺序 ✗
  否则"未来信息泄露"→ 测试集准确率虚高 → 上线后准确率暴跌
```

---

## 6.1 实现原理：LSTM + 时间窗口

```
时间序列预测的核心方法：滑动窗口

  原始时间序列：
  [100, 110, 105, 120, 115, 130, 125, 140, ...]

  滑动窗口（窗口大小=3，预测下一步）：
  ┌─────────────┬──────────┐
  │ 输入 (X)    │ 输出 (Y) │
  ├─────────────┼──────────┤
  │ [100,110,105] │ 120    │
  │ [110,105,120] │ 115    │
  │ [105,120,115] │ 130    │
  │ [120,115,130] │ 125    │
  └─────────────┴──────────┘
```

---

## 6.2 潜在风险

### 数据泄露——时间序列的头号杀手

```
时间序列分割的错误做法：

  ❌ 错误：随机分割
  train = data[0:80] + data[90:100]  ← 随机选了 90% 的数据
  test  = data[80:90]                    ← 中间的 10%
  问题：测试集中的"明天的数据"可能被用来预测"昨天的数据"
        测试集准确率虚高 100%！

  ✅ 正确：时间分割
  train = data[0:80]    ← 前 80% 的数据
  test  = data[80:100]  ← 后 20% 的数据
  问题：测试集总是在未来，模型不能"偷看"
```

### 多步预测误差累积

```
单步预测 vs 多步预测：

  单步预测（滚动）：
  预测 t+1 → 用 t+1 的预测值作为输入预测 t+2
  → 误差在每一步累积！

  第1步预测：真实值 100, 预测 101（误差 1%）
  第2步预测：输入从"真实 100"变成"预测 101"（已经有误差）
           → 误差放大到 3%
  第10步预测：误差可能累积到 50%！
```

---

## 6.3 优化方案

### 完整实现（电力负荷预测）

```python
# ch06-timeseries/train.py
import tensorflow as tf
import numpy as np

# ===== 1. 生成模拟数据（实际应用中替换为真实 CSV） =====
# 模拟电力负荷数据（每天 24 小时，频率 1 小时）
def generate_synthetic_data(length=2000):
    t = np.arange(length)
    # 基荷 + 日周期 + 随机噪声
    base = 100 + 20 * np.sin(2 * np.pi * t / 24)  # 日周期
    trend = t * 0.01                                # 长期趋势
    noise = np.random.randn(length) * 3             # 噪声
    return base + trend + noise

data = generate_synthetic_data()

# ===== 2. 构建时间窗口 =====
def create_sequences(data, window_size=24, forecast_horizon=1):
    X, y = [], []
    for i in range(len(data) - window_size - forecast_horizon + 1):
        X.append(data[i:i + window_size])
        y.append(data[i + window_size:i + window_size + forecast_horizon])
    return np.array(X), np.array(y)

WINDOW_SIZE = 24  # 用过去 24 小时预测未来
FORECAST_HORIZON = 1  # 预测未来 1 小时

X, y = create_sequences(data, WINDOW_SIZE, FORECAST_HORIZON)
X = X.reshape((-1, WINDOW_SIZE, 1))  # 添加特征维度

# ⚠️ 时间序列分割——不能打乱！
split = int(0.8 * len(X))
X_train, X_test = X[:split], X[split:]
y_train, y_test = y[:split], y[split:]

# ===== 3. 构建模型 =====
model = tf.keras.Sequential([
    tf.keras.layers.Input(shape=(WINDOW_SIZE, 1)),

    # LSTM 层（return_sequences=True 时返回所有时间步输出）
    tf.keras.layers.LSTM(64, return_sequences=True),
    tf.keras.layers.Dropout(0.2),

    tf.keras.layers.LSTM(32, return_sequences=False),
    tf.keras.layers.Dropout(0.2),

    # 输出层
    tf.keras.layers.Dense(FORECAST_HORIZON)
])

model.compile(optimizer='adam', loss='mse', metrics=['mae'])
print(model.summary())

# ===== 4. 训练 =====
history = model.fit(
    X_train, y_train,
    batch_size=32,
    epochs=30,
    validation_data=(X_test, y_test),
    callbacks=[
        tf.keras.callbacks.EarlyStopping(patience=5,
                                         restore_best_weights=True),
        tf.keras.callbacks.TensorBoard(log_dir='./logs')
    ]
)

# ===== 5. 评估与预测 =====
test_loss, test_mae = model.evaluate(X_test, y_test)
print(f'测试 MAE: {test_mae:.4f}')

# 多步预测（滚动预测未来 24 小时）
def forecast(model, last_sequence, steps=24):
    predictions = []
    current = last_sequence.copy()
    for _ in range(steps):
        pred = model.predict(current[np.newaxis, :, :], verbose=0)
        predictions.append(pred[0, 0])
        # 滚动：移除最旧的，添加最新的预测
        current = np.roll(current, -1, axis=0)
        current[-1, 0] = pred[0, 0]
    return np.array(predictions)

# 使用测试集最后 24 小时预测未来 24 小时
last_24h = X_test[-1]
future = forecast(model, last_24h, steps=24)
print(f"未来 24 小时预测: {future}")
```

---

## 6.4 Docker Compose

```yaml
# demos/ch06-timeseries/docker-compose.yml
version: "3.8"
services:
  train:
    image: tensorflow/tensorflow:2.16.1
    container_name: tf-ch06-train
    working_dir: /app
    volumes:
      - ./train.py:/app/train.py
      - ./logs:/app/logs
    command: python train.py
```

```bash
cd demos/ch06-timeseries
docker compose up train
```

---

## 本章总结

| 风险 | 解决方案 |
|------|---------|
| 数据泄露 | 时间顺序分割（不使用随机 shuffle）|
| 多步预测误差累积 | 使用 Direct Multi-Step 或 Seq2Seq 预测 |
| 季节性/趋势 | 差分 + 时间特征编码（hour_of_day, day_of_week）|