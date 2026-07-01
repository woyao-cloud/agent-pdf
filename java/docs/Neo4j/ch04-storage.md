# 第4章 Neo4j 原生图存储引擎

## 4.1 概述

Neo4j 之所以在图数据库领域占据领先地位，其核心优势之一在于**原生图存储引擎**（Native Graph Storage Engine）。与将图数据序列化到关系型数据库或通用键值存储中的非原生方案不同，Neo4j 从磁盘布局到内存缓存均为图结构量身设计。这种"存储即图"的理念带来了一个关键特性：**无索引邻接**（Index-Free Adjacency）。当从一个节点遍历到其邻居时，Neo4j 只需通过记录中的指针直接跳转，无需经过索引查找，遍历速度仅取决于实际关联边的数量，与图的总规模无关。

本章将深入剖析 Neo4j 存储引擎的底层实现，涵盖节点存储、关系存储、属性存储、标签存储、文件结构以及内存映射与页面缓存机制，并辅以 Java 代码帮助读者建立直观理解。

## 4.2 存储文件结构

Neo4j 将图数据持久化到一组固定名称的磁盘文件中，这些文件位于数据库目录的 `neostore` 命名空间下。每个存储文件对应一种记录类型，采用**定长记录**（Fixed-Size Record）格式，使得记录位置可通过 `recordId × recordSize` 直接计算，实现 O(1) 的随机访问。

### 4.2.1 核心文件清单

| 文件路径 | 存储内容 | 记录大小 |
|---|---|---|
| `neostore.nodestore.db` | 节点记录 | 15 字节 |
| `neostore.relationshipstore.db` | 关系记录 | 34 字节 |
| `neostore.propertystore.db` | 属性记录（主存储） | 动态 |
| `neostore.propertystore.db.strings` | 长字符串属性 | 动态 |
| `neostore.propertystore.db.arrays` | 数组属性 | 动态 |
| `neostore.labeltokenstore.db` | 标签令牌 | 动态 |
| `neostore.labeltokenstore.names` | 标签名称 | 动态 |
| `neostore.schemastore.db` | 模式索引定义 | 动态 |
| `neostore.relationshipgroupstore.db` | 关系组 | 25 字节 |

### 4.2.2 记录寻址

所有记录通过**逻辑 ID**（即记录序号）寻址。给定记录 ID `id` 和固定记录大小 `recordSize`，其在文件中的字节偏移量为：

```
offset = id × recordSize
```

这种直接映射方式避免了 B-Tree 或哈希索引的额外开销，是 Neo4j 实现高性能图遍历的基石。

```java
// 记录寻址示例
public class RecordAddressing {
    public static final int NODE_RECORD_SIZE = 15;
    public static final int RELATIONSHIP_RECORD_SIZE = 34;

    public static long computeOffset(long recordId, int recordSize) {
        return recordId * recordSize;
    }

    public static void main(String[] args) {
        long nodeId = 1000L;
        long offset = computeOffset(nodeId, NODE_RECORD_SIZE);
        System.out.printf("节点 ID %d 的文件偏移量: %d (0x%X)%n",
                nodeId, offset, offset);
        // 输出: 节点 ID 1000 的文件偏移量: 15000 (0x3A98)
    }
}
```

## 4.3 节点存储（Node Store）

节点存储是 Neo4j 最基础的存储结构，位于 `neostore.nodestore.db` 文件中。每条节点记录固定为 **15 字节**，采用紧凑的位级布局。

### 4.3.1 节点记录格式（15 字节）

```
偏移量  大小(字节)  字段              说明
─────────────────────────────────────────────────
0       1          inUse(1bit) + 保留位  记录是否被使用
1       4          firstRelId           第一条关系的 ID（大端序）
5       4          firstPropId          第一个属性的 ID（大端序）
9       5          labelField           标签位图或标签令牌引用
14      1          additionalFlags      额外标志位
```

**字段详解：**

- **inUse（1 位）**：标记记录是否已被分配。删除节点时仅将此位置 0，实现"软删除"。
- **firstRelId（4 字节）**：指向该节点的第一条关系记录的 ID。这是实现无索引邻接的关键——从节点出发，通过此字段直接跳转到关系链的头部。
- **firstPropId（4 字节）**：指向该节点的第一个属性记录的 ID。属性以单向链表形式组织。
- **labelField（5 字节 = 40 位）**：采用两种编码模式：
  - **内联模式**：当节点标签数量 ≤ 5 时，使用 40 位位图直接存储标签 ID（每个标签占用 8 位，最多 5 个标签 ID 或 40 个布尔标签）。
  - **溢出模式**：当标签数量超过内联容量时，此字段存储指向动态标签记录的指针。
- **additionalFlags（1 字节）**：存储版本信息、是否已删除等元数据。

### 4.3.2 节点记录的 Java 表示

```java
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

public class NodeRecord {
    public static final int RECORD_SIZE = 15;

    private long id;
    private boolean inUse;
    private long firstRelationshipId;
    private long firstPropertyId;
    private long labelField;
    private byte flags;

    public NodeRecord(long id) {
        this.id = id;
        this.inUse = false;
        this.firstRelationshipId = -1;  // -1 表示 null
        this.firstPropertyId = -1;
        this.labelField = 0;
        this.flags = 0;
    }

    /**
     * 从 15 字节的缓冲区反序列化节点记录
     */
    public static NodeRecord deserialize(long id, byte[] data) {
        if (data.length < RECORD_SIZE) {
            throw new IllegalArgumentException("数据长度不足: " + data.length);
        }

        ByteBuffer buf = ByteBuffer.wrap(data);
        buf.order(ByteOrder.BIG_ENDIAN);

        NodeRecord record = new NodeRecord(id);

        // 第一个字节：高 1 位为 inUse，低 7 位为保留位
        byte header = buf.get();
        record.inUse = (header & 0x80) != 0;  // 取最高位

        record.firstRelationshipId = buf.getInt();  // 4 字节
        record.firstPropertyId = buf.getInt();      // 4 字节

        // labelField 占 5 字节，需要手动读取
        byte[] labelBytes = new byte[5];
        buf.get(labelBytes);
        long labelVal = 0;
        for (int i = 0; i < 5; i++) {
            labelVal = (labelVal << 8) | (labelBytes[i] & 0xFF);
        }
        record.labelField = labelVal;

        record.flags = buf.get();  // 1 字节

        return record;
    }

    /**
     * 将节点记录序列化为 15 字节
     */
    public byte[] serialize() {
        ByteBuffer buf = ByteBuffer.allocate(RECORD_SIZE);
        buf.order(ByteOrder.BIG_ENDIAN);

        byte header = (byte) (inUse ? 0x80 : 0x00);
        buf.put(header);
        buf.putInt((int) firstRelationshipId);
        buf.putInt((int) firstPropertyId);

        // 写入 5 字节的 labelField
        for (int i = 4; i >= 0; i--) {
            buf.put((byte) ((labelField >> (i * 8)) & 0xFF));
        }

        buf.put(flags);
        return buf.array();
    }

    // getters 和 setters
    public long getId() { return id; }
    public boolean isInUse() { return inUse; }
    public void setInUse(boolean inUse) { this.inUse = inUse; }
    public long getFirstRelationshipId() { return firstRelationshipId; }
    public void setFirstRelationshipId(long id) { this.firstRelationshipId = id; }
    public long getFirstPropertyId() { return firstPropertyId; }
    public void setFirstPropertyId(long id) { this.firstPropertyId = id; }
    public long getLabelField() { return labelField; }
    public void setLabelField(long labelField) { this.labelField = labelField; }

    @Override
    public String toString() {
        return String.format(
            "NodeRecord[id=%d, inUse=%b, firstRel=%d, firstProp=%d, labels=0x%X]",
            id, inUse, firstRelationshipId, firstPropertyId, labelField);
    }
}
```

