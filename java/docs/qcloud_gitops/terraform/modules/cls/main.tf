# CLS 日志模块
resource "tencentcloud_cls_logset" "main" {
  logset_name = var.logset_name
  period      = 30
  tags = {
    ManagedBy = "terraform"
  }
}

resource "tencentcloud_cls_topic" "topics" {
  for_each = var.topics
  
  topic_name   = each.key
  logset_id    = tencentcloud_cls_logset.main.id
  auto_split   = true
  max_split_partitions = 10
  period       = 7
  storage_type = "hot"
  tags = {
    Description = each.value
  }
}

variable "logset_name" {}
variable "topics" { type = map(string) }

output "logset_id" {
  value = tencentcloud_cls_logset.main.id
}

output "topic_ids" {
  value = { for k, v in tencentcloud_cls_topic.topics : k => v.id }
}
