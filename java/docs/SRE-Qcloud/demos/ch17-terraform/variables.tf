variable "region" {
  description = "腾讯云区域"
  type        = string
  default     = "ap-guangzhou"
}

variable "project" {
  description = "项目名称"
  type        = string
  default     = "sre-demo"
}

variable "environment" {
  description = "环境名称"
  type        = string
  default     = "dev"
}

variable "azs" {
  description = "可用区列表"
  type        = list(string)
  default     = ["ap-guangzhou-3", "ap-guangzhou-4"]
}

variable "instance_type" {
  description = "CVM 实例类型"
  type        = string
  default     = "S5.SMALL1"
}