### 4.3.3 节点创建流程

```java
public class NodeStore {
    private static final int RECORD_SIZE = 15;
    private java.io.RandomAccessFile file;
    private long highId;  // 下一个可用的记录 ID

    public NodeStore(String filePath) throws Exception {
        this.file = new java.io.RandomAccessFile(filePath, "rw");
        this.highId = file.length() / RECORD_SIZE;
    }

    /**
     * 创建一个新节点，返回其 ID
     */
    public long createNode() throws Exception {
        long id = highId++;
        NodeRecord record = new NodeRecord(id);
        record.setInUse(true);
        writeRecord(record);
        return id;
    }

    /**
     * 读取指定 ID 的节点记录
     */
    public NodeRecord getNode(long id) throws Exception {
        byte[] data = new byte[RECORD_SIZE];
        long offset = id * RECORD_SIZE;
        file.seek(offset);
        file.readFully(data);
        return NodeRecord.deserialize(id, data);
    }

    /**
     * 更新节点记录
     */
    public void updateNode(NodeRecord record) throws Exception {
        writeRecord(record);
    }

    /**
     * 删除节点（软删除，仅清除 inUse 标志）
     */
    public void deleteNode(long id) throws Exception {
        NodeRecord record = getNode(id);
        record.setInUse(false);
        writeRecord(record);
    }

    private void writeRecord(NodeRecord record) throws Exception {
        long offset = record.getId() * RECORD_SIZE;
        file.seek(offset);
        file.write(record.serialize());
    }

    public void close() throws Exception {
        file.close();
    }
}
```

## 4.4 关系存储（Relationship Store）

关系存储位于 `neostore.relationshipstore.db`，每条记录固定 **34 字节**。关系存储最精妙的设计在于**双向链表**（Double-Linked List）结构：每个关系记录同时指向前一个和后一个关系，使得从任一方向遍历关系链都无需反向扫描。

### 4.4.1 关系记录格式（34 字节）

```
偏移量  大小(字节)  字段              说明
─────────────────────────────────────────────────
0       1          inUse(1bit) + 保留位  记录是否被使用
1       4          firstNode             起始节点 ID
5       4          secondNode            目标节点 ID
9       4          relType               关系类型 ID（引用关系类型令牌）
13      4          firstPrevRel          起始节点侧的前一个关系 ID
17      4          firstNextRel          起始节点侧的后一个关系 ID
21      4          secondPrevRel         目标节点侧的前一个关系 ID
25      4          secondNextRel         目标节点侧的后一个关系 ID
29      4          firstPropId           第一个属性 ID
33      1          flags                 标志位
```

**双向链表设计详解：**

关系链以节点记录中的 `firstRelId` 为入口，按关系类型分组。对于每个节点，其所有关系构成一个双向链表：

```
节点 A 的视角：
  firstRelId → Rel_5 → Rel_3 → Rel_7 → Rel_2 → -1
               ↑        ↑        ↑        ↑
              prev     prev     prev     prev

节点 B 的视角：
  firstRelId → Rel_5 → Rel_9 → Rel_2 → -1
               ↑        ↑        ↑
              prev     prev     prev
```

每个关系记录维护**两套**指针（prev/next），分别对应 `firstNode` 和 `secondNode` 两个方向。这意味着：

- 从节点 A 遍历其所有关系时，使用 `firstNextRel` 和 `firstPrevRel`（因为 A 是 firstNode）
- 从节点 B 遍历时，使用 `secondNextRel` 和 `secondPrevRel`（因为 B 是 secondNode）

这种设计使得无论从哪个节点出发，都能以 O(1) 的代价找到下一条关系，实现真正的无索引邻接遍历。

### 4.4.2 关系记录的 Java 实现

```java
public class RelationshipRecord {
    public static final int RECORD_SIZE = 34;

    private long id;
    private boolean inUse;
    private long firstNode;
    private long secondNode;
    private int type;
    private long firstPrevRel;
    private long firstNextRel;
    private long secondPrevRel;
    private long secondNextRel;
    private long firstPropertyId;
    private byte flags;

    public RelationshipRecord(long id) {
        this.id = id;
        this.inUse = false;
        this.firstNode = -1;
        this.secondNode = -1;
        this.type = -1;
        this.firstPrevRel = -1;
        this.firstNextRel = -1;
        this.secondPrevRel = -1;
        this.secondNextRel = -1;
        this.firstPropertyId = -1;
        this.flags = 0;
    }

    public static RelationshipRecord deserialize(long id, byte[] data) {
        if (data.length < RECORD_SIZE) {
            throw new IllegalArgumentException("数据长度不足: " + data.length);
        }

        ByteBuffer buf = ByteBuffer.wrap(data);
        buf.order(ByteOrder.BIG_ENDIAN);

        RelationshipRecord r = new RelationshipRecord(id);
        byte header = buf.get();
        r.inUse = (header & 0x80) != 0;
        r.firstNode = buf.getInt() & 0xFFFFFFFFL;
        r.secondNode = buf.getInt() & 0xFFFFFFFFL;
        r.type = buf.getInt();
        r.firstPrevRel = buf.getInt() & 0xFFFFFFFFL;
        r.firstNextRel = buf.getInt() & 0xFFFFFFFFL;
        r.secondPrevRel = buf.getInt() & 0xFFFFFFFFL;
        r.secondNextRel = buf.getInt() & 0xFFFFFFFFL;
        r.firstPropertyId = buf.getInt() & 0xFFFFFFFFL;
        r.flags = buf.get();
        return r;
    }

    public byte[] serialize() {
        ByteBuffer buf = ByteBuffer.allocate(RECORD_SIZE);
        buf.order(ByteOrder.BIG_ENDIAN);
        buf.put((byte) (inUse ? 0x80 : 0x00));
        buf.putInt((int) firstNode);
        buf.putInt((int) secondNode);
        buf.putInt(type);
        buf.putInt((int) firstPrevRel);
        buf.putInt((int) firstNextRel);
        buf.putInt((int) secondPrevRel);
        buf.putInt((int) secondNextRel);
        buf.putInt((int) firstPropertyId);
        buf.put(flags);
        return buf.array();
    }

    /**
     * 判断给定节点是关系的起始节点还是目标节点
     */
    public boolean isFirstNode(long nodeId) {
        return firstNode == nodeId;
    }

    /**
     * 获取给定节点侧的下一个关系 ID
     */
    public long getNextRel(long nodeId) {
        return isFirstNode(nodeId) ? firstNextRel : secondNextRel;
    }

    /**
     * 获取给定节点侧的前一个关系 ID
     */
    public long getPrevRel(long nodeId) {
        return isFirstNode(nodeId) ? firstPrevRel : secondPrevRel;
    }

    // getters 和 setters
    public long getId() { return id; }
    public boolean isInUse() { return inUse; }
    public void setInUse(boolean inUse) { this.inUse = inUse; }
    public long getFirstNode() { return firstNode; }
    public void setFirstNode(long firstNode) { this.firstNode = firstNode; }
    public long getSecondNode() { return secondNode; }
    public void setSecondNode(long secondNode) { this.secondNode = secondNode; }
    public int getType() { return type; }
    public void setType(int type) { this.type = type; }
    public long getFirstPrevRel() { return firstPrevRel; }
    public void setFirstPrevRel(long r) { this.firstPrevRel = r; }
    public long getFirstNextRel() { return firstNextRel; }
    public void setFirstNextRel(long r) { this.firstNextRel = r; }
    public long getSecondPrevRel() { return secondPrevRel; }
    public void setSecondPrevRel(long r) { this.secondPrevRel = r; }
    public long getSecondNextRel() { return secondNextRel; }
    public void setSecondNextRel(long r) { this.secondNextRel = r; }
    public long getFirstPropertyId() { return firstPropertyId; }
    public void setFirstPropertyId(long id) { this.firstPropertyId = id; }

    @Override
    public String toString() {
        return String.format(
            "RelRecord[id=%d, (%d)-[type:%d]->(%d), " +
            "firstChain: prev=%d next=%d, secondChain: prev=%d next=%d]",
            id, firstNode, type, secondNode,
            firstPrevRel, firstNextRel, secondPrevRel, secondNextRel);
    }
}
```

