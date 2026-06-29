# 腾讯云网络架构 - Terraform 配置
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

# VPC A
resource "tencentcloud_vpc" "vpc_a" {
  name       = "vpc-a"
  cidr_block = "10.0.0.0/16"
}

resource "tencentcloud_subnet" "vpc_a_subnet" {
  name       = "vpc-a-subnet"
  vpc_id     = tencentcloud_vpc.vpc_a.id
  cidr_block = "10.0.1.0/24"
  availability_zone = "ap-guangzhou-3"
}

# VPC B
resource "tencentcloud_vpc" "vpc_b" {
  name       = "vpc-b"
  cidr_block = "10.1.0.0/16"
}

resource "tencentcloud_subnet" "vpc_b_subnet" {
  name       = "vpc-b-subnet"
  vpc_id     = tencentcloud_vpc.vpc_b.id
  cidr_block = "10.1.1.0/24"
  availability_zone = "ap-guangzhou-3"
}

# VPC Peering
resource "tencentcloud_vpc_peering_connection" "peering" {
  name        = "vpc-a-to-vpc-b"
  vpc_id      = tencentcloud_vpc.vpc_a.id
  peer_vpc_id = tencentcloud_vpc.vpc_b.id
  peer_region = "ap-guangzhou"
}

# 路由表
resource "tencentcloud_route_table" "vpc_a_route" {
  name   = "vpc-a-route"
  vpc_id = tencentcloud_vpc.vpc_a.id
}

resource "tencentcloud_route_entry" "to_vpc_b" {
  route_table_id         = tencentcloud_route_table.vpc_a_route.id
  destination_cidr_block = "10.1.0.0/16"
  next_type              = "peering_connection"
  next_hub               = tencentcloud_vpc_peering_connection.peering.id
}

output "vpc_a_id" {
  value = tencentcloud_vpc.vpc_a.id
}

output "vpc_b_id" {
  value = tencentcloud_vpc.vpc_b.id
}
