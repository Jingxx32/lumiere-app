# TCF 错题闭环（错题沉淀 + 智能重刷 + 考点画像）— 设计文档

日期：2026-07-06
状态：已与用户确认核心决策，待审阅

## 1. 概述

把 TCF 刷题模块从「一次性自测」升级为「错题沉淀 → 智能重刷 → 考点画像」的闭环，与平台「每个错误沉淀进学习者画像」的核心理念对齐。

当前缺口：

- Drill 模式的作答结果完全不落库（仅 localStorage 存「已做」标记），无法复盘错题、无法按薄弱点重刷
- Exam 模式只存总分 + per-level 汇总（`tcf_attempts`），逐题答案交卷后即丢，历史卷无法回顾
- 没有考点维度：只能按 CEFR level / 题型看数据，无法定位「推断题弱」「连接词不熟」这类真实薄弱项

题库规模（现状）：听力 1638 题 + 阅读 1521 题 ≈ 3200 题。

## 2. 已确认的核心决策

| 决策点 | 结论 |
|---|---|
| 备考阶段 | TCF Canada 长期备考 → 优先错题闭环，不做计时器/NCLC 换算（冲刺期再说） |
| 错题价值 | 智能重刷队列 + 考点归因到画像；AI 逐题解析暂不做 |
| 考点体系 | **新建一小套理解考点标签**（7 个），不复用写作错误体系（面向产出错误，不适配理解题） |
| 打标方式 | AI（gpt-4o-mini）批量预打标签，脚本幂等可续跑，全库约 $1–2 |
| 重导入取舍 | `tcf_question_attempts.question_id` 用 cascade delete——重新导入某套题会清掉该套题的逐题答题历史。个人应用、重导入罕见，可接受；`tcf_attempts` 整卷总分不受影响 |
| 「已做」状态 | 从 localStorage 改为数据库派生；移除「清除记录」按钮（答题历史是数据资产） |
| 智能队列 | 纯 SQL + JS 打分排序，不用 AI |

## 3. 数据模型

### 3.1 新表 `tcf_question_attempts`

每答一题写一行（drill 即答即写；exam 交卷时批量写）：

```
id               uuid PK, defaultRandom
question_id      uuid NOT NULL → tcf_questions(id) ON DELETE CASCADE
mode             tcf_attempt_mode enum: 'drill' | 'exam'
exam_attempt_id  uuid NULL → tcf_attempts(id) ON DELETE SET NULL   -- drill 时为 null
chosen           integer NOT NULL   -- 所选选项 0–3
correct          boolean NOT NULL
answered_at      timestamptz NOT NULL defaultNow

索引：question_id、answered_at、exam_attempt_id
```

`correct` 冗余存储（可由 chosen 与 question.answer 推出）：换取聚合查询（错误率、队列排序）不用 join 比较，且题目答案若被修正，历史记录仍反映当时判定。

### 3.2 `tcf_questions` 加列

```
skill_tags  jsonb NULL  $type<string[]>   -- 考点标签 id 数组，1–2 个；null = 未打标
```

### 3.3 新文件 `src/lib/tcf/tags.ts`

仿 `src/lib/taxonomy.ts` 模式：单一数据源定义标签 id、法语/中文标签、说明（供 AI prompt 用）、颜色 token。

| id | 考点 | 判定要点（AI prompt 依据） |
|----|------|------|
| `vocab` | 词汇缺口 | 答对关键是认识某个词/短语 |
| `syntax` | 长难句解析 | 关键信息藏在复杂句式（从句、被动、倒装）里 |
| `inference` | 推断 / 言外之意 | 答案未明说，需从上下文推断 |
| `detail` | 细节定位 | 信息明说，考快速定位与匹配 |
| `connectors` | 逻辑连接词 | 考 pourtant/donc/bien que 等连接词的逻辑关系 |
| `numbers_time` | 数字 / 时间 / 日期 | 考数字、时刻、日期、价格的听辨/读取 |
| `register_intent` | 语域 / 说话人意图 | 考「谁在说、对谁说、为什么说」（告示/留言/广告的功能） |

每题主考点必填 1 个，次考点可选 1 个（数组第 0 位为主考点）。

## 4. 作答落库

### 4.1 Server actions（`src/lib/actions/tcf.ts` 扩展）

- `recordTcfQuestionAttempt({ questionId, mode: 'drill', chosen, correct })` — drill 单条写入。不 revalidate（drill 页是 client 组件持状态，无需刷新）。
- `recordTcfExamAttempt` 扩展：入参增加逐题答案数组，同一事务内先插 `tcf_attempts` 拿 id，再批量插 `tcf_question_attempts`（mode='exam'，带 exam_attempt_id）。未作答的题不写行。
- `getTcfQuestionStats(skill, level)` — 返回该组题的聚合：每题 wrongCount / correctCount / lastCorrect / lastAnsweredAt，供 drill 页派生「已做」标记与智能排序。

### 4.2 客户端改动

