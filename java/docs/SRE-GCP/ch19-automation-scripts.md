# 第 19 章 GCP API 自动化脚本

## 19.1 为什么需要自动化脚本？

### 一个故事：每周五的"磁盘清理日"

每个周五下午，小张都要做同一件事：登录 GCP 控制台，检查所有 Compute Engine 实例的磁盘使用情况。如果发现磁盘使用率超过 80%，他就 SSH 登录到实例上，手动清理日志文件或临时数据。

整个操作需要 2 小时，每周重复一次。一年下来，就是 104 个小时——相当于 2.5 个工作周。

后来，小张花了 8 小时写了一个自动化脚本：脚本每周自动检查磁盘使用率，超过阈值时自动清理，清理完成后发送报告。从此，周五下午他再也不用做这件事了。

**8 小时的投入，节省了每年 104 小时——ROI 是 13 倍。**

### 脚本自动化的价值

| 维度 | 手动操作 | 脚本自动化 |
|------|---------|-----------|
| 时间成本 | 每次 2 小时 | 开发 8 小时，之后 0 小时 |
| 一致性 | 每次可能不同 | 每次完全一致 |
| 错误率 | 高（人为失误） | 低（代码可控） |
| 可审计 | 难以记录 | 日志自动记录 |
| 可扩展 | 无法并行 | 可以同时处理多个资源 |

---

## 19.2 GCP Python SDK 基础

### 安装和认证

```bash
# 安装 GCP Python SDK
pip install google-cloud-compute
pip install google-cloud-storage
pip install google-cloud-sql
pip install google-cloud-monitoring

# 本地开发认证
gcloud auth application-default login

# CI/CD 环境认证（使用 Workload Identity）
# 不需要安装单独的认证工具，SDK 自动读取环境变量
```

### 基础用法

```python
from google.cloud import compute_v1

def list_instances(project_id, zone):
    """列出指定区域的所有 Compute Engine 实例"""
    client = compute_v1.InstancesClient()
    
    request = compute_v1.ListInstancesRequest()
    request.project = project_id
    request.zone = zone
    
    instances = client.list(request=request)
    
    result = []
    for instance in instances:
        result.append({
            'name': instance.name,
            'status': instance.status,
            'machine_type': instance.machine_type,
            'creation_timestamp': instance.creation_timestamp,
        })
    
    return result

# 使用示例
instances = list_instances('my-project', 'us-central1-a')
for instance in instances:
    print(f"{instance['name']}: {instance['status']}")
```

---

## 19.3 实战脚本一：自动清理未挂载的磁盘

### 场景

在 GCP 中，当虚拟机实例被删除时，其持久化磁盘往往没有被自动清理。这些"孤儿磁盘"会持续产生存储费用。

