output "vpc_id" {
  value = tencentcloud_vpc.main.id
}

output "tke_cluster_id" {
  value = module.tke_cluster.cluster_id
}

output "tke_cluster_endpoint" {
  value = module.tke_cluster.cluster_endpoint
}

output "cls_logset_id" {
  value = module.cls_log.logset_id
}

output "cls_topic_ids" {
  value = module.cls_log.topic_ids
}

output "kubeconfig" {
  value     = module.tke_cluster.kubeconfig
  sensitive = true
}
