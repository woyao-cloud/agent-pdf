# 第12章 开发者必备技能

## 12.1 TensorBoard 可视化调试

```python
import tensorflow as tf
from tensorflow import keras

# 在训练中使用 TensorBoard 回调
model.fit(
    x_train, y_train,
    epochs=50,
    callbacks=[
        keras.callbacks.TensorBoard(
            log_dir='./logs',
            histogram_freq=1,     # 每 1 个 epoch 记录权重分布
            write_graph=True,      # 记录计算图
            write_images=True      # 记录权重可视化
        )
    ]
)

# 启动 TensorBoard
# tensorboard --logdir ./logs --port 6006
# 打开 http://localhost:6006
```

## 12.2 SavedModel 格式与签名

```python
# 保存模型时指定签名（签名 = 模型的输入输出接口定义）
class MyModel(keras.Model):
    def call(self, inputs):
        return self.dense(inputs)

model = MyModel()

# 保存时定义签名
@tf.function(input_signature=[tf.TensorSpec((None, 224, 224, 3), tf.float32)])
def serving_default(image):
    return {'prediction': model(image), 'confidence': tf.reduce_max(model(image), axis=-1)}

tf.saved_model.save(
    model,
    '/models/my_model/1',
    signatures={'serving_default': serving_default}
)
```

---

## 本章总结

| 工具 | 用途 | 入门命令 |
|------|------|---------|
| TensorBoard | 可视化训练曲线/权重/计算图 | `tensorboard --logdir logs` |
| SavedModel | 模型部署格式 | `tf.saved_model.save(model, path)` |
| MLflow | 实验跟踪 | `mlflow ui` |