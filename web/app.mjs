import { bindPdfPanel } from './pdf-panel.mjs';
import { validateBundle, run, sha256 } from "./engine.mjs";
import { readDraft, writeDraft } from "./state.mjs";
import { bindHandoff } from "./handoff.mjs";
const $ = (id) => document.getElementById(id),
  el = (tag, content, cls) => {
    const n = document.createElement(tag);
    if (content !== undefined) n.textContent = content;
    if (cls) n.className = cls;
    return n;
  };
const names = {
  "gross-margin": "毛利率",
  "revenue-growth": "收入同比",
  "gross-margin-change": "毛利率变化",
  search: "原文检索",
  facts: "财务输入",
  agent: "模型辅助",
};
const errors = {
  FACTS_NOT_FOUND:
    "缺少本次计算所需的前期事实。请选择 2024 年，或核对单年的毛利率。",
  INVALID_QUERY:
    "请输入英文检索词，例如 revenue、water 或 safety。中文问题请使用本地模型辅助。",
  SOURCE_MISMATCH: "资料指纹或来源对应关系不一致，已停止输出。请重新加载。",
  MODEL_NOT_CONFIGURED:
    "本地服务尚未配置模型密钥。请按运行说明设置环境变量并重启。",
  MODEL_TIMEOUT: "模型响应超时，本次未返回答案。可手动重试。",
  AGENT_BUDGET:
    "模型在调用次数内未完成任务，本次未返回答案。请缩小问题后重试。",
  AGENT_NO_RESULT:
    "模型未找到可执行的范围内任务。请询问所选公司与年度的资料或三个支持指标。",
  AGENT_REPEAT: "模型重复调用同一工具，已停止。请调整问题后重试。",
  AGENT_TOOL_REJECTED: "模型请求了未允许的工具或参数，已停止。",
  MODEL_HTTP_401: "模型凭据无效，请在本机检查配置。",
  MODEL_HTTP_429: "模型服务限流，请稍后手动重试。",
  SERVER_BUSY: "本地服务正在处理其他请求，请稍后重试。",
  MODEL_TLS: "无法验证模型服务证书，请检查本机受信任 CA 配置。",
  FACT_INVALID: "财务样本不符合受限事实格式，已停止输出。",
  CORPUS_INVALID: "资料包格式不受支持，请重新加载。",
  INVALID_DENOMINATOR: "收入分母必须为正，无法计算该指标。",
  INCOMPARABLE_FACTS: "财务单位或会计口径不一致，无法比较。",
};
let corpus,
  manifest,
  runtime,
  result = null,
  request = null,
  selected = "",
  reviewed = new Set(),
  busy = false,
  retryAction = null;
