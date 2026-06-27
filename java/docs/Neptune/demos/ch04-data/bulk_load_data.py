#!/usr/bin/env python3
"""
Neptune 数据导入导出演示
生成 CSV 数据文件并演示 Bulk Loader 用法
"""
import csv
import os
import json

def generate_sample_data(output_dir='./data'):
    """生成示例 CSV 数据文件"""
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. 生成节点文件
    print("生成节点数据...")
    vertices = [
        {'~id': 'user:1', '~label': 'User', 'name:String': 'Alice', 'age:Int': 30, 'city:String': 'Beijing'},
        {'~id': 'user:2', '~label': 'User', 'name:String': 'Bob', 'age:Int': 25, 'city:String': 'Shanghai'},
        {'~id': 'user:3', '~label': 'User', 'name:String': 'Carol', 'age:Int': 35, 'city:String': 'Beijing'},
        {'~id': 'user:4', '~label': 'User', 'name:String': 'Dave', 'age:Int': 28, 'city:String': 'Shenzhen'},
        {'~id': 'user:5', '~label': 'User', 'name:String': 'Eve', 'age:Int': 32, 'city:String': 'Shanghai'},
        {'~id': 'movie:1', '~label': 'Movie', 'title:String': 'Inception', 'year:Int': 2010, 'rating:Double': 8.8},
        {'~id': 'movie:2', '~label': 'Movie', 'title:String': 'Interstellar', 'year:Int': 2014, 'rating:Double': 9.3},
        {'~id': 'movie:3', '~label': 'Movie', 'title:String': 'The Matrix', 'year:Int': 1999, 'rating:Double': 8.7},
    ]
    
    vertices_file = os.path.join(output_dir, 'vertices.csv')
    with open(vertices_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=vertices[0].keys())
        writer.writeheader()
        writer.writerows(vertices)
    print(f"  已生成: {vertices_file} ({len(vertices)} 个节点)")
    
    # 2. 生成边文件
    print("生成边数据...")
    edges = [
        {'~id': 'edge:1', '~from': 'user:1', '~to': 'user:2', '~label': 'KNOWS', 'since:Int': 2020},
        {'~id': 'edge:2', '~from': 'user:1', '~to': 'user:3', '~label': 'KNOWS', 'since:Int': 2021},
        {'~id': 'edge:3', '~from': 'user:2', '~to': 'user:3', '~label': 'KNOWS', 'since:Int': 2022},
        {'~id': 'edge:4', '~from': 'user:1', '~to': 'movie:1', '~label': 'RATED', 'rating:Int': 9},
        {'~id': 'edge:5', '~from': 'user:1', '~to': 'movie:2', '~label': 'RATED', 'rating:Int': 10},
        {'~id': 'edge:6', '~from': 'user:2', '~to': 'movie:1', '~label': 'RATED', 'rating:Int': 8},
        {'~id': 'edge:7', '~from': 'user:2', '~to': 'movie:3', '~label': 'RATED', 'rating:Int': 9},
        {'~id': 'edge:8', '~from': 'user:3', '~to': 'movie:2', '~label': 'RATED', 'rating:Int': 9},
        {'~id': 'edge:9', '~from': 'user:3', '~to': 'movie:3', '~label': 'RATED', 'rating:Int': 8},
        {'~id': 'edge:10', '~from': 'user:4', '~to': 'movie:1', '~label': 'RATED', 'rating:Int': 7},
    ]
    
    edges_file = os.path.join(output_dir, 'edges.csv')
    with open(edges_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=edges[0].keys())
        writer.writeheader()
        writer.writerows(edges)
    print(f"  已生成: {edges_file} ({len(edges)} 条边)")
    
    # 3. 生成 JSON 格式数据（Neptune 也支持）
    print("生成 JSON 数据...")
    json_data = {
        'vertices': vertices,
        'edges': edges
    }
    json_file = os.path.join(output_dir, 'graph_data.json')
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)
    print(f"  已生成: {json_file}")
    
    print(f"\n数据生成完成！共 {len(vertices)} 个节点, {len(edges)} 条边")
    print(f"\n上传到 S3 后可使用 Bulk Loader 导入:")
    print(f"  aws s3 cp {output_dir} s3://your-bucket/neptune-data/ --recursive")
    print(f"\n启动 Bulk Loader:")
    print(f"  aws neptune start-loader-job \\")
    print(f"    --source s3://your-bucket/neptune-data/vertices.csv \\")
    print(f"    --format csv \\")
    print(f"    --s3-bucket-region us-east-1 \\")
    print(f"    --iam-role-arn arn:aws:iam::123456789012:role/neptune-loader-role")

if __name__ == '__main__':
    generate_sample_data()
