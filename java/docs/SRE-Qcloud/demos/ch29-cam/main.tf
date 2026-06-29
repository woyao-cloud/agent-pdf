# CAM 权限管理 - Terraform 配置
terraform {
  required_providers {
    tencentcloud = {
      source = "tencentcloudstack/tencentcloud"
      version = ">=1.81.0"
    }
  }
}

provider "tencentcloud" {
  region = "ap-guangzhou"
}

# 自定义策略 - 只读
resource "tencentcloud_cam_policy" "readonly" {
  name        = "SRE-ReadOnly"
  description = "SRE 只读权限策略"
  document = jsonencode({
    version = "2.0"
    statement = [
      {
        effect = "allow"
        action = [
          "cvm:DescribeInstances",
          "cvm:DescribeInstanceTypes",
          "monitor:Describe*",
          "cls:Describe*",
          "vpc:Describe*",
          "clb:Describe*",
          "cos:Get*",
          "cos:Head*",
          "redis:Describe*",
          "sqlserver:Describe*"
        ]
        resource = ["*"]
      }
    ]
  })
}

# 自定义策略 - 运维操作
resource "tencentcloud_cam_policy" "operator" {
  name        = "SRE-Operator"
  description = "SRE 运维操作权限"
  document = jsonencode({
    version = "2.0"
    statement = [
      {
        effect = "allow"
        action = [
          "cvm:RebootInstances",
          "cvm:StartInstances",
          "cvm:StopInstances",
          "tke:Describe*",
          "tke:UpdateClusterVersion",
          "monitor:*"
        ]
        resource = ["*"]
      }
    ]
  })
}

# 用户组
resource "tencentcloud_cam_group" "sre" {
  name   = "SRE-Team"
  remark = "SRE 工程师团队"
}

resource "tencentcloud_cam_group" "sre_readonly" {
  name   = "SRE-ReadOnly"
  remark = "SRE 只读用户"
}

# 策略绑定
resource "tencentcloud_cam_group_policy_attachment" "sre_operator" {
  group_id  = tencentcloud_cam_group.sre.id
  policy_id = tencentcloud_cam_policy.operator.id
}

resource "tencentcloud_cam_group_policy_attachment" "sre_readonly" {
  group_id  = tencentcloud_cam_group.sre_readonly.id
  policy_id = tencentcloud_cam_policy.readonly.id
}

output "sre_group_id" {
  value = tencentcloud_cam_group.sre.id
}

output "readonly_group_id" {
  value = tencentcloud_cam_group.sre_readonly.id
}
