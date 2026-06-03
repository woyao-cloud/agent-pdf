# 附录

## 附录A：Docker Compose 环境速查

```bash
# CPU 版 Jupyter
docker compose -f demos/docker-compose.yml up jupyter-cpu -d

# GPU 版 Jupyter
docker compose -f demos/docker-compose.yml --profile gpu up jupyter-gpu -d

# 某章节训练（示例：第3章图像分类）
cd demos/ch03-classification
docker compose up train

# 模型部署
cd demos/ch09-serving
docker compose up -d
```

## 附录B：PyTorch 常用 API 速查

| 分类 | API | 说明 |
|------|-----|------|
| 创建 | `torch.tensor(data)` | 从 Python 列表创建 |
| 创建 | `torch.zeros/ones/randn` | 特殊张量 |
| GPU | `.cuda()` / `.cpu()` | CPU↔GPU 迁移 |
| 梯度 | `loss.backward()` | 反向传播 |
| 梯度 | `optimizer.step()` | 参数更新 |
| 层 | `nn.Linear(in, out)` | 全连接层 |
| 层 | `nn.Conv2d(Cin, Cout, K)` | 卷积层 |
| 层 | `nn.LSTM(hidden, layers)` | LSTM 层 |
| 层 | `nn.Embedding(vocab, dim)` | 词嵌入层 |
| 损失 | `nn.CrossEntropyLoss()` | 分类损失 |
| 损失 | `nn.MSELoss()` | 回归损失 |
| 优化 | `optim.Adam(params, lr)` | Adam 优化器 |
| 优化 | `optim.SGD(params, lr, momentum)` | SGD 优化器 |
| 数据 | `DataLoader(dataset, batch_size)` | 数据加载器 |
| 模型 | `model.train()` / `model.eval()` | 训练/评估模式切换 |
| 保存 | `torch.save(model.state_dict(), 'p')` | 保存参数 |

## 附录C：TensorBoard 可视化

```bash
# 启动
tensorboard --logdir runs --port 6006 --bind_all
# 打开 http://localhost:6006

# 面板功能
# Scalars: Loss/Accuracy 曲线
# Graphs: 计算图
# Histograms: 梯度/权重分布
# Images: 输入图片
```

## 附录D：面试高频问题

| 问题 | 回答要点 |
|------|---------|
| 谈谈 PyTorch 的动态图机制 | Eager Execution = 运算立即执行，可打断点，可 if/for |
| .backward() 的梯度累积问题 | 每次 backward 梯度会累加，需要手动 zero_grad() |
| DataLoader 的 num_workers 多大合适 | CPU 核数 × 2，太大反而降低性能 |
| 梯度消失/爆炸 | BatchNorm + Xavier 初始化 + 梯度裁剪 |
| `model.train()` vs `model.eval()` | train 启用 Dropout + BatchNorm 更新；eval 固定 |
| torch.jit.trace vs torch.jit.script | trace 跟踪运算（无控制流），script 编译代码 |