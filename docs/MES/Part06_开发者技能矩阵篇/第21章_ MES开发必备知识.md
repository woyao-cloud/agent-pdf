# 第21章 MES开发必备知识

MES（Manufacturing Execution System，制造执行系统）开发需要开发者同时具备制造业业务知识、工业自动化技术和软件工程能力。本章系统梳理MES开发所需的必备知识体系，帮助开发者建立完整的知识架构。

## 21.1 制造业业务知识

制造业业务知识是MES开发的基础。开发者需要深入理解制造企业的核心业务流程和数据模型，才能开发出真正解决业务问题的MES系统。

### 21.1.1 BOM概念与应用

BOM（Bill of Material，物料清单）是制造业最核心的数据结构，定义了产品的组成结构和数量关系。

**BOM的基本结构**

BOM描述了从原材料到成品的整个制造过程，通常包含以下要素：

- 父物料：组装件或成品
- 子物料：组件、原材料
- 数量关系：每个父物料需要的子物料数量
- 层级关系：表明物料的上下级结构
- 生效日期：BOM的有效时间范围

```
产品A（层级0）
├── 子物料A1（层级1）× 2
│   ├── 原材料X × 3（层级2）
│   └── 原材料Y × 1（层级2）
├── 子物料A2（层级1）× 1
│   └── 原材料Z × 5（层级2）
└── 包材 × 1（层级1）
```

**BOM展开**

BOM展开是将多层级的物料清单展开为完整的零件清单的过程。MES系统需要支持正序展开（从成品到原材料）和逆序展开（从原材料到成品）。

正序展开常用于计算生产单件产品所需的全部原材料数量，示例逻辑：

```python
def bom_expand(parent_item, quantity, visited=None):
    """BOM正序展开"""
    if visited is None:
        visited = set()

    # 防止循环引用
    if parent_item.id in visited:
        return []
    visited.add(parent_item.id)

    result = []
    for component in parent_item.components:
        required_qty = component.quantity * quantity
        result.append({
            'item_id': component.item.id,
            'item_name': component.item.name,
            'quantity': required_qty,
            'level': len(visited) - 1
        })

        # 递归展开子层级
        if component.item.is_assembly:
            sub_items = bom_expand(component.item, required_qty, visited.copy())
            result.extend(sub_items)

    return result
```

**BOM的应用场景**

在MES中，BOM主要用于：

1. **生产订单生成**：根据销售订单和产品BOM自动计算所需物料
2. **物料领用**：根据实际生产数量计算应领物料数量
3. **成本核算**：根据BOM结构计算产品标准成本
4. **物料追溯**：建立产品与原材料的追溯关系

### 21.1.2 工艺路线

工艺路线定义了产品从原材料到成品的加工顺序和参数，是MES进行生产调度的核心依据。

**工序定义**

工序（Operation）是工艺路线的基本单元，每个工序包含：

- 工序编号和名称
- 所属工作中心
- 标准工时（准备时间、加工时间）
- 工序说明和检验要求
- 替代工序（可用于工艺路线的备用方案）

```yaml
工艺路线: 产品A的加工流程
  工序10: 原材料检验
    工作中心: QC01
    标准工时: 15分钟
    检验标准: 来料检验规范A01
  
  工序20: 粗加工
    工作中心: MC01
    标准工时: 120分钟
    工艺参数:
      切削速度: 150m/min
      进给量: 0.2mm/rev
  
  工序30: 精加工
    工作中心: MC02
    标准工时: 90分钟
    工艺参数:
      切削速度: 200m/min
      进给量: 0.1mm/rev
  
  工序40: 成品检验
    工作中心: QC02
    标准工时: 30分钟
    检验标准: 出货检验规范B01
```

**工艺参数**

工艺参数是工序执行过程中的技术要求，包括设备参数（如转速、进给量）、环境参数（如温度、湿度）、检测参数（如公差范围）等。这些参数需要在MES中记录并可能通过接口下发到生产设备。

**工时管理**

工时是生产计划和成本核算的关键数据：

- **准备时间**：首次加工前的准备作业时间
- **加工时间**：实际执行加工的时间
- **传送时间**：工序间物料传递的时间
- **等待时间**：等待加工或检验的排队时间

MES系统需要根据工艺路线中的工时数据进行生产排程和产能计算。

### 21.1.3 工作中心

