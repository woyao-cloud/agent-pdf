variable "region" {
  description = "腾讯云区域"
  type        = string
  default     = "ap-guangzhou"
}

variable "project_name" {
  description = "项目名称"
  type        = string
  default     = "qcloud-gitops"
}

variable "vpc_cidr" {
  description = "VPC CIDR"
  type        = string
  default     = "10.0.0.0/16"
}

variable "azs" {
  description = "可用区列表"
  type        = list(string)
  default     = ["ap-guangzhou-3", "ap-guangzhou-4"]
}

variable "cluster_version" {
  description = "TKE 集群版本"
  type        = string
  default     = "1.30"
}

variable "node_instance_type" {
  description = "节点实例类型"
  type        = string
  default     = "S5.LARGE8"
}

variable "alert_receivers" {
  description = "告警接收人"
  type        = list(string)
  default     = ["sre@example.com"]
}
