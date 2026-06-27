"""
02 - 关系抽取演示
基于依存句法分析和规则匹配的关系抽取
"""

import spacy
import re


SAMPLE_SENTENCES = [
    "马云在1999年创立了阿里巴巴集团。",
    "马化腾是腾讯公司的首席执行官。",
    "张一鸣创办了字节跳动公司。",
    "李彦宏担任百度公司的董事长。",
    "雷军是小米科技的创始人兼CEO。",
    "任正非在1987年创立了华为技术有限公司。",
    "王兴创办了美团公司。",
    "阿里巴巴集团总部位于浙江省杭州市。",
    "腾讯公司总部在广东省深圳市。",
    "华为技术有限公司总部位于深圳。",
    "字节跳动公司总部在北京。",
    "百度公司总部位于北京。",
    "小米科技总部在北京。",
    "宁德时代总部位于福建省宁德市。",
    "特斯拉公司与宁德时代签署了电池供应协议。",
    "阿里巴巴收购了饿了么。",
    "腾讯投资了京东。",
    "字节跳动推出了抖音产品。",
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


def extract_triplets_rule_based(nlp, sentences):
    triplets = []

    founder_patterns = [
        (r"(?:由|被)(.{1,6})(?:在\S+)?(?:于\S+)?(?:创立|创办|创建|成立)(?:了)?(.{2,20})", "founded"),
        (r"(.{1,6})(?:在\S+)?(?:于\S+)?(?:创立|创办|创建|成立)(?:了)?(.{2,20})", "founded"),
    ]

    works_at_patterns = [
        (r"(.{1,6})(?:担任|是|成为|出任)(.{2,20})(?:的)?(?:董事长|CEO|首席执行官|总裁|创始人|总经理|董事)", "works_at"),
        (r"(.{1,6})(?:是|为)(.{2,20})(?:的)?(?:创始人|CEO|首席执行官|董事长|总裁)", "works_at"),
    ]

    located_in_patterns = [
        (r"(.{2,20})(?:总部)?(?:位于|在|坐落于)(.{2,10})", "located_in"),
    ]

    acquired_patterns = [
        (r"(.{2,20})(?:收购|并购|买下)(?:了)?(.{2,20})", "acquired"),
    ]

    invested_patterns = [
        (r"(.{2,20})(?:投资|入股)(?:了)?(.{2,20})", "invested_in"),
    ]

    product_patterns = [
        (r"(.{2,20})(?:推出|发布|开发|研发)(?:了)?(.{2,20})", "produces"),
    ]

    all_patterns = [
        *founder_patterns,
        *works_at_patterns,
        *located_in_patterns,
        *acquired_patterns,
        *invested_patterns,
        *product_patterns,
    ]

    for sentence in sentences:
        doc = nlp(sentence)
        entities = {ent.text: ent.label_ for ent in doc.ents}

        for pattern, rel_type in all_patterns:
            match = re.search(pattern, sentence)
            if match:
                subj, obj = match.group(1).strip(), match.group(2).strip()
                if subj and obj and subj != obj:
                    subj_type = entities.get(subj, "UNKNOWN")
                    obj_type = entities.get(obj, "UNKNOWN")
                    triplets.append({
                        "subject": subj,
                        "subject_type": subj_type,
                        "predicate": rel_type,
                        "object": obj,
                        "object_type": obj_type,
                        "sentence": sentence,
                    })
                    break

    return triplets


def print_triplets(triplets):
    print(f"\n{'='*80}")
    print(f"抽取到 {len(triplets)} 个三元组")
    print(f"{'='*80}")

    for i, t in enumerate(triplets, 1):
        print(f"\n  三元组 {i}:")
        print(f"    主体 (Subject):   {t['subject']:12s}  [{t['subject_type']}]")
        print(f"    谓词 (Predicate): {t['predicate']:12s}")
        print(f"    客体 (Object):    {t['object']:12s}  [{t['object_type']}]")
        print(f"    来源句子: {t['sentence']}")


def main():
    print("=" * 60)
    print("  关系抽取演示")
    print("  基于规则和依存句法分析")
    print("=" * 60)

    nlp = load_model()
    triplets = extract_triplets_rule_based(nlp, SAMPLE_SENTENCES)
    print_triplets(triplets)

    print(f"\n{'='*60}")
    print("关系类型统计:")
    print(f"{'='*60}")
    rel_counts = {}
    for t in triplets:
        rel_counts[t["predicate"]] = rel_counts.get(t["predicate"], 0) + 1
    for rel, count in sorted(rel_counts.items(), key=lambda x: -x[1]):
        print(f"  {rel:15s}: {count} 个")


if __name__ == "__main__":
    main()