工作中心是MES中进行产能计划和车间调度的基本单元，代表可以执行工序的物理设备或设备组。

**设备组管理**

工作中心通常按照以下原则划分：

- 按设备类型：车床组、铣床组、注塑机组
- 按生产能力：高效生产线、低产能设备
- 按责任单元：甲班、乙方
- 按物理位置：车间A、车间B

```
工作中心定义示例:
├── 加工中心组
│   ├── MC-001: 数控加工中心（高速型）
│   ├── MC-002: 数控加工中心（普通型）
│   └── MC-003: 数控加工中心（普通型）
├── 组装线
│   ├── ASM-001: 自动组装线
│   └── ASM-002: 手动组装线
└── 质检站
    ├── QC-001: 三次元检测仪
    └── QC-002: 常规量具检测
```

**资源定义**

每个工作中心包含多种资源：

- 设备资源：实际的生产设备
- 人员资源：操作人员、技能等级
- 工具资源：模具、夹具、刀具
- 能力资源：产能、效率指标

MES需要维护工作中心的产能数据，包括：

- 最大产能（理论产能）
- 实际产能（考虑设备状态、人员）
- 可用产能（考虑已排程和预留）

### 21.1.4 生产类型

不同生产类型对MES系统有不同的要求，开发者需要理解各类生产模式的特点。

**离散制造**

离散制造是将原材料通过物理或化学变化形成产品的制造方式，典型行业包括机械制造、电子组装、汽车制造等。

特点：

- 产品由多个离散部件组成
- 工艺路线相对固定
- 生产顺序明确
- 适合批量生产

MES需求重点：工序报工、物料追溯、产能调度

**流程制造**

流程制造通过配方和化学反应将原材料转化为产品，典型行业包括化工、食品、制药等。

特点：

- 配方管理为核心
- 连续生产或批量生产
- 对工艺参数要求严格
- 产出与投入可能不呈线性关系

MES需求重点：配方管理、工艺参数控制、批次追溯

**批量生产**

批量生产是介于离散制造和流程制造之间的模式，每批次有明确的数量和批次号。

特点：

- 固定批量大小
- 批次为最小管理单元
- 支持追溯到批次
- 可以包含离散的工序和连续的工序

MES需求重点：批次管理、混批控制、批次追溯

### 21.1.5 本节小结

制造业业务知识是MES开发的基础。开发者需要深入理解BOM结构与展开、工艺路线设计、工作中心规划以及不同生产类型的特点。这些知识将贯穿于MES系统的整个设计过程，从基础数据建模到生产调度算法，都离不开对制造业业务的深刻理解。

## 21.2 工业协议

工业协议是MES与生产设备、SCADA系统、PLC等工业硬件通信的桥梁。掌握主流工业协议是MES开发的必备技能。

### 21.2.1 OPC UA

OPC UA（Open Platform Communications Unified Architecture）是工业4.0时代的主流通信标准，提供了跨平台的设备通信能力。

**OPC UA架构**

OPC UA采用客户端-服务器架构，主要包含以下层次：

```
OPC UA架构分层:
├── 信息模型层
│   ├── 地址空间
│   ├── 节点类
│   └── 引用类型
├── 服务层
│   ├── 发现服务
│   ├── 会话服务
│   ├── 读写服务
│   └── 订阅服务
├── 安全层
│   ├── 身份认证
│   ├── 加密传输
│   └── 权限管理
└── 传输层
    ├── OPC UA TCP
    ├── HTTPS
    └── WebSocket
```

**地址空间模型**

OPC UA以面向对象的方式组织数据，每个节点包含属性并通过引用连接。典型地址空间结构：

```
Root
├── Objects
│   ├── Device1
│   │   ├── Temperature (变量)
│   │   ├── Status (变量)
│   │   └── Reset (方法)
│   └── Device2
│       └── ...
├── Types
│   ├── DataTypes
│   ├── VariableTypes
│   └── ObjectTypes
└── Views
```

**安全机制**

OPC UA提供多层次的安全机制：

- **身份认证**：用户名/密码、证书、X.509证书
- **加密传输**：AES256、AES128加密
- **签名**：HMAC签名确保数据完整性
- **权限控制**：基于角色的访问控制（RBAC）

连接示例（Python）：

