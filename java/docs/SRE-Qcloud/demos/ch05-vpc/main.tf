# 腾讯云 VPC 基础设施 - Terraform 配置
# 使用步骤：
# 1. 安装 Terraform：choco install terraform
# 2. 配置密钥：export TENCENTCLOUD_SECRET_ID="xxx"; export TENCENTCLOUD_SECRET_KEY="yyy"
# 3. terraform init && terraform plan && terraform apply

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

# VPC
resource "tencentcloud_vpc" "main" {
  name       = "sre-demo-vpc"
  cidr_block = "10.0.0.0/16"
  is_multicast = false
  tags = {
    Environment = "demo"
    ManagedBy   = "terraform"
  }
}

# 子网 - 可用区1
resource "tencentcloud_subnet" "az1" {
  name              = "subnet-az1"
  vpc_id            = tencentcloud_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "ap-guangzhou-3"
  tags = {
    Name = "subnet-az1"
  }
}

# 子网 - 可用区2
resource "tencentcloud_subnet" "az2" {
  name              = "subnet-az2"
  vpc_id            = tencentcloud_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "ap-guangzhou-4"
  tags = {
    Name = "subnet-az2"
  }
}

# 安全组
resource "tencentcloud_security_group" "web" {
  name        = "web-sg"
  description = "Web server security group"
  project_id  = 0
  tags = {
    Name = "web-sg"
  }
}

resource "tencentcloud_security_group_rule" "ssh" {
  security_group_id = tencentcloud_security_group.web.id
  type              = "ingress"
  cidr_ip           = "0.0.0.0/0"
  ip_protocol       = "tcp"
  port_range        = "22"
  policy            = "accept"
  description       = "SSH access"
}

resource "tencentcloud_security_group_rule" "http" {
  security_group_id = tencentcloud_security_group.web.id
  type              = "ingress"
  cidr_ip           = "0.0.0.0/0"
  ip_protocol       = "tcp"
  port_range        = "80,443"
  policy            = "accept"
  description       = "HTTP/HTTPS access"
}

output "vpc_id" {
  value = tencentcloud_vpc.main.id
}

output "subnet_az1_id" {
  value = tencentcloud_subnet.az1.id
}

output "subnet_az2_id" {
  value = tencentcloud_subnet.az2.id
}