```python
#!/usr/bin/env python3
"""
orphan_disk_cleanup.py - 自动清理 GCP 中未挂载的磁盘

使用方法：
  python orphan_disk_cleanup.py --project=my-project --dry-run
  python orphan_disk_cleanup.py --project=my-project --execute
"""

import argparse
import logging
from datetime import datetime, timedelta
from google.cloud import compute_v1

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class OrphanDiskCleaner:
    def __init__(self, project_id, dry_run=True, max_age_days=7):
        self.project_id = project_id
        self.dry_run = dry_run
        self.max_age_days = max_age_days
        self.disks_client = compute_v1.DisksClient()
    
    def find_orphan_disks(self):
        """查找所有未挂载且超过指定天数的磁盘"""
        request = compute_v1.AggregatedListDisksRequest()
        request.project = self.project_id
        
        orphan_disks = []
        cutoff_date = datetime.now() - timedelta(days=self.max_age_days)
        
        for zone, disks_in_zone in self.disks_client.aggregated_list(request=request):
            if not disks_in_zone.disks:
                continue
            
            zone_name = zone.replace('zones/', '')
            
            for disk in disks_in_zone.disks:
                # 跳过正在使用的磁盘
                if disk.users:
                    continue
                
                # 检查磁盘创建时间
                created = datetime.fromisoformat(
                    disk.creation_timestamp.replace('Z', '+00:00')
                )
                
                if created < cutoff_date:
                    orphan_disks.append({
                        'name': disk.name,
                        'zone': zone_name,
                        'size_gb': disk.size_gb,
                        'type': disk.type.split('/')[-1],
                        'created': disk.creation_timestamp,
                        'days_old': (datetime.now() - created).days,
                    })
        
        return orphan_disks
    
    def delete_disk(self, disk_name, zone):
        """删除指定磁盘"""
        try:
            request = compute_v1.DeleteDiskRequest()
            request.project = self.project_id
            request.zone = zone
            request.disk = disk_name
            
            operation = self.disks_client.delete(request=request)
            operation.result()  # 等待操作完成
            
            logger.info(f"✅ 已删除磁盘: {disk_name} (区域: {zone})")
            return True
        
        except Exception as e:
            logger.error(f"❌ 删除磁盘失败 {disk_name}: {e}")
            return False
    
    def run(self):
        """执行清理流程"""
        logger.info(f"开始扫描项目 {self.project_id} 中的孤儿磁盘...")
        
        orphan_disks = self.find_orphan_disks()
        
        if not orphan_disks:
            logger.info("🎉 没有找到孤儿磁盘！")
            return
        
        # 打印汇总信息
        total_size = sum(d['size_gb'] for d in orphan_disks)
        logger.info(f"\n找到 {len(orphan_disks)} 个孤儿磁盘：")
        logger.info(f"{'名称':<40} {'区域':<20} {'大小(GB)':<10} {'天数':<8}")
        logger.info("-" * 80)
        
        for disk in orphan_disks:
            logger.info(f"{disk['name']:<40} {disk['zone']:<20} {disk['size_gb']:<10} {disk['days_old']:<8}")
        
        logger.info(f"\n总计可释放空间: {total_size} GB")
        
        if self.dry_run:
            logger.info("⚠️  Dry Run 模式：未执行任何删除操作")
            logger.info("如需实际删除，请使用 --execute 参数")
            return
        
        # 执行删除
        confirm = input(f"\n是否删除这 {len(orphan_disks)} 个磁盘？(yes/no): ")
        if confirm.lower() != 'yes':
            logger.info("已取消操作。")
            return
        
        success_count = 0
        for disk in orphan_disks:
            if self.delete_disk(disk['name'], disk['zone']):
                success_count += 1
        
        logger.info(f"清理完成！成功删除 {success_count}/{len(orphan_disks)} 个磁盘。")

def main():
    parser = argparse.ArgumentParser(description='清理 GCP 孤儿磁盘')
    parser.add_argument('--project', required=True, help='GCP 项目 ID')
    parser.add_argument('--execute', action='store_true', help='实际执行删除')
    parser.add_argument('--max-age', type=int, default=7, help='磁盘最大保留天数')
    
    args = parser.parse_args()
    
    cleaner = OrphanDiskCleaner(
        project_id=args.project,
        dry_run=not args.execute,
        max_age_days=args.max_age
    )
    
    cleaner.run()

if __name__ == '__main__':
    main()
```

**使用方法：**

```bash
# 1. 先以 dry-run 模式运行，查看哪些磁盘会被清理
python orphan_disk_cleanup.py --project=my-project

# 2. 确认无误后，实际执行
python orphan_disk_cleanup.py --project=my-project --execute

# 3. 设置定时任务（每周一凌晨执行）
# 在 Cloud Scheduler 中配置：
# 频率: 0 2 * * 1
# 目标: Cloud Pub/Sub → Cloud Functions
```

---

## 19.4 实战脚本二：自动轮换服务账号密钥

### 场景

安全最佳实践建议定期轮换 Service Account 的访问密钥。手动轮换涉及创建新密钥、更新依赖服务、吊销旧密钥——容易出错且耗时。