### 4.4.3 关系链遍历

```java
public class RelationshipTraverser {

    /**
     * 遍历指定节点的所有关系（使用双向链表）
     */
    public static void traverseRelationships(
            RelationshipStore relStore, long nodeId) throws Exception {

        // 1. 从节点记录获取第一条关系 ID
        NodeRecord node = nodeStore.getNode(nodeId);
        long relId = node.getFirstRelationshipId();

        System.out.printf("节点 %d 的关系链:%n", nodeId);

        // 2. 沿 next 指针遍历
        while (relId != -1) {
            RelationshipRecord rel = relStore.getRelationship(relId);
            long neighbor = rel.isFirstNode(nodeId)
                    ? rel.getSecondNode() : rel.getFirstNode();

            System.out.printf("  ──[%d]──→ 节点 %d (关系 ID: %d)%n",
                    rel.getType(), neighbor, relId);

            // 沿当前节点方向前进
            relId = rel.getNextRel(nodeId);
        }
    }

    /**
     * 双向遍历验证：从关系链中间向两端遍历
     */
    public static void bidirectionalTraverse(
            RelationshipStore relStore, long entryRelId, long nodeId)
            throws Exception {

        System.out.println("正向遍历（向尾部）:");
        long relId = entryRelId;
        while (relId != -1) {
            RelationshipRecord r = relStore.getRelationship(relId);
            System.out.printf("  关系 %d%n", relId);
            relId = r.getNextRel(nodeId);
        }

        System.out.println("反向遍历（向头部）:");
        relId = entryRelId;
        while (relId != -1) {
            RelationshipRecord r = relStore.getRelationship(relId);
            System.out.printf("  关系 %d%n", relId);
            relId = r.getPrevRel(nodeId);
        }
    }

    private static NodeStore nodeStore;
}
```

## 4.5 属性存储（Property Store）

属性存储是 Neo4j 中最复杂的存储结构，因为它需要处理**变长数据**。属性存储采用**链式记录**（Chained Record）设计，由三个文件协同工作：

### 4.5.1 属性存储架构

```
属性主存储 (neostore.propertystore.db)
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │ PropertyRec  │────→│ PropertyRec  │────→│ PropertyRec  │
  │ (固定大小)    │     │ (固定大小)    │     │ (固定大小)    │
  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
         │                     │                     │
         ▼                     ▼                     ▼
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │ 属性值(内联)  │     │ 属性值(内联)  │     │ 属性值(内联)  │
  │ 或指向       │     │ 或指向       │     │ 或指向       │
  │ String/Array │     │ String/Array │     │ String/Array │
  │ 存储的指针   │     │ 存储的指针   │     │ 存储的指针   │
  └──────────────┘     └──────────────┘     └──────────────┘
                                                    │
                                                    ▼
                                          ┌──────────────────┐
                                          │ String Store     │
                                          │ (变长, 分块存储)  │
                                          └──────────────────┘
```

### 4.5.2 属性记录格式

每个属性记录包含一个属性键值对，并通过 `nextPropId` 指针链接到下一个属性：

```
偏移量  大小(字节)  字段
─────────────────────────
0       1          inUse + 块头
1       4          propertyKeyId (属性键令牌 ID)
5       4          nextPropId (下一个属性 ID)
9       8          propValue (属性值，编码方式取决于类型)
17      1          type + 编码标志
```

**属性值编码策略：**

Neo4j 对属性值采用**内联优先**策略，尽可能将值塞入 8 字节的 `propValue` 字段中：

| 类型 | 编码方式 | 内联可能性 |
|---|---|---|
| boolean | 1 字节 | 总是内联 |
| byte | 1 字节 | 总是内联 |
| short | 2 字节 | 总是内联 |
| int | 4 字节 | 总是内联 |
| long | 8 字节 | 总是内联 |
| float | 4 字节 | 总是内联 |
| double | 8 字节 | 总是内联 |
| String (短) | 直接内联到 8 字节 | 是（≤7 字符 ASCII） |
| String (长) | 指向 String Store 的指针 | 否 |
| 数组 | 指向 Array Store 的指针 | 否 |

### 4.5.3 属性存储的 Java 实现

