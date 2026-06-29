# 第19章 腾讯云自动化脚本实战

## 19.1 概述

在云原生时代，SRE（站点可靠性工程师）面对的是成百上千的云资源实例。手动登录每台服务器执行运维操作已不现实。自动化脚本是SRE将重复性工作转化为可复用、可审计、可版本控制代码的核心手段。

腾讯云提供了三层自动化能力：

1. **腾讯云 Python SDK（TencentCloud SDK）**：完整的 API 封装，适合编写复杂的运维脚本
2. **SCF（Serverless Cloud Function）云函数**：事件驱动的无服务器执行环境，适合定时触发、告警联动
3. **tccli 命令行工具**：轻量级 API 调用工具，适合快速调试和 Shell 脚本集成

本章从这三个维度出发，结合真实运维场景，提供可直接投入生产的自动化脚本。

---

## 19.2 腾讯云 Python SDK 基础

### 19.2.1 安装与认证

腾讯云 Python SDK 通过 pip 安装：

```bash
pip install tencentcloud-sdk-python
```

认证方式推荐使用**临时密钥**或**CAM 角色**，避免在代码中硬编码长期密钥。

**方式一：环境变量**

```bash
set TENCENTCLOUD_SECRET_ID=AKIDxxxxxx
set TENCENTCLOUD_SECRET_KEY=xxxxxxxx
```

**方式二：凭证文件**

创建 `~/.tencentcloud/credentials`：

```ini
[default]
secret_id = AKIDxxxxxx
secret_key = xxxxxxxx
```

**方式三：直接在代码中初始化（仅用于测试）**

```python
from tencentcloud.common import credential
cred = credential.Credential("AKIDxxxxxx", "xxxxxxxx")
```

### 19.2.2 通用调用模式

所有腾讯云 API 遵循统一的调用模式：

```python
from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tencentcloud.cvm.v20170312 import cvm_client, models

def main():
    try:
        cred = credential.DefaultCredentialProvider().get_credential()
        client = cvm_client.CvmClient(cred, "ap-guangzhou")

        req = models.DescribeInstancesRequest()
        req.Limit = 100

        resp = client.DescribeInstances(req)
        for instance in resp.InstanceSet:
            print(f"{instance.InstanceId} - {instance.InstanceName}")

    except TencentCloudSDKException as e:
        print(f"API 调用失败: {e}")

if __name__ == "__main__":
    main()
```

核心要点：
- `credential.DefaultCredentialProvider()` 自动按优先级读取环境变量 → 凭证文件 → 实例角色
- 每个产品有独立的 Client 类，如 `CvmClient`、`CbsClient`、`TagClient`
- Request/Response 模式，所有参数通过 Request 对象设置

---

## 19.3 场景一：磁盘空间自动清理

### 19.3.1 问题背景

云服务器运行一段时间后，以下目录容易写满：

- `/var/log` — 应用日志、系统日志
- `/tmp` — 临时文件
- `/data/logs` — 业务日志

磁盘使用率超过 85% 时应触发告警，超过 95% 可能导致服务不可用。

### 19.3.2 本地清理脚本

```python
#!/usr/bin/env python3
"""
disk_cleaner.py — 磁盘空间自动清理脚本
功能：扫描指定目录，按策略清理过期日志和临时文件
"""

import os
import shutil
import time
import logging
import argparse
from pathlib import Path
from datetime import datetime, timedelta

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("/var/log/disk_cleaner.log")
    ]
)
logger = logging.getLogger(__name__)


def get_disk_usage(path: str) -> float:
    stat = shutil.disk_usage(path)
    return stat.used / stat.total * 100


def clean_by_age(directory: str, days: int, pattern: str = "*",
                 dry_run: bool = False) -> int:
    """
    清理指定目录下超过 days 天的文件
    返回清理的文件数量
    """
    cutoff = datetime.now() - timedelta(days=days)
    count = 0
    path = Path(directory)

    if not path.exists():
        logger.warning(f"目录不存在: {directory}")
        return 0

    for f in path.glob(pattern):
        if not f.is_file():
            continue
        mtime = datetime.fromtimestamp(f.stat().st_mtime)
        if mtime < cutoff:
            if dry_run:
                logger.info(f"[DRY-RUN] 将删除: {f} (修改时间: {mtime})")
            else:
                f.unlink()
                logger.info(f"已删除: {f}")
            count += 1

    return count


def clean_by_size(directory: str, max_size_mb: int,
                  dry_run: bool = False) -> int:
    """
    清理目录中最大的文件，直到总大小低于 max_size_mb
    返回清理的文件数量
    """
    path = Path(directory)
    if not path.exists():
        return 0

    total_size = sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
    target_size = max_size_mb * 1024 * 1024

    if total_size <= target_size:
        return 0

    files = sorted(
        [f for f in path.rglob("*") if f.is_file()],
        key=lambda x: x.stat().st_size,
        reverse=True
    )

    count = 0
    for f in files:
        if total_size <= target_size:
            break
        size = f.stat().st_size
        if dry_run:
            logger.info(f"[DRY-RUN] 将删除: {f} ({size / 1024 / 1024:.2f}MB)")
        else:
            f.unlink()
            logger.info(f"已删除: {f} ({size / 1024 / 1024:.2f}MB)")
        total_size -= size
        count += 1

    return count


def main():
    parser = argparse.ArgumentParser(description="磁盘空间自动清理工具")
    parser.add_argument("--dir", "-d", action="append",
                        help="要清理的目录（可多次指定）")
    parser.add_argument("--days", type=int, default=30,
                        help="文件保留天数（默认 30 天）")
    parser.add_argument("--pattern", default="*.log",
                        help="文件匹配模式（默认 *.log）")
    parser.add_argument("--max-size", type=int, default=1024,
                        help="目录最大大小 MB（默认 1024MB）")
    parser.add_argument("--threshold", type=float, default=85,
                        help="触发清理的磁盘使用率阈值（默认 85%%）")
    parser.add_argument("--dry-run", action="store_true",
                        help="仅预览，不实际删除")
    parser.add_argument("--notify", action="store_true",
                        help="清理后通过腾讯云发送通知")

    args = parser.parse_args()
    dirs = args.dir or ["/var/log", "/tmp", "/data/logs"]

    usage = get_disk_usage("/")
    logger.info(f"当前磁盘使用率: {usage:.2f}%%")

    if usage < args.threshold:
        logger.info("磁盘使用率正常，无需清理")
        return

    total_cleaned = 0
    for d in dirs:
        logger.info(f"开始清理目录: {d}")
        c1 = clean_by_age(d, args.days, args.pattern, args.dry_run)
        c2 = clean_by_size(d, args.max_size, args.dry_run)
        total_cleaned += c1 + c2

    after_usage = get_disk_usage("/")
    logger.info(f"清理完成，共处理 {total_cleaned} 个文件")
    logger.info(f"清理后磁盘使用率: {after_usage:.2f}%%")

    if args.notify and total_cleaned > 0:
        notify_via_scf(after_usage, total_cleaned)


def notify_via_scf(usage: float, cleaned: int):
    """通过 SCF HTTP 触发器发送通知（占位函数）"""
    import requests
    payload = {
        "subject": "磁盘清理报告",
        "content": f"磁盘使用率: {usage:.2f}%%, 清理文件数: {cleaned}"
    }
    try:
        requests.post(
            "https://service-xxxxxx.gz.apigw.tencentcs.com/release/notify",
            json=payload,
            timeout=5
        )
    except Exception as e:
        logger.error(f"通知发送失败: {e}")


if __name__ == "__main__":
    main()
```

