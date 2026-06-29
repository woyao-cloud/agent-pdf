region     = "ap-guangzhou"
project_name = "qcloud-gitops-prod"
vpc_cidr   = "10.20.0.0/16"
azs        = ["ap-guangzhou-3", "ap-guangzhou-4"]
cluster_version = "1.30"
node_instance_type = "S5.LARGE8"
alert_receivers   = ["sre@example.com", "oncall@example.com"]
