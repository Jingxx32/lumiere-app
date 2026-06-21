# TODO — AI 成本优化（Tier 1 / Tier 2 模型选择）

> 状态：**未来优化方向，暂不实施**
> 记录日期：2026-06-21
> 背景：个人单用户 app，当前成本极低，此文档是上量或想省钱时的参考。

## 当前的两层 AI 模型

词汇查词功能采用两层模型（two-tier），对应两次不同的 AI 调用：

| 层级 | 触发时机 | 当前模型 | 单次成本（约） | 说明 |
|---|---|---|---|---|
| **Tier 1** 查词 | 划词时（cache miss） | `gpt-4o-mini` | ~$0.0002 | 轻量：翻译 / in-context / 例句 + lemma |
| **Tier 2** 富词条 | 点 Save 时 | `gpt-4o` | ~$0.011 | 完整 `verb_schema_spec.md` 词条（动词变位表等） |

> 其他用到 `gpt-4o` 的地方：写作任务生成（task generation）、写作反馈（feedback）。配置在 `src/lib/ai/client.ts` 的 `MODELS`。

**关键事实：花钱的大头是 Tier 2 和写作反馈（`gpt-4o`），不是查词。** 查词 1000 次也就 ~¥1.4；Tier 2 每次 ~¥0.08。

## 三家厂商最便宜模型价格对比

> 价格为每百万 token（输入 / 输出）。Gemini 数据为训练知识估算（截止 2026-01），以官方 [ai.google.dev/pricing](https://ai.google.dev/pricing) 为准。

| 厂商 / 模型 | 输入 | 输出 | 相对 gpt-4o-mini |
|---|---|---|---|
| Gemini 1.5 Flash-8B | ~$0.0375 | ~$0.15 | ~0.25× |
| Gemini 2.0 Flash-Lite | ~$0.075 | ~$0.30 | ~0.5× |
| **OpenAI gpt-4o-mini**（当前 Tier 1） | $0.15 | $0.60 | 1× |
| Claude Haiku 4.5 | $1.00 | $5.00 | ~7× |

**便宜排序：Gemini < OpenAI < Claude。** 但单用户量级下绝对差额极小（1000 次查词三家差不到 ¥1）。

## 优化方向（按性价比排序）

### 方向 A：零迁移成本 —— Tier 2 降级到 gpt-4o-mini（推荐先试）
- 把 `MODELS.task`（或单独给 enrich 用的模型）从 `gpt-4o` 降到 `gpt-4o-mini`。
- 词条生成是结构化输出，mini 大概率够用；**写作反馈需要准确性，建议保留 gpt-4o**。
- 改动：`src/lib/ai/client.ts` + 验证 enrich 输出质量。
- 收益：Tier 2 单次从 ~$0.011 → ~$0.0002，**降一个数量级**。

### 方向 B：换厂商到 Gemini（量大时才值得）
- 查词类简单任务 Gemini Flash 系列足够，价格约 OpenAI 一半。
- **迁移成本不低**：要改 `client.ts`、`lookup.ts`、`enrich.ts` 的调用方式，结构化输出从 Zod `zodResponseFormat` 改成 Gemini 的 `responseSchema` 格式，并重测所有 AI 流程。
- 单用户场景**不划算**——省的钱填不平改造和调试时间。

### 方向 C：换厂商到 Claude
- Claude Haiku 4.5 查词比 OpenAI 贵 ~7×，**不考虑**。
- 但 Tier 2 如果对比的是 `gpt-4o`：Haiku 4.5 单次 ~$0.005，反而比 gpt-4o 便宜约一半（因为 gpt-4o 本身贵）。若想要 Claude 的输出质量，这是个选项；否则方向 A 更省。

## 决策建议

1. **现在**：维持 OpenAI 全家桶，代码已成形、成本可忽略。
2. **想省钱的第一步**：执行方向 A（Tier 2 → gpt-4o-mini），零迁移、立即见效。
3. **真正考虑换 Gemini 的触发条件**：
   - app 开放多用户、调用量上一个数量级；或
   - TCF 听力要做原生音频理解/生成（Gemini 音频能力是强项）。

## 相关文件
- `src/lib/ai/client.ts` — 模型配置 `MODELS`
- `src/lib/ai/lookup.ts` — Tier 1 查词
- `src/lib/ai/enrich.ts` — Tier 2 富词条
- `src/lib/ai/feedback.ts` — 写作反馈（gpt-4o）