**使用方式：**

```bash
# 预览模式
python disk_cleaner.py --dry-run

# 实际清理，保留 7 天日志，自定义目录
python disk_cleaner.py -d /var/log -d /app/logs --days 7 --threshold 80

# 添加到 crontab（每天凌晨 2 点执行）
# 0 2 * * * /usr/bin/python3 /opt/scripts/disk_cleaner.py >> /var/log/disk_cleaner.log 2>&1
```

### 19.3.3 通过 SDK 批量清理多台 CVM

当需要同时对多台 CVM 执行清理时，使用腾讯云 SDK 的 **Command 执行接口**：

```python
#!/usr/bin/env python3
"""
batch_disk_cleaner.py — 批量对多台 CVM 执行磁盘清理
"""

import json
import sys
from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tencentcloud.cvm.v20170312 import cvm_client, models as cvm_models
from tencentcloud.ssl.v20191205 import ssl_client, models as ssl_models


def get_all_instances(client, region: str) -> list:
    """获取指定地域所有 CVM 实例"""
    instances = []
    offset = 0
    limit = 100

    while True:
        req = cvm_models.DescribeInstancesRequest()
        req.Offset = offset
        req.Limit = limit
        resp = client.DescribeInstances(req)

        for inst in resp.InstanceSet:
            instances.append({
                "InstanceId": inst.InstanceId,
                "InstanceName": inst.InstanceName,
                "PublicIp": inst.PublicIpAddresses[0] if inst.PublicIpAddresses else "",
                "PrivateIp": inst.PrivateIpAddresses[0] if inst.PrivateIpAddresses else "",
                "OsName": inst.OsName,
            })

        if len(resp.InstanceSet) < limit:
            break
        offset += limit

    return instances


def run_command_on_instance(client, instance_id: str, command: str) -> dict:
    """在指定实例上执行命令（使用云 API）"""
    req = cvm_models.RunCommandRequest()
    req.InstanceIds = [instance_id]
    req.Command = command
    req.Timeout = 60

    try:
        resp = client.RunCommand(req)
        return {"success": True, "command_id": resp.CommandId}
    except TencentCloudSDKException as e:
        return {"success": False, "error": str(e)}


def main():
    regions = ["ap-guangzhou", "ap-shanghai", "ap-beijing", "ap-singapore"]
    clean_command = """
    # 清理 7 天前的日志
    find /var/log -name "*.log" -mtime +7 -delete
    find /tmp -type f -atime +3 -delete
    # 清理 Docker 悬空镜像
    docker image prune -f 2>/dev/null || true
    # 清理 yum/apt 缓存
    yum clean all 2>/dev/null || apt-get clean 2>/dev/null || true
    echo "Disk cleanup completed"
    df -h /
    """

    cred = credential.DefaultCredentialProvider().get_credential()

    for region in regions:
        print(f"\n=== 处理地域: {region} ===")
        client = cvm_client.CvmClient(cred, region)

        instances = get_all_instances(client, region)
        print(f"发现 {len(instances)} 台实例")

        for inst in instances:
            print(f"  执行清理: {inst['InstanceName']} ({inst['InstanceId']})")
            result = run_command_on_instance(client, inst["InstanceId"], clean_command)
            if result["success"]:
                print(f"    ✓ 命令已下发, ID: {result['command_id']}")
            else:
                print(f"    ✗ 失败: {result['error']}")


if __name__ == "__main__":
    main()
```

---

## 19.4 场景二：密钥对自动轮转

### 19.4.1 问题分析

SSH 密钥对和云 API 密钥是访问云资源的"钥匙"。安全最佳实践要求：

- SSH 密钥对每 90 天轮转一次
- API 密钥每 180 天轮转一次
- 旧密钥在轮转后立即禁用，观察 72 小时无异常后删除

### 19.4.2 SSH 密钥对轮转脚本

