# Neptune 基础操作演示

## 环境要求

```bash
pip install -r requirements.txt
```

## 运行方式

### 模拟模式（无需 Neptune）
```bash
python neptune_connect.py
```

### 真实 Neptune 连接
```bash
export NEPTUNE_ENDPOINT=your-cluster-endpoint
python neptune_connect.py
```

## 演示内容

- 创建节点（person 标签，含 name/age/city 属性）
- 创建关系（knows 边，含 since 属性）
- 查询所有节点
- 查询邻居节点
- 按属性过滤节点
