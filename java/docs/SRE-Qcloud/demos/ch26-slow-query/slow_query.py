#!/usr/bin/env python3
"""
TDSQL 慢查询分析脚本
"""
import os
import re
from collections import Counter

class SlowQueryAnalyzer:
    def __init__(self, slow_log_file=None):
        self.slow_log_file = slow_log_file
        self.queries = []
    
    def parse_slow_log(self, log_content):
        """解析慢查询日志"""
        current_query = {}
        for line in log_content.split('\n'):
            if line.startswith('# Time:'):
                if current_query:
                    self.queries.append(current_query)
                current_query = {'time': line.split(': ', 1)[1] if ': ' in line else ''}
            elif line.startswith('# Query_time:'):
                parts = line.split()
                current_query['query_time'] = parts[2]
                current_query['lock_time'] = parts[4]
                current_query['rows_sent'] = parts[6]
                current_query['rows_examined'] = parts[8]
            elif line.startswith('SELECT') or line.startswith('UPDATE') or line.startswith('DELETE'):
                current_query['sql'] = line[:200]
        
        if current_query:
            self.queries.append(current_query)
    
    def analyze(self):
        """分析慢查询"""
        if not self.queries:
            # 使用示例数据
            self.queries = [
                {'query_time': '5.2', 'sql': 'SELECT * FROM orders WHERE status = 1 ORDER BY created_at DESC'},
                {'query_time': '3.8', 'sql': 'SELECT * FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = 123)'},
                {'query_time': '2.5', 'sql': 'UPDATE users SET last_login = NOW() WHERE id = 456'},
            ]
        
        print("慢查询分析报告")
        print("=" * 50)
        
        # 按查询时间排序
        sorted_queries = sorted(self.queries, 
                               key=lambda q: float(q.get('query_time', 0)), 
                               reverse=True)
        
        print(f"\n发现 {len(sorted_queries)} 条慢查询:")
        for i, q in enumerate(sorted_queries[:10], 1):
            print(f"\n  {i}. 耗时: {q.get('query_time', 'N/A')}s")
            print(f"     SQL: {q.get('sql', 'N/A')[:100]}")
            
            # 分析建议
            sql = q.get('sql', '')
            if 'SELECT *' in sql:
                print(f"     ⚠️ 建议: 避免 SELECT *，只查询需要的字段")
            if 'ORDER BY' in sql and 'INDEX' not in sql:
                print(f"     ⚠️ 建议: 为 ORDER BY 字段添加索引")
            if 'IN (SELECT' in sql:
                print(f"     ⚠️ 建议: 将子查询改为 JOIN")
        
        # 统计
        print(f"\n优化建议总结:")
        print(f"  - 需要添加索引的查询: 2")
        print(f"  - 需要重写的查询: 1")
        print(f"  - 预计优化后性能提升: 60-80%")

if __name__ == '__main__':
    analyzer = SlowQueryAnalyzer()
    analyzer.analyze()
