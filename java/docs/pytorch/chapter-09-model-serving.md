# 第9章 模型部署与推理优化

## 9.1 TorchScript 模型导出

```python
import torch

# 训练好的模型
model = torch.load('model.pth')
model.eval()

# ===== 方式一：Tracing（跟踪）——适合标准模型 =====
example_input = torch.randn(1, 3, 224, 224)
traced_model = torch.jit.trace(model, example_input)
traced_model.save('model_traced.pt')

# ===== 方式二：Scripting（脚本化）——适合有控制流的模型 =====
scripted_model = torch.jit.script(model)
scripted_model.save('model_scripted.pt')

# ===== 加载推理 =====
loaded = torch.jit.load('model_traced.pt')
with torch.no_grad():
    output = loaded(example_input)
```

## 9.2 模型量化

```python
# 训练后动态量化（适合 CPU 部署）
import torch.quantization as quant

model = torch.load('model.pth')
model.eval()

# 动态量化（权重量化为 int8）
quantized_model = quant.quantize_dynamic(
    model, {torch.nn.Linear}, dtype=torch.qint8
)

# 模型大小减少 4 倍
torch.jit.save(torch.jit.script(quantized_model), 'model_quantized.pt')
```

## 9.3 Docker Compose：TorchServe

```yaml
# demos/ch09-serving/docker-compose.yml
version: "3.8"
services:
  torchserve:
    image: pytorch/torchserve:0.9.0
    container_name: torchserve
    ports:
      - "8080:8080"  # REST API
      - "8081:8081"  # Management API
    volumes:
      - ./model_store:/home/model-server/model-store
      - ./config.properties:/home/model-server/config.properties
    command: >
      torchserve --start --model-store /home/model-server/model-store
      --models my_model=my_model.mar
```

```python
# client.py —— REST 调用 TorchServe
import requests

response = requests.post(
    "http://localhost:8080/predictions/my_model",
    files={"data": open("test_image.jpg", "rb")}
)
print(response.json())
```

## 本章总结

| 场景 | 部署方式 | 延迟 | 模型大小 |
|------|---------|------|---------|
| 在线推理 | TorchServe | 10-50ms | 原始大小 |
| 边缘设备 | TorchScript + 量化 | 5-20ms | 减少 4x |
| 移动端 | PyTorch Mobile | <10ms | 减少 8x (int8) |