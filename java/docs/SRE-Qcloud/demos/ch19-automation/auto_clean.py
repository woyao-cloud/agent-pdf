#!/usr/bin/env python3
"""
腾讯云自动化运维脚本
自动清理未挂载的云硬盘、轮换访问密钥、管理资源标签
"""
from tencentcloud.common import credential
from tencentcloud.cbs.v20170312 import cbs_client, models as cbs_models
from tencentcloud.cam.v20190116 import cam_client, models as cam_models
import os
import datetime

class AutoOps:
    def __init__(self):
        secret_id = os.environ.get('TENCENTCLOUD_SECRET_ID')
        secret_key = os.environ.get('TENCENTCLOUD_SECRET_KEY')
        self.cred = credential.Credential(secret_id, secret_key)
    
    def clean_unattached_disks(self, region='ap-guangzhou'):
        """清理未挂载的云硬盘"""
        try:
            client = cbs_client.CbsClient(self.cred, region)
            req = cbs_models.DescribeDisksRequest()
            req.Filters = [{"Name": "disk-state", "Values": ["UNATTACHED"]}]
            resp = client.DescribeDisks(req)
            
            print(f"\n未挂载的云硬盘 ({region}):")
            for disk in resp.DiskSet:
                days_old = (datetime.datetime.now() - 
                           datetime.datetime.fromtimestamp(disk.CreateTime)).days
                print(f"  {disk.DiskId} ({disk.DiskSize}GB) - {days_old}天未使用")
                
                if days_old > 30:
                    print(f"    -> 建议删除: {disk.DiskId}")
                    # 实际删除需谨慎
                    # self._delete_disk(client, disk.DiskId)
        except Exception as e:
            print(f"查询失败: {e}")
    
    def rotate_keys(self):
        """轮换访问密钥"""
        try:
            client = cam_client.CamClient(self.cred, "")
            req = cam_models.ListAccessKeysRequest()
            resp = client.ListAccessKeys(req)
            
            print("\n访问密钥状态:")
            for key in resp.AccessKeys:
                status = "启用" if key.Status == "Active" else "禁用"
                print(f"  {key.AccessKeyId}: {status} (创建于 {key.CreateTime})")
                if key.Status == "Active":
                    print(f"    -> 建议定期轮换")
        except Exception as e:
            print(f"查询失败: {e}")
    
    def tag_resources(self, resource_ids, resource_region, tags):
        """批量标记资源标签"""
        from tencentcloud.tag.v20180813 import tag_client, models as tag_models
        
        try:
            client = tag_client.TagClient(self.cred, resource_region)
            req = tag_models.TagResourcesRequest()
            req.ResourceList = [f"qcs::cvm:{resource_region}:uin/100000000000:instance/{rid}" 
                               for rid in resource_ids]
            req.Tags = [{"TagKey": k, "TagValue": v} for k, v in tags.items()]
            resp = client.TagResources(req)
            print(f"标签已更新: {tags}")
        except Exception as e:
            print(f"标签更新失败: {e}")

if __name__ == '__main__':
    ops = AutoOps()
    ops.clean_unattached_disks()
    ops.rotate_keys()
