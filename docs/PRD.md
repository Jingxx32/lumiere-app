# Lumière — 产品需求文档 (PRD)

| 字段 | 内容 |
|------|------|
| **产品名** | Lumière (法语 *光 / 启蒙*) |
| **版本** | v0.1 (Sprint 1 已交付，规划至 Sprint 7) |
| **文档状态** | 起草后即冻结 — 任何变更需在变更日志中记录 |
| **最后更新** | 2026-05-05 |
| **目标读者** | 产品作者本人（自用产品）；未来潜在协作者；未来潜在用户 |

---

## 0. 阅读指南

本 PRD 是产品的"宪法"。它回答的是 **为什么 (Why) 和做什么 (What)**，不回答 **怎么做 (How)** 的具体实现细节（那些归 ADR 和代码注释）。

本文档中：

- **强决策** = 必须遵守，改动需明确替换
- **弱决策** = 当前选择，可基于证据迭代
- **范围外 (Out of scope)** = 明确不做，避免范围爆炸

---

## 1. 执行摘要

**Lumière 是一个为中高级法语自学者设计、以"输出"为核心的训练场。**

它解决一个被现有工具集体忽视的问题：**主流 AI 学习工具（NotebookLM、Claude、ChatGPT）让你"理解"语言变得太容易，反而剥夺了你"产出"的机会，导致学了等于没学。**

Lumière 的核心闭环是：

```
你上传法语原文 → 阅读时 AI 帮你查词 → AI 基于原文生成"必须用到 X 词 / Y 语法"的写作任务
        → 你用法语写 → AI 给出按错误分类法标注的结构化反馈 → 错误归档到你的档案
        → 档案里的盲点反过来影响下一次任务的出题
```

**v0.1 是个人自用工具**（本地跑、SQLite、单用户），目的是先让作者自己跑通这个闭环，再决定是否产品化。

---

## 2. 背景与问题陈述

### 2.1 现有工具的局限

| 工具 | 强项 | 关键局限 |
|------|------|---------|
| **NotebookLM** | Flashcard / Quiz / 脑图 / 基于文件问答 | 原文阅读体验差，无法批注；**完全没有强制输出环节**；内容封闭在它的生态里 |
| **Claude (Cowork/MCP)** | 自由度高，可接本地笔记 | 不是为"学习"场景设计；**没有结构化的复习与进度追踪**；AI 太"温柔"，直接给答案 |
| **Anki / 传统 SRS** | 间隔重复算法成熟 | 卡片**脱离原文语境**；完全被动识别，没有产出环节；制卡成本高 |
| **通用 AI 聊天** | 万能 | 没有学习者画像，每次对话都是"陌生人"；批改不分类、不持久化 |

### 2.2 语言学习的根本矛盾

二语习得的 **Output Hypothesis (Swain, 1985)** 指出：

> 学习者只有被迫产出语言，才会真正发现自己"以为懂了"和"真的会用"之间的鸿沟。

但所有现代 AI 工具都在做相反的事——它们让"理解"变得太容易：

- 看不懂？AI 一秒翻译
- 不会词义？AI 一秒解释
- 不知道怎么说？AI 直接给你答案

**结果是 "假装学过"的幻觉**：在 NotebookLM 里读完一篇文章 + 看了总结 + 答了几个 Quiz，感觉自己懂了；一周后什么都不记得，因为你**从未真正产出过**。

### 2.3 法语学习的专属痛点

| 痛点 | 通用 AI 处理得如何 | 该怎么处理 |
|------|------------------|-----------|
| 阴阳性 (`le maison` vs `la maison`) | 修正了，但不告诉你为什么、不追踪 | 单独分类、长期追踪错误率 |
| 时态选择 (passé composé vs imparfait) | 修正了，但不解释触发语境 | 必须记录 trigger_context |
| 动词变位 (être/avoir/aller…) | 修正了，但不让你练 | 错误自动转成 follow-up drill |
| 语境锚点 | 把生词从原文"摘"出来，丢失记忆锚点 | 卡片必须能跳回原句 |
| 阅读 vs 输出割裂 | 阅读和写作完全两个会话 | 写作任务必须从原文生成 |

### 2.4 为什么是现在

- LLM 的结构化输出 (Structured Outputs / Zod schema) 在 2024 年成熟，让"按 taxonomy 分类的批改"第一次变得可靠
- Server Components + Server Actions 让全栈 TS 个人项目部署成本降到接近零
- SQLite + Drizzle 让本地优先 (local-first) 的学习工具成为可能

---

## 3. 产品定位

### 3.1 一句话定位

> **一个用英文界面、给中高级法语学习者用的"读 → 写 → 长期变好"的训练场。读什么由你（用户上传），写什么由 AI 根据你刚读的内容生成，AI 批改并把每个错误归档进你的"语言成长档案"。**

### 3.2 三个核心价值主张

1. **输出为核心 (Output-first)**
   不再是 "AI 帮你理解材料"，而是 "AI 强迫你产出材料"。每篇阅读最终都要落到一段你自己写的法语上。

2. **反馈持久化 (Persistent feedback)**
   每个错误带 9 大类、33 子类的精确标签，写入你的档案。三个月后你能看到 "subjonctif 错误率从 80% 降到 30%" 这样的趋势。

3. **学习者模型驱动 (Learner-driven)**
   档案不是静态的统计页，而是会反过来影响 AI 出题——它会刻意触发你最薄弱的语法点，让你不得不练。