```java
public class PropertyRecord {
    public static final int RECORD_SIZE = 18;

    private long id;
    private boolean inUse;
    private int propertyKeyId;
    private long nextPropId;
    private long propValue;   // 内联值或指针
    private byte typeAndFlags;

    // 属性类型常量
    public static final byte TYPE_BOOL   = 0;
    public static final byte TYPE_INT    = 1;
    public static final byte TYPE_SHORT  = 2;
    public static final byte TYPE_LONG   = 3;
    public static final byte TYPE_FLOAT  = 4;
    public static final byte TYPE_DOUBLE = 5;
    public static final byte TYPE_STRING = 6;
    public static final byte TYPE_ARRAY  = 7;

    public PropertyRecord(long id) {
        this.id = id;
        this.inUse = false;
        this.propertyKeyId = -1;
        this.nextPropId = -1;
        this.propValue = 0;
        this.typeAndFlags = 0;
    }

    public byte getPropertyType() {
        return (byte) (typeAndFlags & 0x0F);
    }

    public boolean isInline() {
        return (typeAndFlags & 0x10) == 0;
    }

    public static PropertyRecord deserialize(long id, byte[] data) {
        ByteBuffer buf = ByteBuffer.wrap(data);
        buf.order(ByteOrder.BIG_ENDIAN);

        PropertyRecord p = new PropertyRecord(id);
        byte header = buf.get();
        p.inUse = (header & 0x80) != 0;
        p.propertyKeyId = buf.getInt();
        p.nextPropId = buf.getInt();
        p.propValue = buf.getLong();
        p.typeAndFlags = buf.get();
        return p;
    }

    public byte[] serialize() {
        ByteBuffer buf = ByteBuffer.allocate(RECORD_SIZE);
        buf.order(ByteOrder.BIG_ENDIAN);
        buf.put((byte) (inUse ? 0x80 : 0x00));
        buf.putInt(propertyKeyId);
        buf.putInt((int) nextPropId);
        buf.putLong(propValue);
        buf.put(typeAndFlags);
        return buf.array();
    }

    /**
     * 将 int 值编码到 propValue 中
     */
    public void setIntValue(int value) {
        this.propValue = value & 0xFFFFFFFFL;
        this.typeAndFlags = (byte) (TYPE_INT | 0x10); // 0x10 = 内联标志
    }

    /**
     * 从 propValue 解码 int 值
     */
    public int getIntValue() {
        return (int) (propValue & 0xFFFFFFFFL);
    }

    /**
     * 将 long 值编码到 propValue 中
     */
    public void setLongValue(long value) {
        this.propValue = value;
        this.typeAndFlags = (byte) (TYPE_LONG | 0x10);
    }

    public long getLongValue() {
        return propValue;
    }

    /**
     * 将 double 值编码到 propValue 中
     */
    public void setDoubleValue(double value) {
        this.propValue = Double.doubleToRawLongBits(value);
        this.typeAndFlags = (byte) (TYPE_DOUBLE | 0x10);
    }

    public double getDoubleValue() {
        return Double.longBitsToDouble(propValue);
    }

    /**
     * 设置字符串引用（指向 String Store 的指针）
     */
    public void setStringRef(long stringBlockId) {
        this.propValue = stringBlockId;
        this.typeAndFlags = (byte) (TYPE_STRING); // 无内联标志
    }

    // getters
    public long getId() { return id; }
    public boolean isInUse() { return inUse; }
    public void setInUse(boolean inUse) { this.inUse = inUse; }
    public int getPropertyKeyId() { return propertyKeyId; }
    public void setPropertyKeyId(int id) { this.propertyKeyId = id; }
    public long getNextPropId() { return nextPropId; }
    public void setNextPropId(long id) { this.nextPropId = id; }
    public long getPropValue() { return propValue; }
    public byte getTypeAndFlags() { return typeAndFlags; }

    @Override
    public String toString() {
        return String.format(
            "PropertyRecord[id=%d, keyId=%d, type=%d, inline=%b, value=0x%X]",
            id, propertyKeyId, getPropertyType(), isInline(), propValue);
    }
}
```

### 4.5.4 字符串存储

长字符串存储在 `neostore.propertystore.db.strings` 中，采用**分块存储**（Chunked Storage）策略：

```java
public class StringPropertyStore {

    /**
     * 将字符串写入 String Store，返回块 ID
     * 每个块最大 120 字节，超长字符串分多个块链接
     */
    public static long writeString(java.io.RandomAccessFile stringFile,
                                   String value) throws Exception {
        byte[] utf8Bytes = value.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        int blockSize = 120;
        int numBlocks = (utf8Bytes.length + blockSize - 1) / blockSize;

        long firstBlockId = stringFile.length() / (blockSize + 1);
        long currentBlockId = firstBlockId;

        for (int i = 0; i < numBlocks; i++) {
            int offset = i * blockSize;
            int length = Math.min(blockSize, utf8Bytes.length - offset);

            // 每个块: 1 字节头 + 最多 120 字节数据
            ByteBuffer blockBuf = ByteBuffer.allocate(blockSize + 1);
            blockBuf.order(ByteOrder.BIG_ENDIAN);

            boolean isLast = (i == numBlocks - 1);
            byte blockHeader = (byte) ((isLast ? 0 : 1) << 7); // 高位置 1 表示有后继块
            blockBuf.put(blockHeader);

            blockBuf.put(utf8Bytes, offset, length);

            // 填充剩余空间
            while (blockBuf.hasRemaining()) {
                blockBuf.put((byte) 0);
            }

            stringFile.seek(currentBlockId * (blockSize + 1));
            stringFile.write(blockBuf.array());

            currentBlockId++;
        }

        return firstBlockId;
    }

    /**
     * 从 String Store 读取字符串
     */
    public static String readString(java.io.RandomAccessFile stringFile,
                                    long blockId) throws Exception {
        int blockSize = 120;
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        long currentBlockId = blockId;

        while (currentBlockId != -1) {
            byte[] blockData = new byte[blockSize + 1];
            stringFile.seek(currentBlockId * (blockSize + 1));
            stringFile.readFully(blockData);

            byte blockHeader = blockData[0];
            boolean hasNext = (blockHeader & 0x80) != 0;

            // 找到数据结束位置（去除尾部零填充）
            int dataEnd = blockSize;
            while (dataEnd > 0 && blockData[dataEnd] == 0) {
                dataEnd--;
            }

            baos.write(blockData, 1, dataEnd);

            if (!hasNext) {
                break;
            }
            // 从块头低 7 位获取下一个块 ID 的增量
            currentBlockId = currentBlockId + 1;
        }

        return baos.toString(java.nio.charset.StandardCharsets.UTF_8.name());
    }
}
```

## 4.6 标签存储与模式索引

### 4.6.1 标签令牌存储

标签（Label）在 Neo4j 中通过**标签令牌**（Label Token）管理。每个标签名称对应一个整数 ID，存储在 `neostore.labeltokenstore.db` 和 `neostore.labeltokenstore.names` 中。

```java
public class LabelTokenRecord {
    private int id;
    private String name;

    public LabelTokenRecord(int id, String name) {
        this.id = id;
        this.name = name;
    }

    public int getId() { return id; }
    public String getName() { return name; }
}

public class LabelTokenStore {
    private java.util.Map<String, Integer> labelToId = new java.util.HashMap<>();
    private java.util.Map<Integer, String> idToLabel = new java.util.HashMap<>();
    private int nextId = 0;

    /**
     * 获取或创建标签令牌
     */
    public int getOrCreateLabelToken(String labelName) {
        return labelToId.computeIfAbsent(labelName, name -> {
            int id = nextId++;
            idToLabel.put(id, name);
            return id;
        });
    }

    /**
     * 将标签 ID 列表编码到节点的 labelField 中
     * 内联模式：每个标签 ID 占用 8 位，最多 5 个
     */
    public long encodeLabelsInline(int[] labelIds) {
        if (labelIds.length > 5) {
            throw new IllegalArgumentException("内联模式最多支持 5 个标签");
        }
        long field = 0;
        for (int i = 0; i < labelIds.length; i++) {
            field |= ((long) labelIds[i] & 0xFF) << (i * 8);
        }
        return field;
    }

    /**
     * 从 labelField 解码内联标签
     */
    public int[] decodeLabelsInline(long labelField) {
        int count = 0;
        long temp = labelField;
        while (temp != 0 && count < 5) {
            if ((temp & 0xFF) != 0) count++;
            temp >>>= 8;
        }
        int[] ids = new int[count];
        for (int i = 0; i < count; i++) {
            ids[i] = (int) ((labelField >> (i * 8)) & 0xFF);
        }
        return ids;
    }
}
```