```python
#!/usr/bin/env python3
"""
rotate_sa_keys.py - 自动轮换服务账号密钥

使用方法：
  python rotate_sa_keys.py --project=my-project --service-account=deploy-sa@my-project.iam.gserviceaccount.com --dry-run
  python rotate_sa_keys.py --project=my-project --service-account=deploy-sa@my-project.iam.gserviceaccount.com --execute
"""

import argparse
import json
import logging
from datetime import datetime, timedelta
from google.cloud import iam_credentials_v1
from google.oauth2 import service_account
import googleapiclient.discovery

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SAKeyRotator:
    def __init__(self, project_id, dry_run=True, max_key_age_days=90):
        self.project_id = project_id
        self.dry_run = dry_run
        self.max_key_age_days = max_key_age_days
        self.iam_service = googleapiclient.discovery.build('iam', 'v1')
    
    def list_keys(self, service_account_email):
        """列出服务账号的所有密钥"""
        name = f"projects/{self.project_id}/serviceAccounts/{service_account_email}"
        keys = self.iam_service.projects().serviceAccounts().keys().list(
            name=name,
            keyTypes='USER_MANAGED'  # 只列出用户管理的密钥
        ).execute()
        
        return keys.get('keys', [])
    
    def find_expiring_keys(self, service_account_email):
        """查找即将过期的密钥"""
        keys = self.list_keys(service_account_email)
        expiring_keys = []
        cutoff_date = datetime.now() + timedelta(days=30)  # 30 天内过期
        
        for key in keys:
            created = datetime.fromisoformat(
                key['validAfterTime'].replace('Z', '+00:00')
            )
            expires = created + timedelta(days=self.max_key_age_days)
            
            if expires < cutoff_date:
                expiring_keys.append({
                    'name': key['name'],
                    'created': key['validAfterTime'],
                    'expires': expires.isoformat(),
                    'days_remaining': (expires - datetime.now()).days,
                })
        
        return expiring_keys
    
    def create_key(self, service_account_email):
        """创建新的密钥"""
        name = f"projects/{self.project_id}/serviceAccounts/{service_account_email}"
        
        request = self.iam_service.projects().serviceAccounts().keys().create(
            name=name,
            body={'keyAlgorithm': 'KEY_ALG_RSA_2048'}
        )
        
        key = request.execute()
        logger.info(f"✅ 已创建新密钥: {key['name']}")
        
        return key
    
    def delete_key(self, key_name):
        """删除旧的密钥"""
        try:
            self.iam_service.projects().serviceAccounts().keys().delete(
                name=key_name
            ).execute()
            logger.info(f"✅ 已删除旧密钥: {key_name}")
            return True
        except Exception as e:
            logger.error(f"❌ 删除密钥失败 {key_name}: {e}")
            return False
    
    def rotate(self, service_account_email):
        """执行密钥轮换"""
        logger.info(f"检查服务账号密钥: {service_account_email}")
        
        expiring_keys = self.find_expiring_keys(service_account_email)
        active_keys = self.list_keys(service_account_email)
        
        logger.info(f"当前活跃密钥数: {len(active_keys)}")
        logger.info(f"即将过期的密钥数: {len(expiring_keys)}")
        
        if not expiring_keys:
            logger.info("✅ 没有即将过期的密钥，无需轮换。")
            return
        
        logger.info("\n即将过期的密钥：")
        for key in expiring_keys:
            logger.info(f"  - {key['name']} (剩余 {key['days_remaining']} 天)")
        
        if self.dry_run:
            logger.info("\n⚠️ Dry Run 模式：未执行任何操作")
            logger.info("如需实际轮换，请使用 --execute 参数")
            return
        
        # 1. 创建新密钥
        logger.info("\n步骤 1: 创建新密钥...")
        new_key = self.create_key(service_account_email)
        
        # 2. 输出新密钥信息（需要手动更新到依赖服务）
        private_key_data = json.loads(new_key['privateKeyData'])
        logger.info("\n⚠️  新密钥已创建，请更新以下服务的密钥配置：")
        logger.info(f"    新密钥 ID: {new_key['name'].split('/')[-1]}")
        
        # 3. 等待一段时间后删除旧密钥
        # 在实际使用中，你需要等待依赖服务更新完密钥配置后再删除旧密钥
        logger.info("\n步骤 2: 删除旧密钥...")
        
        for key in expiring_keys:
            self.delete_key(key['name'])
        
        logger.info("\n✅ 密钥轮换完成！")

def main():
    parser = argparse.ArgumentParser(description='轮换 GCP 服务账号密钥')
    parser.add_argument('--project', required=True, help='GCP 项目 ID')
    parser.add_argument('--service-account', required=True, help='服务账号邮箱')
    parser.add_argument('--execute', action='store_true', help='实际执行轮换')
    
    args = parser.parse_args()
    
    rotator = SAKeyRotator(
        project_id=args.project,
        dry_run=not args.execute
    )
    
    rotator.rotate(args.service_account)

if __name__ == '__main__':
    main()
```

---

## 19.5 实战脚本三：自动备份关键资源

### 场景

定期对关键资源执行备份，并将备份文件存储到 Cloud Storage，同时设置保留周期自动清理过期备份。

