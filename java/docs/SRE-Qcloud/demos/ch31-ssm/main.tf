# 凭据管理与加密 - Terraform 配置
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

# KMS 密钥
resource "tencentcloud_kms_key" "main" {
  alias             = "sre-demo-key"
  description       = "SRE 演示加密密钥"
  key_usage         = "ENCRYPT_DECRYPT"
  is_enabled        = true
  pending_delete_window_in_days = 7
  tags = {
    Environment = "demo"
  }
}

# SSM 凭据
resource "tencentcloud_ssm_secret" "db_password" {
  secret_name = "sre-demo-db-password"
  version_id  = "v1"
  secret_string = jsonencode({
    username = "admin"
    password = "SreDemo@2024"
    host     = "10.0.1.100"
    port     = 3306
  })
  tags = {
    Environment = "demo"
  }
}

resource "tencentcloud_ssm_secret" "api_key" {
  secret_name = "sre-demo-api-key"
  version_id  = "v1"
  secret_string = jsonencode({
    key   = "sk-xxxxxxxxxxxxxxxx"
    name  = "production-api-key"
  })
}

# COS 存储桶加密
resource "tencentcloud_cos_bucket" "secure" {
  bucket = "sre-secure-data-1250000000"
  acl    = "private"
  
  encryption_rule {
    sse_algorithm = "KMS"
    kms_key_id    = tencentcloud_kms_key.main.id
  }
}

output "kms_key_id" {
  value = tencentcloud_kms_key.main.id
}

output "db_secret_name" {
  value = tencentcloud_ssm_secret.db_password.secret_name
}
