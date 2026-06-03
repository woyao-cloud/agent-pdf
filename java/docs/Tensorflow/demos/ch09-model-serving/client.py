import requests
import json
import numpy as np

test_data = np.random.randn(224, 224, 3).tolist()

response = requests.post(
    "http://tf-serving:8501/v1/models/default:predict",
    json={"instances": [test_data]}
)

result = response.json()
print(f"预测结果形状: {len(result['predictions'][0])}")
print(f"状态码: {response.status_code}")
assert response.status_code == 200, "TF Serving 部署失败！"
print("✅ TF Serving 部署成功！")