// Presentation of an already resolved in-memory review, never an import/admission API.
const escape = (value) =>
  String(value ?? "—").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const pre = (value) =>
  `<pre>${escape(typeof value === "string" ? value : JSON.stringify(value, null, 2))}</pre>`;
const fields = (pairs) =>
  `<dl>${pairs.map(([key, value]) => `<dt>${escape(key)}</dt><dd>${escape(value)}</dd>`).join("")}</dl>`;
const section = (title, body) => `<section><h2>${title}</h2>${body}</section>`;

export function renderReviewBrief(record) {
  const { result: r, review, request, sources } = record;
  if (
    record.classification !== "SYNTHETIC" ||
    !["CALCULATED", "EVIDENCE_FOUND", "NO_MATCH", "FACTS_FOUND"].includes(
      r?.status,
    ) ||
    review?.verification !== "browser_user_check_only_not_authenticated" ||
    !Array.isArray(review.checked_citation_ids) ||
    new Set(review.checked_citation_ids).size !==
      review.checked_citation_ids.length ||
    !review.checked_citation_ids.every((id) =>
      r.citations.some((c) => c.citation_id === id),
    )
  )
    throw Error("BRIEF_UNSUPPORTED");
  const checked = new Set(review.checked_citation_ids);
  const refs = (ids) =>
    (ids || [])
      .map((id) => {
        const i = r.citations.findIndex((c) => c.citation_id === id);
        if (i < 0) throw Error("BRIEF_UNSUPPORTED");
        return `<a href="#citation-${i + 1}">原文 ${i + 1}</a>`;
      })
      .join(" · ");
  // Fixed local anchors only. No URL, HTML, stylesheet or script comes from data.
  const calculations = (r.calculations || [])
    .map(
      (c) =>
        `<article><h3>${escape(c.display)}</h3>${fields([
          ["指标", c.operation ?? c.metric],
          ["公式", c.formula],
          ...(c.unit ? [["结果单位", c.unit]] : []),
          ["精度与舍入", c.precision ?? JSON.stringify(c.numeric_policy)],
          ...Object.entries(c.normalized_inputs || {}).map(([key, v]) => [
            key,
            v,
          ]),
        ])}<p>${refs(c.citation_ids)}</p><details><summary>计算记录与舍入规则</summary>${pre(c)}</details></article>`,
    )
    .join("");
  const facts = r.facts || [];
  const normalized = facts.some((f) => f.normalized_value !== undefined);
  const factTable = facts.length
    ? `<div class="table-scroll" tabindex="0" role="region" aria-label="财务输入表，可横向滚动"><table><thead><tr><th>事实 / 时期</th><th>原始金额 / 单位</th>${normalized ? "<th>标准金额（运行提供）</th>" : ""}<th>口径 / 来源</th></tr></thead><tbody>${facts.map((f) => `<tr><td>${escape(f.metric)}<br>${escape(f.company)}<br>${escape(f.period_start)} 至 ${escape(f.period_end)}<br><small>${escape(f.fact_id)}</small></td><td>${escape(f.raw_value)} ${escape(f.currency)}<br>倍数 ${escape(f.unit_scale)}</td>${normalized ? `<td>${escape(f.normalized_value)}</td>` : ""}<td>${escape(f.accounting_basis)}<br>${escape(f.consolidation_scope)}<br>${refs(r.citations.filter((c) => c.doc_id === f.doc_id && c.page === f.page && c.excerpt === f.source_excerpt).map((c) => c.citation_id))}<br>${escape(f.verification_status)}</td></tr>`).join("")}</tbody></table></div>`
    : "<p>本次结果没有财务输入。</p>";
  const evidence = r.citations
    .map(
      (c, i) =>
        `<article id="citation-${i + 1}"><h3>原文 ${i + 1} · ${escape(c.company)} ${escape(c.year)}</h3><p>${checked.has(c.citation_id) ? "已勾选核对" : "尚未勾选核对"}（未经认证的浏览器记录）</p>${fields(
          [
            ["引用编号", c.citation_id],
            ["文件", c.source_file],
            ["页码", `${c.page}（${c.page_kind}；合成页，非 PDF 物理页）`],
            ["SHA-256", c.source_sha256],
          ],
        )}<blockquote>${escape(c.excerpt)}</blockquote></article>`,
    )
    .join("");
  const sourcePages = sources
    .map(
      (d) =>
        `<article><h3>${escape(d.company)} ${escape(d.year)} · ${escape(d.filename)}</h3>${fields(
          [
            ["文档编号", d.doc_id],
            ["SHA-256", d.sha256],
          ],
        )}${d.pages.map((p, i) => `<h4>合成页 ${i + 1}</h4><p class="source-page">${escape(p)}</p>`).join("")}</article>`,
    )
    .join("");
  const model = r.model
    ? section(
        "模型调用记录",
        `<p>模型辅助只选择受限工具；金额来自确定性工具，资料仍为合成数据。模型标识由运行记录提供。</p>${fields(
          [
            ["模型标识", r.model.id],
            ["调用次数", r.model.calls],
            ["耗时（秒）", r.model.seconds],
            [
              "用量状态",
              r.model.usage_complete === true
                ? "提供商返回了全部调用用量（未核对账单）"
                : "用量不完整；缺失部分未知，不计为零",
            ],
            ["用量未知的调用", r.model.calls_with_unknown_usage ?? "未知"],
          ],
        )}<h3>已报告用量</h3>${pre(r.model.usage || {})}<h3>工具轨迹</h3>${pre(r.tool_trace || [])}`,
      )
    : "";
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>FinEvidence 证据简报 · ${escape(request.company)} ${escape(request.year)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#fff;color:#222;font:15px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:980px;margin:40px auto;padding:0 28px 48px}h1{font-size:25px;line-height:1.3;margin:8px 0 16px}h2{font-size:19px;margin:0 0 16px}h3{font-size:16px;margin:16px 0 8px}h4{font-size:15px}p{margin:10px 0}header{border-bottom:2px solid #333;padding-bottom:22px}section{border-bottom:1px solid #ddd;padding:24px 0}article+article{border-top:1px solid #ddd;margin-top:20px;padding-top:12px}small,.muted{color:#555;font-size:13px}dl{display:grid;grid-template-columns:130px 1fr;gap:6px 20px;margin:12px 0}dt{color:#555}dd{margin:0;min-width:0;overflow-wrap:anywhere}blockquote{margin:16px 0;padding:0 16px;border-left:3px solid #aaa;white-space:pre-wrap;overflow-wrap:anywhere}.source-page,#brief-notes{white-space:pre-wrap;overflow-wrap:anywhere}pre{font:12px/1.6 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;min-width:660px;font-size:13px}th,td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}th{background:#f4f4f4}.table-scroll{overflow:auto}a{color:#174c68;text-underline-offset:3px}a:focus-visible,summary:focus-visible,.table-scroll:focus-visible{outline:2px solid #174c68;outline-offset:3px}summary{cursor:pointer}footer{margin-top:22px;font-size:13px;color:#555}
@media(max-width:600px){main{margin:20px auto;padding:0 16px 30px}h1{font-size:22px}dl{grid-template-columns:1fr;gap:2px}dd{margin-bottom:10px}}
@media print{main{max-width:none;margin:0;padding:0}body{font-size:10pt}h1{font-size:18pt}h2{font-size:14pt}h3{font-size:11pt}table{min-width:0;table-layout:fixed;font-size:9pt}.table-scroll{overflow:visible}h2,h3,h4{break-after:avoid}tr{break-inside:avoid}thead{display:table-header-group}a{color:inherit}section{padding:14px 0}.screen-only{display:none}details{display:none}@page{size:A4;margin:16mm}}
</style></head><body><main>
<header><p class="muted">FinEvidence · 证据简报</p><h1>${escape(request.company)} · ${escape(request.year)}</h1><p><strong>SYNTHETIC · 虚构资料示例，非真实财报。</strong></p><p>核对勾选和备注未经认证，不代表独立审核、来源许可或财务事实准入。</p><p class="screen-only muted">可用浏览器的打印功能保存。需要复算时，请另行导出 JSON 复算包；此 HTML 是可修改的阅读副本。</p></header>
${section(
  "核查范围与结果",
  fields([
    ["操作", request.operation],
    ["执行模式", r.mode],
    ["状态", r.status],
    ...(request.operation === "search" ? [["检索词", request.query]] : []),
    ...(r.question ? [["原始问题", r.question]] : []),
  ]) +
    `<p>${r.answer ? escape(r.answer) : r.status === "NO_MATCH" ? "没有匹配证据；没有生成财务答案。" : "仅展示检索或事实结果，没有额外生成答案。"}</p>` +
    calculations,
)}
${section("财务输入", factTable)}
${section("核对记录", `<p>${checked.size} / ${r.citations.length} 项已勾选核对（未经认证）</p><p id="brief-notes">${escape(review.notes || "尚未填写备注。")}</p>`)}
${section("引用与摘录", evidence || "<p>没有可核对的引用。</p>")}
${section("来源完整页", sourcePages || "<p>没有来源页。</p>")}
${model}
${section(
  "版本与限制",
  fields([
    ["导出时间（UTC）", record.exported_at],
    ["代码提交", record.source_commit],
    ["语料 SHA-256", record.corpus_sha256],
    ["运行编号", r.trace_id],
  ]) +
    `<ul>${(r.limitations || []).map((s) => `<li>${escape(s)}</li>`).join("")}</ul>`,
)}
<footer>本文件不运行脚本、不加载外部资源，也不执行复算或认证。原文属于合成样本；本机 PDF 待核验草稿不包含在此简报中。</footer>
</main></body></html>`;
}
