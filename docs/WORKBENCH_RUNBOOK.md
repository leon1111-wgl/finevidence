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

仅运行用户明确发起的请求。最多四次模型调用，每次输出上限 256 tokens；一次格式修复计入总次数；不自动重试网络或 HTTP 失败。单次网络 timeout 上限 15 秒，45 秒累计预算在调用前后检查。这是同步网络超时与检查点预算，**不是强制终止远端任务或精确计费上限**。浏览器等待上限 50 秒，客户端超时不代表提供商取消计费。默认无后台模型请求、无定时付费调用。

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
