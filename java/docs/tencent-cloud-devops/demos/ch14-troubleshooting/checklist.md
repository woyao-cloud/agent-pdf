# TKE 故障排查清单

## Pod 启动失败

- [ ] `kubectl describe pod <name> -n <ns>` 查看 Events
- [ ] `kubectl logs <name> -n <ns> --previous` 查看上一轮日志
- [ ] 检查镜像名称和标签是否正确
- [ ] 检查镜像拉取凭证 (imagePullSecrets)
- [ ] 检查资源请求是否超过节点可用资源
- [ ] 检查 PVC 是否已绑定
- [ ] 检查 ConfigMap/Secret 是否存在

## 网络问题

- [ ] `kubectl get endpoints <service>` 检查 Endpoint
- [ ] `kubectl exec -it <pod> -- nslookup <service>` 检查 DNS
- [ ] 检查 NetworkPolicy 是否阻止了流量
- [ ] 检查 CLB 健康检查配置
- [ ] 检查安全组规则

## 性能问题

- [ ] `kubectl top pod <name>` 检查资源使用
- [ ] 检查 CPU Throttling (container_cpu_cfs_throttled_seconds_total)
- [ ] 检查 GC 日志和堆内存
- [ ] 检查连接池配置
- [ ] 检查慢查询日志

## 发布问题

- [ ] `kubectl rollout status deployment/<name>` 检查发布状态
- [ ] `kubectl rollout history deployment/<name>` 查看发布历史
- [ ] 检查 PodDisruptionBudget 是否阻塞
- [ ] 检查 readinessProbe 配置
- [ ] 检查 ConfigMap 热更新是否生效