```python
from opcua import Client, ua

class OPCUAClient:
    def __init__(self, url):
        self.url = url
        self.client = None
    
    def connect(self):
        self.client = Client(self.url)
        # 设置安全策略
        self.client.set_security_string(
            "Basic256Sha256,Sign,cert.pem,private-key.pem"
        )
        self.client.connect()
    
    def read_value(self, node_id):
        """读取节点值"""
        node = self.client.get_node(node_id)
        return node.get_value()
    
    def write_value(self, node_id, value):
        """写入节点值"""
        node = self.client.get_node(node_id)
        dv = ua.DataValue(ua.Variant(value, ua.VariantType.Double))
        node.set_value(dv)
    
    def subscribe(self, node_ids, callback):
        """订阅节点变化"""
        subscription = self.client.create_subscription(1000, callback)
        for node_id in node_ids:
            node = self.client.get_node(node_id)
            subscription.subscribe_data_change(node)
    
    def disconnect(self):
        self.client.disconnect()
```

**信息模型扩展**

OPC UA支持自定义信息模型，制造业常用扩展包括：

- PLCopen功能块模型
- 设备厂商特定模型
- 行业标准模型（如PackML for包装机械）

### 21.2.2 MQTT协议

MQTT（Message Queuing Telemetry Transport）是轻量级的发布/订阅消息协议，广泛用于物联网和工业数据采集场景。

**MQTT基础**

MQTT采用发布/订阅模式，核心概念：

- **Broker（代理）**：消息转发中心
- **Publisher（发布者）**：发送消息的客户端
- **Subscriber（订阅者）**：接收消息的客户端
- **Topic（主题）**：消息的分类标识
- **QoS（服务质量）**：消息传递保证级别

```
MQTT架构:
     ┌──────────┐     ┌──────────┐
     │Device A  │     │Device B  │
     │(Publisher)    │(Subscriber)    │
     └────┬─────┘     └──────┬────┘
          │                  │
          ▼                  ▼
     ┌─────────────────────────────────┐
     │          MQTT Broker            │
     │       (Mosquitto/HiveMQ)        │
     └─────────────────────────────────┘
          │                  ▲
          ▼                  │
     ┌──────────┐     ┌──────────┐
     │SCADA     │     │MES       │
     │(Publisher)    │(Subscriber)    │
     └──────────┘     └──────────┘
```

**QoS级别**

MQTT提供三级QoS：

- **QoS 0（最多一次）**：消息最多传递一次，可能丢失
- **QoS 1（至少一次）**：确保消息到达，但可能重复
- **QoS 2（恰好一次）**：确保消息仅到达一次

工业场景选择建议：

| 场景 | 推荐QoS | 原因 |
|------|---------|------|
| 实时状态 | QoS 0 | 丢失可接受，数据频繁 |
| 重要报警 | QoS 1 | 必须到达，允许重复 |
| 控制命令 | QoS 2 | 精确一次，不容重复 |

**主题设计**

工业数据采集的主题设计示例：

```yaml
主题结构设计:
  工厂级别:
    factory/{factory_id}/+/+/+    # 全厂数据
  
  车间级别:
    factory/{factory_id}/workshop/{workshop_id}/+/+
  
  设备级别:
    factory/{factory_id}/workshop/{workshop_id}/device/{device_id}/status
    factory/{factory_id}/workshop/{workshop_id}/device/{device_id}/telemetry
  
  具体数据:
    factory/01/workshop/A1/device/PLC001/status
    factory/01/workshop/A1/device/PLC001/telemetry/temperature
    factory/01/workshop/A1/device/PLC001/telemetry/pressure
```

Python客户端示例：

```python
import paho.mqtt.client as mqtt
import json

class MQTTSubscriber:
    def __init__(self, broker, port, client_id):
        self.broker = broker
        self.port = port
        self.client = mqtt.Client(client_id)
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
    
    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            print("连接成功")
            # 订阅多个主题
            client.subscribe([
                ("factory/+/workshop/+/device/+/status", 0),
                ("factory/+/workshop/+/device/+/telemetry/#", 1)
            ])
        else:
            print(f"连接失败: {rc}")
    
    def _on_message(self, client, userdata, msg):
        """处理接收到的消息"""
        try:
            topic = msg.topic
            payload = json.loads(msg.payload.decode())
            print(f"收到 [{topic}]: {payload}")
        except Exception as e:
            print(f"消息解析错误: {e}")
    
    def connect(self):
        self.client.connect(self.broker, self.port, 60)
        self.client.loop_forever()
```

