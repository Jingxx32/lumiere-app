# TCF 题目精讲入库（TCF Explanations）— 设计文档

日期：2026-08-13
状态：设计已与用户确认，待审阅

## 1. 概述

刷 TCF 题时点「Afficher réponse」，除了高亮正确选项，还要看到一篇**中文讲解 + 全题英文翻译**。讲解由用户与 Claude 在对话里逐题产出，写成 markdown 文件存进本仓库，再由脚本同步进 `tcf_questions.explanation`，前端渲染。

现状缺口：`tcf_questions.explanation` 与 `translation_en` 两个字段建表时就留好了，但 3159 道题**全为 null**——解析器（`src/lib/tcf/parse.ts`）一律写 null，前端也从未渲染过这两个字段。

这条线与 french-wiki → sundew 的口语表达闪卡流水线相互独立，互不写入。

## 2. 已确认的核心决策

| 决策点 | 结论 |
|---|---|
| 存储形状 | 整块 Markdown 存进现有 `explanation` 字段。不做结构化 JSONB |
| 为什么不结构化 | 讲解含变位表、双语词条、⚠️ 提醒、句架，进固定 schema 会被切碎；且讲解格式仍在迭代，schema 会跟着反复改 |
| 选项级钉一句话 | **不做**。选项对错解析写在讲解正文里，整篇显示 |
| 真源 | 仓库里的 markdown 文件，数据库是派生物 |
| 为什么文件是真源 | `scripts/import-tcf-reading.ts:77` 重导一套题会先 `delete` 该套全部 question 再重插；讲解只写库会被静默抹掉且不可恢复 |
| 题目定位 | `test_number` + `skill` + `order_index`，即 `T1 CE Q5`。题干文字会跨套重复（"Quelle est la nationalité d'Elsa ?" 在 test 1/9/31 各有一题），不能作主键 |
| 是否需要截图 | 阅读题不需要：`passage` 覆盖 1521/1521。听力 `transcript` 覆盖 1525/1638，缺的 113 题需截图。版面信息重要的图片题也需截图 |
| 触发条件 | 仅当用户说「今天我们来精讲TCF题目」之后才写文件与同步；其余对话只讲不存 |
| 批量回填 | 不做。一题一存，随讲随写 |
| 讲解语言 | 中文讲解 + 英文简释（用户明确要求），另含全题英文翻译区块 |
| `translation_en` 字段 | 本期由脚本从「全文翻译」区块顺手抽出填入；不填也不影响显示 |
| 词汇/语法点结构化 | 本期不做。以后若要接 `vocabulary_lookups` / `grammar_points`，再单独设计 |

## 3. 数据模型

**不新增表，不新增列。**

| 字段 | 用途 | 现状 |
|---|---|---|
| `tcf_questions.explanation` | 整篇讲解 Markdown（不含 frontmatter） | 已存在，全空 |
| `tcf_questions.translation_en` | 「全文翻译」区块正文 | 已存在，全空 |

定位键：`tcf_sets.test_number` + `tcf_sets.skill` + `tcf_questions.order_index`。

## 4. 讲解文件

### 4.1 路径与命名

```
data/tcf-explanations/CE-T1-Q5.md      # CE = reading（compréhension écrite）
data/tcf-explanations/CO-T13-Q30.md    # CO = listening（compréhension orale）
```

文件名即定位三件套，肉眼可读、可 grep。

### 4.2 结构

```markdown
---
test: 1
skill: reading
question: 5
written: 2026-08-13
---

## 全文翻译

**Question** — What is Elsa's nationality?

**Text**
> Hi Paul,
> I'm writing to you from Canada. …

**Options** — A. Canadian · B. Spanish · C. Italian · D. Mexican

## 题干
…

## 信件 / 文件 / 广告
…逐句讲：词汇 / 语法点 / 时态 / 语用（空的板块直接省略）

## 选项
A. … ❌ 理由　B. … ✅ 理由　C. … ❌ 理由　D. … ❌ 理由

## 句架
…

**答案：B**
```

frontmatter 供脚本定位，不进数据库、不显示。frontmatter 之后的全文原样写入 `explanation`。

### 4.3 正文规范

- 板块：词汇 / 语法点 / 时态 / 语用 / 句架。**没内容的板块直接省略**，不为凑格式硬写。
- 词汇：每词一行，中文 + 英文简释；默认每词 0–1 个例句；易混词最多 1 组对比。
- 语法点：只写本句实际用到的，1–2 条。已讲过的规则一句话引用，不重开表格。
- 时态：只答「用了什么时态、为什么、排除了哪个备选」。
- 句架：只给 1 个模板。
- 「全文翻译」= 题干 + 原文 + 四个选项，三样都翻，置于全篇最前。

## 5. 同步脚本

`npm run tcf:explain-sync` → `scripts/sync-tcf-explanations.ts`

1. 扫 `data/tcf-explanations/*.md`；
2. 解析 frontmatter，按 `test + skill + question` 查 `tcf_sets` join `tcf_questions`；
3. 把 frontmatter 之后的全文写入 `explanation`，把「全文翻译」区块正文写入 `translation_en`；
4. 幂等：重跑只覆盖同一行，不产生重复；
5. 匹配不到的文件报错并列出，不静默跳过；
6. 题库重导后重跑一次，讲解全部恢复。

## 6. 前端显示

- 新增依赖：`react-markdown` + `remark-gfm`（讲解含表格，GFM 必需）。
- `src/app/tcf/_components/drill-runner.tsx`、`exam-runner.tsx`：揭晓答案后在选项区下方渲染 `explanation`。
- `explanation` 为空的题保持现状，不显示空容器。

## 7. 会话流程

```
用户：今天我们来精讲TCF题目          ← 闸门打开，本次会话有效
用户：T1 Q5
Claude：从库里取题干/原文/选项/答案 → 按 §4.3 讲解
        → 写 data/tcf-explanations/CE-T1-Q5.md
        → 跑 npm run tcf:explain-sync
```

闸门未打开时正常讲解，**不写文件、不同步、不主动提议存储**。理由：用户同期还在学播客口语等其他材料，无差别捕获会把不属于任何题目的笔记灌进题库，且同步后难以撤销。

## 8. 明确不做

- 选项级钉一句话的结构化展示
- 词汇 / 语法点抽取入 `vocabulary_lookups` / `grammar_points`
- 批量回填历史题
- 改动 french-wiki 与 sundew 两个仓库

## 9. 风险与取舍

| 风险 | 处理 |
|---|---|
| 重导题库抹掉讲解 | 文件为真源，重导后重跑 sync 恢复 |
| OCR 出来的 `passage` 丢版面信息 | 遇到即要求截图；文件正文以截图为准 |
| 听力 113 题无 transcript | 同上，需截图 |
| 讲解格式后续再改 | Markdown 不锁格式，存储层无需改动 |
| 用户忘记说触发语 | 讲解照常给出但不落盘；用户随时可补说触发语，再要求把本次会话已讲的题补写入库 |