```python
#!/usr/bin/env python3
"""
ssh_key_rotator.py — SSH 密钥对自动轮转
功能：生成新密钥对，部署到指定 CVM，禁用旧密钥
"""

import os
import sys
import json
import time
import base64
import logging
from datetime import datetime, timedelta
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend

from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tencentcloud.cvm.v20170312 import cvm_client, models

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def generate_ssh_keypair(bits: int = 4096) -> tuple:
    """生成 RSA 密钥对，返回 (私钥字符串, 公钥字符串)"""
    key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=bits,
        backend=default_backend()
    )

    private_key = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.OpenSSH,
        encryption_algorithm=serialization.NoEncryption()
    ).decode("utf-8")

    public_key = key.public_key().public_bytes(
        encoding=serialization.Encoding.OpenSSH,
        format=serialization.PublicFormat.OpenSSH
    ).decode("utf-8")

    return private_key, public_key


def import_keypair(client, key_name: str, public_key: str) -> str:
    """导入公钥到腾讯云，返回 KeyId"""
    req = models.ImportKeyPairRequest()
    req.KeyName = key_name
    req.PublicKey = public_key
    resp = client.ImportKeyPair(req)
    return resp.KeyId


def bind_keypair_to_instances(client, key_id: str, instance_ids: list):
    """将密钥对绑定到指定实例"""
    req = models.AssociateInstancesKeyPairsRequest()
    req.KeyIds = [key_id]
    req.InstanceIds = instance_ids
    client.AssociateInstancesKeyPairs(req)


def unbind_keypair_from_instances(client, key_id: str, instance_ids: list):
    """从实例解绑密钥对"""
    req = models.DisassociateInstancesKeyPairsRequest()
    req.KeyIds = [key_id]
    req.InstanceIds = instance_ids
    client.DisassociateInstancesKeyPairs(req)


def list_old_keypairs(client, max_days: int = 90) -> list:
    """列出超过 max_days 天未使用的密钥对"""
    req = models.DescribeKeyPairsRequest()
    resp = client.DescribeKeyPairs(req)
    old_keys = []
    cutoff = datetime.now() - timedelta(days=max_days)

    for kp in resp.KeyPairSet:
        created = datetime.fromtimestamp(kp.CreatedTime.timestamp())
        if created < cutoff:
            old_keys.append({
                "KeyId": kp.KeyId,
                "KeyName": kp.KeyName,
                "CreatedTime": kp.CreatedTime,
                "AssociatedInstanceIds": list(kp.AssociatedInstanceIds),
            })
    return old_keys


def rotate_ssh_keys(region: str, instance_ids: list, dry_run: bool = False):
    """执行 SSH 密钥轮转"""
    cred = credential.DefaultCredentialProvider().get_credential()
    client = cvm_client.CvmClient(cred, region)
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    key_name = f"rotated-key-{timestamp}"

    logger.info(f"生成新密钥对: {key_name}")
    private_key, public_key = generate_ssh_keypair()

    if dry_run:
        logger.info(f"[DRY-RUN] 密钥名称: {key_name}")
        logger.info(f"[DRY-RUN] 公钥: {public_key[:80]}...")
        logger.info(f"[DRY-RUN] 将绑定到实例: {instance_ids}")
        return

    # 保存私钥到本地（安全位置）
    key_dir = "/opt/keys/ssh"
    os.makedirs(key_dir, exist_ok=True)
    key_path = os.path.join(key_dir, f"{key_name}.pem")
    with open(key_path, "w") as f:
        f.write(private_key)
    os.chmod(key_path, 0o600)
    logger.info(f"私钥已保存: {key_path}")

    # 导入公钥到腾讯云
    key_id = import_keypair(client, key_name, public_key)
    logger.info(f"公钥已导入, KeyId: {key_id}")

    # 绑定新密钥到实例
    bind_keypair_to_instances(client, key_id, instance_ids)
    logger.info(f"新密钥已绑定到 {len(instance_ids)} 台实例")

    # 查找并解绑旧密钥
    old_keys = list_old_keypairs(client, max_days=90)
    for old in old_keys:
        if old["AssociatedInstanceIds"]:
            logger.info(f"解绑旧密钥: {old['KeyName']} ({old['KeyId']})")
            unbind_keypair_from_instances(client, old["KeyId"], instance_ids)

    logger.info("SSH 密钥轮转完成")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="SSH 密钥自动轮转")
    parser.add_argument("--region", default="ap-guangzhou", help="地域")
    parser.add_argument("--instances", nargs="+", required=True,
                        help="实例 ID 列表")
    parser.add_argument("--dry-run", action="store_true", help="仅预览")
    args = parser.parse_args()

    rotate_ssh_keys(args.region, args.instances, args.dry_run)


if __name__ == "__main__":
    main()
```

### 19.4.3 API 密钥轮转脚本

```python
#!/usr/bin/env python3
"""
api_key_rotator.py — 腾讯云 API 密钥自动轮转
"""

import json
import logging
from datetime import datetime, timedelta

from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tencentcloud.cam.v20190116 import cam_client, models

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def list_api_keys(client, owner_uin: str = None) -> list:
    """列出所有 API 密钥"""
    req = models.ListAccessKeysRequest()
    if owner_uin:
        req.TargetUin = owner_uin
    resp = client.ListAccessKeys(req)
    return [
        {
            "AccessKeyId": ak.AccessKeyId,
            "Status": ak.Status,
            "CreateTime": ak.CreateTime,
            "Description": getattr(ak, "Description", ""),
        }
        for ak in resp.AccessKeys
    ]


def create_api_key(client, description: str = "") -> dict:
    """创建新的 API 密钥"""
    req = models.CreateAccessKeyRequest()
    if description:
        req.Description = description
    resp = client.CreateAccessKey(req)
    return {
        "AccessKeyId": resp.AccessKey.AccessKeyId,
        "SecretAccessKey": resp.AccessKey.SecretAccessKey,
        "CreateTime": resp.AccessKey.CreateTime,
    }


def disable_api_key(client, access_key_id: str):
    """禁用 API 密钥"""
    req = models.UpdateAccessKeyRequest()
    req.AccessKeyId = access_key_id
    req.Status = "Disabled"
    client.UpdateAccessKey(req)


def delete_api_key(client, access_key_id: str):
    """删除 API 密钥"""
    req = models.DeleteAccessKeyRequest()
    req.AccessKeyId = access_key_id
    client.DeleteAccessKey(req)


def rotate_api_keys(dry_run: bool = False):
    """执行 API 密钥轮转"""
    cred = credential.DefaultCredentialProvider().get_credential()
    client = cam_client.CamClient(cred, "ap-guangzhou")

    keys = list_api_keys(client)
    active_keys = [k for k in keys if k["Status"] == "Active"]
    logger.info(f"当前活跃密钥数: {len(active_keys)}")

    if len(active_keys) >= 2:
        logger.warning("已有 2 个活跃密钥，跳过创建（腾讯云限制最多 2 个活跃密钥）")
        return

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    description = f"auto-rotated-{timestamp}"

    if dry_run:
        logger.info(f"[DRY-RUN] 将创建新密钥: {description}")
        logger.info(f"[DRY-RUN] 将禁用旧密钥: {[k['AccessKeyId'] for k in active_keys]}")
        return

    # 创建新密钥
    new_key = create_api_key(client, description)
    logger.info(f"新密钥已创建: {new_key['AccessKeyId']}")
    logger.info(f"SecretAccessKey: {new_key['SecretAccessKey']}")
    logger.warning("请立即保存 SecretAccessKey，此信息仅在此显示一次！")

    # 禁用旧密钥
    for old_key in active_keys:
        logger.info(f"禁用旧密钥: {old_key['AccessKeyId']}")
        disable_api_key(client, old_key["AccessKeyId"])

    logger.info("API 密钥轮转完成。旧密钥将在 72 小时后自动删除。")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="API 密钥自动轮转")
    parser.add_argument("--dry-run", action="store_true", help="仅预览")
    args = parser.parse_args()
    rotate_api_keys(args.dry_run)


if __name__ == "__main__":
    main()
```

