# 第12章 开发者必备技能

## 12.1 TensorBoard 集成

```python
from torch.utils.tensorboard import SummaryWriter

writer = SummaryWriter('runs/experiment_1')

# 记录 Loss
for epoch in range(100):
    loss = train_one_epoch()
    writer.add_scalar('Loss/train', loss, epoch)

# 记录网络结构
writer.add_graph(model, example_input)

# 记录权重分布
for name, param in model.named_parameters():
    writer.add_histogram(name, param, epoch)

# 记录图像
writer.add_images('predictions', output_images, epoch)

writer.close()
# tensorboard --logdir runs --port 6006
```

## 12.2 torchinfo —— 打印模型结构

```python
from torchinfo import summary

model = ImageClassifier()
summary(model, input_size=(1, 3, 224, 224))
# 输出：
# ============================================================
# Layer (type)          Output Shape         Param #
# ============================================================
# Conv2d-1             [1, 64, 224, 224]     1,792
# BatchNorm2d-2        [1, 64, 224, 224]     128
# ReLU-3               [1, 64, 224, 224]     0
# MaxPool2d-4          [1, 64, 112, 112]     0
# ...
# ============================================================
# Total params: 11,173,962
# Trainable params: 11,173,962
# ============================================================
```

## 12.3 模型保存与加载

```python
# ===== 保存 =====
# 方式 1：只保存参数（推荐）
torch.save(model.state_dict(), 'model.pth')

# 方式 2：保存整个模型
torch.save(model, 'model_full.pth')

# ===== 加载 =====
# 方式 1：先创建模型再加载参数
model = ImageClassifier()
model.load_state_dict(torch.load('model.pth'))
model.eval()

# 方式 2：直接加载
model = torch.load('model_full.pth')
model.eval()

# ===== 保存时包含优化器（用于恢复训练） =====
checkpoint = {
    'epoch': epoch,
    'model_state_dict': model.state_dict(),
    'optimizer_state_dict': optimizer.state_dict(),
    'loss': loss,
}
torch.save(checkpoint, 'checkpoint.pth')

# 加载时：
checkpoint = torch.load('checkpoint.pth')
model.load_state_dict(checkpoint['model_state_dict'])
optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
start_epoch = checkpoint['epoch'] + 1
```

## 12.4 HuggingFace 集成

```python
# PyTorch 与 HuggingFace Transformers 无缝集成
from transformers import AutoModelForSequenceClassification, AutoTokenizer

# 加载 BERT 预训练模型（PyTorch 模型）
model = AutoModelForSequenceClassification.from_pretrained('bert-base-chinese')
tokenizer = AutoTokenizer.from_pretrained('bert-base-chinese')

# 推理——和普通 PyTorch 模型完全一样
inputs = tokenizer("这部电影真好看", return_tensors='pt')
with torch.no_grad():
    outputs = model(**inputs)
    predictions = torch.nn.functional.softmax(outputs.logits, dim=-1)
    print(f"正面概率: {predictions[0][1].item():.4f}")
```

---

## 本章总结

| 工具 | 命令 | 用途 |
|------|------|------|
| TensorBoard | `tensorboard --logdir runs` | 可视化训练曲线/权重/图 |
| torchinfo | `summary(model, input_size)` | 打印模型参数 |
| HuggingFace | `from_pretrained()` | 使用预训练 Transformer |