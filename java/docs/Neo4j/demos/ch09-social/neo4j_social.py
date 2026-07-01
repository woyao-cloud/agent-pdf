#!/usr/bin/env python3
"""
Neo4j 社交网络演示
使用内存图模拟 Neo4j 社交网络查询
"""
from collections import defaultdict

class SocialGraph:
    def __init__(self):
        self.users = {}
        self.follows = defaultdict(set)
    
    def add_user(self, uid, name, age, city):
        self.users[uid] = {'id': uid, 'name': name, 'age': age, 'city': city}
    
    def add_follow(self, follower, followee):
        self.follows[follower].add(followee)
    
    def recommend_friends(self, user_id):
        """好友推荐：朋友的朋友"""
        followed = self.follows.get(user_id, set())
        recommendations = defaultdict(int)
        
        for friend in followed:
            for fof in self.follows.get(friend, set()):
                if fof != user_id and fof not in followed:
                    recommendations[fof] += 1
        
        return sorted(recommendations.items(), key=lambda x: -x[1])
    
    def shortest_path(self, start, end):
        """BFS 最短路径"""
        if start == end:
            return [start]
        queue = [[start]]
        visited = {start}
        while queue:
            path = queue.pop(0)
            node = path[-1]
            for neighbor in self.follows.get(node, set()):
                if neighbor == end:
                    return path + [neighbor]
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(path + [neighbor])
        return None

def demo_social():
    print("=" * 60)
    print("Neo4j 社交网络演示")
    print("=" * 60)
    
    g = SocialGraph()
    
    # 1. 创建用户
    print("\n--- 1. 创建用户 ---")
    users = [
        ('u1', 'Alice', 30, 'Beijing'),
        ('u2', 'Bob', 25, 'Shanghai'),
        ('u3', 'Carol', 35, 'Beijing'),
        ('u4', 'Dave', 28, 'Shenzhen'),
        ('u5', 'Eve', 32, 'Shanghai'),
    ]
    for uid, name, age, city in users:
        g.add_user(uid, name, age, city)
        print(f"  {name} ({city}, {age})")
    
    # 2. 创建关注关系
    print("\n--- 2. 创建关注关系 ---")
    follows = [('u1','u2'), ('u1','u3'), ('u2','u3'), ('u2','u4'), ('u3','u5')]
    for f, t in follows:
        g.add_follow(f, t)
        print(f"  {g.users[f]['name']} -> {g.users[t]['name']}")
    
    # 3. 好友推荐
    print("\n--- 3. 好友推荐 (Alice) ---")
    recs = g.recommend_friends('u1')
    for uid, common in recs:
        print(f"  推荐: {g.users[uid]['name']} (共同好友: {common})")
    
    # 4. 最短路径
    print("\n--- 4. 最短路径 (Alice -> Eve) ---")
    path = g.shortest_path('u1', 'u5')
    if path:
        names = ' -> '.join([g.users[n]['name'] for n in path])
        print(f"  {names}")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == '__main__':
    demo_social()
