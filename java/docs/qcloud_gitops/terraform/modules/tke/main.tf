# TKE 集群模块
resource "tencentcloud_kubernetes_cluster" "main" {
  cluster_name    = var.cluster_name
  cluster_version = var.cluster_version
  vpc_id          = var.vpc_id
  subnet_ids      = var.subnet_ids
  cluster_type    = "MANAGED_CLUSTER"
  cluster_os      = "ubuntu"
  cluster_internet_security_group_limit = 1
  
  tags = {
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

resource "tencentcloud_kubernetes_node_pool" "dev" {
  name              = "${var.cluster_name}-dev"
  cluster_id        = tencentcloud_kubernetes_cluster.main.id
  subnet_id         = var.node_config.dev.subnet_id
  instance_type     = var.node_config.dev.instance_type
  desired_size      = var.node_config.dev.desired_size
  min_size          = var.node_config.dev.min_size
  max_size          = var.node_config.dev.max_size
  node_os           = "ubuntu"
  internet_max_bandwidth_out = 1
  labels = {
    environment = "dev"
  }
}

resource "tencentcloud_kubernetes_node_pool" "prod" {
  name              = "${var.cluster_name}-prod"
  cluster_id        = tencentcloud_kubernetes_cluster.main.id
  subnet_id         = var.node_config.prod.subnet_id
  instance_type     = var.node_config.prod.instance_type
  desired_size      = var.node_config.prod.desired_size
  min_size          = var.node_config.prod.min_size
  max_size          = var.node_config.prod.max_size
  node_os           = "ubuntu"
  internet_max_bandwidth_out = 1
  labels = {
    environment = "prod"
  }
}

variable "cluster_name" {}
variable "cluster_version" {}
variable "vpc_id" {}
variable "subnet_ids" { type = list(string) }
variable "node_config" { type = any }

output "cluster_id" {
  value = tencentcloud_kubernetes_cluster.main.id
}

output "cluster_endpoint" {
  value = tencentcloud_kubernetes_cluster.main.cluster_external_endpoint
}

output "kubeconfig" {
  value     = tencentcloud_kubernetes_cluster.main.kube_config
  sensitive = true
}