### 3.3 与竞品的差异化矩阵

| 维度 | NotebookLM | Anki | Claude/ChatGPT | **Lumière** |
|------|-----------|------|----------------|-------------|
| 上传自己的素材 | ✓ | △（手动制卡） | △（粘贴） | ✓ |
| 阅读体验 | 弱 | — | 弱 | **强** (S2) |
| 划词 AI 解释 | △ | — | ✓ | ✓ (S2) |
| 强制输出 | ✗ | △（cloze） | ✗ | **✓ (S3+S4)** |
| 结构化批改 (按错误分类) | ✗ | ✗ | ✗ | **✓ (S4)** |
| 错误持久化 + 档案 | ✗ | △ (单卡历史) | ✗ | **✓ (S5)** |
| 长期趋势可视化 | ✗ | ✗ | ✗ | **✓ (S6)** |
| 学习者画像影响出题 | ✗ | ✗ | ✗ | **✓ (S7)** |
| SRS 间隔重复 | ✗ | ✓ | ✗ | △（v2 候选） |

**护城河**：第 4-7 行——这是 NotebookLM **结构上做不到**的事，因为它没有"输出 → 错误归档 → 影响下一次输入"这个闭环。

---

## 4. 目标用户

### 4.1 主用户画像 (P0)

> **"独立学习者"**：母语英文（次：中文），CEFR A2-B1，自学法语 6 个月以上，每周投入 3-8 小时，技术亲和性高（开发者 / 学者 / 内容创作者），用过 NotebookLM/Claude/Anki，对它们的局限性有切身感受。

具体特征：
- **不依赖外部督促**（不需要老师、不需要班级、不需要排名）
- **愿意付出认知努力**（接受"AI 不直接给答案"的反馈方式）
- **对长期数据敏感**（看到趋势曲线会有动力）
- **使用自己挑选的真实材料**（小说、新闻、播客转录稿），而不是教材式预制内容

### 4.2 次要用户画像 (P1，v2 之后才考虑)

- 准备 DELF B1/B2 考试的学习者（需要写作专项强化）
- 移居法语国家前的工作者（需要快速建立工作场景写作能力）
- 法语教师（用于学生作业批改辅助）

### 4.3 不服务的用户 (P3)

- A0-A1 入门者（现有大量入门 app 已经做得很好，不重复造轮子）
- 只想"被动看视频学法语"的用户（与产品哲学冲突）
- 追求游戏化、连击、勋章的用户（与设计原则冲突）

### 4.4 主用户旅程示例

> **晚上 22:00，主用户读完一篇 Le Monde 关于气候变化的文章**
> 1. 在 Reader 里划查 8 个生词，每个都看了 AI 的解释 + 例句
> 2. 点 "Generate task from these 8 words"
> 3. AI 出题：用其中 5 个词写一段反思，必须用 plus-que-parfait
> 4. 用户写了 6 行
> 5. AI 反馈：3 个错误（1 个 tense_choice、1 个 noun_gender、1 个 preposition），1 条夸奖，1 个建议
> 6. 用户看了解释、点击 micro-drill，再写 2 句巩固
> 7. 关掉 app
> 8. **下周再打开 Progress 页，看到 noun_gender 错误率本周下降了**

---

## 5. 产品原则 (Design Principles)

这五条是 Lumière 的"宪法"。任何功能决策都要回到这五条做检查。

### 5.1 输出为核心 (Output-first)
> "如果一个功能只让用户更轻松地理解材料，但没有强迫产出，它就不是 Lumière 的核心功能。"

直接推论：
- 不优先做"AI 总结全文" / "脑图" 这类纯输入侧功能
- 不做"AI 帮我朗读全文" 这类被动消费

### 5.2 错误是燃料 (Errors are fuel)
> "用户犯的每一个错都是产品最有价值的数据，不是失败的标志。"

直接推论：
- 错误必须被结构化、持久化、可分析
- 必须有"鼓励层"（praise），让用户愿意继续暴露错误
- **不做对错积分、不做错题率排名**

### 5.3 学习者模型驱动 (Learner-driven)
> "AI 给的每一次反馈都应该'知道你是谁'。"

直接推论：
- 用户的累计错误档案必须喂给批改 prompt
- 写作任务的难度、词表必须基于学习者画像生成
- 用户当前等级（CEFR）影响 AI 输出的措辞复杂度

### 5.4 阅读是入口，不是终点 (Reading is the entry, not the destination)
> "每一次阅读最终都应该导向一次产出。"

直接推论：
- Reader 上必须始终有一个一秒可达的"生成写作任务"入口
- 阅读时收集的 vocab 必须能直接喂给写作任务

### 5.5 AI 不直接给答案 (No spoilers)
> "AI 应该像苏格拉底，而不是像维基百科。"

直接推论：
- 写作批改默认不直接 reveal 改后版本，先反问 / 提示
- "Show full correction" 是用户主动二次点击的动作
- 词义解释配合"在这句里为什么这么用"，而不是干巴巴的字典释义

---

## 6. 核心闭环 (The Core Loop)

