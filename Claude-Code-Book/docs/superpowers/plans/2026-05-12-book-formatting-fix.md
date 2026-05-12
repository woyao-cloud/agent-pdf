# Book Formatting Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Markdown structure and Python code formatting across all 23 chapters without changing content.

**Architecture:** 6 rounds matching the book's 6 parts. Each chapter read, edited for structural and code formatting fixes, then spot-checked for correctness.

**Tech Stack:** Markdown editing via Read/Edit tools only. No scripting, no code execution.

---

## File Map

All files already exist. Each chapter is self-contained — no cross-file dependencies.

| File | Current issues |
|------|---------------|
| `Part01_基础入门篇/第1章_Claude_Code概述与安装配置.md` | Minor: mostly well-formed |
| `Part01_基础入门篇/第2章_核心概念与工作原理.md` | Minor |
| `Part01_基础入门篇/第3章_首次使用与AI对话.md` | Minor |
| `Part02_核心技能篇/第4章_项目探索与理解.md` | Minor |
| `Part02_核心技能篇/第5章_代码阅读与分析.md` | Minor |
| `Part02_核心技能篇/第6章_代码编写与修改.md` | Minor |
| `Part02_核心技能篇/第7章_调试与问题排查.md` | Minor |
| `Part02_核心技能篇/第8章_测试驱动开发.md` | Minor |
| `Part03_中级应用篇/第9章_多文件协同开发.md` | Collapsed lines, dot-spaces, missing code block language tags |
| `Part03_中级应用篇/第10章_重构与代码优化.md` | Collapsed lines, dot-spaces |
| `Part03_中级应用篇/第11章_文档生成与维护.md` | Collapsed lines, dot-spaces |
| `Part03_中级应用篇/第12章_正则表达式与文本处理.md` | Collapsed lines, dot-spaces |
| `Part04_高级技巧篇/第13章_复杂项目架构设计.md` | Collapsed lines, dot-spaces |
| `Part04_高级技巧篇/第14章_Agent与子任务编排.md` | Severely collapsed (17 lines), dot-spaces, `@lru__cache` typo |
| `Part04_高级技巧篇/第15章_Prompt工程进阶.md` | Collapsed lines, dot-spaces, `->    str]` typo |
| `Part04_高级技巧篇/第16章_ MCP服务集成.md` | Collapsed lines, dot-spaces |
| `Part05_项目实战篇/第17章_ CLI工具开发.md` | Collapsed lines, dot-spaces, `->    str]` typo |
| `Part05_项目实战篇/第18章_Web后端服务开发.md` | Collapsed lines, dot-spaces |
| `Part05_项目实战篇/第19章_前端React项目开发.md` | Collapsed lines, dot-spaces |
| `Part05_项目实战篇/第20章_全栈应用开发.md` | Collapsed lines, dot-spaces |
| `Part06_认证考试篇/第21章_考试概述与备考策略.md` | Mixed: some collapsed, some OK |
| `Part06_认证考试篇/第22章_模拟试题与解析.md` | Mixed |
| `Part06_认证考试篇/第23章_考试技巧与注意事项.md` | Mixed |

## Fix Pattern Reference

### Pattern A: Collapsed Markdown Lines

Before:
```
## 9.1 项目初始化与配置
### 9.1.1 项目模板选择
**常用项目模板**
```bash
claude "创建一个 Flask REST API 项目"
```**模板类型选择**- **Web 后端**：Flask...
```

After:
```

## 9.1 项目初始化与配置

### 9.1.1 项目模板选择

**常用项目模板**

```bash
claude "创建一个 Flask REST API 项目"
```

**模板类型选择**

- **Web 后端**：Flask...
```

### Pattern B: Python Dot-Spaces

Before:
```python
self. tools = [FileTool(), BashTool()]
results. append(result)
await asyncio. gather(*tasks)
```

After:
```python
self.tools = [FileTool(), BashTool()]
results.append(result)
await asyncio.gather(*tasks)
```

### Pattern C: Known Typos

| Before | After |
|--------|-------|
| `@lru__cache` | `@lru_cache` |
| `->    str]` | `) -> str` |

### Pattern D: Missing Code Block Language Tags

