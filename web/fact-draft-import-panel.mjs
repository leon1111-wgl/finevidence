import {
  importFactDrafts,
  MAX_DRAFT_IMPORT_BYTES,
} from "./fact-draft-import.mjs";
import { displayFileName } from "./file-name.mjs";
const $ = (id) => document.getElementById(id);
const messages = {
  IMPORT_SOURCE:
    "请先预检交接文件对应的同一份 PDF，并使用相同的资料入口（虚构样本或本机文件）。",
  IMPORT_LIMIT: "交接文件超过 1 MiB 或结构上限。",
  IMPORT_JSON: "文件不是有效且字段无重复的 JSON。",
  IMPORT_ENCODING: "文件不是有效 UTF-8 文本。",
  IMPORT_SCHEMA: "仅支持版本 1 的待核验财务草稿，不能接收复算包。",
  IMPORT_CHANGED:
    "草稿与原页或当前格式不一致。请检查金额、摘录、页码、读取器版本和待审标记；未自动修正。",
  IMPORT_READ: "文件读取失败，请重新选择。",
  IMPORT_TIMEOUT: "读取已等待 5 秒，可重新选择文件。",
};
export function bindDraftImport(getReport, getCount, replace) {
  let sequence = 0,
    candidate = null;
  const status = (text, error = false) => {
    $("draft-import-status").textContent = text;
    $("draft-import-status").className = error ? "error" : "small";
    $("draft-import-status").setAttribute("role", error ? "alert" : "status");
  };
  const clear = () => {
    candidate = null;
    $("draft-import-apply").hidden = true;
    $("draft-import-preview").replaceChildren();
  };
  const busy = (value) => {
    $("draft-import").setAttribute("aria-busy", String(value));
    $("draft-import-file").disabled = value;
  };
  const reset = (
    text = "选择此前导出的草稿 JSON；先核对，随后由你替换列表。",
  ) => {
    sequence++;
    clear();
    busy(false);
    $("draft-import-file").value = "";
    $("draft-import-cancel").hidden = true;
    status(text);
  };
  $("draft-import-cancel").onclick = () =>
    reset("已取消接收；现有已保存草稿不变。");
  $("draft-import-file").onchange = async () => {
    const file = $("draft-import-file").files[0];
    if (!file) return;
    const id = ++sequence,
      report = getReport();
    let timer;
    clear();
    busy(true);
    $("draft-import-cancel").hidden = false;
    status("正在读取并核对交接文件…现有草稿不变。");
    try {
      if (!report) throw Error("IMPORT_SOURCE");
      if (file.size > MAX_DRAFT_IMPORT_BYTES) throw Error("IMPORT_LIMIT");
      const bytes = await Promise.race([
        file.arrayBuffer().catch(() => {
          throw Error("IMPORT_READ");
        }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error("IMPORT_TIMEOUT")), 5000);
        }),
      ]);
      if (id !== sequence || getReport() !== report) return;
      if (
        bytes.byteLength !== file.size ||
        bytes.byteLength > MAX_DRAFT_IMPORT_BYTES
      )
        throw Error("IMPORT_LIMIT");
      let raw;
      try {
        raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw Error("IMPORT_ENCODING");
      }
      const checked = importFactDrafts(raw, report);
      candidate = { raw, report };
      const original = JSON.parse(raw).file.name;
      const identity = document.createElement("p");
      identity.className = "small";
      identity.textContent = `交接文件：${displayFileName(file.name)}（${file.size.toLocaleString()} 字节）。交接中的 PDF：${displayFileName(original)}；本机 PDF：${displayFileName(report.file.name)}。SHA-256：${report.file.sha256}`;
      const list = document.createElement("ol");
      for (const d of checked.drafts) {
        const li = document.createElement("li");
        li.textContent = `${d.company} · ${d.period} · ${d.metric === "revenue" ? "收入" : "毛利"} ${d.raw_value} × ${d.unit_scale ?? "单位待核对"} ${d.currency ?? "币种待核对"} · 物理页 ${d.provenance.page}`;
        list.append(li);
      }
      $("draft-import-preview").append(identity, list);
      $("draft-import-apply").textContent =
        `用 ${checked.drafts.length} 条待核验草稿替换已保存的 ${getCount()} 条`;
      $("draft-import-apply").hidden = false;
      status(
        `已核对 ${checked.drafts.length} 条的文件指纹、原页摘录和金额结构；尚未替换列表。字段含义、来源许可和人审身份仍待核验。`,
      );
    } catch (e) {
      if (id === sequence) {
        const code = Object.hasOwn(messages, e.message)
          ? e.message
          : "IMPORT_CHANGED";
        clear();
        $("draft-import-cancel").hidden = true;
        status(
          `${messages[code]} 已保存的 ${getCount()} 条不变。[${code}]`,
          true,
        );
      }
    } finally {
      clearTimeout(timer);
      if (id === sequence) {
        busy(false);
        $("draft-import-file").value = "";
      }
    }
  };
  $("draft-import-apply").onclick = () => {
    if (!candidate) return;
    try {
      if (getReport() !== candidate.report) throw Error();
      const checked = importFactDrafts(candidate.raw, getReport());
      replace(checked.drafts);
      reset(
        `已恢复 ${checked.drafts.length} 条待核验草稿。可逐条查看原页，继续登记或导出；未进入正式计算。`,
      );
      $("draft-count").focus();
    } catch {
      reset();
      status(
        "资料已变化，未替换列表。请重新选择交接文件。[IMPORT_CHANGED]",
        true,
      );
    }
  };
  return { reset };
}
