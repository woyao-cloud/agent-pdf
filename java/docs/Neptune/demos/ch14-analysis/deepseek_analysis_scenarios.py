#!/usr/bin/env python3
"""
DeepSeek 数据分析场景演示
展示 Neptune + DeepSeek 在多个领域的分析能力
支持模拟模式
"""
import os
import json
from collections import defaultdict

class MockDeepSeek:
    def chat(self, messages):
        return {'choices': [{'message': {'content': self._gen(messages)}}]}
    
    def _gen(self, messages):
        last = messages[-1]['content'] if messages else ""
        if '金融' in last or '交易' in last:
            return "【金融分析报告】\n1. 交易模式：检测到3个可疑交易环，涉及5个账户\n2. 风险评分：高风险账户2个，中风险3个\n3. 建议：对高风险账户进行冻结审查，启动反洗钱调查流程"
        elif '社交' in last or '用户' in last:
            return "【社交网络分析报告】\n1. 社区结构：检测到3个主要社区，最大社区包含50%的用户\n2. 关键意见领袖：识别出5个高影响力用户\n3. 推荐建议：基于共同兴趣和社交关系，可向用户推荐8个可能感兴趣的人"
        elif '供应链' in last:
            return "【供应链分析报告】\n1. 瓶颈识别：发现2个关键节点，故障会影响60%的供应链\n2. 替代路径：为关键物料找到3条替代供应路径\n3. 风险缓解：建议对关键供应商进行多元化布局"
        elif '异常' in last or '根因' in last:
            return "【异常检测报告】\n1. 异常模式：检测到3个异常子图模式\n2. 根因定位：异常源头为节点A，通过2跳传播到其他节点\n3. 修复建议：隔离异常节点，检查相关交易记录"
        else:
            return f"[分析报告] 基于图数据的分析结果。查询: {last[:60]}"

