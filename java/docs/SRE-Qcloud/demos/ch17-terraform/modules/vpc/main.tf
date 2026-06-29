# VPC 模块
resource "tencentcloud_vpc" "main" {
  name       = var.vpc_name
  cidr_block = var.vpc_cidr
}

resource "tencentcloud_subnet" "main" {
  count = length(var.azs)
  
  name              = "${var.vpc_name}-subnet-${count.index}"
  vpc_id            = tencentcloud_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone = var.azs[count.index]
}

resource "tencentcloud_security_group" "main" {
  name        = "${var.vpc_name}-sg"
  description = "Managed by Terraform"
}

variable "vpc_name" {}
variable "vpc_cidr" {}
variable "azs" {
  type = list(string)
}
variable "environment" {
  default = "dev"
}

output "vpc_id" {
  value = tencentcloud_vpc.main.id
}

output "subnet_ids" {
  value = tencentcloud_subnet.main[*].id
}

output "security_group_id" {
  value = tencentcloud_security_group.main.id
}
