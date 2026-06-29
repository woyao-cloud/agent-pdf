# CVM 模块
data "tencentcloud_images" "ubuntu" {
  image_name_regex = "Ubuntu Server 22.04 LTS 64Bit"
}

data "tencentcloud_instance_types" "web" {
  cpu_core_count = split(".", var.instance_type)[1]
  memory_size    = 4
}

resource "tencentcloud_instance" "main" {
  instance_name     = var.instance_name
  availability_zone = var.availability_zone
  image_id          = data.tencentcloud_images.ubuntu.images[0].image_id
  instance_type     = var.instance_type
  system_disk_type  = "CLOUD_PREMIUM"
  system_disk_size  = 50
  security_groups   = [var.security_group_id]
  vpc_id            = var.vpc_id
  subnet_id         = var.subnet_id
  tags = {
    Environment = var.environment
  }
}

variable "instance_name" {}
variable "vpc_id" {}
variable "subnet_id" {}
variable "security_group_id" {
  default = ""
}
variable "instance_type" {
  default = "S5.SMALL1"
}
variable "availability_zone" {
  default = "ap-guangzhou-3"
}
variable "environment" {
  default = "dev"
}

output "instance_id" {
  value = tencentcloud_instance.main.id
}

output "public_ip" {
  value = tencentcloud_instance.main.public_ip
}

output "private_ip" {
  value = tencentcloud_instance.main.private_ip
}