### 21.2.3 Modbus协议

Modbus是历史最悠久的工业通信协议之一，至今仍广泛应用于PLC、传感器和仪表的通信。

**Modbus变体**

| 类型 | 传输方式 | 特点 |
|------|----------|------|
| Modbus RTU | RS-232/RS-485串行 | 二进制格式，效率高 |
| Modbus ASCII | 串行 | ASCII格式，易于调试 |
| Modbus TCP | 以太网 | IP网络通信，组网方便 |

**寄存器定义**

Modbus以寄存器为单位存储数据：

| 寄存器类型 | 功能码 | 地址范围 | 用途 |
|------------|--------|----------|------|
| 保持寄存器 | 03, 06, 16 | 40001-49999 | 读写参数 |
| 输入寄存器 | 04 | 30001-39999 | 只读传感器值 |
| 线圈 | 01, 05, 15 | 00001-09999 | 读写开关量 |
| 离散输入 | 02 | 10001-19999 | 只读开关状态 |

**读写操作示例**

Python Modbus通信示例：

```python
from pymodbus.client import ModbusTcpClient
from pymodbus.exceptions import ModbusException

class ModbusClient:
    def __init__(self, host, port):
        self.host = host
        self.port = port
        self.client = ModbusTcpClient(host, port)
    
    def read_holding_registers(self, address, count):
        """读取保持寄存器"""
        response = self.client.read_holding_registers(address, count, unit=1)
        if response.isError():
            raise ModbusException(f"读取错误: {response}")
        return response.registers
    
    def write_single_register(self, address, value):
        """写入单个寄存器"""
        response = self.client.write_register(address, value, unit=1)
        if response.isError():
            raise ModbusException(f"写入错误: {response}")
        return True
    
    def read_coils(self, address, count):
        """读取线圈（开关量）"""
        response = self.client.read_coils(address, count, unit=1)
        if response.isError():
            raise ModbusException(f"读取错误: {response}")
        return response.bits
    
    def close(self):
        self.client.close()


# 使用示例
modbus = ModbusClient("192.168.1.100", 502)

# 读取温度传感器（假设地址为30001）
temperature = modbus.read_holding_registers(0, 1)[0]  # 实际偏移量需减去40001
print(f"温度: {temperature / 10}°C")  # 假设数据放大10倍

# 读取设备状态
status = modbus.read_coils(0, 8)
print(f"设备状态: {status}")

modbus.close()
```

### 21.2.4 协议选择

在MES项目中选择合适的工业协议需要考虑多种因素。

**场景对比**

| 协议 | 适用场景 | 优势 | 劣势 |
|------|----------|------|------|
| OPC UA | 跨厂商集成、复杂数据模型 | 标准化、安全、面向对象 | 复杂度高、资源消耗大 |
| MQTT | 物联网、大量传感器 | 轻量级、发布订阅模式 | 不适合实时控制 |
| Modbus | PLC、简单设备通信 | 简单成熟、兼容性好 | 功能有限、无安全机制 |

**选型建议**

1. **新项目现代化集成**：优先选择OPC UA，作为企业级集成的标准
2. **设备数据采集**：MQTT适用于大量分散的IoT设备数据采集
3. **传统设备改造**：Modbus/RTU仍是PLC和仪表的主流选择
4. **混合场景**：OPC UA over MQTT结合两者优势
5. **安全要求高**：OPC UA提供完整的安全机制

### 21.2.5 本节小结

工业协议是MES与设备层通信的基础。OPC UA作为现代工业4.0的标准协议，适合复杂的企业级集成；MQTT以其轻量级特性适合大规模物联网场景；Modbus以其简单成熟仍在传统设备中广泛使用。MES开发者需要根据实际场景选择合适的协议，并能够实现多种协议的转换和集成。

## 21.3 数据库技术

数据库是MES系统的核心，用于存储生产数据、工艺参数、业务配置等关键信息。MES开发者需要掌握关系型数据库和时序数据库的使用。

### 21.3.1 关系型数据库

关系型数据库存储MES的核心业务数据，如订单、BOM、工艺、客户等结构化数据。

**Oracle**

Oracle是大型MES系统的首选数据库，特别适合对稳定性和性能要求高的制造企业。

特点：

- 高并发处理能力强
- 成熟的分区表和索引技术
- 强大的PL/SQL存储过程
- 完善的数据安全机制

