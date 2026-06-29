# TCOP 监控模块
resource "tencentcloud_monitor_alarm_policy" "main" {
  policy_name  = var.alert_policy_name
  monitor_type = "MT_QCE"
  enable       = 1
  project_id   = 0
  
  conditions {
    is_union_rule = 1
    rules {
      metric_name       = "cpu_usage"
      period            = 300
      operator          = "gt"
      value             = "80"
      continue_period   = 2
      notice_frequency  = 3600
    }
    rules {
      metric_name       = "mem_usage"
      period            = 300
      operator          = "gt"
      value             = "85"
      continue_period   = 2
      notice_frequency  = 3600
    }
  }
  
  event_conditions {
    event_name = "disk_full"
  }
  
  trigger_tasks {
    type = "AS"
  }
  
  tags = {
    ManagedBy = "terraform"
  }
}

resource "tencentcloud_monitor_alarm_notice" "main" {
  name            = var.notify_template_name
  notice_type     = "ALL"
  notice_language = "zh-CN"
  
  user_notices {
    receiver_type = "EMAIL"
    start_time    = 0
    end_time      = 86400
    receiver_list = var.notify_receivers
  }
  
  url_notices {
    url     = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxx"
    type    = "WEIXIN"
  }
}

variable "alert_policy_name" {}
variable "notify_template_name" {}
variable "notify_receivers" { type = list(string) }
