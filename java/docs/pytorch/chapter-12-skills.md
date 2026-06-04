# 第12章 开发者必备技能

## 本章导读

前面 11 章讲了模型怎么构建和训练。但一个专业的深度学习开发者还需要掌握一些"工具类技能"：**怎么看模型结构？怎么看训练曲线？怎么保存和加载模型？怎么用预训练模型？**

这章不教新模型，教的是"日常用得最多的工具"。

---

## 12.1 TensorBoard——可视化训练的"眼睛"

训练深度学习模型就像"在黑箱子里调参数"——你看不到模型内部发生了什么。TensorBoard 提供了一扇"窗户"。

```python
from torch.utils.tensorboard import SummaryWriter

# 创建一个日志记录器
writer = SummaryWriter('runs/experiment_1')

for epoch in range(100):
    loss = train_one_epoch()
    acc = evaluate()

    # 记录标量（Loss / 准确率曲线）
    writer.add_scalar('Loss/train', loss, epoch)
    writer.add_scalar('Accuracy/test', acc, epoch)

    # 记录模型结构（只需一次）
    if epoch == 0:
        writer.add_graph(model, example_input)

    # 记录权重分布（每 10 个 epoch）
    if epoch % 10 == 0:
        for name, param in model.named_parameters():
            writer.add_histogram(f'weights/{name}', param, epoch)

# 关闭
writer.close()

# 命令行启动 TensorBoard
# tensorboard --logdir runs --port 6006
# 打开 http://localhost:6006

# TensorBoard 面板说明：
# Scalars:   Loss/Accuracy 曲线（最常用）
# Graphs:    计算图（检查模型结构是否正确）
# Histograms: 权重分布（检查梯度消失/爆炸）
# Images:    输入图片预览（检查数据增强效果）
```

---

## 12.2 torchinfo——模型结构一目了然

```python
from torchinfo import summary

model = ImageClassifier()

# 打印模型结构 + 参数量（比 print(model) 详细 10 倍）
summary(model, input_size=(1, 3, 224, 224))

# 输出：
# ────────────────────────────────────────────────
# Layer (type)        Output Shape    Param #
# ────────────────────────────────────────────────
# Conv2d-1           [1, 64, 112, 112]   1,792
# BatchNorm2d-2      [1, 64, 112, 112]   128
# ReLU-3             [1, 64, 112, 112]   0
# MaxPool2d-4        [1, 64, 56, 56]      0
# Conv2d-5           [1, 128, 56, 56]    73,856
# ...
# ────────────────────────────────────────────────
# Total params: 11,173,962
# Trainable params: 11,173,962
# Non-trainable params: 0
# ────────────────────────────────────────────────
```

---

## 12.3 模型保存与加载

```python
# ===== 保存 =====
# 方式 1：只保存参数（推荐——跨版本兼容性好）
torch.save(model.state_dict(), 'model.pth')

# 方式 2：保存整个模型（不推荐——版本不兼容时无法加载）
torch.save(model, 'model_full.pth')

# ===== 加载 =====
# 方式 1：先创建模型，再加载参数
model = ImageClassifier()
model.load_state_dict(torch.load('model.pth'))
model.eval()  # ⚠️ 必须：切换到推理模式

# 方式 2：直接加载整个模型
model = torch.load('model_full.pth')
model.eval()

# ===== 保存训练状态（用于恢复训练） =====
checkpoint = {
    'epoch': epoch,
    'model_state_dict': model.state_dict(),
    'optimizer_state_dict': optimizer.state_dict(),
    'loss': loss,
}
torch.save(checkpoint, 'checkpoint.pth')

# 加载 Checkpoint
checkpoint = torch.load('checkpoint.pth')
model.load_state_dict(checkpoint['model_state_dict'])
optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
start_epoch = checkpoint['epoch'] + 1
```

---

## 12.4 HuggingFace 集成

PyTorch 的最大生态优势之一：HuggingFace Transformers 默认使用 PyTorch。

```python
from transformers import AutoModelForSequenceClassification, AutoTokenizer

# 加载 BERT 中文预训练模型（PyTorch）
model = AutoModelForSequenceClassification.from_pretrained('bert-base-chinese')
tokenizer = AutoTokenizer.from_pretrained('bert-base-chinese')

# 推理——用法和普通 PyTorch 模型一样
text = "这部电影真好看"
inputs = tokenizer(text, return_tensors='pt')

with torch.no_grad():
    outputs = model(**inputs)
    probs = torch.nn.functional.softmax(outputs.logits, dim=-1)
    print(f"正面概率: {probs[0][1]:.4f}")  # 大概率 > 0.9
```

---

## 本章总结

| 工具 | 用途 | 启动命令 |
|------|------|---------|
| TensorBoard | 可视化训练 | `tensorboard --logdir runs --port 6006` |
| torchinfo | 打印模型结构 | `summary(model, input_size)` |
| HuggingFace | 预训练模型 | `AutoModel.from_pretrained()` |