适用场景：大型集团级MES、数据量大、并发要求高

**MySQL**

MySQL是开源MES系统的主流选择，拥有完善的生态。

特点：

- 开源免费
- 简单易用，管理成本低
- 读写性能优秀
- 主从复制成熟

适用场景：中小型MES、云部署、成本敏感项目

**PostgreSQL**

PostgreSQL功能最全面的开源关系型数据库。

特点：

- 完全ACID兼容
- JSON/JSONB类型支持
- 丰富的索引类型
- 强大的扩展性

适用场景：需要复杂查询、MES原型开发、混合存储需求

**选型建议**

| 因素 | Oracle | MySQL | PostgreSQL |
|------|--------|-------|------------|
| 数据量 | 超大规模 | 中小规模 | 中大规模 |
| 并发 | 极高 | 高 | 高 |
| 成本 | 高 | 低 | 低 |
| 复杂度 | 高 | 低 | 中 |
| 推荐场景 | 核心系统 | Web MES | 复杂查询 |

### 21.3.2 时序数据库

时序数据库（Time Series Database，TSDB）专为存储和时间相关的数据设计，非常适合工业设备数据采集场景。

**InfluxDB**

InfluxDB是最流行的开源时序数据库，提供InfluxQL查询语言。

特点：

- 高写入性能
- 数据压缩存储
- 丰富的聚合函数
- 完善的生态系统

数据模型：

```
measurement: 生产设备数据
├── tags: 设备标识（索引）
│   ├── device_id: 设备ID
│   ├── workshop: 车间
│   └── device_type: 设备类型
└── fields: 测量值
    ├── temperature: 温度
    ├── pressure: 压力
    └── status: 状态码
```

写入示例：

```python
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

class TimeSeriesWriter:
    def __init__(self, url, token, org, bucket):
        self.client = InfluxDBClient(url=url, token=token, org=org)
        self.write_api = self.client.write_api(write_options=SYNCHRONOUS)
        self.bucket = bucket
    
    def write_device_data(self, device_id, workshop, data):
        """写入设备数据"""
        point = (
            Point("production_device")
            .tag("device_id", device_id)
            .tag("workshop", workshop)
            .field("temperature", data.get("temperature", 0))
            .field("pressure", data.get("pressure", 0))
            .field("status", data.get("status", 0))
        )
        self.write_api.write(bucket=self.bucket, org="myorg", record=point)
    
    def query_avg_temperature(self, device_id, start, stop):
        """查询平均温度"""
        query = f'''
        from(bucket: "{self.bucket}")
          |> range(start: {start}, stop: {stop})
          |> filter(fn: (r) => r["_measurement"] == "production_device")
          |> filter(fn: (r) => r["device_id"] == "{device_id}")
          |> filter(fn: (r) => r["_field"] == "temperature")
          |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
        '''
        return self.client.query_api().query(query)
```

**TimescaleDB**

TimescaleDB是PostgreSQL的时序数据库扩展，兼具关系型和时序数据库的优点。

特点：

- 基于PostgreSQL，SQL兼容
- 自动分区（Hypertable）
- 支持JOIN查询
- 成熟的事务支持

适用场景：需要与关系型数据联合查询、已有PostgreSQL技术栈

**IoTDB**

IoTDB是国产开源时序数据库，专为IoT和工业场景设计。

特点：

- 针对时序数据优化存储
- 支持端边云部署
- 低资源占用
- 丰富的工业协议支持

适用场景：工业物联网、边缘计算、国内项目

### 21.3.3 数据库设计原则

**范式设计**

MES数据库设计应遵循数据库范式：

- **第一范式（1NF）**：字段原子性，不可再分
- **第二范式（2NF）**：消除部分依赖，主键字段完全决定非主键字段
- **第三范式（3NF）**：消除传递依赖，非主键字段之间不应有依赖关系

典型MES表结构设计示例：

