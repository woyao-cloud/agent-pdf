#!/usr/bin/env python3
"""
社交网络分析演示
使用内存图模拟 Neptune 社交网络查询
"""
import json
from collections import defaultdict

class SocialGraph:
    """社交网络图"""
    def __init__(self):
        self.users = {}
        self.posts = {}
        self.follows = defaultdict(set)  # user -> set of followed users
        self.likes = defaultdict(set)     # user -> set of liked posts
        self.posted_by = {}              # post_id -> user_id
    
    def add_user(self, uid, name, age, city, interests=None):
        self.users[uid] = {
            'id': uid, 'name': name, 'age': age,
            'city': city, 'interests': interests or []
        }
    
    def add_post(self, pid, title, content, author_id, tags=None):
        self.posts[pid] = {
            'id': pid, 'title': title, 'content': content,
            'author_id': author_id, 'tags': tags or []
        }
        self.posted_by[pid] = author_id
    
    def add_follow(self, follower_id, followee_id):
        self.follows[follower_id].add(followee_id)
    
    def add_like(self, user_id, post_id):
        self.likes[user_id].add(post_id)
    
    def get_friends_of_friends(self, user_id, max_depth=2):
        """获取朋友的朋友推荐"""
        visited = {user_id}
        current_level = {user_id}
        recommendations = defaultdict(int)
        
        for depth in range(max_depth):
            next_level = set()
            for uid in current_level:
                for followee in self.follows.get(uid, set()):
                    if followee not in visited:
                        visited.add(followee)
                        next_level.add(followee)
                        if depth == max_depth - 1:
                            # 计算共同好友数
                            common = len(
                                self.follows.get(user_id, set()) &
                                self.follows.get(followee, set())
                            )
                            recommendations[followee] = common
            current_level = next_level
        
        return recommendations
    
    def get_influence_score(self):
        """计算影响力分数（简化 PageRank）"""
        scores = {uid: 1.0 for uid in self.users}
        damping = 0.85
        iterations = 10
        
        for _ in range(iterations):
            new_scores = {}
            for uid in self.users:
                # 基础分数
                score = 1 - damping
                # 从关注者获得的分数
                for follower in self.follows:
                    if uid in self.follows[follower]:
                        out_degree = len(self.follows[follower])
                        if out_degree > 0:
                            score += damping * scores[follower] / out_degree
                new_scores[uid] = score
            scores = new_scores
        
        return scores
    
    def recommend_posts(self, user_id, limit=5):
        """基于兴趣和关注者推荐帖子"""
        user = self.users[user_id]
        user_interests = set(user['interests'])
        followed = self.follows.get(user_id, set())
        
        # 收集关注者的帖子
        candidate_posts = []
        for followee_id in followed:
            for pid, post in self.posts.items():
                if self.posted_by[pid] == followee_id:
                    # 计算兴趣匹配度
                    post_tags = set(post['tags'])
                    interest_match = len(user_interests & post_tags)
                    candidate_posts.append((interest_match, pid, post))
        
        # 按兴趣匹配度排序
        candidate_posts.sort(key=lambda x: -x[0])
        return candidate_posts[:limit]

def demo_social_network():
    """社交网络演示"""
    print("=" * 60)
    print("社交网络分析演示")
    print("=" * 60)
    
    g = SocialGraph()
    
    # 1. 创建用户
    print("\n--- 1. 创建用户 ---")
    users_data = [
        ('u1', 'Alice', 30, 'Beijing', ['tech', 'movies', 'music']),
        ('u2', 'Bob', 25, 'Shanghai', ['tech', 'sports']),
        ('u3', 'Carol', 35, 'Beijing', ['movies', 'travel']),
        ('u4', 'Dave', 28, 'Shenzhen', ['tech', 'gaming']),
        ('u5', 'Eve', 32, 'Shanghai', ['travel', 'music']),
        ('u6', 'Frank', 27, 'Beijing', ['sports', 'gaming']),
    ]
    for data in users_data:
        g.add_user(*data)
        print(f"  创建用户: {data[1]} ({data[3]}, {data[2]}岁)")
    
    # 2. 创建关注关系
    print("\n--- 2. 创建关注关系 ---")
    follows = [('u1','u2'), ('u1','u3'), ('u2','u3'), ('u2','u4'),
               ('u3','u5'), ('u4','u5'), ('u5','u1'), ('u6','u1')]
    for f, t in follows:
        g.add_follow(f, t)
        print(f"  {g.users[f]['name']} -> 关注 -> {g.users[t]['name']}")
    
    # 3. 创建帖子
    print("\n--- 3. 创建帖子 ---")
    posts_data = [
        ('p1', 'Graph DB Guide', 'Content about graph databases...', 'u2', ['tech', 'database']),
        ('p2', 'Spring Boot Tips', 'Content about Spring Boot...', 'u2', ['tech', 'java']),
        ('p3', 'Movie Review: Inception', 'Great movie...', 'u3', ['movies', 'review']),
        ('p4', 'Beijing Travel Guide', 'Best places in Beijing...', 'u3', ['travel', 'beijing']),
        ('p5', 'Distributed Systems', 'Content about distributed systems...', 'u4', ['tech', 'distributed']),
        ('p6', 'Music Festival 2024', 'Upcoming music events...', 'u5', ['music', 'events']),
    ]
    for data in posts_data:
        g.add_post(*data)
        author = g.users[data[3]]['name']
        print(f"  {author} 发布了: {data[1]}")
    
    # 4. 好友推荐
    print("\n--- 4. 好友推荐 (Alice) ---")
    recommendations = g.get_friends_of_friends('u1')
    print("  推荐用户 (基于共同好友数):")
    for uid, common in sorted(recommendations.items(), key=lambda x: -x[1]):
        user = g.users[uid]
        print(f"    {user['name']} ({user['city']}) - 共同好友: {common}")
    
    # 5. 影响力分析
    print("\n--- 5. 影响力分析 ---")
    scores = g.get_influence_score()
    ranked = sorted(scores.items(), key=lambda x: -x[1])
    print("  用户影响力排名:")
    for i, (uid, score) in enumerate(ranked, 1):
        user = g.users[uid]
        print(f"    {i}. {user['name']} - 影响力: {score:.4f}")
    
    # 6. 内容推荐
    print("\n--- 6. 内容推荐 (Alice) ---")
    recommendations = g.recommend_posts('u1')
    print("  推荐帖子:")
    for match_score, pid, post in recommendations:
        author = g.users[g.posted_by[pid]]['name']
        print(f"    [{post['title']}] by {author} (兴趣匹配: {match_score})")
    
    print("\n" + "=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == '__main__':
    demo_social_network()
