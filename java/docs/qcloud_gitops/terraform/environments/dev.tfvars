region     = "ap-guangzhou"
project_name = "qcloud-gitops-dev"
vpc_cidr   = "10.10.0.0/16"
azs        = ["ap-guangzhou-3", "ap-guangzhou-4"]
cluster_version = "1.30"
node_instance_type = "S5.SMALL2"
alert_receivers   = ["dev-team@example.com"]