```sql
-- 订单表（核心业务表）
CREATE TABLE mes_production_order (
    order_id VARCHAR(32) PRIMARY KEY,
    order_no VARCHAR(50) NOT NULL UNIQUE,
    product_id VARCHAR(32) NOT NULL,
    quantity DECIMAL(18, 4) NOT NULL,
    completed_quantity DECIMAL(18, 4) DEFAULT 0,
    start_date DATE,
    end_date DATE,
    status VARCHAR(20) DEFAULT 'PENDING',
    priority INT DEFAULT 0,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES bas_product(product_id),
    INDEX idx_order_no (order_no),
    INDEX idx_status (status),
    INDEX idx_product (product_id)
) COMMENT '生产订单';

-- 报工记录表（生产过程数据）
CREATE TABLE mes_work_report (
    report_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id VARCHAR(32) NOT NULL,
    operation_id VARCHAR(32) NOT NULL,
    workcenter_id VARCHAR(32) NOT NULL,
    worker_id VARCHAR(32),
    quantity DECIMAL(18, 4) NOT NULL,
    qualified_quantity DECIMAL(18, 4),
    work_time INT COMMENT '工作时长（分钟）',
    report_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES mes_production_order(order_id),
    FOREIGN KEY (operation_id) REFERENCES mes_operation(operation_id),
    FOREIGN KEY (workcenter_id) REFERENCES mes_workcenter(workcenter_id),
    INDEX idx_order (order_id),
    INDEX idx_workcenter (workcenter_id),
    INDEX idx_report_time (report_time)
) COMMENT '报工记录';
```

**索引优化**

合理的索引设计能显著提升查询性能：

1. **主键索引**：自动创建，唯一且非空
2. **外键索引**：提升JOIN性能
3. **常用查询索引**：根据实际查询模式设计
4. **复合索引**：考虑查询的选择性和覆盖性

索引设计建议：

```sql
-- 复合索引示例：按车间和日期查询报工记录
CREATE INDEX idx_workshop_date ON mes_work_report(workshop_id, report_date);

-- 覆盖索引示例：查询订单详情时包含关键字段
CREATE INDEX idx_order_cover ON mes_production_order 
    (status, priority, start_date) 
    INCLUDE (product_id, quantity);

-- 避免过多索引：索引会降低写入性能
-- 定期分析慢查询，删除不使用的索引
```

### 21.3.4 本节小结

MES开发需要掌握关系型数据库和时序数据库。关系型数据库存储核心业务数据，Oracle、MySQL和PostgreSQL各有优势；时序数据库处理大量设备时序数据，InfluxDB、TimescaleDB和IoTDB是主流选择。数据库设计应遵循范式原则，合理设计索引以平衡查询和写入性能。

## 21.4 实时数据处理

MES系统需要处理来自生产设备的实时数据，包括设备状态、传感器数据、生产进度等。实时数据处理能力是现代MES的核心竞争力。

### 21.4.1 数据采集技术

数据采集是实时数据处理的第一步，常见方式分为主动采集和被动接收两种。

**主动采集**

主动采集指MES系统主动向设备发起请求，获取数据。适用于对实时性要求不高或设备不支持主动上报的场景。

实现方式：

```python
import time
import threading
from opcua import Client
from pymodbus.client import ModbusTcpClient

class ActiveCollector:
    def __init__(self, config):
        self.config = config
        self.running = False
        self.interval = config.get('interval', 5)  # 采集间隔（秒）
        self.clients = {}
    
    def register_device(self, device_id, protocol, params):
        """注册设备"""
        if protocol == 'opcua':
            self.clients[device_id] = {
                'type': 'opcua',
                'url': params['url'],
                'nodes': params.get('nodes', []),
                'client': None
            }
        elif protocol == 'modbus':
            self.clients[device_id] = {
                'type': 'modbus',
                'host': params['host'],
                'port': params['port'],
                'registers': params.get('registers', []),
                'client': None
            }
    
    def collect_opcua(self, device):
        """OPC UA数据采集"""
        try:
            if device['client'] is None:
                device['client'] = Client(device['url'])
                device['client'].connect()
            
            results = {}
            for node_info in device['nodes']:
                node_id = node_info['node_id']
                value = device['client'].get_node(node_id).get_value()
                results[node_id] = {
                    'value': value,
                    'timestamp': time.time()
                }
            return results
        except Exception as e:
            print(f"OPC UA采集错误: {e}")
            device['client'] = None  # 断线重连
            return {}
    
    def collect_modbus(self, device):
        """Modbus数据采集"""
        try:
            if device['client'] is None:
                device['client'] = ModbusTcpClient(
                    device['host'], device['port']
                )
            
            results = {}
            for reg_info in device['registers']:
                address = reg_info['address']
                count = reg_info.get('count', 1)
                values = device['client'].read_holding_registers(
                    address, count, unit=1
                ).registers
                results[address] = {
                    'values': values,
                    'timestamp': time.time()
                }
            return results
        except Exception as e:
            print(f"Modbus采集错误: {e}")
            return {}
    
    def start(self):
        """启动采集"""
        self.running = True
        while self.running:
            for device_id, device in self.clients.items():
                if device['type'] == 'opcua':
                    data = self.collect_opcua(device)
                elif device['type'] == 'modbus':
                    data = self.collect_modbus(device)
                
                if data:
                    self.process_data(device_id, data)
            
            time.sleep(self.interval)
    
    def process_data(self, device_id, data):
        """处理采集数据"""
        # 发送到消息队列或写入时序数据库
        print(f"设备 {device_id} 数据: {data}")
    
    def stop(self):
        """停止采集"""
        self.running = False
        for device in self.clients.values():
            if device.get('client'):
                device['client'].disconnect()
```