```
┌─────────────────────────────────────────────────────────────┐
│  原文 (你上传的素材)                                        │
│         ↓ 阅读时 AI 提取: 新词 + grammar points + 主题      │
│  AI 生成"基于原文的写作任务"                                 │
│   例: "Using 'bouleverser', 'malgré tout' and the           │
│        plus-que-parfait, write a 5-sentence reflection      │
│        on the protagonist's decision."                      │
│         ↓ 你用法语写                                        │
│  AI 批改 (英文解释 + 法语例句)                               │
│         ↓ 错误分类 → 写入你的档案                            │
│  ┌──────────────────────────────────────┐                  │
│  │  你的语言档案 (持久化)                 │                  │
│  │  - 累计错误: 234 (按类别)             │                  │
│  │  - subjonctif 错误率: 80% → 30% ↓    │                  │
│  │  - 你掌握的词: 1,847 (产出过)         │                  │
│  │  - 反复犯错的 top 5 模式               │                  │
│  └──────────────────────────────────────┘                  │
│         ↓ 反过来影响下一次任务生成                           │
│  下一次写作任务会刻意触发你的薄弱点                          │
└─────────────────────────────────────────────────────────────┘
```

**这个闭环 = Lumière。** 没有这个闭环，产品就退化成"NotebookLM + 法语词典"。

---

## 7. 功能需求

### 7.1 Library (素材库)

**目的**：让用户管理所有自己的法语学习素材，是每次进 app 的"门口"。

#### 7.1.1 必须功能

| 功能 | 描述 | Sprint |
|------|------|--------|
| **添加文档** | 通过对话框粘贴/上传法语文本，必填 title/content，可选 source/type/url | S1 ✓ |
| **文档列表** | 按最近读过 → 创建时间排序，每条显示标题、来源、字数、CEFR 等级、累计错误数 | S1 ✓ |
| **Continue Reading 卡** | 最近打开的文档置顶大卡，含进度条、片段预览、双 CTA | S1 ✓ |
| **删除文档** | 通过菜单触发，需二次确认 | S2 |
| **搜索** | 标题 + 内容全文搜索 | S2 |
| **类型筛选** | News / Literature / Personal / Other 四类 chip 筛选 | S2 |

#### 7.1.2 设计要点

- 不做封面图 / 缩略图（不是 Goodreads，是学习工具）
- 错误数 chip 是 "反向入口" — 点击跳转到 `/progress?documentId=<id>`。Progress 页（S6）需支持 `documentId`、`category`、`window` 三个可组合 query param，以实现过滤到该文档的所有错误
- 等级 chip 颜色编码（A2 绿 / B1 蓝 / B2 琥珀），帮助用户判断素材难度分布是否健康

#### 7.1.3 范围外（v1 不做）

- ❌ PDF/EPUB 解析（v1 只支持纯文本/Markdown 粘贴）
- ❌ 网页剪藏 / YouTube 字幕导入
- ❌ 文件夹 / tag 多级组织
- ❌ 导入/导出整个素材库
- ❌ 多人共享素材

---

### 7.2 Document Reader (阅读视图)

**目的**：提供一个"阅读沙龙"般的沉浸环境，AI 帮助一秒可达但不打断心流。

#### 7.2.1 必须功能

| 功能 | 描述 | Sprint |
|------|------|--------|
| **阅读列** | 680px 居中，Source Serif 18px，line-height 1.75，段落间距充足 | S1 ✓ |
| **文档头** | 标题、作者/来源、CEFR chip、字数、阅读进度 | S1 ✓ |
| **划词查询 popover** | 选中任何词/短语，弹出 popover 含: translation, conjugation, "in this context", 2 条法语例句 | **S2** |
| **保存到 vocabulary** | popover 内的按钮，加入本次会话的收集列表 | S2 |
| **This Session 侧栏** | 显示阅读时长、查询的词数、收集的 vocab 列表 | S2 |
| **Generate Writing Task (顶栏)** | 基于全文内容生成写作任务 | S3 |
| **Generate task from these N words (侧栏底部)** | 基于本次收集的词生成写作任务 | S3 |
| **阅读进度自动追踪** | 监听滚动位置，实时更新 readingProgress | S2 |

#### 7.2.2 划词 popover 的内容契约

**强决策**：popover 的 6 个区块顺序固定，不可调换：

```
┌──────────────────────────────────┐
│ <word>           verb · trans.   │ ← 头部 + 词性
│ [B2 word]                        │ ← 等级 chip
│                                  │
│ TRANSLATION                      │
│ to deeply move, to overwhelm     │
│                                  │
│ CONJUGATION (présent)            │ ← 仅动词显示
│ je bouleverse · tu bouleverses…  │
│                                  │
│ IN THIS CONTEXT                  │ ← ★ 差异化关键 ★
│ Past participle agrees with…     │
│                                  │
│ EXAMPLES                         │
│ La nouvelle a bouleversé…        │
│ Cette rencontre m'a bouleversé…  │
│                                  │
│ [+ Save to vocabulary] [Dict →]  │
└──────────────────────────────────┘
```

**"IN THIS CONTEXT" 是与通用 AI 字典的核心差异。** 它解释这个词在**这个具体句子里**为什么这么用（变位、性数、惯用搭配、引申义），不是通用字典释义。

#### 7.2.3 范围外

- ❌ 高亮 / 划线 / 批注（这是阅读工具功能，与"输出为核心"原则冲突，故意不做）
- ❌ 阅读时跟读 / TTS 朗读（v1 不做听力 / 发音）
- ❌ 多人共读 / 评论

---

### 7.3 Practice (写作练习 + 反馈)

**这是产品的灵魂场景。所有其他模块都为这一刻服务。**

