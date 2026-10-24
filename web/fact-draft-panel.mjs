import { bindDraftImport } from "./fact-draft-import-panel.mjs";
import { createFactDraft, exportFactDrafts } from "./fact-draft.mjs";
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
  let drafts = [];
  const status = (text, error = false) => {
    $("draft-status").textContent = text;
    $("draft-status").className = error ? "error" : "small";
    $("draft-status").setAttribute("role", error ? "alert" : "status");
  };
  const render = () => {
    $("draft-list").replaceChildren();
    $("draft-count").textContent = `已保存 ${drafts.length} / 20 条待核验草稿`;
    $("draft-download").disabled = !drafts.length;
    $("draft-download").textContent = `导出已保存草稿（${drafts.length}）`;
    drafts.forEach((d, i) => {
      const li = document.createElement("li");
      const heading = document.createElement("p");
      heading.textContent = `${i + 1}. ${d.company} · ${d.metric === "revenue" ? "收入" : "毛利"} · 原文 ${d.raw_value} × ${d.unit_scale ?? "单位待核对"} ${d.currency ?? "币种待核对"} · 物理页 ${d.provenance.page}`;
      li.append(heading);
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
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary";
      remove.dataset.remove = String(i);
      remove.textContent = `删除草稿 ${i + 1}`;
      remove.onclick = () => {
        receiver.reset("列表已修改，请重新选择交接文件后再替换。");
        drafts.splice(i, 1);
        render();
        status("已删除草稿。");
        $("draft-count").focus();
      };
      li.append(view, remove);
      $("draft-list").append(li);
    });
  };
  const receiver = bindDraftImport(
    getReport,
    () => drafts.length,
    (next) => {
      drafts = next;
      render();
    },
  );
  const pageChanged = () => {
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
      const next = [...drafts, d];
      exportFactDrafts(getReport(), next);
      receiver.reset("列表已修改，请重新选择交接文件后再替换。");
      drafts = next;
      render();
      status(
        `已保存第 ${drafts.length} 条待核验草稿。尚未完成人工审核，未用于计算。`,
      );
    } catch (error) {
      status(
        `${messages[error.message] ?? "请检查必填项、长度和字段格式。"} 未添加；已保存的 ${drafts.length} 条不变。`,
        true,
      );
    }
  };
  $("draft-download").onclick = () => {
    try {
      const report = exportFactDrafts(getReport(), drafts);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(report, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "finevidence-unverified-fact-drafts.json";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status(
        `已请求下载 ${drafts.length} 条已保存草稿；表单内未添加的内容不在导出中。`,
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