---

## 19.5 场景三：资源标签自动化管理

### 19.5.1 标签管理的重要性

腾讯云标签是组织云资源的核心手段。合理的标签策略可以实现：

- **成本分摊**：按项目、部门、环境拆分账单
- **自动化运维**：通过标签批量操作资源
- **访问控制**：基于标签的精细化权限管理

### 19.5.2 标签批量管理脚本

```python
#!/usr/bin/env python3
"""
tag_manager.py — 腾讯云资源标签批量管理工具
"""

import json
import logging
from collections import defaultdict
from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tencentcloud.tag.v20180813 import tag_client, models

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# 预定义标签策略
TAG_POLICIES = {
    "required": ["env", "project", "owner"],
    "env_values": {"prod", "staging", "dev", "test"},
    "project_pattern": r"^[a-z0-9-]{3,32}$",
}


def get_resource_tags(client, resource: str) -> dict:
    """查询单个资源的标签"""
    req = models.DescribeResourceTagsByResourceIdsRequest()
    req.ResourceRegion = "ap-guangzhou"
    req.ServiceType = resource.split("::")[1] if "::" in resource else ""
    req.ResourcePrefix = resource
    req.ResourceIds = [resource.split("/")[-1]]

    try:
        resp = client.DescribeResourceTagsByResourceIds(req)
        tags = {}
        for tag in resp.Tags:
            tags[tag.TagKey] = tag.TagValue
        return tags
    except TencentCloudSDKException as e:
        logger.error(f"查询标签失败: {resource} - {e}")
        return {}


def tag_resource(client, resource: str, tags: dict):
    """为资源绑定标签"""
    req = models.AddResourceTagRequest()
    for key, value in tags.items():
        req.TagKey = key
        req.TagValue = value
        req.Resource = resource
        try:
            client.AddResourceTag(req)
            logger.info(f"标签已添加: {resource} -> {key}={value}")
        except TencentCloudSDKException as e:
            logger.error(f"添加标签失败: {resource} {key}={value} - {e}")


def untag_resource(client, resource: str, tag_keys: list):
    """解绑资源的指定标签"""
    for key in tag_keys:
        req = models.DeleteResourceTagRequest()
        req.TagKey = key
        req.Resource = resource
        try:
            client.DeleteResourceTag(req)
            logger.info(f"标签已删除: {resource} -> {key}")
        except TencentCloudSDKException as e:
            logger.error(f"删除标签失败: {resource} {key} - {e}")


def batch_tag_by_instances(region: str, instance_ids: list, tags: dict,
                            mode: str = "merge"):
    """
    批量对 CVM 实例打标签
    mode: overwrite — 覆盖现有标签, merge — 合并（保留未冲突的现有标签）
    """
    cred = credential.DefaultCredentialProvider().get_credential()
    client = tag_client.TagClient(cred, region)

    for inst_id in instance_ids:
        resource = f"qcs::cvm:{region}:uin/1000xxxxxx:instance/{inst_id}"

        if mode == "merge":
            existing = get_resource_tags(client, resource)
            final_tags = {**existing, **tags}
        else:
            final_tags = tags

        tag_resource(client, resource, final_tags)

    logger.info(f"批量标签完成: {len(instance_ids)} 台实例")


def audit_tag_compliance(region: str, service_type: str = "cvm") -> dict:
    """
    审计标签合规性
    返回不合规资源列表
    """
    cred = credential.DefaultCredentialProvider().get_credential()
    client = tag_client.TagClient(cred, region)

    req = models.DescribeResourcesByTagsRequest()
    req.ServiceType = service_type
    req.ResourceRegion = region

    non_compliant = defaultdict(list)

    try:
        resp = client.DescribeResourcesByTags(req)
        for resource in resp.Rows:
            resource_id = resource.ResourceId
            tags = get_resource_tags(client, resource_id)

            missing = [k for k in TAG_POLICIES["required"] if k not in tags]
            if missing:
                non_compliant["missing_tags"].append({
                    "resource": resource_id,
                    "missing": missing,
                })

            env = tags.get("env", "")
            if env and env not in TAG_POLICIES["env_values"]:
                non_compliant["invalid_env"].append({
                    "resource": resource_id,
                    "value": env,
                })

    except TencentCloudSDKException as e:
        logger.error(f"合规审计失败: {e}")

    return dict(non_compliant)


def sync_tags_from_csv(csv_path: str, region: str):
    """从 CSV 文件批量导入标签"""
    import csv
    cred = credential.DefaultCredentialProvider().get_credential()
    client = tag_client.TagClient(cred, region)

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            resource = row.get("resource", "")
            tag_key = row.get("tag_key", "")
            tag_value = row.get("tag_value", "")
            if resource and tag_key and tag_value:
                tag_resource(client, resource, {tag_key: tag_value})

    logger.info(f"CSV 标签导入完成: {csv_path}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="腾讯云标签管理工具")
    subparsers = parser.add_subparsers(dest="action", required=True)

    # 批量打标签
    tag_parser = subparsers.add_parser("tag", help="批量打标签")
    tag_parser.add_argument("--region", default="ap-guangzhou")
    tag_parser.add_argument("--instances", nargs="+", required=True)
    tag_parser.add_argument("--tags", nargs="+", required=True,
                            help="标签键值对，格式 key=value")
    tag_parser.add_argument("--mode", choices=["merge", "overwrite"],
                            default="merge")

    # 合规审计
    audit_parser = subparsers.add_parser("audit", help="标签合规审计")
    audit_parser.add_argument("--region", default="ap-guangzhou")
    audit_parser.add_argument("--service", default="cvm")

    # CSV 导入
    csv_parser = subparsers.add_parser("import-csv", help="从 CSV 导入标签")
    csv_parser.add_argument("--csv", required=True)
    csv_parser.add_argument("--region", default="ap-guangzhou")

    args = parser.parse_args()

    if args.action == "tag":
        tags = dict(kv.split("=", 1) for kv in args.tags)
        batch_tag_by_instances(args.region, args.instances, tags, args.mode)

    elif args.action == "audit":
        result = audit_tag_compliance(args.region, args.service)
        if result:
            print(json.dumps(result, indent=2, ensure_ascii=False))
        else:
            print("所有资源标签合规 ✓")

    elif args.action == "import-csv":
        sync_tags_from_csv(args.csv, args.region)


if __name__ == "__main__":
    main()
```