### 4.6.2 模式索引

Neo4j 使用 **Lucene 索引**作为默认的模式索引实现，支持对带有特定标签的节点的某个属性进行快速查找。模式索引的定义存储在 `neostore.schemastore.db` 中。

```java
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 简化的模式索引实现
 * 实际 Neo4j 使用 Lucene 索引，此处仅演示概念
 */
public class SchemaIndex {
    // 索引结构: (labelId, propertyKeyId) → Map<属性值, Set<节点ID>>
    private final Map<Integer, Map<Integer, Map<Object, Set<Long>>>> indexes;
    private final Object lock = new Object();

    public SchemaIndex() {
        this.indexes = new ConcurrentHashMap<>();
    }

    /**
     * 为指定标签和属性键创建索引
     */
    public void createIndex(int labelId, int propertyKeyId) {
        indexes.computeIfAbsent(labelId, k -> new ConcurrentHashMap<>())
               .computeIfAbsent(propertyKeyId, k -> new ConcurrentHashMap<>());
    }

    /**
     * 向索引中添加节点
     */
    public void addNode(long nodeId, int labelId, int propertyKeyId, Object value) {
        Map<Integer, Map<Object, Set<Long>>> labelIndex = indexes.get(labelId);
        if (labelIndex == null) return;

        Map<Object, Set<Long>> propIndex = labelIndex.get(propertyKeyId);
        if (propIndex == null) return;

        synchronized (lock) {
            propIndex.computeIfAbsent(value, k -> new HashSet<>()).add(nodeId);
        }
    }

    /**
     * 从索引中移除节点
     */
    public void removeNode(long nodeId, int labelId, int propertyKeyId, Object value) {
        Map<Integer, Map<Object, Set<Long>>> labelIndex = indexes.get(labelId);
        if (labelIndex == null) return;

        Map<Object, Set<Long>> propIndex = labelIndex.get(propertyKeyId);
        if (propIndex == null) return;

        synchronized (lock) {
            Set<Long> nodes = propIndex.get(value);
            if (nodes != null) {
                nodes.remove(nodeId);
                if (nodes.isEmpty()) propIndex.remove(value);
            }
        }
    }

    /**
     * 通过索引查找节点
     */
    public Set<Long> lookup(int labelId, int propertyKeyId, Object value) {
        Map<Integer, Map<Object, Set<Long>>> labelIndex = indexes.get(labelId);
        if (labelIndex == null) return Collections.emptySet();

        Map<Object, Set<Long>> propIndex = labelIndex.get(propertyKeyId);
        if (propIndex == null) return Collections.emptySet();

        Set<Long> result = propIndex.get(value);
        return result != null ? new HashSet<>(result) : Collections.emptySet();
    }

    /**
     * 判断索引是否存在
     */
    public boolean hasIndex(int labelId, int propertyKeyId) {
        Map<Integer, Map<Object, Set<Long>>> labelIndex = indexes.get(labelId);
        return labelIndex != null && labelIndex.containsKey(propertyKeyId);
    }
}
```

## 4.7 关系组存储

当节点拥有大量关系时，Neo4j 使用**关系组**（Relationship Group）来按类型组织关系，避免遍历所有关系时的类型过滤开销。关系组存储在 `neostore.relationshipgroupstore.db` 中，每条记录 25 字节。

### 4.7.1 关系组记录格式

```
偏移量  大小(字节)  字段
─────────────────────────
0       1          inUse + 头
1       4          type (关系类型 ID)
5       4          firstRel (该类型的第一条关系 ID)
9       4          nextGroup (下一个关系组 ID)
13      4          firstLoopRel (自环关系链起始)
17      4          ownerNode (所属节点 ID)
21      4          保留
```

关系组将节点的关系按类型分组，使得遍历特定类型的关系时无需扫描其他类型：

```
节点 N 的关系组链:
  ┌──────────┐     ┌──────────┐     ┌──────────┐
  │ Group    │────→│ Group    │────→│ Group    │
  │ type=1   │     │ type=2   │     │ type=3   │
  │ firstRel │     │ firstRel │     │ firstRel │
  └────┬─────┘     └────┬─────┘     └────┬─────┘
       ▼                ▼                ▼
    Rel_1 → Rel_3    Rel_2 → Rel_5    Rel_4 → Rel_7
```

## 4.8 内存映射与页面缓存

### 4.8.1 页面缓存架构

Neo4j 使用**页面缓存**（Page Cache）作为内存与磁盘之间的桥梁。页面缓存将存储文件划分为固定大小的页面（默认 8 KiB），在内存中维护最近访问的页面副本。

```
┌─────────────────────────────────────────────────┐
│                  Java 堆                         │
│  ┌─────────────┐  ┌─────────────┐               │
│  │ 遍历算法     │  │ Cypher 执行器 │               │
│  └──────┬──────┘  └──────┬──────┘               │
│         │                │                       │
│         ▼                ▼                       │
│  ┌─────────────────────────────────────────┐    │
│  │         Page Cache (直接内存)             │    │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │    │
│  │  │Page 1│ │Page 2│ │Page 3│ │Page 4│...│    │
│  │  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘   │    │
│  │     │         │         │         │       │    │
│  │  ┌──▼─────────▼─────────▼─────────▼──┐   │    │
│  │  │     页表 (Page Table)              │   │    │
│  │  │  fileId → pageId → 内存地址        │   │    │
│  │  └────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────┘    │
│              │          ↑                        │
│              ▼          │                        │
│  ┌─────────────────────────────────────────┐    │
│  │     FileSystem 通道 (FileChannel)       │    │
│  └────────────────┬────────────────────────┘    │
│                   │                              │
├───────────────────┴──────────────────────────────┤
│                   操作系统                         │
│  ┌─────────────────────────────────────────┐    │
│  │        磁盘 I/O 调度器                   │    │
│  └────────────────┬────────────────────────┘    │
│                   │                              │
│  ┌────────────────▼────────────────────────┐    │
│  │        物理磁盘 (neostore.*.db)          │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### 4.8.2 页面缓存的 Java 实现

```java
import java.nio.ByteBuffer;
import java.nio.MappedByteBuffer;
import java.nio.channels.FileChannel;
import java.io.RandomAccessFile;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 简化的页面缓存实现
 * 实际 Neo4j 使用 Clock 算法 + 直接内存（DirectBuffer）
 */