**被动接收**

被动接收指设备主动上报数据，MES系统作为服务端接收。适用于支持主动上报的现代化设备和需要高实时性的场景。

实现方式：

```python
import json
from mqtt import mqtt
from flask import Flask, request

# MQTT被动接收
class MqttReceiver:
    def __init__(self, broker, port):
        self.client = mqtt.Client()
        self.client.on_message = self.on_message
        self.client.connect(broker, port)
    
    def on_message(self, client, userdata, msg):
        """处理接收到的消息"""
        try:
            topic = msg.topic
            payload = json.loads(msg.payload.decode())
            # 解析设备数据并存储
            self.process_device_data(topic, payload)
        except Exception as e:
            print(f"消息处理错误: {e}")
    
    def subscribe(self, topic):
        self.client.subscribe(topic)
    
    def process_device_data(self, topic, payload):
        """处理设备数据"""
        # 提取设备标识
        parts = topic.split('/')
        factory_id = parts[1]
        workshop_id = parts[3]
        device_id = parts[5]
        
        # 写入时序数据库
        print(f"收到数据: 工厂={factory_id}, 车间={workshop_id}, 设备={device_id}")
    
    def start(self):
        self.client.loop_forever()

# HTTP被动接收
app = Flask(__name__)

@app.route('/api/device/report', methods=['POST'])
def device_report():
    """设备主动上报数据"""
    data = request.json
    device_id = data.get('device_id')
    telemetry = data.get('telemetry', {})
    
    # 写入时序数据库或消息队列
    return {'code': 0, 'message': 'success'}
```

### 21.4.2 消息队列

消息队列是实时数据处理的核心组件，用于解耦数据生产和消费、提供缓冲能力和异步处理能力。

**Kafka**

Apache Kafka是分布式消息队列，适合高吞吐量的实时数据处理场景。

特点：

- 高吞吐量：支持百万级消息/秒
- 分布式架构：水平扩展能力强
- 持久化：消息持久化到磁盘
- 消费者组：支持负载均衡和容错

MES应用场景：

- 设备数据采集缓冲
- 生产事件流处理
- 微服务间通信

使用示例：

```python
from kafka import KafkaProducer, KafkaConsumer
import json

class MESKafkaProducer:
    def __init__(self, bootstrap_servers):
        self.producer = KafkaProducer(
            bootstrap_servers=bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode('utf-8'),
            key_serializer=lambda k: k.encode('utf-8') if k else None
        )
    
    def send_device_data(self, topic, device_id, data):
        """发送设备数据"""
        future = self.producer.send(
            topic,
            key=device_id,
            value={
                'device_id': device_id,
                'data': data,
                'timestamp': int(time.time() * 1000)
            }
        )
        # 同步等待确认
        record_metadata = future.get(timeout=10)
        return record_metadata.topic, record_metadata.partition
    
    def close(self):
        self.producer.close()


class MESKafkaConsumer:
    def __init__(self, bootstrap_servers, group_id, topics):
        self.consumer = KafkaConsumer(
            *topics,
            bootstrap_servers=bootstrap_servers,
            group_id=group_id,
            value_deserializer=lambda m: json.loads(m.decode('utf-8')),
            auto_offset_reset='earliest',
            enable_auto_commit=True
        )
    
    def consume(self):
        """消费消息"""
        for message in self.consumer:
            print(f"收到消息: {message.topic} [{message.partition}] "
                  f"offset={message.offset}")
            yield message.value
    
    def close(self):
        self.consumer.close()
```