**使用示例：**

```bash
# 批量打标签
python tag_manager.py tag \
    --region ap-guangzhou \
    --instances ins-xxxxxx1 ins-xxxxxx2 \
    --tags env=prod project=myapp owner=sre-team

# 合规审计
python tag_manager.py audit --region ap-guangzhou

# CSV 导入
python tag_manager.py import-csv --csv tags.csv
```

---

## 19.6 SCF 云函数自动化

### 19.6.1 SCF 适用场景

腾讯云 SCF（Serverless Cloud Function）适合以下自动化场景：

| 场景 | 触发器 | 说明 |
|------|--------|------|
| 定时磁盘清理 | 定时触发器 | 每天凌晨执行清理脚本 |
| 资源标签合规检查 | 定时触发器 | 每天检查标签合规性并发送报告 |
| 密钥轮转 | 定时触发器 | 每 90 天自动轮转密钥 |
| 告警联动自愈 | CLS/CMQ 触发器 | 收到告警后自动执行恢复操作 |
| 资源自动扩缩容 | 定时/API 触发器 | 根据时间计划自动调整实例配置 |

### 19.6.2 SCF 函数模板

```python
#!/usr/bin/env python3
"""
scf_automation_template.py — SCF 云函数自动化通用模板
部署到腾讯云 SCF 平台，支持多种触发器
"""

import json
import os
import sys
import logging
from datetime import datetime

# SCF 运行时会将事件和上下文注入
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def load_config() -> dict:
    """从环境变量加载配置"""
    return {
        "regions": os.environ.get("REGIONS", "ap-guangzhou").split(","),
        "disk_threshold": float(os.environ.get("DISK_THRESHOLD", "85")),
        "log_retention_days": int(os.environ.get("LOG_RETENTION_DAYS", "30")),
        "tag_policy": os.environ.get("TAG_POLICY", "default"),
        "notification_url": os.environ.get("NOTIFICATION_URL", ""),
    }


def handle_timer_event(event: dict, context: object) -> str:
    """处理定时触发器事件"""
    config = load_config()
    action = os.environ.get("SCF_ACTION", "disk_clean")

    logger.info(f"SCF 定时触发开始, action={action}")

    if action == "disk_clean":
        return execute_disk_clean(config)
    elif action == "tag_audit":
        return execute_tag_audit(config)
    elif action == "key_rotate":
        return execute_key_rotate(config)
    else:
        return f"未知 action: {action}"


def handle_api_event(event: dict, context: object) -> dict:
    """处理 API 网关触发器事件"""
    try:
        body = json.loads(event.get("body", "{}"))
        action = body.get("action", "")

        if action == "clean":
            result = execute_disk_clean(load_config())
            return {"statusCode": 200, "body": json.dumps({"result": result})}
        elif action == "tag":
            result = execute_tag_audit(load_config())
            return {"statusCode": 200, "body": json.dumps({"result": result})}
        else:
            return {"statusCode": 400, "body": json.dumps({"error": "unknown action"})}

    except Exception as e:
        logger.exception("API 处理异常")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


def execute_disk_clean(config: dict) -> str:
    """执行磁盘清理（通过云 API 对多台实例下发命令）"""
    from tencentcloud.common import credential
    from tencentcloud.cvm.v20170312 import cvm_client, models

    cred = credential.DefaultCredentialProvider().get_credential()
    results = []

    for region in config["regions"]:
        client = cvm_client.CvmClient(cred, region.strip())

        # 查询所有实例
        req = models.DescribeInstancesRequest()
        req.Limit = 100
        resp = client.DescribeInstances(req)

        for inst in resp.InstanceSet:
            clean_cmd = f"""
            find /var/log -name "*.log" -mtime +{config['log_retention_days']} -delete
            docker image prune -f 2>/dev/null || true
            echo "Cleaned: $(df -h / | tail -1 | awk '{{print $5}}')"
            """
            try:
                cmd_req = models.RunCommandRequest()
                cmd_req.InstanceIds = [inst.InstanceId]
                cmd_req.Command = clean_cmd
                cmd_req.Timeout = 30
                client.RunCommand(cmd_req)
                results.append(f"{inst.InstanceId}: OK")
            except Exception as e:
                results.append(f"{inst.InstanceId}: {e}")

    summary = f"磁盘清理完成: {len(results)} 台实例"
    logger.info(summary)
    return summary


def execute_tag_audit(config: dict) -> str:
    """执行标签合规审计并发送报告"""
    from tencentcloud.common import credential
    from tencentcloud.tag.v20180813 import tag_client, models

    cred = credential.DefaultCredentialProvider().get_credential()
    required_tags = ["env", "project", "owner"]
    violations = []

    for region in config["regions"]:
        client = tag_client.TagClient(cred, region.strip())

        req = models.DescribeResourcesByTagsRequest()
        req.ServiceType = "cvm"
        req.ResourceRegion = region.strip()

        try:
            resp = client.DescribeResourcesByTags(req)
            for resource in resp.Rows:
                tag_req = models.DescribeResourceTagsByResourceIdsRequest()
                tag_req.ResourceRegion = region.strip()
                tag_req.ServiceType = "cvm"
                tag_req.ResourceIds = [resource.ResourceId]

                tag_resp = client.DescribeResourceTagsByResourceIds(tag_req)
                existing_keys = {t.TagKey for t in tag_resp.Tags}
                missing = [k for k in required_tags if k not in existing_keys]

                if missing:
                    violations.append({
                        "region": region,
                        "resource": resource.ResourceId,
                        "missing": missing,
                    })
        except Exception as e:
            logger.error(f"审计失败 {region}: {e}")

    report = {
        "timestamp": datetime.now().isoformat(),
        "total_violations": len(violations),
        "violations": violations[:50],  # 限制输出大小
    }

    logger.info(f"标签审计完成, 违规数: {len(violations)}")
    return json.dumps(report, ensure_ascii=False)


def main_handler(event: dict, context: object):
    """SCF 入口函数"""
    logger.info(f"收到事件: {json.dumps(event, ensure_ascii=False)[:200]}")

    # 判断触发器类型
    if "Time" in event and "TriggerName" in event:
        return handle_timer_event(event, context)
    elif "httpMethod" in event or "requestContext" in event:
        return handle_api_event(event, context)
    else:
        return handle_timer_event(event, context)


# 本地调试入口
if __name__ == "__main__":
    test_event = {"Time": datetime.now().isoformat(), "TriggerName": "test"}
    result = main_handler(test_event, None)
    print(result)
```