#### 7.3.1 Task Stage（任务阶段）

| 功能 | 描述 | Sprint |
|------|------|--------|
| **任务卡** | 显示来源（FROM 文档名）、英文 prompt、target words chips、target grammar chips | S3 |
| **写作输入** | 大尺寸 textarea，Source Serif 字体，实时字数统计，支持粘贴 | S3 |
| **字数提示** | 显示推荐字数区间（如 50-200），未达到时按钮可点但有 warning | S3 |
| **Submit** | 触发批改 server action | S3 |

#### 7.3.2 Feedback Stage（反馈阶段）

| 功能 | 描述 | Sprint |
|------|------|--------|
| **三栏布局** | 左侧原文片段（可折叠）/ 中间提交 + 内联高亮 / 右侧反馈面板 | **S4** |
| **内联高亮** | 错误处用对应类别颜色下划线 + 编号上标，与右侧错误卡一一对应 | **S4** |
| **错误卡片** | 每个错误一张卡，含 original → correction、explanation_en、2 条法语例句、对应规则链接 | **S4** |
| **Praise 卡** | A2-B1 鼓励刚需，至少 1 条对做得好的肯定 | **S4** |
| **Improvement 卡** | 不是错但能更好（不进入错误档案统计） | **S4** |
| **Overall summary** | AI 估计本次的 CEFR 等级 + 一句英文总结 | **S4** |
| **Show full correction (二次点击)** | 默认不显示完整修正，鼓励用户自己改 | **S4** |
| **Micro-drill** | 错误卡内的 "再写 2 句" 入口 | S5 |

#### 7.3.3 写作任务生成的来源（强决策）

写作任务**必须**来自以下三种来源之一，不允许"凭空"生成：

1. **基于完整文档** — 由 Reader 顶部按钮触发
2. **基于本次会话收集的词** — 由 Reader 侧栏底部按钮触发
3. **基于错误档案** — 由 Progress 页的 "Practice" 按钮触发（S7）

**不做** "随机出题"功能。所有产出必须有学习上下文锚点。

**target_words 约束规则（强决策）**：
- `target_words` 必须是用户本次收集词的**子集**（AI 不得在返回值中添加未被收集的词）
- 当收集词 **≤ 5 个**时，`target_words` 必须包含全部收集词
- 当收集词 **> 5 个**时，AI 可选子集，但 `target_words` 至少包含 3 个，且仍须是收集词子集
- 使用**整篇文档**（无收集词）触发时，此约束不适用，AI 自由选词
- 后处理验证在 `generateWritingTask` server action 中执行，不重新调用 AI

#### 7.3.4 反馈"做到极致"的 5 层栈

| 层 | 内容 | Sprint |
|----|------|--------|
| **5. 进步可视化** | 你写错过 X 次 subjonctif，现在错误率从 80% 降到 20% | S6 |
| **4. 错误持久化 + 回流** | 写错的句型明天出现在复习/任务队列 | S5 + S7 |
| **3. 解释引擎** | 不只说错在哪，要讲为什么、给规则、给同类型例句 | **S4** |
| **2. 批改 Prompt 工程 + 后处理** | 让 AI 按 Zod schema 输出，不要自由发挥 | **S4** |
| **1. 错误分类法 (Taxonomy)** | 9 大类 33 子类，地基 | S1 ✓ |

---

### 7.4 Progress (档案与趋势)

**目的**：让用户**看到自己的成长**，并提供"反向入口"回到针对性练习。

#### 7.4.1 必须功能

| 功能 | 描述 | Sprint |
|------|------|--------|
| **顶部 4 卡数字** | Submissions / Errors logged / Active days / Most improved | S6 |
| **错误率趋势图** | 多条曲线，按 category 拆分，30/90/365 天可切换 | S6 |
| **错误分布柱状图** | 各 category 累计错误数，水平柱状 | S6 |
| **Top 3 recurring patterns** | 反复犯的 3 个错误，每条带 "Practice" 按钮（→ 生成针对性写作任务） | S6 + S7 |
| **鼓励 banner** | 底部一句正向反馈 | S6 |
| **错误明细页** | 点 category 下钻看所有错误，可跳回原句 | S6 |

#### 7.4.2 不做的事（强决策）

- ❌ Streak / 连续天数（A2-B1 心理脆弱，断签焦虑会赶走用户。改用更柔和的 "Active days"）
- ❌ 等级 / 经验值 / 勋章（gamification 会扭曲"为学习而学"的动机）
- ❌ 排行榜 / 与他人对比（自用产品，且与产品调性冲突）

---

### 7.5 Settings

| 功能 | Sprint |
|------|--------|
| OpenAI API key 校验 + 跳转 OpenAI usage dashboard | S2 |
| 当前 CEFR 等级（手动设置 / AI 估算） | S6 |
| 元语言切换（默认 EN，未来支持 ZH） | v2 |
| 数据导出（导出 SQLite 或 JSON） | v2 |
| 主题切换（深色模式） | v2 |

---

## 8. 错误分类法 (Error Taxonomy) — 产品的灵魂

> **这是 Lumière 最重要的设计决策。**
> 它既是给人看的分类体系，也是 AI 输出的结构化 schema。
> 改它就等于改产品的 DNA。

### 8.1 设计原则

