# 任务效果量化：首轮真实模型与固定工作流

2026-10-21，**8 个合成开发任务，一次顺序执行**。这是可复现的端到端工程评测，不是隐藏测试集、真实财报准确率或银行生产效果。数字判定不使用模型自评。

| 指标 | 固定工作流 | 晨涧云真实模型选工具 |
|---|---:|---:|
| 完整任务通过 | 8 / 8（100%） | 7 / 8（87.5%） |
| 数值正确（6 个计算任务） | 6 / 6 | 6 / 6 |
| 来源完整且匹配（6 个计算任务） | 6 / 6 | 6 / 6 |
| 按预期拒绝（2 个拒绝任务） | 2 / 2 | 1 / 2 |
| 请求耗时 p50（每组 n=8） | 0.00156 s | 3.55141 s |
| 请求耗时 p95（每组 n=8） | 0.00200 s | 5.57159 s |
| 模型请求数 | 0 | 15 |
| 提供商报告的总 tokens | 0 | 7,471 |
| 用量缺失的调用 | 0 | 0 |

两组共享相同来源、Python 计算与来源核对工具。固定组输入明确的操作枚举；模型组输入中文自然语言，由模型选择工具。**它们不是同等输入条件下的模型准确率竞赛。** 这轮证明已接通“中文请求 → 受限工具 → 计算 → 原文引用”，没有证明 AI 比固定流程更准确、更快或降低人工成本。确定性流程保持默认入口；模型提供自然语言路由，但增加等待、用量及决策失败点。

## 首轮失败，没有删去或重跑取最好成绩

`missing-prior`：选择 Aurora / 2023，要求计算相对 2022 的收入同比；资料没有 2022。

- 固定组返回 `FACTS_NOT_FOUND`，通过。
- 真实模型组返回 `AGENT_TOOL_REJECTED`，一次请求、295 tokens、约 1.83 秒。
- 系统拦截了不合规工具决策，没有金融答案、事实、计算或引用。安全边界生效，但没有完成预期的缺数据语义，因此本任务仍判失败，不能把“任意报错”计成正确拒绝。
- 原始无效模型内容未记录；现有证据只支持“不符合允许工具／参数契约”，不能猜测具体字段或推断模型动机。下一轮先添加脱敏的 schema 错误类别，观察后再改进；不能放宽工具权限或删除该题。

首轮数据固定后没有为提高分数重新调用。后续修复应使用新的运行记录和提交，保留这次失败及全部分母。开发集已公开，可用于回归；应另建未用于调试的更大独立集，才可评估泛化。

## 数据与判定

[公开题目与字面预期](../evaluation/development_cases.json)：两家公司 × 三个指标（毛利率、收入同比、毛利率百分点变化），再加缺前期和实时股价请求。四份报告、八个事实全部虚构。

[完整逐题请求结果／耗时／用量／判定](validation/development-evaluation-2026-10-21.json) 记录源码提交 `9cc3b6c`、题集 SHA256、开始时间和全部输出。题目与判定器在真实执行前提交；模型只接收问题和选定范围，不接收 expected_display、expected_citation_ids 或 judge 结果。

判定器 [scripts/evaluate.py](../scripts/evaluate.py)：

- 数值：必须是 CALCULATED、预期操作、唯一计算结果、精确 display；正负号、百分比与百分点不可混用。
- 来源：引用 ID 必须与预期集合一致且无重复；逐项检查公司、年份、页码、文档 ID、源文件 SHA256、第一段原文、SYNTHETIC 标识；计算也必须引用完整集合。
- 拒绝：只接受题目列出的预期状态，且无答案／事实／计算／引用；超时、网络错误、无效工具不算业务成功。
- 耗时：同一台本机、串行、两组均走回环 HTTP，从发出请求到完整结果；不是并发或公网服务测试。p50 用中位数，p95 用 nearest-rank；n=8 时 p95 就是最大值，不足以估计稳定尾延迟。
- 用量：汇总提供商响应；失败请求同样计量，未返回用量则标记 unknown，绝不当作零。未核实实际账单／单价，所以不换算费用。网关返回的 model 标识是提供商声明，不是独立权重审计。

判定器自身有反例测试：篡改数值、年份、原文时不能通过；超时不能计为正确拒绝；失败仍计入分母和已知 tokens。最初离线脚本误写缺数据状态名，产生 7/8；已在真实执行前对照现有接口修正为 FACTS_NOT_FOUND，这是测试预期错误，不是产品修复，历史日志保留在本地制作材料。

## 复跑

```sh
# 离线固定工作流，8 个任务，无模型调用
python3 scripts/evaluate.py --output evaluation-result.json

# 另一个终端，隐藏输入本机密钥并启动回环服务
python3 scripts/start_model.py

# 显式真实调用，两组走同一个本地服务；可能产生 API 费用
python3 scripts/evaluate.py --live --output evaluation-result.json
```

一次评测固定八题，每题最多四次模型调用、每次最多 256 输出 tokens；格式修复包含在次数内，不重试网络失败。此次数／输出限制不是提供商账单保证。脚本逐题保存，失败保留结果并退出 1；不要删掉失败或把进程退出 1 当成无结果。CI 只运行离线组，不读取密钥或触发付费调用。

## 工程验证与业务效果分开

2026-10-21 工作台发布时本地 Python 176 项通过，JS 7 项（含 24 个 Python 对照），真实浏览器静态与 Python 模式各 14 个流程检查。它们证明特定边界与流程可复现，**不并入上述 8 题效果分母**。当前未测真实资料提取质量、人工节时、金融决策收益、组织权限或生产 SLA。最终发布以精确提交的 CI 和公开站点实测为准。

## Evidence handoff evaluation (2026-10-22)

Run `python3 scripts/build_web.py` then `node scripts/evaluate_replay.mjs --output replay-evaluation.json`. The authored synthetic development set contains 18 single corruptions and 10 valid controls (8 literal financial results plus NO_MATCH/facts). Observed detection: 18/18, compared with 0/18 for accepting any parseable JSON; valid acceptance plus expected display: 10/10. This deliberately weak baseline is not a competitor benchmark. Script reports per-case outcomes/timing and denominators. No hidden/real-report or human-time-saving claim; zero model calls. Original live model 7/8 remains unchanged. See HANDOFF_REPLAY for first failures, contract and limitations.


### File identity usability contract (2026-10-22)

`node tests/browser-handoff-identity.cjs` checks three file-identification sequences at two widths: first file, changed name/bytes and same name/different bytes. Baseline 9c469be satisfies 0/6 visible name/digest/report contracts; the new local build satisfies 6/6 on both static and Python workbenches. The full suite has 20 checks per mode, including 14 boundary checks (20/20 locally). These are authored synthetic UI acceptance cases, not human usability scores, financial accuracy or a model benchmark. Hash expectations use Node crypto over actual input bytes; browser and downloaded reports must agree. First failed test fixtures and limits are recorded in HANDOFF_REPLAY. No paid calls or live evaluation rerun.

## PDF preflight acceptance (2026-10-23)

Run the two browser-pdf scripts via pnpm test:browser. 17 authored scenarios × 2 widths = 34/34 locally; 3/3 injected resource-failure cases pass after preserving the initial 2/3 failure. Twelve generated PDF fixtures plus a byte-limit File exercise extraction/page mapping and refusals; real-report quality, OCR/table accuracy and human time saved are unmeasured. The separate fixed workflow remains 8/8; the original real-model development run remains 7/8 with FE-013 open and no paid rerun. See PDF_INTAKE for test-fixture errors and parser recovery limits.
