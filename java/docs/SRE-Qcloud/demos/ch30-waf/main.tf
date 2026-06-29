# WAF 安全防护 - Terraform 配置
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

# WAF 实例
resource "tencentcloud_waf_instance" "main" {
  name          = "sre-demo-waf"
  region        = "ap-guangzhou"
  waf_type      = "saas"  # SaaS 型 WAF
  is_cd_domain  = false
  api_protection = true
}

# WAF 规则
resource "tencentcloud_waf_rule" "sql_injection" {
  domain = "*.example.com"
  rule_id = "sql_injection"
  status = 1  # 启用
}

resource "tencentcloud_waf_rule" "xss" {
  domain = "*.example.com"
  rule_id = "xss"
  status = 1
}

# 安全组
resource "tencentcloud_security_group" "web" {
  name        = "web-tier-sg"
  description = "Web 层安全组"
}

resource "tencentcloud_security_group_rule" "allow_lb" {
  security_group_id = tencentcloud_security_group.web.id
  type              = "ingress"
  cidr_ip           = "10.0.0.0/8"
  ip_protocol       = "tcp"
  port_range        = "80,443"
  policy            = "accept"
  description       = "允许内网 CLB 流量"
}

resource "tencentcloud_security_group_rule" "deny_all" {
  security_group_id = tencentcloud_security_group.web.id
  type              = "ingress"
  cidr_ip           = "0.0.0.0/0"
  ip_protocol       = "tcp"
  port_range        = "1-65535"
  policy            = "drop"
  description       = "默认拒绝所有入站"
}

output "waf_id" {
  value = tencentcloud_waf_instance.main.id
}