1. **互斥的叶节点** — 任何错误必须能不歧义地归到唯一一个 leaf
2. **粒度控制在 ~33 leaves** — 太多 AI 标签不稳，太少分析没价值
3. **A2-B1 重心下移** — 重 tense / gender / articles，轻 style / register / collocation
4. **无 severity 字段** — 所有错误平权，避免给 AI 增加判断维度

### 8.2 完整 Taxonomy v1

```
GRAMMAR (语法 — 重灾区)
├── conjugation_present       现在时变位
├── conjugation_passe_compose 过去时变位
├── auxiliary_choice          être / avoir 助动词选错
├── tense_choice              时态选择错（présent 用在过去语境）
├── pc_vs_imparfait           ★ passé composé vs imparfait
├── past_participle_agreement 过去分词性数一致
├── subjonctif_basic          基础虚拟式
└── futur_vs_conditionnel     futur / conditionnel 误用

GENDER & AGREEMENT (性数)
├── noun_gender               名词阴阳性错
├── adjective_agreement       形容词性数一致
├── adjective_position        形容词位置
└── article_noun_mismatch     冠词与名词性数不匹配

ARTICLES (冠词)
├── definite_vs_indefinite    le/la vs un/une 选错
├── partitive                 du/de la/des
├── article_omission          该有/不该有
├── negation_de_rule          ★ 否定句中 un/une/des → de
└── contraction               à+le=au, de+le=du

PREPOSITIONS (介词)
├── verb_preposition          动词后接介词错
├── place_preposition         地点介词
├── time_preposition          时间介词
└── general_preposition       其他介词

PRONOUNS (代词)
├── subject_pronoun           主语代词错
├── object_pronoun            COD/COI
├── y_en                      y / en
└── stressed_pronoun          重读代词

NEGATION & QUESTION (否定与疑问)
├── negation_structure        ne...pas 结构
└── question_formation        疑问句结构

VOCABULARY (词汇)
├── wrong_word                用词不对（含 faux ami）
├── anglicism                 英式直译
└── word_form                 词性错

ORTHOGRAPHY (拼写)
├── accent                    重音符号
├── cedilla                   ç 漏写
├── homophone                 同音异形
├── liaison_elision           连读 / 省音 (l'arbre, d'amis)
└── spelling                  其他拼写

SYNTAX (句法)
├── word_order                语序
└── awkward_structure         结构生硬
```

**总计：9 大类，33 个 leaves。**

### 8.3 每条错误的 Schema（AI 必须输出的格式）

```typescript
{
  span: { start: number, end: number },     // 在原文中的字符位置
  original: string,                          // "je vais"
  correction: string,                        // "je suis allé"
  category: ErrorCategory,                   // "Grammar"
  subcategory: string,                       // "tense_choice"
  trigger_context: string | null,            // "Hier"  ← 是什么触发了这个语境
  explanation_en: string,                    // 英文解释
  fr_examples: string[],                     // 2-3 条法语例句
  rule_id: string | null,                    // 关联到规则知识库
  micro_drill: string | null                 // 当场出小练习（可选）
}
```

### 8.4 完整的反馈包（一次提交的 AI 输出）

```typescript
{
  errors: Error[],              // 真正的错误（影响档案统计）
  improvements: Suggestion[],   // 不是错但能更好（不进档案）
  praise: string[],             // ★ A2-B1 鼓励层 ★
  overall_level_estimate: CefrLevel,
  summary_en: string            // 一句话总结，对比上次进步
}
```

### 8.5 Taxonomy 演进策略

- **现在**：A2-B1 重基础语法
- **当用户达到 B2+** 后：扩展 `Style/Register/Collocation` 三个新 category，细分 `subjonctif_basic` 为具体触发词
- **不做** 用户自定义 taxonomy（保持 schema 稳定，否则历史数据无法对比）

---

## 9. 数据模型

### 9.1 ER 图

```
┌────────────┐         ┌──────────────────┐
│ documents  │←───────│ reading_sessions │
│            │         └──────────────────┘
│            │
│            │←───┐
└────────────┘    │
                  │
            ┌─────┴────────┐
            │ writing_tasks │
            └───────┬───────┘
                    │
                    ↓
            ┌──────────────┐
            │ submissions  │
            └───────┬──────┘
                    │
                    ↓
            ┌──────────────┐         ┌────────┐
            │   errors     │────────→│ rules  │
            └──────────────┘         └────────┘
```

### 9.2 6 张表的职责

| 表 | 职责 | 关键字段 |
|----|------|---------|
| `documents` | 用户上传的法语原文 | content, type, estimated_level, reading_progress |
| `reading_sessions` | 单次阅读 + 期间查的词 | duration_seconds, vocabulary_looked_up (JSON) |
| `writing_tasks` | AI 生成的写作任务 | prompt_en, target_words, target_grammar |
| `submissions` | 用户提交的法语作文 | content_fr, feedback_json, praise, summary_en |
| `errors` | **★ 灵魂表 ★** 所有结构化错误 | category, subcategory, trigger_context, explanation_en |
| `rules` | 语法规则知识库 | description_en, examples |

### 9.3 关键设计决策

