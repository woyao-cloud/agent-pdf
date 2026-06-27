# -*- coding: utf-8 -*-
"""
图链接预测演示 - 使用GAE预测社交网络中的缺失连接
"""
import torch
import torch.nn.functional as F
from torch_geometric.nn import GCNConv
from torch_geometric.utils import train_test_split_edges, negative_sampling
from sklearn.metrics import roc_auc_score, average_precision_score
import numpy as np

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"使用设备: {device}")

# 使用Cora数据集进行链接预测
from torch_geometric.datasets import Planetoid
dataset = Planetoid(root='/tmp/Cora', name='Cora')
data = dataset[0].to(device)

# 划分边为训练/验证/测试
data = train_test_split_edges(data)
print(f"训练边: {data.train_pos_edge_index.size(1)}")
print(f"验证正边: {data.val_pos_edge_index.size(1)}")
print(f"测试正边: {data.test_pos_edge_index.size(1)}")

# GAE编码器
class GCNEncoder(torch.nn.Module):
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.conv1 = GCNConv(in_channels, 2 * out_channels)
        self.conv2 = GCNConv(2 * out_channels, out_channels)

    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index).relu()
        return self.conv2(x, edge_index)

model = GCNEncoder(dataset.num_features, 16).to(device)
optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

def compute_loss(pos_score, neg_score):
    pos_loss = -torch.log(pos_score + 1e-15).mean()
    neg_loss = -torch.log(1 - neg_score + 1e-15).mean()
    return pos_loss + neg_loss

def decode(z, pos_edge_index, neg_edge_index):
    pos_sim = (z[pos_edge_index[0]] * z[pos_edge_index[1]]).sum(dim=-1)
    neg_sim = (z[neg_edge_index[0]] * z[neg_edge_index[1]]).sum(dim=-1)
    return torch.sigmoid(pos_sim), torch.sigmoid(neg_sim)

# 训练
for epoch in range(101):
    model.train()
    optimizer.zero_grad()
    z = model(data.x, data.train_pos_edge_index)
    neg_edge_index = negative_sampling(data.train_pos_edge_index, data.num_nodes)
    pos_score, neg_score = decode(z, data.train_pos_edge_index, neg_edge_index)
    loss = compute_loss(pos_score, neg_score)
    loss.backward()
    optimizer.step()
    
    if epoch % 20 == 0:
        model.eval()
        with torch.no_grad():
            z = model(data.x, data.train_pos_edge_index)
            val_neg = negative_sampling(data.val_pos_edge_index, data.num_nodes)
            val_pos_score, val_neg_score = decode(z, data.val_pos_edge_index, val_neg)
            val_labels = torch.cat([torch.ones(val_pos_score.size(0)), torch.zeros(val_neg_score.size(0))])
            val_scores = torch.cat([val_pos_score, val_neg_score])
            val_auc = roc_auc_score(val_labels.cpu(), val_scores.cpu())
            print(f'Epoch {epoch:3d} | Loss: {loss:.4f} | Val AUC: {val_auc:.4f}')

# 测试
model.eval()
with torch.no_grad():
    z = model(data.x, data.train_pos_edge_index)
    test_neg = negative_sampling(data.test_pos_edge_index, data.num_nodes)
    test_pos_score, test_neg_score = decode(z, data.test_pos_edge_index, test_neg)
    test_labels = torch.cat([torch.ones(test_pos_score.size(0)), torch.zeros(test_neg_score.size(0))])
    test_scores = torch.cat([test_pos_score, test_neg_score])
    test_auc = roc_auc_score(test_labels.cpu(), test_scores.cpu())
    test_ap = average_precision_score(test_labels.cpu(), test_scores.cpu())
    print(f'\n测试集 AUC: {test_auc:.4f}')
    print(f'测试集 AP:  {test_ap:.4f}')
    print("演示完成！")
