# Terraform 模块化示例 - 腾讯云
terraform {
  required_providers {
    tencentcloud = {
      source = "tencentcloudstack/tencentcloud"
      version = ">=1.81.0"
    }
  }
}

provider "tencentcloud" {
  region = var.region
}

module "vpc" {
  source = "./modules/vpc"
  
  vpc_name    = "${var.project}-vpc"
  vpc_cidr    = "10.0.0.0/16"
  azs         = var.azs
  environment = var.environment
}

module "cvm" {
  source = "./modules/cvm"
  
  instance_name = "${var.project}-web"
  vpc_id        = module.vpc.vpc_id
  subnet_id     = module.vpc.subnet_ids[0]
  instance_type = var.instance_type
  environment   = var.environment
}

output "vpc_id" {
  value = module.vpc.vpc_id
}

output "cvm_ip" {
  value = module.cvm.public_ip
}
