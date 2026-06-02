# 第16章：JVM 与操作系统调优

## 检查配置

```bash
# 给脚本执行权限
chmod +x ch16-jvm-tuning/check-jvm.sh

# 运行检查
bash ch16-jvm-tuning/check-jvm.sh
```

## 推荐配置速查

| 配置 | 推荐值 | 说明 |
|------|-------|------|
| ES 堆内存 | -Xms31g -Xmx31g | 不超过物理内存 50%，不超过 32GB |
| Logstash 堆 | -Xms2g -Xmx2g | 根据数据量调整 |
| memory_lock | true | 禁止 Swap |
| vm.max_map_count | 262144 | mmap 文件映射上限 |
| 文件描述符 | 65535 | 每个连接一个 fd |

## ES Heap 配置示例

```yaml
# docker-compose.yml 中的 ES 节点配置
environment:
  - "ES_JAVA_OPTS=-Xms31g -Xmx31g"
ulimits:
  memlock:
    soft: -1
    hard: -1
```