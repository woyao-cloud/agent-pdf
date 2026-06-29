variable "aws_region" {
  description = "AWS 区域"
  type        = string
  default     = "us-east-1"
}

variable "cluster_name" {
  description = "EKS 集群名称"
  type        = string
}

variable "environment" {
  description = "环境名称"
  type        = string
  default     = "dev"
}

variable "node_desired_size" {
  description = "节点期望数量"
  type        = number
  default     = 2
}

variable "node_min_size" {
  description = "节点最小数量"
  type        = number
  default     = 1
}

variable "node_max_size" {
  description = "节点最大数量"
  type        = number
  default     = 5
}

variable "node_instance_types" {
  description = "节点实例类型"
  type        = list(string)
  default     = ["t3.medium"]
}