- **无 user 表**（v0.1 是单用户工具，省一层抽象）
- **errors 表是事件流，不是状态** — 不更新已有错误，每次提交追加新行
- **JSON 字段 vs 关系建模** — `target_words / fr_examples / vocabulary_looked_up` 用 JSON 存（小数组、查询不用 JOIN）
- **timestamp 用 PostgreSQL `timestamp`** — 原 SQLite unix epoch 方案已随数据库迁移弃用
- **外键级联策略**：
  - `submission` 删了 → `errors` 跟着删（cascade）
  - `document` 删了 → `writing_tasks.documentId` 设为 NULL（保留历史作文）
  - `document` 删了 → `reading_sessions.documentId` 设为 NULL（**保留 vocab 学习历史**，而非 cascade 删除）；`documentTitleSnapshot` 字段保留原文档标题，保证 vocab 历史可溯源

---

## 10. 信息架构与导航

```
Lumière
├── Library              ← 入口、素材管理
│   └── Document Reader  ← 阅读 + 划词 + 触发写作任务
├── Practice             ← 任务 + 写作 + 反馈
│   ├── Task Stage
│   └── Feedback Stage
├── Progress             ← 档案与趋势
│   └── Errors Drill-down
└── Settings
```

**强决策**：左侧 200px Sidebar 是固定导航。**不做** 顶栏 tab、不做汉堡菜单（桌面优先工具）。

---

## 11. UI/UX 设计原则

### 11.1 设计语言

| 元素 | 选择 | 理由 |
|------|------|------|
| 主色 | 暖米底 `#FAF8F4` + 法兰西蓝 `#3B5BA9` | 阅读友好、不刺眼，避免"科技公司"或"游戏化"廉价感 |
| 卡片 | 白底 + 极轻阴影 + 16px 圆角 | 学术工具感，不浮夸 |
| 标题字体 | Source Serif 4 | 与法语印刷物气质一致 |
| 正文字体 | Inter | 现代、可读性高 |
| 阅读字体 | Source Serif（正文 18px / 行距 1.75） | "阅读沙龙"的关键 |
| 图标 | Lucide line icons (1.7 stroke) | 比 emoji 更稳定一致 |
| 交互反馈 | 只有 hover/focus，无声音、无震动、无动画 | 安静学术感 |

### 11.2 故意不做的事（强决策）

- ❌ Streak / 连击 / 经验值
- ❌ 排行榜 / 排名
- ❌ 弹幕 / 通知 / 红点 badge
- ❌ 庆祝动画 / 烟花 / confetti
- ❌ 角色扮演 / 卡通形象 / 拟人化 AI
- ❌ Onboarding 引导 tour（第一次进就可用）

### 11.3 关键页面线框已交付

详见根目录下的 mockup 截图（与本 PRD 配套交付）：
- `french-app-library-screen.png`
- `french-app-document-reader.png`
- `french-app-feedback-screen.png`
- `french-app-progress-dashboard.png`

---

## 12. 技术架构

### 12.1 技术栈（v0.1）

| 层 | 选择 | 理由 |
|----|------|------|
| 框架 | Next.js 16 (App Router) + React 19 + TypeScript | 一套代码搞定 UI + API；Server Actions 直调 OpenAI 最干净 |
| 样式 | Tailwind CSS v4 + 自定义 CSS 变量 | 个人项目最快迭代速度；Tailwind v4 性能足够 |
| 数据库 | **PostgreSQL** via `node-postgres` + Drizzle ORM | 原 SQLite 方案（见 v0.1.1 变更日志）在 S3.5 前迁移至 Azure PostgreSQL，以支持多设备访问和 S4+ 的并发写入需求；Drizzle schema 使用 `pgTable / jsonb / timestamp` |
| AI | OpenAI API（GPT-4o / GPT-5）+ Structured Outputs (Zod) | 结构化输出最可靠；批改场景刚需 |
| UI 原语 | Radix UI (Dialog / Popover / Slot) | 无依赖 lock-in，组件代码在自己仓库里 |
| 图标 | Lucide React | 与 Radix 风格一致，体积小 |
| 字体 | Inter + Source Serif 4 (next/font) | 自托管，无 FOUT |
| 图表 | Recharts (S6 引入) | React 集成最干净 |

### 12.2 部署模型

| 阶段 | 部署 |
|------|------|
| **v0.1** | `npm run dev` 本地跑 |
| v0.2 候选 | Tauri 打包成 .app（如果觉得"开浏览器"麻烦） |
| v1.0 候选 | Vercel + Postgres / Turso（如果做多用户） |

### 12.3 AI 模型选型策略

| 场景 | 默认模型 | 备选 | 理由 |
|------|---------|------|------|
| 划词解释 | `gpt-4o-mini` | `gpt-4o` | 高频 + 低延迟需求，成本敏感 |
| 写作任务生成 | `gpt-4o` | `gpt-5` | 中频 + 需要创意，质量优先 |
| 写作批改 | `gpt-4o` | `gpt-5` | **质量绝对优先**，单次成本可接受 |

**强决策**：所有 AI 调用必须使用 Structured Outputs (Zod schema)，**不允许** "解析自由文本 JSON"。

### 12.4 数据隐私

- **v0.1**：所有数据存本地 SQLite，仅 OpenAI 调用会出网（用户的写作内容会发给 OpenAI）
- 用户应被明确告知"提交的内容会发送给 OpenAI 进行批改"
- 未来 v2 候选：本地模型选项（Ollama + Mistral / Qwen），完全离线

---

## 13. 实施路线图 (Roadmap)

### 13.1 Sprint 概览

