# 腾讯云 GitOps 基础设施 - Terraform 主配置
terraform {
  required_providers {
    tencentcloud = {
      source = "tencentcloudstack/tencentcloud"
      version = ">=1.81.0"
    }
  }
  backend "cos" {
    bucket = "terraform-state-1250000000"
    prefix = "qcloud-gitops"
    region = "ap-guangzhou"
  }
}

provider "tencentcloud" {
  region = var.region
}

# VPC
resource "tencentcloud_vpc" "main" {
  name       = "${var.project_name}-vpc"
  cidr_block = var.vpc_cidr
}

resource "tencentcloud_subnet" "dev" {
  name              = "${var.project_name}-dev-subnet"
  vpc_id            = tencentcloud_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, 0)
  availability_zone = var.azs[0]
}

resource "tencentcloud_subnet" "prod" {
  name              = "${var.project_name}-prod-subnet"
  vpc_id            = tencentcloud_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, 1)
  availability_zone = var.azs[1]
}

# TKE 集群
module "tke_cluster" {
  source = "./modules/tke"
  
  cluster_name    = "${var.project_name}-cluster"
  cluster_version = var.cluster_version
  vpc_id          = tencentcloud_vpc.main.id
  subnet_ids      = [tencentcloud_subnet.dev.id, tencentcloud_subnet.prod.id]
  node_config = {
    dev = {
      subnet_id         = tencentcloud_subnet.dev.id
      instance_type     = var.node_instance_type
      desired_size      = 1
      min_size          = 1
      max_size          = 3
    }
    prod = {
      subnet_id         = tencentcloud_subnet.prod.id
      instance_type     = var.node_instance_type
      desired_size      = 2
      min_size          = 2
      max_size          = 5
    }
  }
}

# CLS 日志
module "cls_log" {
  source = "./modules/cls"
  
  logset_name = "${var.project_name}-logs"
  topics = {
    user_service = "user-service 应用日志"
    tke_audit    = "TKE 审计日志"
  }
}

# TCOP 监控
module "tcop_monitor" {
  source = "./modules/tcop"
  
  alert_policy_name = "${var.project_name}-alerts"
  notify_template_name = "${var.project_name}-notify"
  notify_receivers = var.alert_receivers
}
