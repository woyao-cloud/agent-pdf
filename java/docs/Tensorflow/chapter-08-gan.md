# 第8章 生成式模型（GANs/VAEs）

## 本章导读

GAN（Generative Adversarial Network，生成对抗网络）是 2014 年由 Ian Goodfellow 提出的革命性模型。它的核心思想极具创意：**让两个网络互相博弈，共同进步**。

```
GAN 的"造假者与警察"比喻：

  生成器（Generator）——造假者
  目标：画出足以乱真的假画
  输入：随机噪声
  输出：伪造的图像

  判别器（Discriminator）——警察
  目标：辨别画作的真伪
  输入：一幅画（真实或伪造）
  输出：是真是假

  训练过程：
  第 1 轮：造假者画得极差 → 警察轻松识破
  第 50 轮：造假者画得还行 → 警察偶尔被骗
  第 500 轮：造假者画得逼真 → 警察难以分辨
  第 1000 轮：造假者已经成为"大师" → 警察和造假者达到纳什均衡
```

---

## 8.1 实现原理：DCGAN

```python
# ch08-gan/dcgan.py
import tensorflow as tf
from tensorflow import keras
import numpy as np

# ===== 生成器 =====
def build_generator(latent_dim=100):
    model = keras.Sequential(name='generator')
    model.add(keras.layers.Dense(7*7*256, input_dim=latent_dim))
    model.add(keras.layers.BatchNormalization())
    model.add(keras.layers.LeakyReLU(alpha=0.2))

    model.add(keras.layers.Reshape((7, 7, 256)))
    model.add(keras.layers.Conv2DTranspose(128, (4,4), strides=(2,2), padding='same'))
    model.add(keras.layers.BatchNormalization())
    model.add(keras.layers.LeakyReLU(alpha=0.2))

    model.add(keras.layers.Conv2DTranspose(64, (4,4), strides=(2,2), padding='same'))
    model.add(keras.layers.BatchNormalization())
    model.add(keras.layers.LeakyReLU(alpha=0.2))

    model.add(keras.layers.Conv2DTranspose(1, (3,3), strides=(1,1), padding='same',
                                           activation='tanh'))
    return model

# ===== 判别器 =====
def build_discriminator():
    model = keras.Sequential(name='discriminator')
    model.add(keras.layers.Conv2D(64, (3,3), strides=(2,2), padding='same',
                                  input_shape=(28,28,1)))
    model.add(keras.layers.LeakyReLU(alpha=0.2))
    model.add(keras.layers.Dropout(0.3))

    model.add(keras.layers.Conv2D(128, (3,3), strides=(2,2), padding='same'))
    model.add(keras.layers.LeakyReLU(alpha=0.2))
    model.add(keras.layers.Dropout(0.3))

    model.add(keras.layers.Flatten())
    model.add(keras.layers.Dense(1, activation='sigmoid'))
    return model

# ===== GAN 组合模型 =====
class GAN(keras.Model):
    def __init__(self, generator, discriminator, latent_dim=100):
        super().__init__()
        self.generator = generator
        self.discriminator = discriminator
        self.latent_dim = latent_dim
        self.d_loss_tracker = keras.metrics.Mean(name='d_loss')
        self.g_loss_tracker = keras.metrics.Mean(name='g_loss')

    @property
    def metrics(self):
        return [self.d_loss_tracker, self.g_loss_tracker]

    def compile(self, d_optimizer, g_optimizer, loss_fn):
        super().compile()
        self.d_optimizer = d_optimizer
        self.g_optimizer = g_optimizer
        self.loss_fn = loss_fn

    def train_step(self, real_images):
        batch_size = tf.shape(real_images)[0]
        real_labels = tf.ones((batch_size, 1))        # 真实图片标签=1
        fake_labels = tf.zeros((batch_size, 1))        # 伪造图片标签=0

        # 1. 训练判别器
        noise = tf.random.normal((batch_size, self.latent_dim))
        fake_images = self.generator(noise)
        with tf.GradientTape() as tape:
            real_pred = self.discriminator(real_images)
            fake_pred = self.discriminator(fake_images)
            d_loss = self.loss_fn(real_labels, real_pred) + \
                     self.loss_fn(fake_labels, fake_pred)
        grads = tape.gradient(d_loss, self.discriminator.trainable_weights)
        self.d_optimizer.apply_gradients(zip(grads, self.discriminator.trainable_weights))

        # 2. 训练生成器
        noise = tf.random.normal((batch_size, self.latent_dim))
        with tf.GradientTape() as tape:
            fake_images = self.generator(noise)
            fake_pred = self.discriminator(fake_images)
            g_loss = self.loss_fn(real_labels, fake_pred)  # 希望判别器认错
        grads = tape.gradient(g_loss, self.generator.trainable_weights)
        self.g_optimizer.apply_gradients(zip(grads, self.generator.trainable_weights))

        self.d_loss_tracker.update_state(d_loss)
        self.g_loss_tracker.update_state(g_loss)
        return {'d_loss': self.d_loss_tracker.result(), 'g_loss': self.g_loss_tracker.result()}

# ===== 训练 =====
BATCH_SIZE = 64
EPOCHS = 50
LATENT_DIM = 100

(x_train, _), _ = keras.datasets.mnist.load_data()
x_train = (x_train.astype(np.float32) - 127.5) / 127.5  # 归一化到 [-1, 1]
x_train = np.expand_dims(x_train, -1)

dataset = tf.data.Dataset.from_tensor_slices(x_train).shuffle(60000).batch(BATCH_SIZE)

generator = build_generator(LATENT_DIM)
discriminator = build_discriminator()
gan = GAN(generator, discriminator, LATENT_DIM)
gan.compile(
    d_optimizer=keras.optimizers.Adam(learning_rate=0.0002, beta_1=0.5),
    g_optimizer=keras.optimizers.Adam(learning_rate=0.0002, beta_1=0.5),
    loss_fn=keras.losses.BinaryCrossentropy()
)

gan.fit(dataset, epochs=EPOCHS)
generator.save('/models/gan_generator')
```

---

## 本章总结

| 风险 | 解决方案 |
|------|---------|
| 模式崩塌 | WGAN-GP（梯度惩罚） |
| 训练不稳定 | 标签平滑 + 更小的学习率（0.0002）|
| 评估困难 | FID / IS 指标 |