```python
#!/usr/bin/env python3
"""
auto_backup.py - 自动备份 GCP 资源

支持：
  - Compute Engine 磁盘快照
  - Cloud SQL 导出
  - Cloud Storage 跨区域复制
"""

import argparse
import logging
from datetime import datetime, timedelta
from google.cloud import compute_v1
from google.cloud import storage

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class BackupManager:
    def __init__(self, project_id, backup_bucket, retention_days=30):
        self.project_id = project_id
        self.backup_bucket = backup_bucket
        self.retention_days = retention_days
        self.storage_client = storage.Client(project=project_id)
    
    def create_disk_snapshot(self, disk_name, zone, snapshot_name=None):
        """创建 Compute Engine 磁盘快照"""
        if not snapshot_name:
            timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
            snapshot_name = f"{disk_name}-backup-{timestamp}"
        
        disks_client = compute_v1.DisksClient()
        snapshots_client = compute_v1.SnapshotsClient()
        
        # 创建快照
        snapshot = compute_v1.Snapshot()
        snapshot.name = snapshot_name
        snapshot.source_disk = f"projects/{self.project_id}/zones/{zone}/disks/{disk_name}"
        
        # 设置快照标签
        snapshot.labels = {
            'backup': 'auto',
            'source': disk_name,
            'created': datetime.now().strftime('%Y-%m-%d'),
        }
        
        request = compute_v1.InsertSnapshotRequest()
        request.project = self.project_id
        request.snapshot_resource = snapshot
        
        operation = snapshots_client.insert(request=request)
        operation.result()
        
        logger.info(f"✅ 已创建快照: {snapshot_name}")
        return snapshot_name
    
    def delete_old_snapshots(self, prefix='backup', retention_days=None):
        """删除过期的快照"""
        if retention_days is None:
            retention_days = self.retention_days
        
        snapshots_client = compute_v1.SnapshotsClient()
        cutoff_date = datetime.now() - timedelta(days=retention_days)
        
        request = compute_v1.ListSnapshotsRequest()
        request.project = self.project_id
        
        deleted_count = 0
        
        for snapshot in snapshots_client.list(request=request):
            # 只处理自动备份的快照
            if not snapshot.labels or snapshot.labels.get('backup') != 'auto':
                continue
            
            created = datetime.fromisoformat(
                snapshot.creation_timestamp.replace('Z', '+00:00')
            )
            
            if created < cutoff_date:
                delete_request = compute_v1.DeleteSnapshotRequest()
                delete_request.project = self.project_id
                delete_request.snapshot = snapshot.name
                
                operation = snapshots_client.delete(request=delete_request)
                operation.result()
                
                logger.info(f"🗑️ 已删除过期快照: {snapshot.name}")
                deleted_count += 1
        
        if deleted_count == 0:
            logger.info("没有需要删除的过期快照。")
        
        return deleted_count
    
    def backup_to_gcs(self, source_bucket, prefix='backup'):
        """将数据备份到 Cloud Storage（跨区域复制）"""
        source_bucket_obj = self.storage_client.bucket(source_bucket)
        backup_bucket_obj = self.storage_client.bucket(self.backup_bucket)
        
        blobs = source_bucket_obj.list_blobs()
        copied_count = 0
        
        for blob in blobs:
            # 构建备份路径
            backup_path = f"{prefix}/{datetime.now().strftime('%Y/%m/%d')}/{blob.name}"
            
            # 复制到备份 Bucket
            source_bucket_obj.copy_blob(
                blob,
                backup_bucket_obj,
                backup_path
            )
            
            copied_count += 1
        
        logger.info(f"✅ 已备份 {copied_count} 个对象到 {self.backup_bucket}")
        return copied_count
    
    def run_disk_backup(self, disk_configs):
        """执行完整备份流程"""
        logger.info("开始磁盘快照备份...")
        
        for config in disk_configs:
            self.create_disk_snapshot(
                disk_name=config['disk_name'],
                zone=config['zone']
            )
        
        # 清理过期快照
        self.delete_old_snapshots()
        
        logger.info("备份完成！")

def main():
    parser = argparse.ArgumentParser(description='GCP 自动备份工具')
    parser.add_argument('--project', required=True, help='GCP 项目 ID')
    parser.add_argument('--backup-bucket', required=True, help='备份存储桶')
    parser.add_argument('--action', choices=['disk-snapshot', 'cleanup', 'full'], 
                        default='disk-snapshot', help='备份类型')
    parser.add_argument('--retention', type=int, default=30, help='保留天数')
    
    args = parser.parse_args()
    
    manager = BackupManager(
        project_id=args.project,
        backup_bucket=args.backup_bucket,
        retention_days=args.retention
    )
    
    if args.action in ['disk-snapshot', 'full']:
        # 示例：备份指定的磁盘
        disk_configs = [
            {'disk_name': 'prod-db-data', 'zone': 'us-central1-a'},
            {'disk_name': 'prod-app-data', 'zone': 'us-central1-b'},
        ]
        manager.run_disk_backup(disk_configs)
    
    if args.action in ['cleanup', 'full']:
        manager.delete_old_snapshots()

if __name__ == '__main__':
    main()
```

