# 语法知识点模块（Grammar Reference）— 设计文档

日期：2026-07-10
状态：设计已与用户确认，待审阅

## 1. 概述

新增一个 A2–B1 语法参考库：约 60–80 个知识点，英文讲解 + 法语例句（英文对照）。知识点体系（大纲）基于 CEFR 官方 A2/B1 语法清单人工整理、进 git 可审；内容由 AI 按大纲批量起草，全部以 **draft（未核实）** 状态入库，用户在阅读页里**边学边核**——直接编辑、逐条标记「已核实」。

现状缺口：`rules` 表（~33 条，按错误分类法子类各一条）只服务错误卡片的附属讲解，没有独立浏览入口，且「错误视角」的划分不等于语法书目录。

## 2. 已确认的核心决策

| 决策点 | 结论 |
|---|---|
| 模块形态 | A（参考库）为主，B（配套练习）以后再加，本期只留挂载点 |
| 知识点体系 | 独立语法大纲（非错误分类法骨架），通过映射字段与分类法相通 |
| 内容来源 | 方法 C：CEFR 官方 A2/B1 语法清单搭骨架 + AI 起草 + 人工校对（用户无自有教材 PDF） |
| 讲解语言 | 英文讲解（与现有 `rules.descriptionEn` 一致），法语例句附英文对照 |
| 覆盖范围 | A2–B1 核心，约 60–80 个知识点；B2 以后增量补 |
| 校对流程 | 不做批量前置校对；批量起草入库为 draft，应用内「边学边核」，阅读页内嵌编辑 + 标记已核实 |
| `rules` 表 | 不动，继续服务错误反馈流程；两套体系通过 taxonomy 映射间接相通 |

## 3. 数据模型

### 3.1 新表 `grammar_points`

走新表约定（uuid PK `defaultRandom()` + `timestamp(..., { withTimezone: true })`）：

```
id                      uuid PK, defaultRandom
slug                    text NOT NULL UNIQUE     -- 稳定键，如 'passe-compose-vs-imparfait'；URL 与幂等导入用
name                    text NOT NULL            -- 英文标题
level                   text NOT NULL            -- 'A2' | 'B1'
category                text NOT NULL            -- 教学分组（约 7–8 组），如 Articles & Nouns / Pronouns / Verb Tenses / Moods / Sentence Structure / Prepositions / Agreement
order_index             integer NOT NULL         -- 组内排序
summary                 text NOT NULL            -- 一句话概要
description_en          text NOT NULL            -- 正文，Markdown
examples                jsonb                    -- { fr: string, en: string }[]
taxonomy_subcategories  jsonb                    -- string[]，映射 ERROR_TAXONOMY 叶子子类键（多对一，可为空数组）
status                  text NOT NULL            -- 'draft' | 'verified'，默认 'draft'
verified_at             timestamptz NULL
created_at / updated_at timestamptz NOT NULL
```

索引：`slug` unique；`(category, order_index)`。

### 3.2 大纲文件 `src/lib/grammar-outline.ts`

进仓库、可审。每条含 `slug / name / level / category / orderIndex / taxonomySubcategories`。大纲由实现者基于 CEFR A2/B1 语法清单起草，**用户只审这份清单**（远轻于审 80 条内容）。大纲是知识点体系的唯一权威来源；AI 只负责「写讲解」，不决定「学什么」。

## 4. 内容生产管线

`scripts/generate-grammar-points.ts`（仿 `seed-rules.ts` 模式），npm script `grammar:generate`：

- 遍历大纲，跳过库里已有的 slug（幂等、可断点重跑）
- 对缺失项调 OpenAI（结构化输出 + Zod 校验）生成 `summary / descriptionEn / examples`，以 `status = 'draft'` 入库
- 单条失败不中断整体，下次重跑补齐
- 模型：新增可选环境变量 `OPENAI_MODEL_GRAMMAR`，默认 `gpt-4o`
- AI 生成内容经用户校对，无版权问题，入库数据可正常存在（大纲与脚本进 git；生成内容在数据库中）

## 5. 页面与交互

侧边栏 Vocabulary 旁新增 **Grammar** 入口。两个页面（`src/app/(main)/grammar/`）：

### 5.1 `/grammar` 列表页

- 按 `category` 分组展示，每条：名称 + 等级章（A2/B1）+ 未核实标记（draft 才显示）
- 顶部：核实进度（如 "12/72 verified"）+ 客户端搜索框（~80 条内存过滤）

### 5.2 `/grammar/[slug]` 详情页

- 标题、等级、正文（渲染 Markdown）、例句列表（法语 `font-serif`，英文对照）
- **"Your errors on this point"** 区块：按 `taxonomy_subcategories` 查 `errors` 表（`subcategory IN (...)`），显示错误总数 + 最近几条摘要
- **编辑模式**：点 Edit 后正文 / 例句 / 概要变为可编辑，保存走 server action
- **"Mark as verified"** 独立按钮：置 `status = 'verified'` + `verified_at`；列表页未核实标记随之消失

### 5.3 Server actions `src/lib/actions/grammar.ts`

`"use server"`：列表（含核实进度）、按 slug 取单条、更新内容、标记核实；写操作后 `revalidatePath`。

## 6. 与现有系统的边界

- `rules` 表与错误反馈流程不动
- 错误卡片反向链接到语法详情页：不在本期，是后续小增量
- 未来练习功能（B）：练习记录表挂 `grammar_point_id` 即可，本期 schema 无需预埋字段
- 不新建 API 路由，遵循「页面 → server actions → Drizzle」现有数据流

## 7. 验证方式

项目无测试套件。验证路径：

1. 大纲文件成稿 → 用户审清单
2. 管线先限量生成 2–3 条跑通（Zod 校验、幂等重跑）
3. 全量生成 → 浏览器过一遍列表页 / 详情页 / 编辑 / 核实 / 错误关联

## 8. 不做的事（本期）

- 配套练习题（B 方案）
- B2 及以上内容
- 批量校对后台 / 单独审核界面
- `rules` 表迁移或合并
- 错误卡片 → 语法详情页的反向链接
