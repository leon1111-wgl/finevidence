# FinEvidence 工作台实施计划

使用 writing-plans / executing-plans，当前会话顺序执行。规范：[WORKBENCH_DESIGN](WORKBENCH_DESIGN.md)。不并行修改仓库。Python 3.12，浏览器原生模块，测试 Node 22+。

- [x] 数据与共享服务：finevidence/service.py 提供 Workspace.run(operation, company, year, query)，直接调用现有 workflow；scripts/build_web.py 生成受限 bundle 与 Python parity 样本。先以真实临时索引测试正常／缺年／非法参数／来源漂移。
- [x] 模型与回环服务：provider.py、agent.py、server.py；测试未知工具、附加参数、重复调用、无结果结束、超时预算、模型未配置、Host/Origin/CSRF、body 大小和无密钥响应。命令 python -m unittest discover -s tests -v。
- [x] 浏览器业务引擎：web/engine.mjs、web/state.mjs，tests/web.test.mjs；运行 node --test tests/web.test.mjs。先失败，再实现。核对 Python 检索顺序、六项计算，测试四舍六入五成双、来源漂移、无前年和损坏草稿。
- [x] 工作台界面：web/index.html、styles.css、app.mjs；真实桌面／窄屏操作，错误恢复、键盘、导出／恢复和仅本地模型流程。
- [ ] 发布：CI 增加静态包与 JS 检查，Pages 只在完整检查后部署。README 首屏给实际应用和本地启动方式；更新能力边界、运行手册。快进发布，核对远端与 CI，公开地址复跑和字节比对。
- [ ] 中文材料：保存两轮调研、功能与调用数据流、失败证据、面试问题、未附答案练习，记录 Codex 辅助和用户贡献边界。仅清理干净且远端已验证的临时检出。