### 19.6.3 部署 SCF 函数

**方式一：通过控制台部署**

1. 登录腾讯云 SCF 控制台
2. 创建函数 → 选择"空白函数"
3. 运行时选择 Python 3.7+
4. 粘贴上述代码
5. 配置环境变量（REGIONS、DISK_THRESHOLD 等）
6. 添加触发器（定时触发器或 API 网关触发器）

**方式二：通过 SCF CLI 部署**

```bash
# 安装 SCF CLI
pip install scf

# 初始化项目
scf init --runtime python3.7 --name disk-cleaner

# 部署
scf deploy --region ap-guangzhou --name disk-cleaner
```

**方式三：通过 Terraform 部署**

```hcl
resource "tencentcloud_scf_function" "disk_cleaner" {
  name    = "disk-cleaner"
  runtime = "Python3.7"
  handler = "main.main_handler"

  environment {
    variables = {
      REGIONS          = "ap-guangzhou,ap-shanghai"
      DISK_THRESHOLD   = "85"
      LOG_RETENTION_DAYS = "30"
    }
  }

  triggers {
    type  = "timer"
    param = "CRON_TZ=Asia/Shanghai 0 2 * * *"
  }
}
```

---

## 19.7 tccli 命令行工具

### 19.7.1 安装与配置

tccli 是腾讯云官方命令行工具，基于 Python 实现：

```bash
# 安装
pip install tccli

# 配置（交互式）
tccli configure

# 或直接写入配置文件
cat > ~/.tccli/default.configure << 'EOF'
{
  "secretId": "AKIDxxxxxx",
  "secretKey": "xxxxxxxx",
  "region": "ap-guangzhou",
  "output": "json"
}
EOF
```

### 19.7.2 常用命令速查

```bash
# CVM 相关
tccli cvm DescribeInstances --Limit 100
tccli cvm DescribeInstances --Filters '[{"Name":"instance-state","Values":["RUNNING"]}]'
tccli cvm RunInstances --InstanceChargeType POSTPAID_BY_HOUR \
  --ImageId img-xxxxxx --InstanceType S5.LARGE8

# CBS 云硬盘
tccli cbs DescribeDisks --Limit 100
tccli cbs CreateSnapshot --DiskId disk-xxxxxx --SnapshotName "auto-snap-$(date +%Y%m%d)"

# 标签
tccli tag DescribeTags --Limit 100
tccli tag AddResourceTag --TagKey env --TagValue prod \
  --Resource "qcs::cvm:ap-guangzhou:uin/1000xxxxxx:instance/ins-xxxxxx"

# CAM 密钥
tccli cam ListAccessKeys
tccli cam CreateAccessKey --Description "rotated-key-20250601"

# 监控
tccli monitor DescribeBaseMetrics
tccli monitor GetMonitorData --Namespace QCE/CVM \
  --MetricName CPUUsage --Period 300 \
  --Instances '[{"InstanceId":"ins-xxxxxx"}]'
```

### 19.7.3 Shell 自动化脚本

tccli 最大的优势是可以嵌入 Shell 脚本，实现快速自动化：

```bash
#!/bin/bash
# batch_ops.sh — 基于 tccli 的批量运维脚本

set -euo pipefail

REGION="${REGION:-ap-guangzhou}"

# 获取所有运行中的实例
get_running_instances() {
    tccli cvm DescribeInstances \
        --Filters '[{"Name":"instance-state","Values":["RUNNING"]}]' \
        --region "$REGION" \
        --query 'InstanceSet[*].[InstanceId,InstanceName]' \
        --output json
}

# 批量重启实例
batch_reboot() {
    local tag_key="${1:-env}"
    local tag_value="${2:-prod}"

    echo "查询标签 ${tag_key}=${tag_value} 的实例..."

    local instance_ids
    instance_ids=$(tccli tag DescribeResourcesByTags \
        --TagFilters "[{\"TagKey\":\"${tag_key}\",\"TagValue\":\"${tag_value}\"}]" \
        --ServiceType cvm --ResourceRegion "$REGION" \
        --query 'Rows[*].ResourceId' --output text)

    if [[ -z "$instance_ids" ]]; then
        echo "未找到匹配实例"
        exit 0
    fi

    echo "将重启以下实例:"
    echo "$instance_ids"

    read -p "确认重启? (y/N) " confirm
    if [[ "$confirm" != "y" ]]; then
        echo "已取消"
        exit 0
    fi

    for id in $instance_ids; do
        echo "重启实例: $id"
        tccli cvm RebootInstances --InstanceIds "[\"$id\"]" --region "$REGION"
    done

    echo "重启命令已下发"
}

# 创建所有云硬盘的快照
batch_snapshot() {
    local retention_days="${1:-7}"

    echo "获取所有云硬盘..."
    local disks
    disks=$(tccli cbs DescribeDisks \
        --region "$REGION" \
        --query 'DiskSet[*].DiskId' --output text)

    for disk_id in $disks; do
        local snap_name="auto-snap-$(date +%Y%m%d)-${disk_id}"
        echo "创建快照: $disk_id -> $snap_name"
        tccli cbs CreateSnapshot \
            --DiskId "$disk_id" \
            --SnapshotName "$snap_name" \
            --region "$REGION" > /dev/null
    done

    echo "快照创建完成"

    # 清理过期快照
    local cutoff
    cutoff=$(date -d "-${retention_days} days" +%Y%m%d)
    echo "清理 ${retention_days} 天前的快照..."

    local old_snapshots
    old_snapshots=$(tccli cbs DescribeSnapshots \
        --region "$REGION" \
        --query "SnapshotSet[?starts_with(SnapshotName,'auto-snap-') && \
            SnapshotName < 'auto-snap-${cutoff}'].SnapshotId" --output text)

    for snap_id in $old_snapshots; do
        echo "删除过期快照: $snap_id"
        tccli cbs DeleteSnapshots --SnapshotIds "[\"$snap_id\"]" --region "$REGION"
    done
}

# 磁盘使用率巡检
disk_inspection() {
    tccli monitor GetMonitorData \
        --Namespace QCE/CVM \
        --MetricName DiskUsage \
        --Period 3600 \
        --Instances "[{\"InstanceId\":\"$1\"}]" \
        --StartTime "$(date -d '-1 hour' -u +%Y-%m-%dT%H:%M:%S+08:00)" \
        --EndTime "$(date -u +%Y-%m-%dT%H:%M:%S+08:00)" \
        --region "$REGION"
}

# 主菜单
case "${1:-help}" in
    list)
        get_running_instances
        ;;
    reboot)
        batch_reboot "${2:-env}" "${3:-prod}"
        ;;
    snapshot)
        batch_snapshot "${2:-7}"
        ;;
    disk)
        disk_inspection "${2:-}"
        ;;
    *)
        echo "用法: $0 {list|reboot|snapshot|disk}"
        echo "  list                    — 列出所有运行中实例"
        echo "  reboot [key] [val]      — 按标签批量重启实例"
        echo "  snapshot [days]         — 批量创建快照并清理过期"
        echo "  disk <instance-id>      — 查询实例磁盘使用率"
        ;;
esac
```