| Sprint | 主题 | 价值交付 | 状态 |
|--------|------|---------|------|
| **S1** | 脚手架 + DB schema + Library + Reader 基础 | 能读自己的法语文章 | ✅ 已完成 |
| **S2** | 划词查询（OpenAI）+ 阅读进度追踪 + 词汇收集 | 阅读体验已超过 NotebookLM | next |
| **S3** | "Generate Writing Task" 闭环上半部分 | 拿到第一份个性化作文题 | |
| **S4** | **★ 写作批改核心 ★** 结构化反馈 + 错误归档 | 第一次拿到结构化反馈 | |
| **S5** | 错误档案页 + Micro-drill | 错误开始"沉淀" | |
| **S6** | Progress Dashboard + 趋势图 | 你能看到自己长期变化 | |
| **S7** | 学习者档案融合到任务生成 | 闭环关上 | |

### 13.2 各 Sprint 详细范围

#### Sprint 1 ✅
- [x] Next.js 16 + TS + Tailwind v4 脚手架
- [x] 6 张表的 Drizzle schema + migration
- [x] 错误 Taxonomy 常量
- [x] 暖米底 + French blue 设计系统
- [x] Sidebar 全局导航
- [x] Library 页（Continue Reading + List + Filter chips placeholder）
- [x] Add Document 对话框（Server Action + Zod 校验）
- [x] Document Reader 基础阅读视图
- [x] 3 篇示例文章 seed
- [x] Placeholder 页面（Practice / Progress / Settings）
- [x] README + .env.example

#### Sprint 2（next）
- OpenAI client 封装 + key 配置 UI
- 划词触发 popover（Radix Popover + 选区监听）
- AI 词义解释 endpoint（Structured Output: translation, conjugation, in_context, examples）
- "Save to vocabulary" 持久化到 reading_sessions
- This Session 侧栏（实时 vocab 列表 + 计时）
- 阅读进度 IntersectionObserver

#### Sprint 3
- "Generate Writing Task" Server Action（输入：document + collected vocab → 输出：prompt_en + targets）
- Practice / Task Stage 页面（任务卡 + 写作输入）
- Submit 跳转到 Feedback Stage（loading 状态）

#### Sprint 4（★ 灵魂 Sprint ★）
- 完整反馈 Zod schema 定义
- 写作批改 Server Action（OpenAI structured output）
- 错误数据写入 errors 表
- Feedback Stage 三栏布局
- 内联高亮 + 编号上标
- 错误卡 / Praise / Improvement 三种卡片
- "Show full correction" 二次点击交互

#### Sprint 5
- Errors archive 页面（按 category 浏览）
- 点击错误跳回原句（需要存 submission 的 contentFr 引用）
- Micro-drill UI（错误卡内入口 → 出 2 句小练习）

#### Sprint 6
- Progress Dashboard 页（4 卡 + 趋势图 + 分布图 + Top 3 patterns）
- Recharts 集成
- 趋势计算（按周/月聚合）

#### Sprint 7
- Learner Profile 数据结构（汇总自 errors 表）
- 写作任务生成时注入 profile 作为上下文
- "Practice" 按钮从 Progress 页直跳生成针对性任务

### 13.3 v2+ 候选功能（未排期）

- SRS 间隔重复（基于 errors 表自动生成复习卡）
- PDF / EPUB 解析
- 网页剪藏 / YouTube 字幕导入
- 听力填空（Whisper 强制对齐）
- 跟读评分
- 多用户 + 账号系统
- 移动端
- 桌面 app（Tauri）
- 本地模型选项（Ollama）

---

## 14. 成功度量

### 14.1 主观指标（v0.1 自用阶段唯一重要的指标）

> **作者每周至少自发使用 3 次，连续 4 周。**

如果做不到这一点，说明产品有根本问题（要么功能不够、要么体验有阻力），任何客观指标都失去意义。

### 14.2 客观指标（v0.1 后期开始追踪）

| 指标 | 目标 | 测量方式 |
|------|------|---------|
| 读 → 写转化率 | > 30% 的阅读会话转成至少一次提交 | 对比 reading_sessions 与 submissions 数量 |
| 反馈完整性 | 95% 的提交收到 ≥1 条结构化反馈 | submissions JOIN errors |
| 错误标签准确率 | 抽样 50 条错误，>= 90% 的 category 标对 | 人工评估 |
| 长期趋势可见性 | 30 天后能看到至少 3 个 category 的明显趋势变化 | Progress 页 |

### 14.3 反指标（出现就要警惕）

- 用户花在阅读上的时间 ÷ 写作时间 > 5：说明输出环节没真正激活
- 同一个错误反复出现且没下降：说明反馈没真正起作用
- "Add Document" 点击量持续走低：说明素材枯竭，需要剪藏功能

---

## 15. 风险与开放问题

### 15.1 已识别的风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| OpenAI 批改质量不稳定 | 反馈错误会误导学习 | S4 上线后先人工抽样校准 prompt；保留 raw feedback JSON 便于回溯 |
| Taxonomy 与真实错误不匹配 | 大量错误被归到 "wrong_word" 兜底 | S4-S5 阶段每周回看分布，必要时新增 leaf |
| AI 成本失控 | 高频划词 + 长批改 = 月成本可观 | 划词用 mini 模型；批改控制 max_tokens；本地缓存重复查询 |
| 用户（即作者）写得太少导致档案稀疏 | Progress 没东西可显示 | S6 加 "至少 N 次提交才解锁某些图表"提示 |
| 法语字符 / 重音处理 bug | 划词、span 定位错位 | 全程用 NFC normalization；测试覆盖加 é/è/ê 等 |

