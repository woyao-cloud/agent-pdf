"""
01 - 命名实体识别 (NER) 演示
使用 spaCy 对中文新闻文本进行命名实体识别
"""

import spacy
from collections import Counter
import matplotlib.pyplot as plt
import matplotlib


matplotlib.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'DejaVu Sans']
matplotlib.rcParams['axes.unicode_minus'] = False


SAMPLE_TEXTS = [
    "阿里巴巴集团创始人马云于2023年9月访问了位于杭州的总部园区。",
    "腾讯控股有限公司宣布马化腾将继续担任董事会主席，公司在深圳的研发中心已扩建。",
    "字节跳动旗下抖音平台在全球拥有超过10亿月活跃用户，张一鸣于2012年创立了该公司。",
    "华为技术有限公司总部位于深圳，任正非在1987年创立了这家通信设备巨头。",
    "百度创始人李彦宏在2023年世界人工智能大会上发表了关于大模型发展的演讲。",
    "小米科技创始人雷军宣布，小米汽车将于2024年正式量产，工厂设在北京。",
    "宁德时代新能源科技股份有限公司与特斯拉公司签署了长期电池供应协议。",
    "美团创始人王兴表示，公司将继续加大在社区电商领域的投入。",
]


def load_model():
    try:
        nlp = spacy.load("zh_core_web_sm")
        print("✓ spaCy 中文模型加载成功")
        return nlp
    except OSError:
        print("✗ 未找到 zh_core_web_sm 模型，正在下载...")
        spacy.cli.download("zh_core_web_sm")
        nlp = spacy.load("zh_core_web_sm")
        print("✓ 模型下载并加载成功")
        return nlp


def extract_entities(nlp, texts):
    all_entities = []
    for i, text in enumerate(texts, 1):
        doc = nlp(text)
        entities = [(ent.text, ent.label_, ent.start_char, ent.end_char) for ent in doc.ents]
        all_entities.extend(entities)

        print(f"\n{'='*60}")
        print(f"文本 {i}: {text}")
        print(f"{'='*60}")
        if entities:
            for ent_text, ent_label, start, end in entities:
                print(f"  [{ent_label:8s}] {ent_text:20s} 位置 ({start:3d}, {end:3d})")
        else:
            print("  (未识别到实体)")
    return all_entities


def visualize_entity_distribution(entities):
    label_map = {
        "PERSON": "人物",
        "ORG": "组织",
        "GPE": "地名",
        "DATE": "日期",
        "MONEY": "金额",
        "TIME": "时间",
        "PERCENT": "百分比",
        "PRODUCT": "产品",
        "EVENT": "事件",
        "LOC": "位置",
        "NORP": "民族/群体",
        "FAC": "设施",
        "LAW": "法律",
        "ORDINAL": "序数",
        "CARDINAL": "基数",
        "WORK_OF_ART": "艺术作品",
    }

    labels = [label_map.get(e[1], e[1]) for e in entities]
    counter = Counter(labels)

    print(f"\n{'='*60}")
    print("实体类型分布统计")
    print(f"{'='*60}")
    for label, count in counter.most_common():
        print(f"  {label:12s}: {count} 个")

    fig, ax = plt.subplots(figsize=(10, 6))
    labels, counts = zip(*counter.most_common())
    colors = plt.cm.Set3(range(len(labels)))
    bars = ax.bar(labels, counts, color=colors)
    ax.set_title("实体类型分布", fontsize=14, fontweight='bold')
    ax.set_xlabel("实体类型")
    ax.set_ylabel("数量")
    for bar, count in zip(bars, counts):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.1,
                str(count), ha='center', va='bottom')
    plt.tight_layout()
    plt.savefig("ner_distribution.png", dpi=150)
    print(f"\n✓ 分布图已保存为 ner_distribution.png")
    plt.show()


def main():
    print("=" * 60)
    print("  命名实体识别 (NER) 演示")
    print("  使用 spaCy 中文模型 zh_core_web_sm")
    print("=" * 60)

    nlp = load_model()
    entities = extract_entities(nlp, SAMPLE_TEXTS)

    print(f"\n{'='*60}")
    print(f"共识别到 {len(entities)} 个实体")
    print(f"{'='*60}")

    visualize_entity_distribution(entities)


if __name__ == "__main__":
    main()
