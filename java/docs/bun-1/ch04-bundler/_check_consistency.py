import os

basedir = r'D:\学习\大模型\pdf\java\docs\bun-1\ch04-bundler'

# Check 03-production/src/ files
src_dir = os.path.join(basedir, 'examples', '03-production', 'src')
print("=== 03-production/src/ files ===")
for root, dirs, files in os.walk(src_dir):
    for f in sorted(files):
        fp = os.path.join(root, f)
        sz = os.path.getsize(fp)
        with open(fp, 'rb') as fh:
            content = fh.read()
        rel = os.path.relpath(fp, basedir)
        print(f"\n{rel} ({sz} bytes)")
        print(f"  {repr(content)}")

# Check if README section 6 code matches actual files
print("\n\n=== README Section 6 vs Actual Files ===")
readme_path = os.path.join(basedir, 'README.md')
with open(readme_path, 'r', encoding='utf-8') as f:
    readme = f.read()

# Extract the code blocks from section 6
import re
# Find section 6 content
idx = readme.find('## 6. 示例代码与配置')
if idx >= 0:
    section6 = readme[idx:]
    # Find all code blocks
    code_blocks = re.findall(r'```(?:typescript|javascript)\n(.*?)```', section6, re.DOTALL)
    print(f"Found {len(code_blocks)} code blocks in section 6")
    for i, cb in enumerate(code_blocks):
        first_line = cb.strip().split('\n')[0] if cb.strip() else '(empty)'
        print(f"  Block {i+1}: starts with '{first_line}'")
else:
    print("Section 6 not found!")

print("\n=== All files in ch04-bundler ===")
for root, dirs, files in os.walk(basedir):
    for f in sorted(files):
        if f.endswith('.py') or f == '.gitkeep':
            continue
        fp = os.path.join(root, f)
        sz = os.path.getsize(fp)
        rel = os.path.relpath(fp, basedir)
        print(f"  {rel} ({sz} bytes)")
