import { stageReview, clearStagedReview } from "./review-ledger-panel.mjs";
import { bindDraftImport } from "./fact-draft-import-panel.mjs";
import { createFactDraft, exportFactDrafts } from "./fact-draft.mjs";
import { reviewFactDrafts } from "./draft-review.mjs";
const $ = (id) => document.getElementById(id);
const fields = [
  "company",
  "title",
  "source_url",
  "period",
  "metric",
  "raw_value",
  "currency",
  "scale",
  "basis",
  "scope",
  "excerpt",
];
const messages = {
  DRAFT_EXCERPT: "摘录必须逐字来自当前物理页。",
  DRAFT_PAGE: "当前页没有可用文字，请先核对原 PDF。",
  DRAFT_TOKEN:
    "原文中找不到受支持的完整金额。请核对原 PDF 的符号与小数；百分数和特殊数字写法不能登记为普通金额。",
  DRAFT_NUMBER:
    "金额只支持普通小数、三位逗号分组或括号负数，最多 40 位整数和 18 位小数。",
  DRAFT_URL: "来源网址必须是无账号密码的 HTTPS 地址；系统不会访问它。",
  DRAFT_DUPLICATE: "这条草稿已保存，请勿重复添加。",
  DRAFT_COUNT: "最多保存 20 条草稿，请导出或删除后继续。",
};
export function bindFactDraftPanel(getReport, selectPage) {
  // Install controls before binding: supported cached HTML predates this feature.
  const control = (tag, id, text, after, attrs = {}) => {
    if ($(id)) return;
    const node = document.createElement(tag);
    node.id = id;
    node.textContent = text;
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    $(after).after(node);
  };
  control("p", "draft-edit-state", "", "draft-excerpt-help", {
    class: "small",
    role: "status",
  });
  control("button", "draft-edit-cancel", "取消修改", "draft-add", {
    type: "button",
    class: "secondary",
    hidden: "",
  });
  control(
    "p",
    "draft-review-policy",
    "只比较公司、期间、指标、币种、准则和合并范围均已填写且字面相同的记录；别名、重述及不同口径不自动合并。没有提示不代表内容正确。",
    "draft-count",
    { class: "small" },
  );
  control("p", "draft-review-summary", "", "draft-count", {
    class: "small",
    role: "status",
  });
  control("div", "draft-review-groups", "", "draft-review-policy");
  control("button", "draft-review-download", "导出检查清单", "draft-download", {
    type: "button",
    class: "secondary",
    disabled: "",
  });
  control(
    "p",
    "draft-review-help",
    "检查清单含已保存草稿和待办项，供人工核查；接回草稿请使用草稿导出文件。",
    "draft-review-download",
    { class: "small" },
  );
  let drafts = [],
    editing = null;
  const endEdit = () => {
    editing = null;
    $("draft-add").textContent = "保存待核验草稿";
    $("draft-edit-cancel").hidden = true;
    $("draft-edit-state").textContent = "";
  };
  const beginEdit = (d, i) => {
    selectPage(d.provenance.page);
    editing = d;
    const values = {
      ...d,
      scale: d.unit_scale ?? "unknown",
      currency: d.currency ?? "unknown",
      source_url: d.source_url ?? "",
      excerpt: d.provenance.excerpt,
    };
    for (const k of fields) $("draft-" + k).value = values[k];
    $("draft-add").textContent = `保存对草稿 ${i + 1} 的修改`;
    $("draft-edit-cancel").hidden = false;
    $("draft-edit-state").textContent =
      `正在修改草稿 ${i + 1} · 物理页 ${d.provenance.page}。保存前原记录不变；切页或替换列表将结束修改。`;
    $("draft-company").focus();
    $("draft-company").scrollIntoView({ block: "center" });
  };
  const status = (text, error = false) => {
    $("draft-status").textContent = text;
    $("draft-status").className = error ? "error" : "small";
    $("draft-status").setAttribute("role", error ? "alert" : "status");
  };
  const render = () => {
    clearStagedReview();
    $("draft-list").replaceChildren();
    $("draft-count").textContent = `已保存 ${drafts.length} / 20 条待核验草稿`;
    $("draft-download").disabled = !drafts.length;
    $("draft-download").textContent = `导出已保存草稿（${drafts.length}）`;
    $("draft-review-download").disabled = !drafts.length;
    const review = drafts.length ? reviewFactDrafts(getReport(), drafts) : null;
    $("draft-review-summary").textContent = review
      ? `检查 ${drafts.length} 条：${review.checks.rows_needing_attention} 条有缺项或重复声明需处理。所有记录仍待人工核验，来源使用许可与审核身份尚未核验。`
      : "保存草稿后显示缺项与重复声明检查；不会自动核验事实。";
    const groupsPanel = $("draft-review-groups");
    groupsPanel.replaceChildren();
    groupsPanel.hidden = !review?.checks.groups.length;
    const groupMessage = (group) =>
      group.code === "DECLARED_VALUE_CONFLICT"
        ? "同一声明口径金额不一致"
        : "同一声明口径金额重复";
    const jumpLink = (label, target, open = false) => {
      const link = document.createElement("a");
      link.textContent = label;
      link.href = `#${target}`;
      link.onclick = (event) => {
        event.preventDefault();
        const node = $(target);
        if (!node) return;
        if (open) node.parentElement.open = true;
        node.focus();
        node.scrollIntoView({ block: "center" });
      };
      return link;
    };
    review?.checks.groups.forEach((group, i) => {
      const detail = document.createElement("details");
      const summary = document.createElement("summary");
      summary.id = `draft-group-${i + 1}`;
      summary.textContent = `检查组 ${i + 1} · ${groupMessage(group)}（${group.rows.length} 条）`;
      const help = document.createElement("p");
      help.className = "small";
      help.textContent =
        "定位成员后核对期间、口径与原页；相同声明不代表同一事实。";
      const members = document.createElement("div");
      members.className = "draft-group-members";
      for (const row of group.rows)
        members.append(jumpLink(`定位草稿 ${row}`, `draft-row-${row}`));
      detail.append(summary, help, members);
      groupsPanel.append(detail);
    });
    const labels = {
      company: "公司",
      title: "标题",
      period: "期间",
      source_url: "来源网址",
      currency: "币种",
      unit_scale: "单位倍率",
      basis: "会计准则",
      scope: "合并范围",
    };
    drafts.forEach((d, i) => {
      const li = document.createElement("li");
      const heading = document.createElement("p");
      heading.id = `draft-row-${i + 1}`;
      heading.tabIndex = -1;
      heading.textContent = `${i + 1}. ${d.company} · ${d.metric === "revenue" ? "收入" : "毛利"} · 原文 ${d.raw_value} × ${d.unit_scale ?? "单位待核对"} ${d.currency ?? "币种待核对"} · 物理页 ${d.provenance.page}`;
      li.append(heading);
      const findings = document.createElement("p");
      findings.className = "small draft-findings";
      const missing = review.checks.rows[i].missing_fields;
      const groups = review.checks.groups.filter((g) => g.rows.includes(i + 1));
      const messages = [];
      if (missing.length)
        messages.push(`待补证：${missing.map((k) => labels[k]).join("、")}`);
      for (const group of groups) messages.push(groupMessage(group));
      findings.textContent = messages.length
        ? messages.join("。")
        : "未发现列明的缺项或重复声明；字段含义仍待人工核验。";
      for (const group of groups) {
        const number = review.checks.groups.indexOf(group) + 1;
        findings.append(
          " · ",
          jumpLink(`查看检查组 ${number}`, `draft-group-${number}`, true),
        );
      }
      li.append(findings);
      const detail = document.createElement("details"),
        summary = document.createElement("summary");
      summary.textContent = "查看口径与摘录（待人工核验）";
      detail.append(summary);
      const meta = document.createElement("p");
      meta.className = "small";
      meta.textContent = `${d.title} · 期间：${d.period} · 单位倍率：${d.unit_scale ?? "待核对"} · 换算值：${d.normalized_value ?? "未换算"} · 准则：${d.basis} · 合并范围：${d.scope} · 来源网址：${d.source_url ?? "未提供"}`;
      const quote = document.createElement("blockquote");
      quote.textContent = d.provenance.excerpt;
      detail.append(meta, quote);
      li.append(detail);
      const view = document.createElement("button");
      view.type = "button";
      view.className = "secondary";
      view.textContent = `查看草稿 ${i + 1} 原文`;
      view.onclick = () => {
        selectPage(d.provenance.page);
        $("pdf-text").focus();
        $("pdf-text").scrollIntoView({ block: "center" });
      };
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "secondary";
      edit.textContent = `修改草稿 ${i + 1}`;
      edit.onclick = () => beginEdit(d, i);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary";
      remove.dataset.remove = String(i);
      remove.textContent = `删除草稿 ${i + 1}`;
      remove.onclick = () => {
        receiver.reset("列表已修改，请重新选择交接文件后再替换。");
        endEdit();
        drafts.splice(i, 1);
        render();
        status("已删除草稿。");
        $("draft-count").focus();
      };
      const record = document.createElement("button");
      record.type = "button"; record.className = "secondary";
      record.textContent = `登记草稿 ${i + 1} 审核意见`;
      record.onclick = () => {
        try { stageReview(exportFactDrafts(getReport(), drafts).drafts[i], i + 1); }
        catch { status("草稿与当前来源不一致，请重新登记。", true); }
      };
      li.append(view, edit, remove, record);
      $("draft-list").append(li);
    });
  };
  const receiver = bindDraftImport(
    getReport,
    () => drafts.length,
    (next) => {
      endEdit();
      drafts = next;
      render();
    },
  );
  const pageChanged = () => {
    endEdit();
    $("draft-excerpt").value = "";
    $("draft-raw_value").value = "";
    const page = getReport()?.pages.find(
      (p) => p.page === Number($("pdf-page").value),
    );
    $("draft-add").disabled = !page?.text;
    $("draft-use-page").disabled = !page?.text;
    $("draft-page-label").textContent =
      `摘录来源：当前物理页 ${page?.page ?? "—"}`;
    status(
      page?.text
        ? "摘录和金额已清空，请按当前页填写。"
        : "本页没有文字，不能登记草稿。",
    );
  };
  $("draft-use-page").onclick = () => {
    const text = getReport()?.pages.find(
      (p) => p.page === Number($("pdf-page").value),
    )?.text;
    if (!text || text.length > 4000) {
      status("本页超过 4,000 字符或没有文字，请自行复制需要的短段落。", true);
      return;
    }
    $("draft-excerpt").value = text;
    $("draft-excerpt").focus();
  };
  $("draft-form").onsubmit = (e) => {
    e.preventDefault();
    try {
      const values = Object.fromEntries(
        fields.map((k) => [k, $("draft-" + k).value]),
      );
      const d = createFactDraft(getReport(), {
        ...values,
        page: Number($("pdf-page").value),
      });
      const index = editing ? drafts.indexOf(editing) : -1;
      if (editing && index < 0) throw Error("DRAFT_CHANGED");
      const next =
        index < 0
          ? [...drafts, d]
          : drafts.map((old, i) => (i === index ? d : old));
      exportFactDrafts(getReport(), next);
      receiver.reset("列表已修改，请重新选择交接文件后再替换。");
      drafts = next;
      endEdit();
      render();
      if (index >= 0) {
        $("draft-raw_value").value = "";
        $("draft-excerpt").value = "";
        $("draft-count").focus();
      }
      status(
        index < 0
          ? `已保存第 ${drafts.length} 条待核验草稿。尚未完成人工审核，未用于计算。`
          : `已替换草稿 ${index + 1}，共 ${drafts.length} 条。检查已更新；仍待人工审核。`,
      );
    } catch (error) {
      status(
        `${messages[error.message] ?? "请检查必填项、长度和字段格式。"} ${editing ? "未替换" : "未添加"}；已保存的 ${drafts.length} 条不变。`,
        true,
      );
    }
  };
  $("draft-edit-cancel").onclick = () => {
    endEdit();
    $("draft-raw_value").value = "";
    $("draft-excerpt").value = "";
    status("已取消修改；已保存草稿不变。");
    $("draft-count").focus();
  };
  $("draft-review-download").onclick = () => download(true);
  $("draft-download").onclick = () => download(false);
  const download = (withChecks) => {
    try {
      const report = withChecks
        ? reviewFactDrafts(getReport(), drafts)
        : exportFactDrafts(getReport(), drafts);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(report, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = withChecks
        ? "finevidence-unverified-draft-review.json"
        : "finevidence-unverified-fact-drafts.json";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status(
        `已请求下载 ${drafts.length} 条已保存草稿${withChecks ? "及检查清单" : ""}；表单内未保存的内容不在导出中。`,
      );
    } catch {
      status("草稿校验失败，未导出。请清除资料后重新登记。", true);
    }
  };
  return {
    pageChanged,
    reset: () => {
      receiver.reset();
      drafts = [];
      $("draft-form").reset();
      $("fact-draft").open = false;
      render();
      pageChanged();
    },
  };
}