const storageKey = "finevidence.review.v1";
function status(message, error = false) {
  $("status").textContent = message;
  $("status").className = error ? "error" : "";
  $("status").setAttribute("role", error ? "alert" : "status");
}
function controls(lock) {
  busy = lock;
  for (const id of ["company", "year", "operation", "run"])
    $(id).disabled = lock;
  updateHelp();
  $("query-form").setAttribute("aria-busy", String(lock));
}
function updateHelp() {
  const op = $("operation").value;
  $("query").disabled = busy || !["search", "agent"].includes(op);
  $("query").maxLength = op === "agent" ? 1000 : 500;
  $("query-help").textContent =
    op === "agent"
      ? "输入所选公司与年度的问题。模型只选择允许的检索、事实与计算工具。"
      : op === "search"
        ? "当前原文为英文。可检索 revenue、gross profit、water 或 safety；分数不是置信度。"
        : "指标使用固定公式；无需输入问题。对比指标会同时读取上一年度。";
}
function clearResult() {
  retryAction = null;
  $("retry").hidden = true;
  result = null;
  selected = "";
  reviewed.clear();
  $("export").disabled = true;
  $("replay-export").disabled = true;
  $("notes").disabled = true;
  $("notes").value = "";
  $("result-meta").textContent = "等待运行";
  $("review-count").textContent = "0 项已核对";
  $("evidence").replaceChildren();
  $("result-content").replaceChildren(
    el("div", "核查范围已更新，请运行核查。", "empty"),
  );
  $("source-content").className = "empty";
  $("source-content").replaceChildren(
    el("p", "选择一条证据，在这里核对上下文、来源与报告年度。"),
  );
}
function save() {
  if (!result || !request) return;
  try {
    localStorage.setItem(
      storageKey,
      writeDraft(
        { request, notes: $("notes").value, reviewed: [...reviewed], selected },
        manifest.bundle_sha256,
      ),
    );
    $("save-state").textContent =
      "最近一次核查已保存在当前浏览器。模型结果恢复时只复算工具，不会自动调用模型。";
  } catch {
    $("save-state").textContent = "浏览器未允许保存草稿，请及时导出审查记录。";
  }
}
function renderEvidence() {
  const list = $("evidence");
  list.replaceChildren();
  if (!result?.citations?.length) return;
  list.append(el("h3", "支持证据"));
  for (const c of result.citations) {
    const b = el("button", undefined, "evidence-row");
    b.type = "button";
    b.setAttribute("aria-pressed", String(c.citation_id === selected));
    b.append(
      el(
        "strong",
        `${c.company} · ${c.year} · 合成页 ${c.page}${reviewed.has(c.citation_id) ? " · 已核对" : ""}`,
      ),
      el("p", c.excerpt, "excerpt"),
      el("span", "打开原文 →", "small"),
    );
    b.onclick = () => {
      selected = c.citation_id;
      renderEvidence();
      renderSource();
      save();
      $("source-heading").focus();
    };
    list.append(b);
  }
}
function renderSource() {
  const box = $("source-content");
  box.replaceChildren();
  box.className = "source-sheet";
  const c = result.citations.find((c) => c.citation_id === selected);
  if (!c) {
    box.append(el("p", "请选择一条证据。"));
    return;
  }
  box.append(
    el(
      "div",
      `${c.source_file} / ${c.year} 年 / 合成页 ${c.page}`,
      "source-meta",
    ),
    el("blockquote", c.excerpt),
  );
  const d = corpus.docs.find((d) => d.doc_id === c.doc_id);
  const detail = el("details"),
    sum = el("summary", "查看该页完整上下文");
  detail.append(
    sum,
    el("p", d?.pages[c.page - 1] || "当前资料包中没有此页。", "context"),
  );
  box.append(detail, el("p", "SHA-256  " + c.source_sha256, "digest"));
  const label = el("label", undefined, "review-check"),
    check = el("input");
  check.type = "checkbox";
  check.checked = reviewed.has(c.citation_id);
  check.setAttribute("aria-label", "已核对这条原文");
  check.onchange = () => {
    if (check.checked) reviewed.add(c.citation_id);
    else reviewed.delete(c.citation_id);
    renderEvidence();
    updateCount();
    save();
  };
  label.append(check, document.createTextNode("已核对这条原文"));
  box.append(label);
  updateCount();
}
function updateCount() {
  $("review-count").textContent =
    `${reviewed.size} / ${result?.citations.length || 0} 项已核对`;
}
function render() {
  const content = $("result-content");
  content.replaceChildren();
  const calc = result.calculations?.[0];
  $("result-meta").textContent =
    `${result.filters?.company || request.company} · ${result.filters?.year || request.year}`;
  if (calc) {
    const m = el("div", undefined, "metric");
    m.append(
      el("div", names[result.resolved_operation] || "计算结果", "small"),
      el("div", calc.display, "value"),
      el(
        "div",
        typeof calc.formula === "string"
          ? calc.formula
          : JSON.stringify(calc.formula),
        "formula",
      ),
    );
    const wrap = el("div", undefined, "table-scroll"),
      table = el("table"),
      head = el("thead"),
      hr = el("tr");
    for (const [i, t] of ["年度 / 指标", "原始金额", "单位"].entries())
      hr.append(el("th", t, i === 1 ? "num" : ""));
    head.append(hr);
    table.append(head);
    const body = el("tbody");
    for (const f of result.facts || []) {
      const tr = el("tr");
      tr.append(
        el(
          "td",
          `${f.period_start.slice(0, 4)} / ${f.metric === "revenue" ? "收入" : "毛利"}`,
        ),
        el("td", f.raw_value, "num"),
        el(
          "td",
          `${f.currency} × ${Number(f.unit_scale).toLocaleString("en-US")}`,
        ),
      );
      body.append(tr);
    }
    table.append(body);
    wrap.append(table);
    m.append(
      wrap,
      el("p", "百分比按比率 × 100 展示；毛利率变化使用百分点。", "small"),
    );
    content.append(m);
  } else {
    content.append(
      el(
        "div",
        result.status === "NO_MATCH"
          ? "没有找到匹配证据。请更换检索词，例如 revenue、water 或 safety。"
          : `找到 ${result.citations.length} 条来源证据。请逐条核对原文。`,
        "empty",
      ),
    );
  }
  if (result.tool_trace) {
    const detail = el("details", undefined, "trace");
    detail.append(
      el(
        "summary",
        `模型调用 ${result.model.calls} 次 · ${result.model.seconds} 秒 · ${result.model.usage.total_tokens ?? "未返回"} tokens`,
      ),
    );
    const list = el("ol");
    for (const t of result.tool_trace)
      list.append(el("li", `${t.tool} → ${t.status}`));
    detail.append(list, el("p", result.model.id));
    content.append(detail);
  }
  $("export").disabled = false;
  $("replay-export").disabled = false;
  $("notes").disabled = false;
  renderEvidence();
  if (result.citations.length) {
    selected = result.citations.some((c) => c.citation_id === selected)
      ? selected
      : result.citations[0].citation_id;
    renderEvidence();
    renderSource();
  } else {
    selected = "";
    $("source-content").className = "empty";
    $("source-content").replaceChildren(el("p", "当前结果没有可核对原文。"));
    updateCount();
  }
}
async function execute(data, { restore = null } = {}) {
  if (busy) return;
  clearResult();
  controls(true);
  $("retry").hidden = true;
  status(
    data.operation === "agent"
      ? "模型正在选择并执行核查工具…"
      : "正在检索来源并复核计算…",
  );
  try {
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    let r;
    if (runtime.runtime === "python_local") {
      const response = await fetch("./api/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-FinEvidence-CSRF": runtime.csrf,
        },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(50000),
      });
      r = await response.json();
      if (!response.ok) throw Error(r.status || "REQUEST_FAILED");
    } else {
      if (data.operation === "agent") throw Error("MODEL_NOT_CONFIGURED");
      r = run(corpus, data.operation, data.company, data.year, data.query);
    }
    result = r;
    request = {
      ...data,
      operation: r.resolved_operation,
      query: r.query || "",
    };
    reviewed = new Set(
      restore?.reviewed.filter((id) =>
        r.citations.some((c) => c.citation_id === id),
      ) || [],
    );
    selected = restore?.selected || "";
    $("notes").value = restore?.notes || "";
    render();
    save();
    status(
      restore
        ? "已恢复最近一次核查，并重新执行确定性工具。"
        : r.status === "NO_MATCH"
          ? "核查完成，当前没有匹配证据。"
          : "核查完成。请打开原文，确认年份、单位与口径。",
    );
  } catch (e) {
    const code = e.name === "TimeoutError" ? "REQUEST_TIMEOUT" : e.message;
    status(
      (errors[code] || "本次核查未完成，请检查网络或本地服务后重试。") +
        ` [${code}]`,
      true,
    );
    retryAction = () => execute(data, { restore });
    $("retry").textContent = "重试本次核查";
    $("retry").hidden = false;
  } finally {
    controls(false);
  }
}
function listDocuments() {
  const list = $("documents");
  list.replaceChildren();
  for (const d of corpus.docs.filter((d) => d.company === $("company").value))
    list.append(el("li", `${d.year} 年报 · ${d.pages.length} 合成页`));
}
async function initialize() {
  controls(true);
  $("retry").hidden = true;
  status("正在校验资料…");
  try {
    const fetchJSON = async (p) => {
      const r = await fetch(p, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw Error("LOAD_FAILED");
      return r.json();
    };
    [manifest, runtime] = await Promise.all([
      fetchJSON("./manifest.json"),
      fetchJSON("./runtime.json"),
    ]);
    const response = await fetch("./bundle.json", {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw Error("LOAD_FAILED");
    const raw = await response.arrayBuffer();
    if (raw.byteLength > 1048576) throw Error("CORPUS_INVALID");
    if ((await sha256(raw)) !== manifest.bundle_sha256)
      throw Error("SOURCE_MISMATCH");
    corpus = await validateBundle(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)),
    );
    bindHandoff(
      corpus,
      manifest,
      () =>
        result && {
          request,
          review: {
            notes: $("notes").value,
            checked_citation_ids: [...reviewed],
          },
        },
    );
    $("runtime").textContent =
      runtime.runtime === "python_local"
        ? "Python 本地工作台"
        : "公开样本 · 浏览器运算";
    $("runtime-detail").textContent = runtime.model_configured
      ? "真实模型已配置；仅在选择模型辅助时调用。"
      : "检索与计算可直接运行。真实模型可在本机接入。";
    const option = $("operation").querySelector("[value=agent]");
    option.disabled = !runtime.model_configured;
    option.textContent = runtime.model_configured
      ? "模型辅助"
      : "模型辅助 · 需要本地服务";
    $("version").textContent = "版本 " + manifest.commit.slice(0, 7);
    listDocuments();
    status("资料校验完成，可以开始核查。");
    controls(false);
    let draft = null;
    try {
      draft = readDraft(
        localStorage.getItem(storageKey),
        manifest.bundle_sha256,
      );
    } catch {}
    if (
      draft &&
      corpus.docs.some(
        (d) =>
          d.company === draft.request.company && d.year === draft.request.year,
      )
    ) {
      $("company").value = draft.request.company;
      $("year").value = String(draft.request.year);
      $("operation").value =
        draft.request.operation === "facts"
          ? "search"
          : draft.request.operation;
      $("query").value = draft.request.query;
      listDocuments();
      await execute(draft.request, { restore: draft });
    }
  } catch (e) {
    status(
      (errors[e.message] || "资料加载失败，请检查网络后重试。") +
        ` [${e.message}]`,
      true,
    );
    $("runtime").textContent = "资料尚未就绪";
    retryAction = initialize;
    $("retry").textContent = "重新加载资料";
    $("retry").hidden = false;
    busy = false;
  }
}
// Module evaluation must have no UI/network side effects: an expired bootstrap
// may still finish importing this module. Only an active bootstrap starts it.
let started = false;
export function startWorkbench() {
  if (started) return;
  started = true;
  $("query-form").onsubmit = (e) => {
    e.preventDefault();
    execute({
      operation: $("operation").value,
      company: $("company").value,
      year: Number($("year").value),
      query: $("query").value,
    });
  };
  for (const id of ["company", "year", "operation", "query"])
    $(id).addEventListener(id === "query" ? "input" : "change", () => {
      clearResult();
      updateHelp();
      if (corpus) listDocuments();
      status("核查范围已更新，请运行核查。");
    });
  $("notes").oninput = save;
  $("retry").onclick = () => retryAction?.();
  $("export").onclick = () => {
    if (!result) return;
    const payload = {
      schema_version: 1,
      classification: "SYNTHETIC",
      exported_at: new Date().toISOString(),
      source_commit: manifest.commit,
      corpus_sha256: manifest.bundle_sha256,
      request,
      result,
      review: {
        checked_citation_ids: [...reviewed],
        notes: $("notes").value,
        verification: "browser_user_check_only_not_authenticated",
      },
      sources: corpus.docs.filter((d) =>
        result.citations.some((c) => c.doc_id === d.doc_id),
      ),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = el("a");
    a.href = url;
    a.download = `finevidence-${request.company.replaceAll(" ", "-")}-${request.year}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status("审查记录已导出，包含原文、输入、计算与核对状态。");
  };
  bindPdfPanel();
  initialize();
}
