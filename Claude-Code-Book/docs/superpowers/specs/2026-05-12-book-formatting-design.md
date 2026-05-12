# Book Formatting Fix — Design Spec

**Date:** 2026-05-12
**Scope:** 23 chapters across 6 parts, formatting only (no content changes)

## Goal

Fix Markdown structure and Python code formatting across all 23 chapters so the book is readable and code is correct. No content enrichment — purely mechanical fixes.

## Fix Rules

### A. Markdown Structure

- Every `#`/`##`/`###` heading on its own line, blank line before and after
- Every fenced code block (` ``` `) on its own line, blank line before and after
- Code blocks annotated with language: ` ```bash`, ` ```python`, ` ```json`, ` ```toml`, ` ```powershell`, ` ```markdown`, ` ```mermaid`, ` ```git`
- List items on separate lines, not stacked
- Paragraphs, tables, images, blockquotes left as-is when already well-formed

### B. Python Code Formatting

- Remove space before dots in method/attribute access: `self. tools` → `self.tools`, `results. append` → `results.append`
- Apply only inside Python code blocks (` ```python`)
- Fix known typos: `@lru__cache` → `@lru_cache`, `->    str]` → `) -> str`

### C. What NOT to Change

- Content, meaning, chapter structure
- Non-Python code blocks
- File names
- Chapter ordering or part assignments

## Execution Plan

6 rounds, one per part. Each round: fix → spot-check → confirm.

| Round | Part | Chapters |
|-------|------|----------|
| 1 | Part 01 — 基础入门篇 | 1–3 |
| 2 | Part 02 — 核心技能篇 | 4–8 |
| 3 | Part 03 — 中级应用篇 | 9–12 |
| 4 | Part 04 — 高级技巧篇 | 13–16 |
| 5 | Part 05 — 项目实战篇 | 17–20 |
| 6 | Part 06 — 认证考试篇 | 21–23 |

## Verification

After each round, spot-check 2 chapters with Read tool:
- Confirm headings are clean
- Confirm code blocks have language tags and no dot-spaces
- Confirm no content was altered

## Non-Goals

- Adding missing content to thin chapters (Chapter 14, etc.) — deferred to content enhancement phase
- Fixing factual accuracy of code examples — deferred
- Renaming files to fix spacing inconsistencies — can be done separately
