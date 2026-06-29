# 腾讯云 CLB 负载均衡 - Terraform 配置
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

resource "tencentcloud_vpc" "main" {
  name       = "clb-demo-vpc"
  cidr_block = "10.2.0.0/16"
}

resource "tencentcloud_subnet" "main" {
  name       = "clb-demo-subnet"
  vpc_id     = tencentcloud_vpc.main.id
  cidr_block = "10.2.1.0/24"
  availability_zone = "ap-guangzhou-3"
}

# 公网 CLB
resource "tencentcloud_clb_instance" "public" {
  clb_name                  = "sre-demo-public-clb"
  network_type              = "OPEN"
  vpc_id                    = tencentcloud_vpc.main.id
  project_id                = 0
  tags = {
    Environment = "demo"
  }
}

# 监听器 - HTTP 80
resource "tencentcloud_clb_listener" "http" {
  clb_id        = tencentcloud_clb_instance.public.id
  listener_name = "http-80"
  port          = 80
  protocol      = "HTTP"
  http_keep_alive_timeout = 60
}

# 监听器 - HTTPS 443
resource "tencentcloud_clb_listener" "https" {
  clb_id        = tencentcloud_clb_instance.public.id
  listener_name = "https-443"
  port          = 443
  protocol      = "HTTPS"
  certificate_id = ""  # 替换为实际证书 ID
  sni_switch    = false
}

output "clb_public_ip" {
  value = tencentcloud_clb_instance.public.clb_vips
}