**RabbitMQ**

RabbitMQ是功能完善的消息中间件，支持多种消息模式和路由策略。

特点：

- 多种消息模式：发布/订阅、路由、主题
- 灵活的路由能力
- 完善的权限管理
- 丰富的客户端库

适用场景：需要复杂路由、消息确认、优先级队列的场景

### 21.4.3 流处理

流处理（Stream Processing）是对连续数据流进行实时计算的技术，适合大规模设备数据的实时分析。

**Flink**

Apache Flink是流处理领域的领先框架，支持事件时间处理和精确一次语义。

特点：

- 真正流处理：原生支持流式计算
- 事件时间处理：处理乱序和延迟数据
- 精确一次语义：保证数据准确性
- 强大窗口函数：支持滚动、滑动、会话窗口

Flink任务示例：

```java
// Flink流处理任务：计算设备平均温度
public class DeviceTemperatureProcessor {
    public static void main(String[] args) throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        
        // 从Kafka读取设备数据
        DataStream<String> rawStream = env.addSource(
            new FlinkKafkaConsumer<>(
                "device-telemetry",
                new SimpleStringSchema(),
                kafkaProps
            )
        );
        
        // 解析JSON
        DataStream<DeviceData> deviceStream = rawStream
            .map(json -> {
                JSONObject obj = new JSONObject(json);
                return new DeviceData(
                    obj.getString("device_id"),
                    obj.getLong("timestamp"),
                    obj.getDouble("temperature"),
                    obj.getDouble("pressure")
                );
            });
        
        // 按设备分组，5分钟滚动窗口计算平均值
        DataStream<DeviceAgg> aggStream = deviceStream
            .keyBy(DeviceData::getDeviceId)
            .window(TumblingEventTimeWindows.of(Time.minutes(5)))
            .process(new WindowAggFunction());
        
        // 输出到数据库
        aggStream.addSink(new JdbcSink(
            "INSERT INTO device_agg VALUES (?, ?, ?, ?, ?)",
            (statement, agg) -> {
                statement.setString(1, agg.getDeviceId());
                statement.setLong(2, agg.getWindowStart());
                statement.setLong(3, agg.getWindowEnd());
                statement.setDouble(4, agg.getAvgTemperature());
                statement.setLong(5, agg.getRecordCount());
            }
        ));
        
        env.execute("Device Temperature Aggregation");
    }
}
```

**Spark Streaming**

Spark Streaming是微批处理框架，将连续数据流切分为小批次处理。

特点：

- 吞吐量高：适合大规模批处理
- 生态系统完善：与Spark SQL、MLlib集成
- 延迟较高：通常秒级延迟

适用场景：对延迟要求不高（秒级）、需要复杂批处理逻辑的场景

**流处理选型**

| 特性 | Flink | Spark Streaming |
|------|-------|-----------------|
| 处理模式 | 真流处理 | 微批处理 |
| 延迟 | 毫秒级 | 秒级 |
| 吞吐量 | 高 | 很高 |
| 状态管理 | Checkpoint | RDD lineage |
| 窗口支持 | 丰富 | 基础 |
| 推荐场景 | 实时分析、低延迟需求 | 批量分析、复杂ETL |

### 21.4.4 本节小结

实时数据处理是现代MES的核心能力。数据采集技术分为主动采集和被动接收，MQTT和HTTP是常用的被动接收协议。消息队列（Kafka、RabbitMQ）提供了解耦和缓冲能力，是构建实时数据管道的基础。流处理框架（Flink、Spark Streaming）支持对大规模数据流进行实时分析，开发者应根据延迟要求和处理复杂度选择合适的方案。

## 21.5 本章总结

本章系统介绍了MES开发所需的核心知识体系：

1. **制造业业务知识**：BOM、工艺路线、工作中心、生产类型是理解MES业务逻辑的基础
2. **工业协议**：OPC UA、MQTT、Modbus是MES与设备通信的三大支柱协议
3. **数据库技术**：关系型数据库存储核心业务数据，时序数据库处理设备时序数据
4. **实时数据处理**：数据采集、消息队列、流处理构成完整的实时数据处理架构

这些知识将贯穿于后续章节的具体模块开发中，帮助开发者建立完整的MES技术视野。掌握这些知识后，开发者可以开始构建功能完整、性能优良的MES系统。