public class PageCache {
    public static final int PAGE_SIZE = 8192;  // 8 KiB

    private final int maxPages;
    private final Page[] pages;
    private final AtomicInteger clockHand;
    private final Map<PageKey, Integer> pageTable;

    // 文件通道映射
    private final Map<String, FileChannel> channels;

    public PageCache(int maxPages) {
        this.maxPages = maxPages;
        this.pages = new Page[maxPages];
        this.clockHand = new AtomicInteger(0);
        this.pageTable = new ConcurrentHashMap<>();
        this.channels = new ConcurrentHashMap<>();
    }

    /**
     * 页面键：标识一个唯一的文件页面
     */
    record PageKey(String fileName, long pageId) {}

    /**
     * 页面结构
     */
    static class Page {
        final ByteBuffer buffer;
        volatile boolean dirty;
        volatile boolean referenced;
        volatile PageKey key;
        volatile long lastAccessTime;

        Page() {
            this.buffer = ByteBuffer.allocateDirect(PAGE_SIZE);
            this.dirty = false;
            this.referenced = false;
        }

        void clear() {
            buffer.clear();
            dirty = false;
            referenced = false;
            key = null;
        }
    }

    /**
     * 获取文件通道
     */
    private FileChannel getChannel(String fileName) throws Exception {
        return channels.computeIfAbsent(fileName, name -> {
            try {
                Path path = Path.of(name);
                return FileChannel.open(path,
                    StandardOpenOption.READ,
                    StandardOpenOption.WRITE,
                    StandardOpenOption.CREATE);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });
    }

    /**
     * 读取指定文件页面的数据
     */
    public ByteBuffer read(String fileName, long pageId) throws Exception {
        PageKey key = new PageKey(fileName, pageId);

        // 1. 检查页表
        Integer slot = pageTable.get(key);
        if (slot != null) {
            Page page = pages[slot];
            page.referenced = true;
            page.lastAccessTime = System.nanoTime();
            page.buffer.position(0);
            return page.buffer.duplicate();
        }

        // 2. 缓存未命中，从磁盘加载
        Page page = evictAndLoad();
        FileChannel channel = getChannel(fileName);
        long position = pageId * PAGE_SIZE;

        page.buffer.clear();
        channel.read(page.buffer, position);
        page.buffer.flip();

        page.key = key;
        page.referenced = true;
        page.dirty = false;
        page.lastAccessTime = System.nanoTime();

        // 3. 更新页表
        int pageIndex = page - pages[0]; // 计算数组索引
        pageTable.put(key, pageIndex);

        return page.buffer.duplicate();
    }

    /**
     * 写入页面（标记为脏，延迟刷盘）
     */
    public void write(String fileName, long pageId, ByteBuffer data)
            throws Exception {
        PageKey key = new PageKey(fileName, pageId);
        Integer slot = pageTable.get(key);

        Page page;
        if (slot != null) {
            page = pages[slot];
        } else {
            page = evictAndLoad();
            page.key = key;
            int pageIndex = page - pages[0];
            pageTable.put(key, pageIndex);
        }

        page.buffer.clear();
        page.buffer.put(data);
        page.dirty = true;
        page.referenced = true;
        page.lastAccessTime = System.nanoTime();
    }

    /**
     * 使用 Clock 算法淘汰页面
     */
    private Page evictAndLoad() {
        while (true) {
            int hand = clockHand.getAndUpdate(v -> (v + 1) % maxPages);
            Page candidate = pages[hand];

            if (candidate.key == null) {
                // 空槽位
                return candidate;
            }

            if (!candidate.referenced) {
                // 淘汰此页面
                if (candidate.dirty) {
                    flush(candidate);
                }
                pageTable.remove(candidate.key);
                candidate.clear();
                return candidate;
            }

            // 给第二次机会
            candidate.referenced = false;
        }
    }

    /**
     * 将脏页面刷入磁盘
     */
    private void flush(Page page) {
        try {
            FileChannel channel = getChannel(page.key.fileName());
            long position = page.key.pageId() * PAGE_SIZE;
            page.buffer.position(0);
            channel.write(page.buffer, position);
            page.dirty = false;
        } catch (Exception e) {
            throw new RuntimeException("刷盘失败", e);
        }
    }

    /**
     * 刷新所有脏页面
     */
    public void flushAll() {
        for (Page page : pages) {
            if (page != null && page.dirty && page.key != null) {
                flush(page);
            }
        }
    }

    public void close() throws Exception {
        flushAll();
        for (FileChannel channel : channels.values()) {
            channel.close();
        }
    }
}
```

### 4.8.3 Clock 页面置换算法

Neo4j 的页面缓存使用**Clock 算法**（又称"第二次机会"算法）进行页面置换。与 LRU 相比，Clock 算法无需维护链表，开销更低：

```
Clock 指针旋转方向
      ┌─────────────────────┐
      │                     │
      ▼                     │
  ┌──────┐  ┌──────┐  ┌──────┐
  │ P1   │  │ P2   │  │ P3   │
  │ ref=1│  │ ref=0│  │ ref=1│
  └──────┘  └──┬───┘  └──────┘
               │
               ▼ 淘汰 P2（ref=0）
                  加载新页面，ref=1
```

算法步骤：
1. 指针沿环形缓冲区移动
2. 如果当前页面的 `referenced` 位为 0，淘汰该页面
3. 如果 `referenced` 位为 1，将其置 0（给予第二次机会），继续移动
4. 最坏情况下，遍历一圈后所有页面都被置 0，必然找到可淘汰页面

### 4.8.4 直接内存的优势

Neo4j 的页面缓存使用 Java **直接内存**（Direct Memory / DirectByteBuffer），而非堆内存。这样做有三个关键优势：

1. **减少 GC 压力**：页面数据不在堆上，不会触发老年代 GC
2. **零拷贝 I/O**：直接内存与操作系统内核空间之间的 I/O 操作无需经过堆内存中转
3. **可预测的内存占用**：页面缓存大小由 `dbms.memory.pagecache.size` 配置，不受堆大小限制

```java
// 直接内存 vs 堆内存的 I/O 性能对比
public class DirectMemoryDemo {