Before:
```
```
code here
```
```

After:
````
```python
code here
```
````

Determine language from context: Python files get `python`, shell commands get `bash`, JSON gets `json`, TOML gets `toml`, PowerShell gets `powershell`, markdown gets `markdown`, mermaid diagrams get `mermaid`.

---

## Tasks

### Task 1: Round 1 — Part 01 基础入门篇 (Chapters 1–3)

**Files:**
- `Part01_基础入门篇/第1章_Claude_Code概述与安装配置.md`
- `Part01_基础入门篇/第2章_核心概念与工作原理.md`
- `Part01_基础入门篇/第3章_首次使用与AI对话.md`

- [ ] **Step 1: Read and fix Chapter 1**

Read the chapter. Fix any collapsed markdown lines (Pattern A), dot-spaces in Python blocks (Pattern B), known typos (Pattern C), and add missing language tags to code blocks (Pattern D).

- [ ] **Step 2: Read and fix Chapter 2**

Same fixes as Step 1.

- [ ] **Step 3: Read and fix Chapter 3**

Same fixes as Step 1.

- [ ] **Step 4: Spot-check Round 1**

Read Chapter 1 and Chapter 3. Verify: headings clean, code blocks have language tags, no dot-spaces, no content altered.

- [ ] **Step 5: Commit Round 1**

```bash
git add Part01_基础入门篇/
git commit -m "fix: format Part 01 chapters — markdown structure and code blocks"
```

---

### Task 2: Round 2 — Part 02 核心技能篇 (Chapters 4–8)

**Files:**
- `Part02_核心技能篇/第4章_项目探索与理解.md`
- `Part02_核心技能篇/第5章_代码阅读与分析.md`
- `Part02_核心技能篇/第6章_代码编写与修改.md`
- `Part02_核心技能篇/第7章_调试与问题排查.md`
- `Part02_核心技能篇/第8章_测试驱动开发.md`

- [ ] **Step 1: Read and fix Chapter 4**

Fix collapsed markdown lines (Pattern A), dot-spaces in Python blocks (Pattern B), known typos (Pattern C), missing language tags (Pattern D).

- [ ] **Step 2: Read and fix Chapter 5**

Same fixes as Step 1.

- [ ] **Step 3: Read and fix Chapter 6**

Same fixes as Step 1.

- [ ] **Step 4: Read and fix Chapter 7**

Same fixes as Step 1.

- [ ] **Step 5: Read and fix Chapter 8**

Same fixes as Step 1.

- [ ] **Step 6: Spot-check Round 2**

Read Chapter 4 and Chapter 8. Verify: headings clean, code blocks have language tags, no dot-spaces, no content altered.

- [ ] **Step 7: Commit Round 2**

```bash
git add Part02_核心技能篇/
git commit -m "fix: format Part 02 chapters — markdown structure and code blocks"
```

---

### Task 3: Round 3 — Part 03 中级应用篇 (Chapters 9–12)

**Files:**
- `Part03_中级应用篇/第9章_多文件协同开发.md`
- `Part03_中级应用篇/第10章_重构与代码优化.md`
- `Part03_中级应用篇/第11章_文档生成与维护.md`
- `Part03_中级应用篇/第12章_正则表达式与文本处理.md`

- [ ] **Step 1: Read and fix Chapter 9**

This chapter has significant collapsed-line issues. Read carefully. Systematically expand all collapsed markdown sections (Pattern A), fix all Python dot-spaces (Pattern B), add language tags (Pattern D).

- [ ] **Step 2: Read and fix Chapter 10**

Same thorough fixes as Step 1.

- [ ] **Step 3: Read and fix Chapter 11**

Same thorough fixes as Step 1.

- [ ] **Step 4: Read and fix Chapter 12**

Same thorough fixes as Step 1.

- [ ] **Step 5: Spot-check Round 3**

Read Chapter 9 and Chapter 12. Verify: all headings on own lines with blank lines around them, all code blocks have language tags, no `self. method` patterns remain, no content lost.

- [ ] **Step 6: Commit Round 3**

```bash
git add Part03_中级应用篇/
git commit -m "fix: format Part 03 chapters — expand collapsed markdown, fix code blocks"
```

---