class AnalysisScenarios:
    def __init__(self):
        self.llm = MockDeepSeek()
    
    def financial_analysis(self):
        """金融数据分析"""
        print("\n" + "=" * 50)
        print("场景1: 金融数据分析")
        print("=" * 50)
        
        # 模拟交易数据
        transactions = [
            {'from': 'A', 'to': 'B', 'amount': 50000, 'type': 'transfer'},
            {'from': 'B', 'to': 'C', 'amount': 50000, 'type': 'transfer'},
            {'from': 'C', 'to': 'A', 'amount': 50000, 'type': 'transfer'},
            {'from': 'D', 'to': 'E', 'amount': 100000, 'type': 'transfer'},
            {'from': 'E', 'to': 'F', 'amount': 100000, 'type': 'transfer'},
        ]
        
        print(f"\n交易数据: {len(transactions)} 笔交易")
        print(f"涉及账户: A, B, C, D, E, F")
        
        # 检测环形交易
        print("\n检测到可疑模式:")
        print("  - 环形交易: A -> B -> C -> A (金额: 50,000)")
        print("  - 线性交易: D -> E -> F (金额: 100,000)")
        
        # 生成分析报告
        prompt = f"""分析以下金融交易图数据:
交易记录: {json.dumps(transactions, ensure_ascii=False)}
检测到的模式: 环形交易和线性交易

请生成金融分析报告，包括风险评分和建议。"""
        
        response = self.llm.chat([
            {"role": "system", "content": "你是一个金融风控分析专家。"},
            {"role": "user", "content": prompt}
        ])
        print(f"\nDeepSeek 分析报告:\n{response['choices'][0]['message']['content']}")
    
    def social_analysis(self):
        """社交网络分析"""
        print("\n" + "=" * 50)
        print("场景2: 社交网络分析")
        print("=" * 50)
        
        # 模拟社交网络数据
        users = [
            {'id': 'u1', 'name': 'Alice', 'followers': 1000, 'interests': ['tech', 'AI']},
            {'id': 'u2', 'name': 'Bob', 'followers': 500, 'interests': ['tech']},
            {'id': 'u3', 'name': 'Carol', 'followers': 2000, 'interests': ['design', 'AI']},
            {'id': 'u4', 'name': 'Dave', 'followers': 100, 'interests': ['gaming']},
            {'id': 'u5', 'name': 'Eve', 'followers': 3000, 'interests': ['AI', 'tech', 'design']},
        ]
        
        print(f"\n用户数据: {len(users)} 个用户")
        print(f"高影响力用户: Eve (3000关注者), Carol (2000关注者)")
        
        # 社区检测
        print("\n社区结构:")
        print("  社区1 (Tech): Alice, Bob, Eve")
        print("  社区2 (Design): Carol, Eve")
        print("  社区3 (Gaming): Dave")
        
        prompt = f"""分析社交网络图数据:
用户: {json.dumps(users, ensure_ascii=False)}
社区结构: Tech社区(Alice, Bob, Eve), Design社区(Carol, Eve), Gaming社区(Dave)

请生成社交网络分析报告，包括关键意见领袖识别和推荐建议。"""
        
        response = self.llm.chat([
            {"role": "system", "content": "你是一个社交网络分析专家。"},
            {"role": "user", "content": prompt}
        ])
        print(f"\nDeepSeek 分析报告:\n{response['choices'][0]['message']['content']}")
    
    def supply_chain_analysis(self):
        """供应链分析"""
        print("\n" + "=" * 50)
        print("场景3: 供应链分析")
        print("=" * 50)
        
        # 模拟供应链数据
        suppliers = {
            'S1': {'name': '芯片供应商A', 'risk': 'low', 'capacity': 10000},
            'S2': {'name': '芯片供应商B', 'risk': 'medium', 'capacity': 5000},
            'S3': {'name': '屏幕供应商', 'risk': 'low', 'capacity': 8000},
            'M1': {'name': '制造商A', 'risk': 'low'},
            'M2': {'name': '制造商B', 'risk': 'medium'},
            'B1': {'name': '品牌商A', 'risk': 'low'},
        }
        
        print(f"\n供应链节点: {len(suppliers)} 个")
        print(f"关键路径: S1 -> M1 -> B1 (主要)")
        print(f"           S2 -> M1 -> B1 (备用)")
        print(f"           S3 -> M2 -> B1 (备用)")
        
        print("\n瓶颈分析:")
        print("  M1 是单点故障节点，故障会影响 60% 的产能")
        print("  S1 是唯一的高容量芯片供应商")
        
        prompt = f"""分析供应链图数据:
节点: {json.dumps(suppliers, ensure_ascii=False)}
关键路径: S1->M1->B1(主要), S2->M1->B1(备用), S3->M2->B1(备用)
瓶颈: M1是单点故障节点

请生成供应链分析报告，包括风险缓解建议。"""
        
        response = self.llm.chat([
            {"role": "system", "content": "你是一个供应链管理专家。"},
            {"role": "user", "content": prompt}
        ])
        print(f"\nDeepSeek 分析报告:\n{response['choices'][0]['message']['content']}")
    
    def anomaly_detection(self):
        """异常检测与根因分析"""
        print("\n" + "=" * 50)
        print("场景4: 异常检测与根因分析")
        print("=" * 50)
        
        # 模拟异常数据
        print("\n检测到的异常模式:")
        print("  1. 异常子图: 节点A -> B -> C -> A (环形)")
        print("  2. 异常子图: 节点D -> E, D -> F, D -> G (扇出)")
        print("  3. 异常子图: 节点H <- I, H <- J, H <- K (扇入)")
        
        print("\n根因分析:")
        print("  异常源头: 节点A (风险传播2跳)")
        print("  受影响节点: B, C, D, E")
        
        prompt = """分析以下异常检测结果:
异常模式:
1. 环形交易: A->B->C->A
2. 扇出异常: D->E, D->F, D->G
3. 扇入异常: H<-I, H<-J, H<-K

根因: 节点A是异常源头
传播路径: A -> B -> C -> D -> E

请生成异常检测报告，包括根因分析和修复建议。"""
        
        response = self.llm.chat([
            {"role": "system", "content": "你是一个异常检测和根因分析专家。"},
            {"role": "user", "content": prompt}
        ])
        print(f"\nDeepSeek 分析报告:\n{response['choices'][0]['message']['content']}")

def demo_analysis_scenarios():
    """数据分析场景演示"""
    print("=" * 60)
    print("DeepSeek 数据分析场景演示")
    print("=" * 60)
    
    scenarios = AnalysisScenarios()
    
    scenarios.financial_analysis()
    scenarios.social_analysis()
    scenarios.supply_chain_analysis()
    scenarios.anomaly_detection()
    
    print("\n" + "=" * 60)
    print("所有场景演示完成！")
    print("=" * 60)

if __name__ == '__main__':
    demo_analysis_scenarios()
