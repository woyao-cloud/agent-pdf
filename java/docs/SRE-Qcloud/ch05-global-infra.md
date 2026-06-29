# 第5章 腾讯云全局基础设施

## 5.1 腾讯云区域与可用区

### 解决的问题

了解腾讯云的全球基础设施布局是设计高可用架构的基础。错误的选择区域和可用区会导致延迟高、可用性低、成本增加。

### 核心原理

腾讯云在全球部署了多个**区域（Region）**和**可用区（AZ）**：

- **区域**：独立的地理区域，包含多个可用区，区域间通过高速网络互联
- **可用区**：区域内独立的物理数据中心，拥有独立的电力、网络和冷却系统

**国内区域：**
| 区域 | 地域 | 可用区数 | 特点 |
|------|------|---------|------|
| ap-beijing | 北京 | 3 | 北方核心，低延迟覆盖华北 |
| ap-shanghai | 上海 | 3 | 华东核心，金融用户集中 |
| ap-guangzhou | 广州 | 3 | 华南核心，游戏/互联网集中 |
| ap-chengdu | 成都 | 2 | 西南节点 |
| ap-chongqing | 重庆 | 1 | 西南备份节点 |

**海外区域：**
| 区域 | 地域 | 可用区数 | 覆盖范围 |
|------|------|---------|---------|
| ap-singapore | 新加坡 | 2 | 东南亚 |
| na-siliconvalley | 硅谷 | 2 | 北美西部 |
| eu-frankfurt | 法兰克福 | 2 | 欧洲 |
| ap-mumbai | 孟买 | 2 | 南亚 |

### 代码/配置实现

**Terraform 创建多可用区 VPC：**

```hcl
provider "tencentcloud" {
  region = "ap-guangzhou"
}

resource "tencentcloud_vpc" "main" {
  name       = "sre-demo-vpc"
  cidr_block = "10.0.0.0/16"
  is_multicast = false
}

resource "tencentcloud_subnet" "az1" {
  name              = "subnet-az1"
  vpc_id            = tencentcloud_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "ap-guangzhou-3"
}

resource "tencentcloud_subnet" "az2" {
  name              = "subnet-az2"
  vpc_id            = tencentcloud_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "ap-guangzhou-4"
}
```

### 使用场景

- 多可用区部署提高可用性
- 就近接入降低延迟
- 数据合规（数据不出境）

### 潜在风险与注意事项

- 跨可用区流量有网络延迟（1-2ms）
- 跨区域流量有较高延迟和费用
- 部分产品不支持所有区域

### 本章小结

- 腾讯云国内5个区域，海外多个区域
- 每个区域至少2个可用区
- 多AZ部署是高可用的基础
