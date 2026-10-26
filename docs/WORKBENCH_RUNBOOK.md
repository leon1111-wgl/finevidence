# 工作台运行、模型接入与验收

## 在线与本地

[公开工作台](https://leon1111-wgl.github.io/finevidence/) 可直接检索、计算、核对和导出。所有金额／公司为明确标注的虚构样本。公开页无模型密钥与上传入口，工作在浏览器中。

完整本地工作台使用同一界面，后端直接调用 Python 源码。需要 Python 3.12 与支持 POSIX 文件锁的 macOS／Linux；无需 Python 第三方包。

```sh
git clone https://github.com/leon1111-wgl/finevidence.git
cd finevidence
python3 -m finevidence.server
```

打开 `http://127.0.0.1:8765`。启动自动在临时目录导入四份样本，并构建浏览器数据包；不覆盖用户数据库。按 Ctrl+C 退出，临时索引清理。可用 `--port 8766` 更换端口。

## 晨涧云真实模型

用户于 2026-10-21 指定晨涧云并授权本地接入检查。[服务商说明](https://www.mornai.cn/docs/use-cases/agent/openclaw-mornai-api) 使用 OpenAI-compatible `/v1` 接口；网关 `/v1/models` 本次返回的可用标识为 `deepseek-v4-1-flash`。不要把 DeepSeek 直连站点的别名强加给代理网关。

用隐藏输入把密钥只放入当前启动进程，不写历史、文件或仓库：

```sh
python3 scripts/start_model.py
```

此命令从终端隐藏读取 key，然后启动本地服务。也可事先用本机密钥管理器注入以下环境变量：

| 变量 | 值／用途 |
|---|---|
| FINEVIDENCE_API_KEY | 本机秘密；没有密钥时明确禁用模型辅助 |
| FINEVIDENCE_API_BASE | 默认 https://apirouter.mornai.cn/v1 |
| FINEVIDENCE_MODEL | 默认 deepseek-v4-1-flash |
| SSL_CERT_FILE | 可选可信 CA PEM 路径；绝不关闭 TLS 校验 |

选择「模型辅助」，输入“请核对2024年的收入同比变化，并给出可核对原文。”选择 Aurora Orchard / 2024，可观察模型调用 calculate_metric，再 finish，结果由 Python Decimal 生成。原文、公式、输入、模型标识和调用用量可一起导出。

仅运行用户明确发起的请求。最多四次模型调用，每次输出上限 256 tokens；一次格式修复计入总次数；不自动重试网络或 HTTP 失败。每次请求交给独立本机子进程，按 15 秒与 Agent 剩余 45 秒预算的较小值等待；到期终止并回收本机进程后释放请求槽位。子进程在 TLS 初始化前也按同一绝对截止时间设置 Unix 定时器；服务中断或被杀后，它最多继续到该截止点，不会获得新的 15 秒。该后备机制要求 macOS/Linux 的信号定时器，缺失时在联网前拒绝。确定性工具仍在调用前后检查预算，操作系统启动/回收存在调度开销，**不是严格实时保证、强制终止远端任务或精确计费上限**。实现与离线验收见 [PROVIDER_DEADLINE](PROVIDER_DEADLINE.md)。浏览器等待上限 50 秒，客户端超时不代表提供商取消计费。默认无后台模型请求、无定时付费调用。

实际最小检查返回 CONNECTION_OK，17 tokens，2.398 秒。首次 Agent 实测暴露计算结果被后续检索覆盖的问题，已补回归并保留各工具结果。修复后浏览器实测 Aurora 收入同比 20.00%（两次调用、1029 tokens、4.407 秒），Harbor 毛利率变化 -5.00 pp（两次调用、1051 tokens、3.181 秒）。这些是两条合成任务的集成证据，不是模型准确率或生产服务指标。

完整八题首轮量化结果、失败原因和复跑命令见 [EVALUATION](EVALUATION.md)。两条浏览器集成检查与八题评测分别记录，不合并成一个准确率。

## 三分钟演示

1. 从首页选择 Aurora / 2024 / 收入同比，运行核查，结果 20.00%。
2. 打开两年引用，核对 120 与 100、USD 与百万单位，逐条勾选。
3. 写一条审查备注，导出 JSON；记录包含计算、完整来源页、hash 和核对状态。
4. 刷新页面，重新执行确定性工具并恢复备注。模型不会因刷新自动调用。
5. 选 2023 年做同比，观察缺前期数据的明确失败。换回 2024 年后旧重试会隐藏，点击“运行核查”提交新范围；输入未改动时可手动重试原请求。
6. 在本地模型模式询问毛利率变化，检查模型工具轨迹与 Python 计算；真实调用有提供商费用。

## 自动与人工检查

```sh
python3 -m unittest discover -s tests -v
python3 scripts/build_web.py
node --test tests/web.test.mjs tests/state.test.mjs
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec playwright install chromium
# 另开终端运行 python3 -m finevidence.server
pnpm test:browser
pnpm test:restore
```

浏览器脚本默认 127.0.0.1:8765；通过 BASE_URL 可验证静态预览或公开 Pages。BROWSER_ARTIFACTS 指定截图／结果目录，CHROME_PATH 可指定已有 Chromium/Chrome。使用测试浏览器全新上下文；不覆盖个人浏览器状态。CI 没有密钥，只运行离线回归；本地实际模型结果单独记录。

## 数据流与边界

- `service.Workspace.run` → 既有 workflow → 来源重查 → Decimal；API 不自己重算金融数字。
- `agent.run_agent` → `ModelProvider.complete` → 严格 tool/arguments 对象 → 允许工具；页面固定 company/year，工具不能跨范围、执行 shell/SQL 或抓任意 URL。
- 浏览器 `validateBundle` 校验发布包和来源 → BM25 / BigInt 有理数 → 原文面板 → 本机审查记录。与 Python 的 24 组原文排序／数值对照进入 CI。
- `state.readDraft` 只接受同 corpus 指纹、受限请求、备注和引用 ID。恢复后重跑工具，不把保存的结果当可信计算。已核对勾选是未认证浏览器用户记录，不是合规签名或人工核验事实。

本地服务仅绑定 127.0.0.1，检查 Host、Origin、CSRF，固定资源路径，拒绝超限 body；这些不是企业身份／文档授权系统。不得直接暴露公网。真实报告许可、PDF 物理页、真实事实核验、组织权限、持久审计和负载运维验收仍有独立工作。

## 发布和回滚

GitHub Actions 中 Python/Linux/macOS、JS 和浏览器检查均通过后，才上传 web 静态产物并部署 Pages。manifest.json 记录发布 SHA 和 bundle SHA256，生产页面不含凭据。

回滚用 `git revert <bad-commit>` 创建新提交，再通过相同 CI／部署。不要 force-push 或手动覆盖已核验产物。来源／schema 变化使旧草稿不恢复勾选；请先导出重要记录。故障排查先看页面状态码、Actions 的确切 SHA 和 manifest，不把旧页面截图当新发布证据。

模型调用失败可在本地HTTP响应或评测JSON中查看可选的 decision_diagnostics。它仅含调用序号和固定校验类别，不含被拒绝的内容。格式修复后成功也保留类别；网络用量缺失仍标为unknown。详见 [脱敏诊断](AGENT_DIAGNOSTICS.md)，不能依据此增量声称首轮7/8已提高。

输入修改与重试状态的回归、实际失败及离线夹具边界见 [RETRY_STATE](RETRY_STATE.md)。`pnpm test:browser`执行原14项流程及7项重试场景，不进行真实模型调用。

草稿重算遇到网络失败时，手动重试会保留同一份备注、选中原文和仍在当前结果中的核对ID；连续失败不覆盖已保存草稿。修改输入会撤销旧恢复重试，新范围不会继承旧核对记录。`pnpm test:restore`必须连接本地Python服务，执行6项恢复／故障／导出检查；公开静态页不执行该网络故障专项。实现与测试边界见 [DRAFT_RECOVERY](DRAFT_RECOVERY.md)。

## 复算交接

首页新增「复算交接」：完成核查后导出复算包，接收者直接选入文件，查看一致/差异并下载结果。原审查记录保留完整执行信息，不作为 v1 复算包选入。公开与 Python 模式都在本机浏览器复算，不上传、不自动调用模型、不覆盖当前草稿。准确协议、命令、差异指标与信任边界见 [HANDOFF_REPLAY](HANDOFF_REPLAY.md)。

## 本机 PDF 资料预检

从首页侧栏点击“预检本机 PDF”，选择本机文件或“试用虚构 PDF”。查看物理页文字与完整字节指纹，然后按需导出待核验页记录。5 MiB、120页、单页10万/整份50万字符、12秒处理上限；内置虚构样本另有5秒下载上限。密码文件拒绝，无OCR。此路径公开/本地都在浏览器处理，不发文件给服务器或模型，不替换当前计算、资料库或草稿。首次使用需读取同源程序资源，未实现离线缓存服务。提取文字仍须对照原PDF版面人工核对；导出文件包含文字，应自行保存。详见PDF_INTAKE；新增34项浏览器和4项故障检查已经纳入test:browser。


PDF组件加载超时会显示PDF_READER_TIMEOUT：检查网络后重新选择文件即可发起新加载，不必等待旧请求结束。PDF_TIMEOUT仍表示文件处理阶段超时。取消只停止应用等待并清理已创建的Worker，浏览器原生import请求可能继续；它晚到时不会覆盖新报告。`node tests/browser-pdf-loading.cjs`以桌面/窄屏共8个故障时序验证重试与隔离，已加入test:browser；它不测真实财报质量。


浏览器PDF故障脚本现在在初始化失败时也保存 `pdf-faults/result.json`。检查 `finished`、固定分母4、phase与not_run，不把已结束的失败测试当成功。`pnpm test:browser-report` 用两个实际子进程故障验证报告留存和脱敏；CI单独执行一次。详细格式与故障证据边界见 [BROWSER_FAILURE_EVIDENCE](BROWSER_FAILURE_EVIDENCE.md)。

## 官方资料入口与文件版本

在首页“PDF资料预检”展开“从官方资料开始”，打开官方链接并自行保存，
再选择本机PDF。目录识别只比较已采集版本的SHA-256与字节数。
换文件、失败和清除会移除旧来源；未匹配不表示文件无效。目录元数据随
页记录与待核验草稿导出，但不改写用户填报的年份、单位或审核状态。
[来源与验收](SOURCE_CATALOG.md)包含两份历史公告、可走通的表格页、
RMB紧贴数字的已知拒绝限制与失败证据。


金额填写示例：原文`RMB120, including ...`时，原文金额填`120`，摘录保留币种及上下文；`RMB-120`填`-120`，不能去掉负号。当前支持RMB/CNY/HKD/USD/EUR/JPY的明确前缀语境与分句逗号；不确定的数字写法仍拒绝。币种、单位和口径继续自行核对，不会因前缀自动填好。两份目录公告首页可走同一流程，仍只导出待审核记录。边界与首轮失败见FACT_DRAFTS。

## 原页版面对照

PDF预检后选择物理页，点击“查看本页版面”。可放大后用方向键滚动，也可收起；切页和换文件会撤销旧图。失败可显式重试，12秒等待上限不代表硬CPU/内存隔离。原页显示不改变草稿待审状态；未知币种、单位、许可和人审仍须实际核验。详见[预览实现与验收](PDF_PREVIEW.md)。

## 接收待核验财务草稿

先重新预检同一份 PDF，展开财务草稿，选择此前导出的 JSON。核对暂存条目与原文件指纹后，点击显示新旧条目数的替换按钮。接收失败、取消和超时保留已保存列表；文件改名允许，但内容必须一致。查看每条原页，再继续登记或导出。相同字节指纹不等于来源许可或人工审核。详见 [接收协议与复跑](DRAFT_RECEIVING.md)。

## 启动失败与整页恢复

程序资源加载失败或等待超过8秒时，首页会显示明确错误；使用上方“重新加载工作台”链接，键盘 Enter 同样可用。入口脚本本身缺失或禁用 JavaScript 时仍有静态恢复提示。程序恢复后会重新校验来源并复算兼容的已保存核查记录，不自动调用模型。未导出的 PDF 草稿属于当前页面内存，整页重载后需要重新准备。资料 JSON 单独失败仍使用原来的“重新加载资料”。故障矩阵与时序边界见 [STARTUP_RECOVERY](STARTUP_RECOVERY.md)。


发布前运行 build_web：源页面为 web/index.template.html，生成的 web/index.html
及 web/assets 不提交。必须整体部署同一产物，不能只替换首页。若旧版本子资源
已移除，使用启动提示中的重新加载；当前没有保留历代静态目录。不要在正在
提供请求的目录中重建。node tests/browser-cache.cjs 使用临时本机HTTP服务及
真实缓存，需完整历史中的 ec0e6a2/0428af8；不会发起模型调用。

## 可选本机审核留存与撤回

默认服务不接收审核意见。使用独立私有目录、审核者标签和隐藏输入的本机凭据启用后，可将选中的待核验草稿与意见显式保存到回环服务，重启后查询、导出和撤回。只有草稿摘录与意见写入本机；PDF文件不传输。凭据不会保存在浏览器或导出中。此身份仅为本机配置操作人，不是组织认证；不会批准来源许可或准入财务计算。具体启用、8秒结果未知重试、100条上限与备份边界见[本机审核记录](LOCAL_REVIEW_LEDGER.md)。

本机启动直接绑定数值回环地址，不再为服务器名称做反向解析；不影响模型
提供商所需的域名解析与TLS。受控慢解析的启动到核查证据见
[LOOPBACK_STARTUP](LOOPBACK_STARTUP.md)。它不证明此前浏览器异常的根因。

恢复测试使用 `pnpm test:restore`；`pnpm test:restore-report` 需要同一个已启动的
回环服务，验证注入故障时的阶段与检查点。`restore/result.json` 的
`finished=false` 或未执行行不能当作完整通过。每次使用新的产物目录，保留
首次失败；网络事件阶段表示事件到达时刻。详见BROWSER_FAILURE_EVIDENCE。
