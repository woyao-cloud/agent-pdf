output "cluster_endpoint" {
  description = "EKS 集群 API 端点"
  value       = module.eks.cluster_endpoint
}

output "cluster_name" {
  description = "EKS 集群名称"
  value       = module.eks.cluster_name
}

output "cluster_certificate_authority_data" {
  description = "集群 CA 证书"
  value       = module.eks.cluster_certificate_authority_data
}

output "node_role_arn" {
  description = "节点 IAM 角色 ARN"
  value       = module.eks.eks_managed_node_groups["main"].iam_role_arn
}
