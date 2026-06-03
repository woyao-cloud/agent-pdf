# 第4章 目标检测（Object Detection）

## 4.1 使用 torchvision 预训练检测模型

```python
import torch
import torchvision
from torchvision.models.detection import fasterrcnn_resnet50_fpn

# 加载 COCO 预训练的 Faster R-CNN
model = fasterrcnn_resnet50_fpn(pretrained=True)
model.eval()
model = model.cuda()

# 推理
from PIL import Image
from torchvision.transforms import functional as F

img = Image.open('test.jpg')
img_tensor = F.to_tensor(img).unsqueeze(0).cuda()

with torch.no_grad():
    predictions = model(img_tensor)

# 预测结果
boxes = predictions[0]['boxes'].cpu().numpy()
scores = predictions[0]['scores'].cpu().numpy()
labels = predictions[0]['labels'].cpu().numpy()

# 过滤低置信度检测
valid = scores > 0.5
print(f"检测到 {valid.sum()} 个目标")
```

## 4.2 潜在风险

```
小目标检测问题：COCO 数据集中小目标(<32×32)占比超过 40%
但 Faster R-CNN 对小目标的召回率只有 30% 左右
→ 使用 FPN（特征金字塔）多尺度检测
→ torchvision 的 fasterrcnn_resnet50_fpn 已经内置 FPN
```

| 风险 | 方案 |
|------|------|
| 小目标漏检 | 使用 FPN (torchvision 默认) |
| 推理慢 | 切换到 MobileNet 作为 backbone |
| NMS 阈值不当 | 调整 `torchvision.ops.nms(boxes, scores, iou_threshold)` |