- **DrillRunner** `choose()`：写本地 UI 状态后 fire-and-forget 调 `recordTcfQuestionAttempt`（与现有 exam 落库同模式，`.catch(() => {})`）。「Afficher réponse」只看答案不算作答，不写库、不再标记「已做」。
- **ExamRunner** `handleFinish()`：把 `answers` 映射为逐题数组一并传给扩展后的 `recordTcfExamAttempt`。
- **`use-done-questions` 退役**：drill 页服务端预取 `getTcfQuestionStats`，「已做」= 有任意 attempt 记录。localStorage 旧数据不迁移（无对错信息，无迁移价值）。移除「清除记录」按钮。

## 5. 智能重刷队列

Drill 页 URL 加 `mode` 参数，三种模式（LevelNav 上方加分段切换控件）：

- **`ordre`（默认，现状不变）**：按 test → orderIndex 顺序
- **`malin`（智能）**：服务端按优先级排序——
  1. 错过且未刷回来的（`wrongCount > 0 && !lastCorrect`），错误次数多者优先
  2. 未做过的
  3. 做对过的，按 `correctCount` 升序、`lastAnsweredAt` 越久远越靠前
- **`erreurs`（只刷错题）**：仅保留「最近一次做错」的题（`lastCorrect = false`）

排序在 server component 完成（复用 `getTcfDrillQuestions` + `getTcfQuestionStats` 在内存中打分），不引入复杂 SQL。

LevelNav 在智能/错题模式下每题显示状态点：红 = 错过未回、灰 = 未做、绿 = 已做对。

标签打好后的增强（同 sprint 内、排序器预留接口）：`malin` 模式对「薄弱考点」的题加权提前——薄弱考点 = 按 §7 的聚合中错误率最高的标签。

## 6. AI 批量打标脚本

`scripts/tag-tcf-questions.ts`（模式仿 `scripts/reenrich-vocab.ts`）：

- 查询 `skill_tags IS NULL` 的题，每批 20 题
- 输入：questionText + options + 正确答案 + transcript/passage（截断至合理长度）；listening/reading 分别有轻微不同的 prompt 措辞
- 模型：`OPENAI_MODEL_ENRICH`（默认 gpt-4o-mini），Zod 校验输出 `{ id, tags: [主考点, 次考点?] }[]`，非法标签 id 拒绝并重试该批一次
- 幂等可续跑：只处理未打标的题；单批失败跳过并记录，结尾汇总
- npm script：`npm run tcf:tag`
- 图片题（passage 为 null 且只有 imagePath 的阅读题）：无文本可分析，跳过打标（`skill_tags` 保持 null），聚合面板中归入「未分类」

## 7. 画像接入 + 历史卷回顾

### 7.1 Progress 页「TCF 薄弱考点」卡片

- 数据：`tcf_question_attempts` join `tcf_questions.skill_tags`，按**主考点**聚合错误率（错误数 / 作答数），listening / reading 分列
- 展示：横条图（recharts，复用现有图表风格与颜色 token），条上标注 `错 x / 共 y`；作答数 < 5 的标签显示但淡化（样本太小）
- 位置：progress 页与现有 `tcf-attempts` 列表相邻

### 7.2 历史卷回顾 `/tcf/exam/review/[attemptId]`

- Progress 页的 TCF 成绩列表每条变为链接
- 页面：server component 取 `tcf_attempts` + 关联的逐题 `tcf_question_attempts` + 题目，复用 `ExamRunner` 的 finished 态渲染（ExamRunner 加 `initialAnswers` + `readOnly` props，跳过作答与交卷逻辑）
- 本设计之前的历史 attempt 没有逐题数据：回顾页显示总分 + per-level，并提示「此次考试无逐题记录」

## 8. 错误处理

- 落库 action 失败：drill/exam 均 fire-and-forget + `.catch`，不打断练习（与现有 `recordTcfExamAttempt` 一致）；最坏情况丢单条记录，可接受
- 打标脚本：批级重试一次，仍失败则跳过该批续跑，退出码非 0 提示有遗留
- 回顾页 attemptId 非法/不存在：`notFound()`

## 9. 测试 / 验证

项目无测试套件，沿用手动验证：

1. drill 答题 → 查库确认 attempt 行；刷新页面「已做」标记仍在；换浏览器标记一致
2. exam 交卷 → `tcf_attempts` + 39 行逐题记录同事务落库；progress 列表可点进回顾页
3. `npm run tcf:tag` 跑一小批 → 抽查标签合理性 → 全量跑
4. 智能模式：制造错题后确认排序（错题 > 未做 > 已对）；「只刷错题」过滤正确
5. progress 薄弱考点卡片数字与 SQL 手查一致

## 10. 实施顺序

1. 数据模型（迁移：新表 + 加列）+ 落库路径（§3–4）——先跑起来积累数据
2. 打标脚本（§6）+ 全量打标
3. 智能队列（§5，含考点加权）
4. 薄弱考点面板 + 历史卷回顾（§7）

## 11. 明确不做（本期）

- 计时器、NCLC/TCF 699 分数换算、考试锁定模式（冲刺期功能）
- AI 逐题解析（`explanation` 列已预留，未来可加）
- 听力音频 TTS 生成（已有 `generate-tcf-audio.py` 管线，独立事项）
- 写作错误体系与 TCF 考点标签的合并
