# 企业应用调研与两轮设计检查

核验：2026-10-21，Asia/Taipei。企业自述与产品页是场景证据，不能作为独立效果评测；不把沙盒试验写成全面生产。没有根据这些页面推定招聘门槛。

## 第一轮：深圳／香港企业在解决什么问题

| 企业／地区 | 可核验场景与来源 | 对 FinEvidence 的启示 |
|---|---|---|
| 腾讯云、华润信托、国投证券／深圳相关 | [ADP 产品案例](https://cloud.tencent.com/product/adp)：债券指令整理、咨询、询价及内部法务 RAG。产品能力文档更新 2026-06-15，[官方说明](https://cloud.tencent.com/document/product/1759/104193) 可访问 | 把工具输出嵌进研究员工作流；操作要能核对，复杂文档与权限不能由聊天框掩盖 |
| 平安／深圳 | [官方技术业务页](https://group.pingan.com/about_us/our_businesses/technology.html)，2025 年业务披露，可访问：非结构化资料、承保理赔、风险识别、客服与销售支持 | 选择窄金融任务，记录材料、状态和异常；不照搬企业自报节省金额 |
| 汇丰／香港 | [2025-08-26 官方沙盒公告](https://www.about.hsbc.com.hk/zh-hk/news-and-media/hsbc-pioneers-real-time-customer-interaction-trials-in-hkmas-genai-sandbox)，可访问：客户交互试验 | 试点、服务与实效要分开；核验和人工接手是产品流程 |
| 香港金管局／香港，监管背景 | [2026-10-15 ART 公告](https://www.hkma.gov.hk/eng/news-and-media/press-releases/2026/10/20261015-3/)，可访问：负责任 AI、沙盒与有边界的多步任务 | 把调用预算、工具边界、失败结果和审查记录纳入验收；不宣称本项目合规认证 |
| DBS／区域参照 | [2025 年报 CRO 章节](https://www.dbs.com/annualreports/2025/cro-statement.html)，可访问：资料提取核对、供员工复核的授信备忘录工作流 | 以证据简报准备为最小完整场景，保留人审 |
| Morgan Stanley／国际参照 | [2024-06-26 Debrief](https://www.morganstanley.com/press-releases/ai-at-morgan-stanley-debrief-launch)，可访问：在客户同意后生成会议笔记、待办和可编辑邮件草稿 | 自动化材料准备，交付可编辑／可追溯的产物 |

微众银行本次官方检索未得到足够具体的 Agent 技术案例，因此不把线上信贷或传统客服自动化冒充 Agent 落地证据。

## 竞品与开源参照

- [AlphaSense](https://www.alpha-sense.com/solutions/generative-ai-in-market-research/)：金融研究、可点击原文引用与多步研究。借鉴引用核对流程；内容许可、数据库规模与企业效果不是本项目拥有的能力。
- [腾讯 ADP](https://cloud.tencent.com/document/product/1759/104193)：知识助手、工作流、模型管理与观察。通用搭建平台不替代金融单位／时期／会计口径校验。
- [Dify](https://github.com/langgenius/dify)：模型适配、RAG、工作流与观察。借鉴模块边界；不为四份资料引入整套部署栈。许可须单独核查，未复制代码。
- [LangGraph](https://github.com/langchain-ai/langgraph)：有状态工具工作流。借鉴显式状态与退出条件；本版少量工具可用可读的 Python 循环实现，后续有恢复需求再评估框架。
- [FinGPT](https://github.com/AI4Finance-Foundation/FinGPT)：金融 LLM 研究参照；训练、基准和投资效果不能从本项目单次 API 成功推出。未下载模型或复制语料。

开源 star、提交时间、许可快照见 OPEN_SOURCE_SNAPSHOT.json；只是当天关注度，不是质量评分。

## 第二轮：反驳方案并收敛

1. 通用聊天首页：容易展示，但答案难核验。改为资料→检索／计算→原文→审查导出的工作台。模型负责选择允许的工具；数字由既有 Python Decimal 算出。
2. 直接在 GitHub Pages 放密钥：会暴露凭据。公开页在浏览器计算；相同界面本地运行时接 Python 服务。模型密钥只在进程环境中。GitHub Pages 的静态边界见 [官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。
3. 直接叫“企业级已上线”：缺少真实报告、组织权限、运维和真实评测。交付一个完整可运行的公开样本工作流，明确哪些已执行、哪些仍是企业目标。
4. 让模型生成任意公式／SQL：不能复算且有执行风险。只允许 search_documents、get_financial_facts、calculate_metric、finish；拒绝额外参数、跨所选公司年度、重复调用、超预算和错误协议。
5. 只测成功：加载、空结果、无前一年、来源漂移、网络失败、模型拒绝／超时、草稿恢复和窄屏也必须验收。参考 [Anthropic Agent 评测](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)，评测任务与完整轨迹一起保留。

最终选择：金融证据简报工作台。用户是研究助理／审查者；任务是准备可复核材料，不提供交易或授信决策。当前四份虚构来源独立标识，真实模型调用也不使数据变成真实财报。

## 2026-10-26 access check (Taipei)

The [DBS2025 CRO chapter](https://www.dbs.com/annualreports/2025/cro-statement.html)
was accessible again: extraction/validation assists credit evaluation, and credit
memos for staff review are described as progressing toward agentic workflows.
DBS is a regional reference; this is workflow rationale, not a Hong Kong/Shenzhen
hiring threshold, role level or an independent productivity benchmark. Correctable
observations support that review workflow; our synthetic UI results do not prove
the bank's performance or production use. No new hiring claim is made.