    public static void main(String[] args) throws Exception {
        int size = 1024 * 1024 * 64; // 64 MB
        int iterations = 100;

        // 堆内存缓冲区
        long heapStart = System.nanoTime();
        for (int i = 0; i < iterations; i++) {
            ByteBuffer heapBuf = ByteBuffer.allocate(size);
            // 模拟 I/O 操作
            heapBuf.putInt(42);
            heapBuf.getInt();
        }
        long heapTime = System.nanoTime() - heapStart;

        // 直接内存缓冲区
        long directStart = System.nanoTime();
        for (int i = 0; i < iterations; i++) {
            ByteBuffer directBuf = ByteBuffer.allocateDirect(size);
            directBuf.putInt(42);
            directBuf.getInt();
        }
        long directTime = System.nanoTime() - directStart;

        System.out.printf("堆缓冲区总耗时: %.2f ms%n", heapTime / 1_000_000.0);
        System.out.printf("直接缓冲区总耗时: %.2f ms%n", directTime / 1_000_000.0);
        System.out.printf("直接内存分配速度: %.2f 倍%n",
                (double) heapTime / directTime);
    }
}
```

## 4.9 综合示例：图存储引擎原型

以下代码将上述所有组件整合为一个简化的图存储引擎原型，演示从节点创建到关系遍历的完整流程：

```java
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.*;

/**
 * 简化的 Neo4j 原生图存储引擎原型
 * 演示：节点存储、关系存储、属性存储、标签存储、页面缓存
 */
public class NativeGraphStore {

    private final NodeStore nodeStore;
    private final RelationshipStore relStore;
    private final PropertyStore propStore;
    private final LabelTokenStore labelStore;
    private final SchemaIndex schemaIndex;
    private final PageCache pageCache;

    public NativeGraphStore(String dbPath) throws Exception {
        this.nodeStore = new NodeStore(dbPath + "/neostore.nodestore.db");
        this.relStore = new RelationshipStore(dbPath + "/neostore.relationshipstore.db");
        this.propStore = new PropertyStore(dbPath + "/neostore.propertystore.db");
        this.labelStore = new LabelTokenStore();
        this.schemaIndex = new SchemaIndex();
        this.pageCache = new PageCache(1024); // 1024 页，每页 8 KiB
    }

    /**
     * 创建带标签和属性的节点
     */
    public long createNode(String[] labels, Map<String, Object> properties)
            throws Exception {
        long nodeId = nodeStore.createNode();
        NodeRecord node = nodeStore.getNode(nodeId);

        // 设置标签
        int[] labelIds = new int[labels.length];
        for (int i = 0; i < labels.length; i++) {
            labelIds[i] = labelStore.getOrCreateLabelToken(labels[i]);
        }
        node.setLabelField(labelStore.encodeLabelsInline(labelIds));

        // 设置属性
        long firstPropId = -1;
        long prevPropId = -1;
        for (Map.Entry<String, Object> entry : properties.entrySet()) {
            int keyId = labelStore.getOrCreateLabelToken(
                    "prop:" + entry.getKey()); // 简化：用标签令牌存储属性键
            long propId = propStore.createProperty(keyId, entry.getValue());
            if (firstPropId == -1) {
                firstPropId = propId;
            }
            if (prevPropId != -1) {
                PropertyRecord prevProp = propStore.getProperty(prevPropId);
                prevProp.setNextPropId(propId);
                propStore.updateProperty(prevProp);
            }
            prevPropId = propId;
        }
        node.setFirstPropertyId(firstPropId);
        nodeStore.updateNode(node);

        // 更新模式索引
        for (int labelId : labelIds) {
            for (Map.Entry<String, Object> entry : properties.entrySet()) {
                int keyId = labelStore.getOrCreateLabelToken(
                        "prop:" + entry.getKey());
                schemaIndex.addNode(nodeId, labelId, keyId, entry.getValue());
            }
        }

        return nodeId;
    }

    /**
     * 创建关系
     */
    public long createRelationship(long fromNode, long toNode, String type,
                                   Map<String, Object> properties)
            throws Exception {
        int typeId = labelStore.getOrCreateLabelToken("rel:" + type);
        long relId = relStore.createRelationship(fromNode, toNode, typeId);

        // 设置属性
        if (properties != null && !properties.isEmpty()) {
            long firstPropId = -1;
            long prevPropId = -1;
            for (Map.Entry<String, Object> entry : properties.entrySet()) {
                int keyId = labelStore.getOrCreateLabelToken(
                        "prop:" + entry.getKey());
                long propId = propStore.createProperty(keyId, entry.getValue());
                if (firstPropId == -1) firstPropId = propId;
                if (prevPropId != -1) {
                    PropertyRecord prevProp = propStore.getProperty(prevPropId);
                    prevProp.setNextPropId(propId);
                    propStore.updateProperty(prevProp);
                }
                prevPropId = propId;
            }
            RelationshipRecord rel = relStore.getRelationship(relId);
            rel.setFirstPropertyId(firstPropId);
            relStore.updateRelationship(rel);
        }

        return relId;
    }

    /**
     * 遍历节点的所有邻居
     */
    public void traverseNeighbors(long nodeId) throws Exception {
        NodeRecord node = nodeStore.getNode(nodeId);
        long relId = node.getFirstRelationshipId();

        System.out.printf("节点 %d 的邻居:%n", nodeId);
        while (relId != -1) {
            RelationshipRecord rel = relStore.getRelationship(relId);
            long neighbor = rel.isFirstNode(nodeId)
                    ? rel.getSecondNode() : rel.getFirstNode();
            System.out.printf("  ──→ 节点 %d (关系类型 ID: %d)%n",
                    neighbor, rel.getType());
            relId = rel.getNextRel(nodeId);
        }
    }

    /**
     * 通过索引查找节点
     */
    public Set<Long> findNodesByProperty(String label, String propertyKey,
                                          Object value) {
        int labelId = labelStore.getOrCreateLabelToken(label);
        int keyId = labelStore.getOrCreateLabelToken("prop:" + propertyKey);
        return schemaIndex.lookup(labelId, keyId, value);
    }

    public void close() throws Exception {
        nodeStore.close();
        relStore.close();
        propStore.close();
        pageCache.close();
    }

    // ========== 内部存储类 ==========

    static class NodeStore {
        private static final int RECORD_SIZE = 15;
        private RandomAccessFile file;
        private long highId;

        NodeStore(String path) throws Exception {
            this.file = new RandomAccessFile(path, "rw");
            this.highId = file.length() / RECORD_SIZE;
        }

        long createNode() throws Exception {
            long id = highId++;
            NodeRecord record = new NodeRecord(id);
            record.setInUse(true);
            writeRecord(record);
            return id;
        }

        NodeRecord getNode(long id) throws Exception {
            byte[] data = new byte[RECORD_SIZE];
            file.seek(id * RECORD_SIZE);
            file.readFully(data);
            return NodeRecord.deserialize(id, data);
        }

        void updateNode(NodeRecord record) throws Exception {
            writeRecord(record);
        }

        private void writeRecord(NodeRecord record) throws Exception {
            file.seek(record.getId() * RECORD_SIZE);
            file.write(record.serialize());
        }

        void close() throws Exception { file.close(); }
    }

    static class RelationshipStore {
        private static final int RECORD_SIZE = 34;
        private RandomAccessFile file;
        private long highId;

        RelationshipStore(String path) throws Exception {
            this.file = new RandomAccessFile(path, "rw");
            this.highId = file.length() / RECORD_SIZE;
        }

        long createRelationship(long firstNode, long secondNode, int type)
                throws Exception {
            long id = highId++;
            RelationshipRecord r = new RelationshipRecord(id);
            r.setInUse(true);
            r.setFirstNode(firstNode);
            r.setSecondNode(secondNode);
            r.setType(type);

            // 插入到两个节点的关系链头部
            // 简化实现：仅设置 next 指针，prev 指针由完整实现维护
            writeRecord(r);
            return id;
        }

