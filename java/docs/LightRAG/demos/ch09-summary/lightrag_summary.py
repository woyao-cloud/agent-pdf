#!/usr/bin/env python3
"""
LightRAG 文档分析与摘要演示
"""
from collections import Counter

class DocumentAnalyzer:
    def __init__(self):
        self.documents = []
        self.topics = Counter()
    
    def add_document(self, title, content, tags=None):
        self.documents.append({"title": title, "content": content, "tags": tags or []})
        for tag in (tags or []):
            self.topics[tag] += 1
        print(f"  已添加: {title} [{', '.join(tags or [])}]")
    
    def generate_summary(self):
        """生成文档集摘要"""
        total = len(self.documents)
        top_topics = self.topics.most_common(5)
        
        summary = f"## 文档集摘要\n\n"
        summary += f"共 {total} 篇文档\n\n"
        summary += "### 主要主题\n"
        for topic, count in top_topics:
            summary += f"- {topic}: {count} 篇 ({count/total*100:.0f}%)\n"
        
        summary += "\n### 文档列表\n"
        for doc in self.documents:
            summary += f"- {doc['title']}\n"
        
        return summary
    
    def extract_topics(self):
        """提取主题"""
        print("\n主题分布:")
        for topic, count in self.topics.most_common():
            bar = "█" * count
            print(f"  {topic}: {bar} {count}")

def demo_summary():
    print("=" * 60)
    print("LightRAG 文档分析与摘要演示")
    print("=" * 60)
    
    analyzer = DocumentAnalyzer()
    
    # 1. 添加文档
    print("\n--- 1. 添加文档 ---")
    analyzer.add_document("iPhone 15 评测", "iPhone 15 性能出色...", ["手机", "苹果", "评测"])
    analyzer.add_document("华为 Mate 60 发布", "华为发布新款旗舰...", ["手机", "华为", "发布"])
    analyzer.add_document("A17 Pro 芯片分析", "3nm工艺带来性能飞跃...", ["芯片", "苹果", "技术"])
    analyzer.add_document("鸿蒙系统介绍", "华为自主研发操作系统...", ["系统", "华为", "技术"])
    analyzer.add_document("智能手机市场趋势", "2024年市场分析...", ["手机", "市场", "分析"])
    
    # 2. 主题分析
    print("\n--- 2. 主题分析 ---")
    analyzer.extract_topics()
    
    # 3. 生成摘要
    print("\n--- 3. 生成摘要 ---")
    summary = analyzer.generate_summary()
    print(summary)
    
    print("=" * 60)
    print("演示完成！")
    print("=" * 60)

if __name__ == "__main__":
    demo_summary()
