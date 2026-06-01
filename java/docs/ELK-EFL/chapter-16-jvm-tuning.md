# 第16章 JVM 与操作系统级调优 Checklist

## 本章导读

ES 和 Logstash 都运行在 JVM 上。不正确的 JVM 配置会导致频繁 GC、节点不稳定、查询超时等"疑难杂症"。本章提供一份可以直接使用的调优清单。

---

## 16.1 JVM 堆内存设置的"两个铁律"

```bash
# 铁律 1：堆内存不超过物理内存的 50%
# 铁律 2：堆内存不超过 32GB

# elasticsearch.yml（config/jvm.options）
-Xms31g
-Xmx31g

# Logstash（config/jvm.options）
-Xms2g
-Xmx2g
```

---

## 16.2 禁用 Swap

```bash
# 方法 1：系统级关闭
sudo swapoff -a

# 方法 2：ES 配置（推荐）
bootstrap.memory_lock: true

# 方法 3：Docker 配置
ulimits:
  memlock:
    soft: -1
    hard: -1

# 验证是否生效
GET _nodes/stats/process?filter_path=**.mlockall
# 期望：mlockall: true
```

---

## 16.3 文件系统选择

```yaml
# ES 官方推荐文件系统：XFS（首选）或 EXT4
# 挂载参数：noatime,nodiratime

# /etc/fstab 配置
/dev/sda1 /data xfs defaults,noatime,nodiratime 0 0
```

---

## 本章总结

JVM 调优的核心就三条：堆不过半、堆不超 32G、禁用 Swap。做到这三点，ES 集群的稳定性就能达到 90%。