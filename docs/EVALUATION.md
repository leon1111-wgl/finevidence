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

Run the two browser-pdf scripts via pnpm test:browser. 17 authored scenarios × 2 widths = 34/34 locally; 4/4 injected resource-failure cases pass after preserving the initial 2/3 library-retry failure and expanded 3/4 sample-download deadline failure. Twelve generated PDF fixtures plus a byte-limit File exercise extraction/page mapping and refusals; real-report quality, OCR/table accuracy and human time saved are unmeasured. The separate fixed workflow remains 8/8; the original real-model development run remains 7/8 with FE-013 open and no paid rerun. See PDF_INTAKE for test-fixture errors and parser recovery limits.


## FE-018 resource-recovery acceptance (2026-10-23)

Eight authored browser scenarios (four resource-lifecycle sequences × desktop/narrow widths) changed from 0/8 on 82ab62c to 8/8 on each fixed local static/Python build. The missing behavior was a fresh explicit retry while the original module request stayed pending; the same unchanged assertions then also cover late-settlement isolation, real parser/export identity and success-cache reuse. Reproduce with `node tests/browser-pdf-loading.cjs`; BASE_URL selects the surface, BROWSER_ARTIFACTS stores raw per-case outcomes and screenshots. No retry-until-pass selection or model invocation is performed. The independent review's earlier public/Python 0/2 is a separate denominator. Tests and fault timing are synthetic engineering evidence, not real financial quality or saved analyst time; first live model7/8 and FE-013 remain unchanged. See PDF_INTAKE for root cause and dynamic-import cancellation limits.


## Failure-evidence retention (2026-10-23)

`pnpm test:browser-report` checks two authored startup failures against the real PDF fault-runner subprocess. Complete report retention was0/2 at8ee1830 and is2/2 locally after FE-019: fixed4 planned cases, prior-pass retention, initialization phase, explicit not_run, nonzero child exit and no private-content canary in diagnostics. The normal four PDF fault cases are a separate control,4/4 per local static/Python surface. Neither denominator counts as a financial task or real-data metric. No paid call; live-model7/8/FE-013 unchanged. See BROWSER_FAILURE_EVIDENCE; original failed reports/logs remain retained in local review materials.

## 2026-10-23 待核验财务草稿增量

[PDF 财务草稿](FACT_DRAFTS.md) 增加了可实际交接的来源绑定记录。新功能不存在时，两个视口的“PDF→草稿→下载”任务为0/2；实现后本地静态和Python两入口分别2/2。题材只有一份公开虚构双页PDF，不能把两个视口当两份独立真实报告，也不能以此宣称财务抽取准确率提升。

8个场景×2视口=16项浏览器工程验收，两入口最终各16/16；八项新增合同单元测试验证金额精度和错误拒绝。首轮14/16的中文提示断言错误、后续拒绝报告预期错误与键盘12/16失败均保留，见功能说明。原固定业务8/8、真实模型首轮7/8、FE-013开放、真实资料质量样本0不变。本轮不调用模型，不估算人工节时，不提供无依据的收益百分比。

## FE-020 摘录数字边界回归（2026-10-23）

原独立审查21个合成字符串案例13/21：8种裁剪反例错误接受。修复后同样输入与预期21/21；8个完整上下文拒绝控制、5个合法控制保持。新增16个单元方法2/16→16/16；整页任意搜索的错误修复变异14/16，两个范围/出现位置检查发现它。浏览器新增拒绝时保留已保存草稿及实际导出，套件由16扩展为18项，修复前16/18。

指标是已知缺陷的回归防护，不是金融语义准确率或业务收益。真实财报样本0、隐藏集0、付费调用0；原真实模型开发集7/8、FE-013仍开放。首轮测试夹具的偏移/错误类型问题保留，金额边界预期没有放宽。最终本地、精确SHA CI及公开入口结果见STATUS和本地交付证据。


## FE-020 Unicode-boundary follow-up (2026-10-23)

The independent actual-PDF probe on57b6b7c had12/18 passes:3 Unicode markers ×2 widths were incorrectly accepted. This cycle retains those inputs and the full-excerpt8-case probe as separate controls. New19 constructed-string methods change2/19→19/19; the new actual-PDF preservation suite has3 symbols ×2 excerpts ×2 widths=12, with0/12 on the old engine. The first fixed suite's11/12 rapid-download failure and a minimal browser control are retained; seeFACT_DRAFTS for test isolation and final results.

These measure known numeric transcription boundary regressions, not financial semantic accuracy, competitor superiority or human time saved. Fixed synthetic business8/8 and historical live-model7/8 retain their original denominators; FE-013 remains open, no paid calls, real-report/hidden quality sample counts0.

## 2026-10-24 官方资料版本识别

[来源目录验收](SOURCE_CATALOG.md)区分四个分母：候选链接实际取得PDF为2/4；
收录2份不同官方报告；2份×2视口的本机表格金额准备与来源导出4/4；
离线合成状态回归2/14→14/14。原首页RMB紧贴金额的草稿尝试0/4保留，
没有通过重试挑选模型答案。365–449ms是本机四次预检观测，不是SLA。
这些只验证文件身份与待审交接，不是语义抽取准确率、人审结果或时间收益。
固定业务8/8、首轮模型7/8、FE-013开放保持；实时付费调用0。