---

## 19.6 使用 Cloud Scheduler 触发脚本

### Cloud Functions + Cloud Scheduler

将自动化脚本部署为 Cloud Functions，通过 Cloud Scheduler 定时触发：

```python
# main.py - Cloud Functions 入口
import functions_framework
from orphan_disk_cleanup import OrphanDiskCleaner

@functions_framework.http
def cleanup_disks(request):
    """Cloud Functions 入口，由 Cloud Scheduler 触发"""
    project_id = request.headers.get('X-Project-Id', 'my-project')
    
    cleaner = OrphanDiskCleaner(
        project_id=project_id,
        dry_run=False,
        max_age_days=7
    )
    
    cleaner.run()
    return 'Cleanup completed', 200
```

```bash
# 部署 Cloud Function
gcloud functions deploy cleanup-disks \
    --runtime python311 \
    --trigger-http \
    --entry-point cleanup_disks \
    --service-account scheduler-sa@my-project.iam.gserviceaccount.com \
    --timeout 540s \
    --memory 256MB

# 创建 Cloud Scheduler 定时任务
gcloud scheduler jobs create http weekly-disk-cleanup \
    --schedule="0 2 * * 1" \  # 每周一凌晨 2 点
    --uri="https://us-central1-my-project.cloudfunctions.net/cleanup-disks" \
    --http-method=GET \
    --oidc-service-account-email=scheduler-sa@my-project.iam.gserviceaccount.com
```

---

## 19.7 反模式：脚本自动化中的常见错误

### 反模式一：脚本没有 dry-run 模式

**表现**：脚本直接执行删除或修改操作，没有先预览将要执行的操作。

**后果**：一个 bug 可能导致误删大量资源。

**正确的做法**：所有执行修改操作的脚本都应该有 `--dry-run` 模式，先预览再执行。

### 反模式二：脚本没有错误处理

**表现**：脚本假设所有操作都会成功，没有 try-catch 或错误处理。

**后果**：某个操作失败后，脚本继续执行后续操作，可能导致数据不一致。

**正确的做法**：每个操作都进行错误处理，失败时记录日志并决定是否继续。

### 反模式三：认证信息硬编码

**表现**：在脚本中硬编码服务账号的 JSON 密钥文件路径，或者将密钥提交到代码仓库。

**后果**：密钥泄露，安全风险。

**正确的做法**：使用 Application Default Credentials 或 Workload Identity，不存储密钥文件。

### 反模式四：脚本没有日志记录

**表现**：脚本没有日志，或者只有 `print()` 输出。

**后果**：脚本执行后无法追溯——它做了什么？成功还是失败？

**正确的做法**：使用 Python 的 logging 模块，输出结构化日志，将日志发送到 Cloud Logging。

---

## 19.8 速查总结

### 常见自动化场景速查

| 场景 | 推荐工具 | 频次 | ROI |
|------|---------|------|-----|
| 清理孤儿磁盘 | Python + Cloud Scheduler | 每周 | 极高 |
| 轮换 SA 密钥 | Python + Cloud Scheduler | 每季度 | 高 |
| 自动备份 | Python + Cloud Scheduler | 每天 | 高 |
| 检查资源配额 | Python + Cloud Monitoring | 每天 | 中 |
| 标记未使用资源 | Python + Cloud Scheduler | 每月 | 中 |
| 自动扩缩容 | MIG/GKE Autoscaler | 持续 | 极高 |

### 脚本开发规范

| 规范 | 说明 |
|------|------|
| 使用 argparse | 支持命令行参数 |
| 支持 dry-run | 预览模式，不执行实际修改 |
| 添加日志 | 使用 logging 模块 |
| 错误处理 | try-catch 覆盖关键操作 |
| 类型注解 | 使用 Python type hints |
| 文档字符串 | 每个函数有 docstring |
| 配置外部化 | 敏感信息通过环境变量传入 |

### 每周脚本维护检查清单

- [ ] 所有定时脚本是否正常运行？
- [ ] 脚本日志是否有异常？
- [ ] 认证凭据是否仍然有效？
- [ ] API 版本是否有变更导致脚本不可用？
- [ ] 是否有新的场景需要自动化？

---

> **下一章预告：** 至此，我们完成了 IaC 与自动化部分的全部内容。从第 20 章开始，我们将进入容量规划、性能与成本管理——首先深入介绍自动扩缩容策略，包括 HPA、VPA 和 Cluster Autoscaler 的配置与实践。