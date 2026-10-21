# 工作台发布验证记录

验证日期：2026-10-21。被验证的实现与评测发布提交：`83ccc2110780bc5fee75c14c55f6751b9ba83332`。此文档在后续文档提交中记录已经发生的验证，不把尚未完成的后续 CI 当作成功。

- 普通快进推送到用户指定的 leon1111-wgl/finevidence，并核对远端 SHA。
- 全新远端克隆，73 个版本文件与本地逐字节一致。在新克隆的工作目录运行 Python 176 项通过，21.342 秒；离线任务 8/8、JS 7 项（含 24 组 Python 对照）通过。
- [GitHub Actions 39628300265](https://github.com/leon1111-wgl/finevidence/actions/runs/39628300265) 精确匹配该 SHA，全部成功。读取实际日志：Ubuntu 176 项／31.194 秒，macOS 176 项／71.885 秒；两组 JS 7 项，静态与 Python Chromium 各 14 项流程成功；Pages 部署成功。
- 公开站点八个资源 index/styles/app/engine/state/bundle/manifest/runtime 与该提交构建逐字节一致，manifest.commit 与上述 SHA 一致。
- 在实际公开 URL 再运行同一 Chrome 流程脚本：14 项通过，无页面 JavaScript 错误；桌面1440px／窄屏390px截图已实际检查。覆盖键盘提交、数值、两年原文、核对、导出、恢复、范围变化清理、缺年、重试、无匹配、无效查询、窄屏无横向溢出、加载及网络失败重试。
- 本地实际 MornAI 模型任务和八题首轮评测单独见 [EVALUATION](EVALUATION.md)。结果为7/8，不以工程测试全绿掩盖任务失败。
- 模型凭据只驻留检查进程；检查完成后进程退出。无密钥进入源码、静态包、公开报告或截图。公共页面只执行合成样本工作流。

验证入口：`python3 -m unittest discover -s tests -v`、`python3 scripts/evaluate.py`、`python3 scripts/build_web.py`、`node --test tests/web.test.mjs tests/state.test.mjs`、`BASE_URL=https://leon1111-wgl.github.io/finevidence/ node tests/browser.cjs`。浏览器测试需按运行手册配置 Playwright／已有 Chromium。

测试通过不代表真实财报正确、组织权限完备、生产 SLA 或人工节时得到验证。FE-013 与路线图未完成项保留。未来发布请核对当时的 manifest、远端 SHA 和对应 CI，不把此历史记录当作未来版本证据。