### Task 4: Round 4 — Part 04 高级技巧篇 (Chapters 13–16)

**Files:**
- `Part04_高级技巧篇/第13章_复杂项目架构设计.md`
- `Part04_高级技巧篇/第14章_Agent与子任务编排.md`
- `Part04_高级技巧篇/第15章_Prompt工程进阶.md`
- `Part04_高级技巧篇/第16章_ MCP服务集成.md`

- [ ] **Step 1: Read and fix Chapter 13**

Expand collapsed markdown sections (Pattern A), fix Python dot-spaces (Pattern B), add language tags (Pattern D).

- [ ] **Step 2: Read and fix Chapter 14**

This is the most damaged chapter (only 17 lines, everything compressed). Read the entire file. Expand every section: each `##` and `###` heading on its own line with blank lines. Each code block properly fenced with language tag. Fix ALL dot-spaces in Python blocks. Fix `@lru__cache` → `@lru_cache`. Be careful to preserve all existing content while restructuring.

- [ ] **Step 3: Read and fix Chapter 15**

Expand collapsed sections. Fix dot-spaces. Fix `->    str]` → `) -> str` in Python blocks. Add language tags.

- [ ] **Step 4: Read and fix Chapter 16**

Expand collapsed sections, fix dot-spaces, add language tags.

- [ ] **Step 5: Spot-check Round 4**

Read Chapter 14 and Chapter 15. Verify: Chapter 14 now has proper heading hierarchy with blank lines, all Python code has correct dot formatting, known typos fixed, content preserved.

- [ ] **Step 6: Commit Round 4**

```bash
git add Part04_高级技巧篇/
git commit -m "fix: format Part 04 chapters — expand collapsed markdown, fix Python code formatting"
```

---

### Task 5: Round 5 — Part 05 项目实战篇 (Chapters 17–20)

**Files:**
- `Part05_项目实战篇/第17章_ CLI工具开发.md`
- `Part05_项目实战篇/第18章_Web后端服务开发.md`
- `Part05_项目实战篇/第19章_前端React项目开发.md`
- `Part05_项目实战篇/第20章_全栈应用开发.md`

- [ ] **Step 1: Read and fix Chapter 17**

Expand collapsed sections. Fix dot-spaces. Fix `->    str]` if present. Add language tags.

- [ ] **Step 2: Read and fix Chapter 18**

Expand collapsed sections, fix dot-spaces, add language tags.

- [ ] **Step 3: Read and fix Chapter 19**

Expand collapsed sections, fix dot-spaces, add language tags.

- [ ] **Step 4: Read and fix Chapter 20**

Expand collapsed sections, fix dot-spaces, add language tags.

- [ ] **Step 5: Spot-check Round 5**

Read Chapter 17 and Chapter 20. Verify: headings clean, code blocks tagged, no dot-spaces, content preserved.

- [ ] **Step 6: Commit Round 5**

```bash
git add Part05_项目实战篇/
git commit -m "fix: format Part 05 chapters — expand collapsed markdown, fix code blocks"
```

---

### Task 6: Round 6 — Part 06 认证考试篇 (Chapters 21–23)

**Files:**
- `Part06_认证考试篇/第21章_考试概述与备考策略.md`
- `Part06_认证考试篇/第22章_模拟试题与解析.md`
- `Part06_认证考试篇/第23章_考试技巧与注意事项.md`

- [ ] **Step 1: Read and fix Chapter 21**

Fix any collapsed markdown lines, dot-spaces, missing language tags.

- [ ] **Step 2: Read and fix Chapter 22**

Same fixes as Step 1.

- [ ] **Step 3: Read and fix Chapter 23**

Same fixes as Step 1.

- [ ] **Step 4: Spot-check Round 6**

Read Chapter 21 and Chapter 23. Verify: headings clean, code blocks tagged, no dot-spaces, content preserved.

- [ ] **Step 5: Commit Round 6**

```bash
git add Part06_认证考试篇/
git commit -m "fix: format Part 06 chapters — markdown structure and code blocks"
```

- [ ] **Step 6: Final verification**

Read the README.md to confirm it's unchanged and links still work. Read Chapter 14 one last time to confirm the worst chapter is fully fixed.
