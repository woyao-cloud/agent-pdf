# 腾讯云计算资源 - Terraform 配置
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

# 查找镜像
data "tencentcloud_images" "ubuntu" {
  image_name_regex = "Ubuntu Server 22.04 LTS 64Bit"
}

data "tencentcloud_instance_types" "web" {
  cpu_core_count = 2
  memory_size    = 4
}

# CVM 实例
resource "tencentcloud_instance" "web" {
  instance_name     = "sre-demo-web"
  availability_zone = "ap-guangzhou-3"
  image_id          = data.tencentcloud_images.ubuntu.images[0].image_id
  instance_type     = data.tencentcloud_instance_types.web.instance_types[0].instance_type
  system_disk_type  = "CLOUD_PREMIUM"
  system_disk_size  = 50
  internet_max_bandwidth_out = 1
  allocate_public_ip = true
  security_groups   = [tencentcloud_security_group.web.id]
  vpc_id            = tencentcloud_vpc.main.id
  subnet_id         = tencentcloud_subnet.az1.id
  tags = {
    Name = "sre-demo-web"
  }
}

# 使用已有 VPC 和子网（需先创建 ch05-vpc）
# 实际使用时取消注释并填入正确的 ID
# vpc_id = "vpc-xxxxx"
# subnet_id = "subnet-xxxxx"

resource "tencentcloud_security_group" "web" {
  name        = "cvm-web-sg"
  description = "CVM web security group"
}

resource "tencentcloud_security_group_rule" "web_ingress" {
  security_group_id = tencentcloud_security_group.web.id
  type              = "ingress"
  cidr_ip           = "0.0.0.0/0"
  ip_protocol       = "tcp"
  port_range        = "80,443,22"
  policy            = "accept"
}

resource "tencentcloud_vpc" "main" {
  name       = "sre-cvm-vpc"
  cidr_block = "10.1.0.0/16"
  is_multicast = false
}

resource "tencentcloud_subnet" "az1" {
  name              = "cvm-subnet"
  vpc_id            = tencentcloud_vpc.main.id
  cidr_block        = "10.1.1.0/24"
  availability_zone = "ap-guangzhou-3"
}

output "cvm_public_ip" {
  value = tencentcloud_instance.web.public_ip
}

output "cvm_private_ip" {
  value = tencentcloud_instance.web.private_ip
}