### 19.7.4 tccli 高级技巧

**使用 JMESPath 精确过滤：**

```bash
# 只返回实例 ID 和名称
tccli cvm DescribeInstances \
    --query "InstanceSet[*].{ID:InstanceId,Name:InstanceName,IP:PublicIpAddresses[0]}"

# 过滤特定状态的实例
tccli cvm DescribeInstances \
    --query "InstanceSet[?InstanceState=='RUNNING'].[InstanceId]"

# 统计各可用区实例数
tccli cvm DescribeInstances \
    --query "length(InstanceSet)"  # 总数
```

**批量操作结合 xargs：**

```bash
# 批量停止所有非生产实例
tccli cvm DescribeInstances \
    --Filters '[{"Name":"tag:env","Values":["dev","test"]}]' \
    --query 'InstanceSet[*].InstanceId' --output text | \
    tr '\t' '\n' | \
    xargs -I {} tccli cvm StopInstances --InstanceIds "[\"{}\"]"
```

**使用配置文件切换多账号：**

```bash
# 配置多个账号
tccli configure --profile prod
tccli configure --profile staging

# 切换账号执行命令
tccli cvm DescribeInstances --profile prod
tccli cvm DescribeInstances --profile staging
```

---

## 19.8 综合自动化案例：全自动运维流水线

### 19.8.1 场景描述

设计一个完整的自动化运维流水线，每天凌晨自动执行：

1. 磁盘使用率检查与清理
2. 标签合规审计
3. 过期快照清理
4. 生成运维日报并发送到企业微信

### 19.8.2 主控脚本

```python
#!/usr/bin/env python3
"""
daily_ops_pipeline.py — 每日自动化运维流水线
"""

import json
import logging
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from tencentcloud.common import credential
from tencentcloud.cvm.v20170312 import cvm_client, models as cvm_models
from tencentcloud.cbs.v20170312 import cbs_client, models as cbs_models
from tencentcloud.tag.v20180813 import tag_client, models as tag_models

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(f"/var/log/ops_pipeline_{datetime.now().strftime('%Y%m%d')}.log")
    ]
)
logger = logging.getLogger(__name__)


class DailyOpsPipeline:
    def __init__(self, regions: list):
        self.regions = regions
        self.cred = credential.DefaultCredentialProvider().get_credential()
        self.report = {
            "timestamp": datetime.now().isoformat(),
            "disk_clean": {"total": 0, "cleaned": 0},
            "snapshot_clean": {"deleted": 0},
            "tag_audit": {"violations": 0},
            "errors": [],
        }

    def step_disk_clean(self):
        """步骤 1：磁盘清理"""
        logger.info("=== 步骤 1: 磁盘清理 ===")
        for region in self.regions:
            try:
                client = cvm_client.CvmClient(self.cred, region)
                req = cvm_models.DescribeInstancesRequest()
                req.Limit = 100
                resp = client.DescribeInstances(req)

                for inst in resp.InstanceSet:
                    clean_cmd = (
                        f"find /var/log -name '*.log' -mtime +30 -delete; "
                        f"find /tmp -type f -atime +3 -delete; "
                        f"docker image prune -f 2>/dev/null || true; "
                        f"yum clean all 2>/dev/null || apt-get clean 2>/dev/null || true"
                    )
                    cmd_req = cvm_models.RunCommandRequest()
                    cmd_req.InstanceIds = [inst.InstanceId]
                    cmd_req.Command = clean_cmd
                    cmd_req.Timeout = 60
                    client.RunCommand(cmd_req)
                    self.report["disk_clean"]["total"] += 1

                logger.info(f"  {region}: 已下发 {len(resp.InstanceSet)} 台实例清理命令")
            except Exception as e:
                self.report["errors"].append(f"disk_clean {region}: {e}")
                logger.error(f"  {region} 清理失败: {e}")

    def step_clean_snapshots(self, retention_days: int = 7):
        """步骤 2：清理过期快照"""
        logger.info(f"=== 步骤 2: 清理 {retention_days} 天前快照 ===")
        for region in self.regions:
            try:
                client = cbs_client.CbsClient(self.cred, region)
                req = cbs_models.DescribeSnapshotsRequest()
                req.Limit = 100
                resp = client.DescribeSnapshots(req)

                cutoff = datetime.now().timestamp() - retention_days * 86400
                for snap in resp.SnapshotSet:
                    if snap.SnapshotName.startswith("auto-"):
                        created = snap.CreateTime.timestamp()
                        if created < cutoff:
                            del_req = cbs_models.DeleteSnapshotsRequest()
                            del_req.SnapshotIds = [snap.SnapshotId]
                            client.DeleteSnapshots(del_req)
                            self.report["snapshot_clean"]["deleted"] += 1
                            logger.info(f"  删除快照: {snap.SnapshotId} ({snap.SnapshotName})")

            except Exception as e:
                self.report["errors"].append(f"snapshot_clean {region}: {e}")
                logger.error(f"  {region} 快照清理失败: {e}")

    def step_tag_audit(self):
        """步骤 3：标签合规审计"""
        logger.info("=== 步骤 3: 标签合规审计 ===")
        required = ["env", "project", "owner"]

        for region in self.regions:
            try:
                client = tag_client.TagClient(self.cred, region)
                req = tag_models.DescribeResourcesByTagsRequest()
                req.ServiceType = "cvm"
                req.ResourceRegion = region
                resp = client.DescribeResourcesByTags(req)

                for resource in resp.Rows:
                    tag_req = tag_models.DescribeResourceTagsByResourceIdsRequest()
                    tag_req.ResourceRegion = region
                    tag_req.ServiceType = "cvm"
                    tag_req.ResourceIds = [resource.ResourceId]
                    tag_resp = client.DescribeResourceTagsByResourceIds(tag_req)

                    existing = {t.TagKey for t in tag_resp.Tags}
                    missing = [k for k in required if k not in existing]
                    if missing:
                        self.report["tag_audit"]["violations"] += 1
                        logger.warning(f"  不合规: {resource.ResourceId} 缺少 {missing}")

            except Exception as e:
                self.report["errors"].append(f"tag_audit {region}: {e}")

    def step_send_report(self):
        """步骤 4：发送运维日报"""
        logger.info("=== 步骤 4: 发送运维日报 ===")
        report_text = f"""
## 每日运维报告 ({self.report['timestamp'][:10]})

### 磁盘清理
- 执行实例数: {self.report['disk_clean']['total']}

### 快照清理
- 删除过期快照: {self.report['snapshot_clean']['deleted']}

### 标签审计
- 违规资源数: {self.report['tag_audit']['violations']}

### 错误
- 错误数: {len(self.report['errors'])}
"""
        if self.report["errors"]:
            for err in self.report["errors"]:
                report_text += f"- {err}\n"

        # 保存报告到本地
        report_path = Path(f"/var/reports/ops_report_{datetime.now().strftime('%Y%m%d')}.md")
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(report_text, encoding="utf-8")
        logger.info(f"报告已保存: {report_path}")

        # 发送到企业微信（示例）
        webhook_url = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxx"
        try:
            import requests
            requests.post(webhook_url, json={
                "msgtype": "markdown",
                "markdown": {"content": report_text},
            }, timeout=10)
            logger.info("报告已发送到企业微信")
        except ImportError:
            logger.warning("requests 未安装，跳过企业微信通知")
        except Exception as e:
            logger.error(f"发送通知失败: {e}")

    def run(self):
        """执行完整流水线"""
        logger.info("=" * 50)
        logger.info("每日运维流水线开始执行")
        logger.info("=" * 50)

        self.step_disk_clean()
        self.step_clean_snapshots()
        self.step_tag_audit()
        self.step_send_report()

        logger.info("=" * 50)
        logger.info("每日运维流水线执行完成")
        logger.info("=" * 50)

        return self.report


def main():
    regions = ["ap-guangzhou", "ap-shanghai", "ap-beijing"]
    pipeline = DailyOpsPipeline(regions)
    report = pipeline.run()
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

---

## 19.9 自动化脚本最佳实践

### 19.9.1 错误处理

```python
def safe_api_call(func, *args, max_retries: int = 3, **kwargs):
    """带重试的安全 API 调用包装器"""
    import time
    from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException

    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except TencentCloudSDKException as e:
            if attempt < max_retries - 1:
                wait = 2 ** attempt
                logger.warning(f"API 调用失败 (尝试 {attempt + 1}/{max_retries}): {e}, {wait}s 后重试")
                time.sleep(wait)
            else:
                logger.error(f"API 调用最终失败: {e}")
                raise
