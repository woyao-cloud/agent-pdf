import re, os

readme_path = 'docs/bun-1/ch07-bun-sqlite/README.md'
with open(readme_path, 'r', encoding='utf-8') as f:
    content = f.read()

cjk = re.findall(r'[一-鿿㐀-䶿豈-﫿]', content)
cjk_count = len(cjk)

total_chars = len(content)

print(f'CJK characters: {cjk_count}')
print(f'Total characters (all): {total_chars}')
print(f'Total bytes (UTF-8): {len(content.encode("utf-8"))}')
print()

for root, dirs, files in os.walk('docs/bun-1/ch07-bun-sqlite'):
    for f in sorted(files):
        path = os.path.join(root, f)
        size = os.path.getsize(path)
        print(f'  {path} - {size} bytes')