## 2026-10-24 币种前缀与分句金额录入

同一提交2b981a9上的最终40项合成字符串从24/40到40/40；最终28项实际合成PDF浏览器案例从12/28到本地静态/Python各28/28。两份真实历史公告首页、两视口共4条手工准备与导出流程从0/4到两入口各4/4。真实路径币种/单位仍未知，normalized_value=null；不把可录入视为自动财务语义正确。

第一版仅处理前缀，合成24/24但真实0/4，原因是后接分句逗号；诊断、补充失败用例和首次结果均保留。错误的“丢掉前缀以前所有上下文”变异仅30/40，十项检查发现问题。详见FACT_DRAFTS。固定合成任务8/8、首轮模型7/8、FE-013开放；付费调用0、隐藏集0、真实金融质量标签0、人效样本0。


## 2026-10-24 货币符号前的负号保留

独立审查4cad7d0发现`-$120`、`-HK$120`可错误保存正120；新增修复保留
符号之前的原页上下文。同样的审查24字符串从16/24到24/24；新41项
单元从22/41到41/41。扩展后的15种合成PDF输入×2摘录×2视口共60项，
同一旧提交40/60，修复后的本地静态/Python各60/60：合法控制20/20保持，
预期拒绝20/40变40/40，并核对拒绝后的旧草稿与实际下载完全相同。

两份真实历史公告第1页、两视口的手工准备流程在两入口仍各4/4，未知
币种/倍率不换算；这是2份文件而非4份金融质量样本。原文、金额和offset
不改写，待审状态保持。固定合成业务8/8、首轮真实模型7/8与FE-013不变。
没有付费调用、隐藏集标签、真实语义正确率或人工节时收益。原失败保留，
不把测试数量当收益或竞品优越性。语法边界见FACT_DRAFTS。

## 2026-10-24 原页版面对照

新增本机PDF原页预览，原8场景×2视口在旧版0/16；首个实现14/16的两次失败来自超时中文文案断言，与正确的PDF_PREVIEW_TIMEOUT状态码不一致，原始记录保留。改为断言固定错误码后，加上放大/收起与挂起超时场景的中间20项为18/20，缺少的两项放大控件随后实现。最终各入口结果以精确版本实测为准。

这些场景验证可查看原始页序、键盘操作、像素预算、失败重试、取消/旧结果隔离和导出保持，不能当金融准确率或节时收益。真实验证另列2份历史公告×2视口=4条流程，每条查看首页与利润表页并保持同一待审核导出；没有新增人工语义标签、许可审核或模型评测。详见[实现、首轮失败与复跑](PDF_PREVIEW.md)。首轮真实模型7/8、FE-013开放保持，付费调用0。

## Pending-draft receiving, 2026-10-24

One authored synthetic two-page PDF supplies a source-to-export-to-receiver task at1440/390px: base d937c9b 0/2 because there is no receiver; local static/Python builds each2/2. These are two viewport repetitions of one synthetic task, not independent financial examples. The initial baseline executes only these two planned tasks;24 other new engineering scenarios remain not_run.

The receiving suite has13 scenarios ×2 widths=26. First implemented result22/26 came from four incorrect canvas-selector assertions after restoration and actual-download equality succeeded. Corrected static/Python suites each26/26;28 new unit methods and file/late-read/overwrite/metadata boundaries are engineering evidence. The initial unit RED is a missing-module startup failure, not28 executed failures. Commands and limits: DRAFT_RECEIVING.

Separate real-source workflow: two official catalog PDFs ×2 widths=4/4 per static/Python surface through preparation, actual export, refresh, local source reselection, restore, page inspection and equal re-export. Count two unique documents; zero independent human semantic labels, no extraction-quality or time-saving estimate. Unknown units staynull. Exact-commit public/CI results are recorded separately. Fixed synthetic8/8, historical live-model7/8 and FE-013 unchanged; no paid calls or hidden-set claim.

## FE-022 文件名交接一致性（2026-10-24）

原独立审查的12项构造字符串保持原输入与断言，10/12→12/12；原20项实际PDF浏览器流程（10场景×2视口）从16/20到本地静态/Python各20/20。已知失败是LF/TAB名称原样导出后无法接回。本轮新增14项单元4/14→14/14，新增7场景×2视口的浏览器0/14→本地静态/Python各14/14，包含冻结旧版下载、重命名原文件、不可见/方向字符的可辨识显示、字面反斜杠区别，以及过长名称拒绝后重试。原始失败全部保留。

这些是公开合成开发/工程回归，分母不能当独立金融题目；它们未测算人工节时或竞品优越性。固定合成业务保持8/8，首轮真实模型保持7/8，FE-013开放。本轮付费调用0、隐藏集0、真实金融语义标签0。两份官方历史PDF的工作流验证另列，不能将两个视口计成四份独立文档。实际本地/远端CI/公开部署分别验收。详见DRAFT_RECEIVING。

