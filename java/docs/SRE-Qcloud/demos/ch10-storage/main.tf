# 腾讯云存储与数据库 - Terraform 配置
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

# COS 存储桶
resource "tencentcloud_cos_bucket" "data" {
  bucket = "sre-demo-data-1250000000"  # 替换为实际 APPID
  acl    = "private"
  tags = {
    Environment = "demo"
  }
}

# COS 生命周期规则
resource "tencentcloud_cos_bucket_object_lifecycle_rule" "archive" {
  bucket_id = tencentcloud_cos_bucket.data.id
  rule_filter = ""
  rule_id      = "archive-old-data"
  rule_status  = "Enabled"
  rule_transition {
    days          = 90
    storage_class = "ARCHIVE"
  }
  rule_expiration {
    days = 365
  }
}

# TDSQL MySQL 实例
resource "tencentcloud_mysql_instance" "main" {
  instance_name  = "sre-demo-tdsql"
  mem_size       = 1000
  volume_size    = 50
  cpu            = 2
  device_type    = "UNIVERSAL"
  engine_version = "8.0"
  root_password  = "SreDemo@2024"
  availability_zone = "ap-guangzhou-3"
  internet_service  = 0
  charge_type       = "POSTPAID"
  tags = {
    Environment = "demo"
  }
}

# Redis 实例
resource "tencentcloud_redis_instance" "cache" {
  availability_zone  = "ap-guangzhou-3"
  type_id            = 6  # 标准版
  password           = "SreDemo@2024"
  mem_size           = 1024
  name               = "sre-demo-redis"
  port               = 6379
  charge_type        = "POSTPAID"
  vpc_id             = tencentcloud_vpc.main.id
  subnet_id          = tencentcloud_subnet.main.id
  tags = {
    Environment = "demo"
  }
}

resource "tencentcloud_vpc" "main" {
  name       = "storage-demo-vpc"
  cidr_block = "10.3.0.0/16"
}

resource "tencentcloud_subnet" "main" {
  name       = "storage-demo-subnet"
  vpc_id     = tencentcloud_vpc.main.id
  cidr_block = "10.3.1.0/24"
  availability_zone = "ap-guangzhou-3"
}

output "mysql_id" {
  value = tencentcloud_mysql_instance.main.id
}

output "redis_id" {
  value = tencentcloud_redis_instance.cache.id
}

output "cos_bucket" {
  value = tencentcloud_cos_bucket.data.bucket
}