        RelationshipRecord getRelationship(long id) throws Exception {
            byte[] data = new byte[RECORD_SIZE];
            file.seek(id * RECORD_SIZE);
            file.readFully(data);
            return RelationshipRecord.deserialize(id, data);
        }

        void updateRelationship(RelationshipRecord record) throws Exception {
            writeRecord(record);
        }

        private void writeRecord(RelationshipRecord record) throws Exception {
            file.seek(record.getId() * RECORD_SIZE);
            file.write(record.serialize());
        }

        void close() throws Exception { file.close(); }
    }

    static class PropertyStore {
        private static final int RECORD_SIZE = 18;
        private RandomAccessFile file;
        private long highId;

        PropertyStore(String path) throws Exception {
            this.file = new RandomAccessFile(path, "rw");
            this.highId = file.length() / RECORD_SIZE;
        }

        long createProperty(int keyId, Object value) throws Exception {
            long id = highId++;
            PropertyRecord p = new PropertyRecord(id);
            p.setInUse(true);
            p.setPropertyKeyId(keyId);

            if (value instanceof Integer) {
                p.setIntValue((Integer) value);
            } else if (value instanceof Long) {
                p.setLongValue((Long) value);
            } else if (value instanceof Double) {
                p.setDoubleValue((Double) value);
            } else if (value instanceof String) {
                // 简化：短字符串直接编码
                String s = (String) value;
                if (s.length() <= 7) {
                    long encoded = 0;
                    for (int i = 0; i < s.length(); i++) {
                        encoded |= ((long) s.charAt(i)) << (i * 8);
                    }
                    p.setPropValue(encoded);
                }
            } else if (value instanceof Boolean) {
                p.setPropValue((Boolean) value ? 1L : 0L);
            }

            writeRecord(p);
            return id;
        }

        PropertyRecord getProperty(long id) throws Exception {
            byte[] data = new byte[RECORD_SIZE];
            file.seek(id * RECORD_SIZE);
            file.readFully(data);
            return PropertyRecord.deserialize(id, data);
        }

        void updateProperty(PropertyRecord record) throws Exception {
            writeRecord(record);
        }

        private void writeRecord(PropertyRecord record) throws Exception {
            file.seek(record.getId() * RECORD_SIZE);
            file.write(record.serialize());
        }

        void close() throws Exception { file.close(); }
    }

    // ========== 主方法：演示 ==========

    public static void main(String[] args) throws Exception {
        String dbPath = System.getProperty("java.io.tmpdir") + "/neo4j_demo";
        new java.io.File(dbPath).mkdirs();

        NativeGraphStore store = new NativeGraphStore(dbPath);

        // 1. 创建带标签和属性的节点
        long alice = store.createNode(
            new String[]{"Person", "Employee"},
            Map.of("name", "Alice", "age", 30, "salary", 85000.0)
        );
        long bob = store.createNode(
            new String[]{"Person"},
            Map.of("name", "Bob", "age", 25)
        );
        long company = store.createNode(
            new String[]{"Company"},
            Map.of("name", "Neo4j", "founded", 2007)
        );

        System.out.println("创建节点:");
        System.out.printf("  Alice: ID=%d%n", alice);
        System.out.printf("  Bob: ID=%d%n", bob);
        System.out.printf("  Company: ID=%d%n", company);

        // 2. 创建关系
        store.createRelationship(alice, company, "WORKS_FOR",
            Map.of("since", 2020, "position", "Engineer"));
        store.createRelationship(bob, company, "WORKS_FOR",
            Map.of("since", 2022));
        store.createRelationship(alice, bob, "KNOWS",
            Map.of("since", 2018));

        System.out.println("\n创建关系完成");

        // 3. 遍历邻居
        System.out.println();
        store.traverseNeighbors(alice);

        // 4. 索引查找
        System.out.println("\n索引查找: Person.name = 'Alice'");
        Set<Long> results = store.findNodesByProperty("Person", "name", "Alice");
        for (long nodeId : results) {
            System.out.printf("  找到节点: %d%n", nodeId);
        }

        store.close();
    }
}
```

## 4.10 存储引擎性能特征

### 4.10.1 无索引邻接的复杂度分析

| 操作 | Neo4j 原生存储 | 非原生方案（如 MySQL + 关系表） |
|---|---|---|
| 查找节点的所有邻居 | O(degree) | O(log n) + O(degree) |
| 遍历 k 跳 | O(k × avg_degree) | O(k × (log n + avg_degree)) |
| 按 ID 查找节点 | O(1) | O(log n) |
| 按属性查找节点 | O(log n)（通过索引） | O(log n)（通过索引） |

### 4.10.2 存储效率

| 指标 | 值 |
|---|---|
| 每条节点记录 | 15 字节 |
| 每条关系记录 | 34 字节 |
| 每条属性记录 | 18 字节（不含变长数据） |
| 页面大小 | 8 KiB（默认） |
| 每页可容纳节点数 | 546 个（8192 ÷ 15） |
| 每页可容纳关系数 | 240 个（8192 ÷ 34） |

### 4.10.3 关键配置参数

```
# 页面缓存大小（直接影响性能）
dbms.memory.pagecache.size=4G

# 存储文件配置
dbms.directories.data=data/databases/graph.db

# 事务日志配置
dbms.tx_log.rotation.retention_policy=7 days
dbms.tx_log.rotation.size=256M

# 关系组配置（大数据量时启用）
dbms.relationship_grouping_threshold=10
```

## 4.11 本章小结

Neo4j 的原生图存储引擎通过以下设计实现了高性能图遍历：

1. **定长记录 + 直接寻址**：节点（15 字节）和关系（34 字节）采用固定大小记录，通过 `id × recordSize` 实现 O(1) 随机访问，无需任何索引。

2. **双向链表关系链**：每个关系记录维护两套 prev/next 指针，分别对应起始节点和目标节点两个方向，使得从任一节点出发都能以 O(degree) 复杂度遍历其所有关系。

3. **属性内联与链式存储**：短值直接内联到 18 字节的属性记录中，长字符串和数组通过分块链式存储，兼顾了小值的紧凑存储和大值的灵活性。

4. **标签内联编码**：少量标签直接编码在节点记录的 5 字节 labelField 中，避免额外的磁盘访问。

5. **页面缓存 + Clock 置换**：使用直接内存的页面缓存减少 GC 压力，Clock 算法以低开销实现高效的页面淘汰。

6. **关系组按类型分组**：将节点的关系按类型分组，遍历特定类型关系时无需扫描无关类型。

这些设计共同构成了 Neo4j 的核心竞争力——**无索引邻接**，使得图遍历性能与图的总规模解耦，仅与遍历的实际路径长度相关。理解这些底层机制，对于优化 Neo4j 数据建模、诊断性能问题以及设计大规模图应用都至关重要。