### 15.2 开放问题（需要后续决策）

1. **划词 popover 的"in this context" 由通用模型生成 vs 预先建索引？**
   - 倾向：先 LLM on-the-fly（成本可接受，灵活）
2. **Praise 应该有多少条？过多会显得敷衍，过少没鼓励作用。**
   - 倾向：每次 1-3 条，AI 决定
3. **错误"对/错"二元 vs 软评分？**
   - 决策：保持二元，避免引入主观判分
4. **Submission 是否应该支持版本历史（修改后再提交）？**
   - 倾向：v1 不支持，v2 视使用情况
5. **"micro_drill" 是否计入 errors 统计？**
   - 决策：不计入，仅作为 follow-up 练习不污染主档案

---

## 16. 范围外 (Out of scope) — 明确不做的事

为了让产品聚焦，以下功能在 v1 内**明确不做**，提出需要走变更流程：

- 听力 / 发音训练（口语和听力另有更合适的工具）
- 视频 / 音频内容
- 词典本身（用户应该用 WordReference / Larousse，Lumière 不重复造）
- Quiz / Multiple Choice 题型
- Flashcard / SRS 复习卡
- 脑图 / 总结生成（与 NotebookLM 重叠，不卷）
- 多语言（暂时只支持法语 → 用户的英文/中文反馈）
- 协同 / 共享 / 老师批改
- 移动端原生 app
- 离线工作（除非未来上本地模型）

---

## 附录

### 附录 A. 反馈 JSON 完整 schema 示例

```json
{
  "errors": [
    {
      "span": { "start": 23, "end": 30 },
      "original": "je vais",
      "correction": "j'allais",
      "category": "Grammar",
      "subcategory": "tense_choice",
      "trigger_context": "Quand j'étais enfant",
      "explanation_en": "The phrase 'Quand j'étais enfant' establishes a habitual past context, which requires the imparfait tense rather than the present.",
      "fr_examples": [
        "Quand j'étais petit, j'allais à l'école à pied.",
        "Elle allait souvent au marché le samedi."
      ],
      "rule_id": "imparfait_for_habitual_past",
      "micro_drill": "Write 2 more sentences starting with 'Quand j'étais...' using the imparfait."
    },
    {
      "span": { "start": 47, "end": 56 },
      "original": "le maison",
      "correction": "la maison",
      "category": "GenderAgreement",
      "subcategory": "noun_gender",
      "trigger_context": null,
      "explanation_en": "'Maison' is a feminine noun in French, so it requires the feminine definite article 'la'.",
      "fr_examples": [
        "La maison de mes parents est grande.",
        "Cette maison a été construite en 1920."
      ],
      "rule_id": "feminine_nouns_ending_in_son",
      "micro_drill": null
    }
  ],
  "improvements": [
    {
      "span": { "start": 80, "end": 95 },
      "original": "c'était bien",
      "suggestion": "c'était merveilleux",
      "explanation_en": "Stylistic upgrade: 'merveilleux' is more vivid than 'bien' for describing a memorable experience."
    }
  ],
  "praise": [
    "Great use of 'malgré tout' — natural placement and accurate meaning.",
    "Your sentence rhythm is improving — varied lengths feel more natural."
  ],
  "overall_level_estimate": "B1",
  "summary_en": "Tense usage is your main growth area — the same imparfait/passé composé confusion appeared in your last 4 submissions. Gender agreement is improving steadily."
}
```

### 附录 B. 写作任务 prompt 模板示例（v0.1 first draft）

> System: You are an expert French teacher creating writing tasks for a student at level {{level}}. The student has just read the following text. Generate a writing task that requires the student to use specific vocabulary from the text and practice specific grammar points.
>
> User: Document title: {{title}}
> Document type: {{type}}
> Document excerpt: {{first_500_chars}}
>
> Vocabulary to incorporate (must be used): {{collected_words}}
> Grammar points to target (from learner's weak areas): {{weak_grammar_subcategories}}
>
> Output format (JSON, conform to TaskSchema):
> - prompt_en: A clear, engaging task instruction in English (2-3 sentences)
> - target_words: array of strings (subset of collected_words actually required)
> - target_grammar: array of subcategory IDs
> - difficulty: CEFR level
> - min_word_count: integer
> - max_word_count: integer

### 附录 C. 与本 PRD 配套的设计稿

详见 v0.1 mockup（在跟作者的对话中已交付，未提交到本仓库）：
- Library 页
- Document Reader（含划词 popover）
- Practice / Feedback 页
- Progress Dashboard

---

## 变更日志

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-05-05 | v0.1 | 初始版本，与 Sprint 1 同时交付 |
| 2026-05-15 | v0.1.1 | **Sprint 3.5 决策同步**：(1) 数据库从 SQLite 迁移至 Azure PostgreSQL，§12.1 强决策替换；(2) `reading_sessions` 删除文档时改为 SET NULL（不再 cascade），新增 `documentTitleSnapshot` 字段；(3) §7.5 API key 余额测试澄清为 key 有效性校验 + 跳转 OpenAI dashboard；(4) §7.1.2 错误 chip 跳转签名定为 `/progress?documentId=<id>`；(5) §7.3.3 新增 `target_words` 强约束规则 |

---

*本 PRD 由作者本人编写，作为 Lumière 项目的产品宪法。任何与本文档冲突的实现选择需要在 PR 中明确说明、并在变更日志中记录。*