```

### 19.9.2 幂等性设计

所有自动化脚本应保证幂等性——多次执行产生相同结果：

```python
def ensure_tag(client, resource: str, key: str, value: str):
    """幂等地设置标签：先查询，存在则跳过，不存在则创建"""
    existing = get_resource_tags(client, resource)
    if existing.get(key) == value:
        logger.info(f"标签已存在，跳过: {key}={value}")
        return
    tag_resource(client, resource, {key: value})
```

### 19.9.3 日志与审计

```python
import logging
import json
from datetime import datetime

class AuditLogger:
    """审计日志记录器，记录所有操作到文件用于事后审计"""

    def __init__(self, log_path: str = "/var/log/ops_audit.log"):
        self.log_path = log_path
        self.logger = logging.getLogger("audit")
        handler = logging.FileHandler(log_path)
        handler.setFormatter(logging.Formatter(
            "%(asctime)s [AUDIT] %(message)s"
        ))
        self.logger.addHandler(handler)
        self.logger.setLevel(logging.INFO)

    def log_operation(self, operator: str, action: str,
                      resource: str, detail: dict, success: bool):
        entry = {
            "timestamp": datetime.now().isoformat(),
            "operator": operator,
            "action": action,
            "resource": resource,
            "detail": detail,
            "success": success,
        }
        self.logger.info(json.dumps(entry, ensure_ascii=False))
```

### 19.9.4 安全注意事项

1. **永远不要在代码中硬编码密钥**——使用环境变量、凭证文件或 CAM 角色
2. **最小权限原则**——为自动化脚本创建专用的 CAM 子账号，仅授予所需权限
3. **操作前备份**——涉及删除的操作（如清理磁盘、删除快照）先执行 dry-run
4. **限速保护**——腾讯云 API 有频率限制，批量操作时加入间隔

```python
import time

def batch_with_rate_limit(items: list, api_func, rate: int = 20):
    """按速率限制批量执行 API 调用（每秒不超过 rate 次）"""
    for i, item in enumerate(items):
        api_func(item)
        if (i + 1) % rate == 0:
            time.sleep(1)
```

---

## 19.10 本章小结

本章从三个层次覆盖了腾讯云自动化脚本的完整知识体系：

| 层次 | 工具 | 适用场景 | 复杂度 |
|------|------|----------|--------|
| SDK 编程 | Python SDK | 复杂业务逻辑、状态管理 | 高 |
| 无服务器 | SCF | 定时任务、事件驱动 | 中 |
| 命令行 | tccli | 快速操作、Shell 集成 | 低 |

**核心原则：**

- **可重复**：脚本应幂等，多次执行结果一致
- **可审计**：所有操作记录日志，支持事后追溯
- **可配置**：通过环境变量或配置文件控制行为，不硬编码
- **安全优先**：最小权限、密钥管理、dry-run 模式

**推荐实践路径：**

1. 从 tccli 开始，快速验证 API 调用
2. 将常用操作封装为 Shell 脚本
3. 复杂逻辑迁移到 Python SDK
4. 定时任务部署到 SCF 云函数
5. 最终构建完整的自动化运维流水线

自动化脚本是 SRE 的核心生产力工具。掌握本章内容后，读者应能独立编写覆盖日常运维场景的自动化脚本，将重复性工作从手动操作转变为代码驱动，显著提升运维效率和可靠性。