## FE-023 startup recovery (2026-10-24)

Frozen synthetic startup matrix:8 scenarios×2 viewports=16 per surface. Baseline
ec0e6a2 passes4/16 (healthy and bundle-fetch controls);12/16 fail startup recovery.
Initial fixed local static and Python each16/16. Saved note, checked citation,
actual exported result and30.00% sample calculation are compared across document
navigation; late-import evaluation must leave the timeout intact. The original
independent review4/8 is retained separately, not pooled with this expanded plan.
Server regression first6/7 (missing bootstrap404), then7/7. See STARTUP_RECOVERY
for commands and the full fault plan. Later full-suite/CI/public results are recorded
separately; no hidden set, human financial labels, quantified staff savings or
paid inference. Deterministic8/8 and historical real-model7/8 remain separate;
FE-013 stays open.

Full local engineering: Python186/186 (25.888s), JS201/201; deterministic8/8 with
numeric6/6, source-complete6/6, expected-refusal2/2 (n=8, p50 0.000561s,
p95 0.001024s, in-process only). A first static currency browser invocation timed
out before any of60 business cases; its unchanged diagnostic rerun60/60 and Python
60/60 are separate records, not replacements for that failure. Transport cause
was not reproduced. No business timing gain is inferred from these durations.


## FE-023 release-cache follow-up (2026-10-24)

Actual local Chrome HTTP-cache probe with max-age=600: the frozen historical
upgrade reproduced0/2 at0428af8 (normal controls2/2, cached app requests1→1).
The matching two viewport upgrades pass2/2 with versioned graphs. The separate
new18-case authored engineering matrix passes18/18; it includes old direct and
bootstrap entries, missing/invalid metadata, late import, explicit reload,
saved notes/checks/downloads and real PDF Worker loading. No Playwright routing
is used in this cache suite. It is not18 independent financial tasks or an
observed public outage sample. See STARTUP_RECOVERY for commands and limits.

Python189 and JS201 are engineering counts, separate from fixed synthetic8/8,
historical live-model7/8 and open FE-013. No paid inference, hidden-set labels,
financial semantic review or measured personnel savings. First static startup
15/16 and its initial readiness timeout are retained, not replaced by later
checks. Local, exact-commit CI and public deployment results are separate gates.

## Draft preparation and correction (2026-10-25)

Two authored tasks (fill missing declared metadata; resolve an intentional
same-context amount conflict) ×1440/390px =4 workflow cases on one synthetic PDF.
On the prior public e58d1ac release,0/4 had the new checklist/correction contract;
on the local updated static and Python surfaces4/4 complete it. This is new task
coverage, not a financial accuracy or staff-productivity percentage. The larger
engineering plan is12 scenarios ×2 widths=24 per surface (24/24 locally), including
failed/duplicate edits, cancellation, source/list changes, keyboard use and
rejection of checklists as draft imports or calculation replay packs. Twelve
new unit methods cover precision, scope and unverified gates.

Retain the original missing-module red run, first unit11/12 fixture error, first
current-HTML browser20/20, and historical cache8/18 before compatibility correction
(18/18 afterward). The first full static base workflow timed out at initialization;
one instrumented run of unchanged assertions passed14/14. The observed diagnostic
bundle ERR_FAILED is the test's explicit route-abort case, not an explanation of
the earlier startup timeout. The natural cause is unknown.

Two separately downloaded catalog PDFs matched both known hashes; each passed
local checklist/metadata-edit/export/re-import/original-page inspection at two
widths (4/4), with currency/scale/basis/scope left unknown. There are2 independent
real documents and0 human semantic labels, not4 financial labels. All timings
are serial automated workflow durations, not analyst time; no cost/accuracy claim.
Historical live7/8, FE-013 and the synthetic fixed-workflow control stay separate.
Reproduce with node tests/browser-draft-review.cjs; detailed contract in DRAFT_REVIEW.


## Draft-group navigation and test waits (2026-10-25)

`node tests/browser-draft-groups.cjs` runs4 authored navigation/state scenarios at
2 widths, using1 synthetic PDF; local8/8. In the20-member case all20 rows are
keyboard reachable with a return path and the actual checklist is unchanged.
The group member list appears once, with concise findings on each row. This is a
presentation/coverage metric, not measured time saved, real financial accuracy or
a competitor win. The prior-version first run0/8 is retained:7 absent-capability
cases and1 initialization timeout, not8 proven navigation defects.

`node tests/browser-waits.cjs` isolates FE-024 with actual streaming HTTP and the
startup runner's shared predicates: original0/12, corrected12/12, including8
missing/wrong-state negative controls that must still time out. These are test
reliability checks, not business outcomes. Full startup16/16 and draft24/24 pass
locally; exact release CI and deployed browser evidence are recorded separately.
Historical actual-model7/8, FE-013, unknown real semantic quality and paid-call0
remain unchanged. No hidden-set claims or rerun-to-select scoring.
