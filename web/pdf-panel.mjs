import { inspectPdf } from "./pdf-intake.mjs";
const $ = (id) => document.getElementById(id);
const messages = {
  PDF_BYTE_LIMIT: "文件超过 5 MiB 上限。",
  PDF_PAGE_LIMIT: "文件超过 120 个物理页上限。",
  PDF_TEXT_LIMIT: "提取文字超过容量上限，请拆分文档后重试。",
  PDF_SIGNATURE: "文件头不是受支持的 PDF。",
  PDF_INVALID: "PDF 损坏或格式无法解析。",
  PDF_ENCRYPTED: "文件受密码保护。请自行解密后重新选择；此处不收集密码。",
  PDF_EXTRACTION_FAILED: "有页面提取失败，未生成部分成功报告。",
  PDF_READ_FAILED: "无法读取文件，请重新选择。",
  PDF_READER_UNAVAILABLE: "PDF 读取组件未能加载，请检查连接后重新选择。",
  PDF_TIMEOUT: "预检超过 12 秒，已停止处理。可拆分文件后重试。",
  PDF_CANCELLED: "已取消，可重新选择文件。",
};
export function bindPdfPanel() {
  let controller = null,
    report = null,
    sequence = 0;
  const status = (message, error = false) => {
    const n = $("pdf-status");
    n.textContent = message;
    n.className = error ? "error" : "small";
    n.setAttribute("role", error ? "alert" : "status");
  };
  const clearResult = () => {
    report = null;
    $("pdf-result").hidden = true;
    $("pdf-download").disabled = true;
    $("pdf-text").textContent = "";
    $("pdf-page").replaceChildren();
    $("pdf-name").textContent = "";
    $("pdf-hash").textContent = "";
  };
  const busy = (value) => {
    $("pdf-intake").setAttribute("aria-busy", String(value));
    $("pdf-file").disabled = value;
    $("pdf-demo").disabled = value;
    $("pdf-cancel").hidden = !value;
  };
  const showPage = () => {
    if (!report) return;
    const p = report.pages[Number($("pdf-page").value) - 1];
    $("pdf-text").textContent =
      p.text ||
      "本页没有提取到文字。可能为空白、扫描图像或不受支持的编码，需要人工查看原文件；未运行 OCR。";
  };
  const run = async (file, sourceKind = "user") => {
    const id = ++sequence;
    controller?.abort();
    controller = new AbortController();
    clearResult();
    busy(true);
    try {
      const value = await inspectPdf(file, {
        signal: controller.signal,
        sourceKind,
        onProgress: (m) => {
          if (sequence === id) status(m);
        },
      });
      if (sequence !== id) return;
      report = value;
      $("pdf-name").textContent = value.file.name;
      $("pdf-hash").textContent = value.file.sha256;
      $("pdf-summary").textContent =
        `${value.page_count} 个物理页 · ${value.text_pages} 页有提取文字 · ${value.file.bytes.toLocaleString()} 字节 · PDF.js ${value.parser.version}`;
      for (const p of value.pages) {
        const option = document.createElement("option");
        option.value = p.page;
        option.textContent = `物理页 ${p.page}${p.text ? "" : " · 无文字"}`;
        $("pdf-page").append(option);
      }
      $("pdf-result").hidden = false;
      $("pdf-download").disabled = false;
      showPage();
      status(
        value.status === "NEEDS_REVIEW"
          ? "已提取文字，等待人工核对。尚未导入研究资料或用于计算。"
          : "存在没有提取到文字的页面，请核对原文件或安排 OCR。尚未导入研究资料。",
      );
    } catch (e) {
      if (sequence === id)
        status(
          `${messages[e.code] || "预检失败，请重新选择文件。"} [${e.code in messages ? e.code : "PDF_READ_FAILED"}]`,
          true,
        );
    } finally {
      if (sequence === id) {
        controller = null;
        busy(false);
        $("pdf-file").value = "";
      }
    }
  };
  $("pdf-page").onchange = showPage;
  $("pdf-file").onchange = () => {
    const file = $("pdf-file").files[0];
    if (file) void run(file);
  };
  $("pdf-cancel").onclick = () => controller?.abort();
  $("pdf-clear").onclick = () => {
    sequence++;
    controller?.abort();
    controller = null;
    clearResult();
    busy(false);
    $("pdf-file").value = "";
    status("选择本机 PDF，或先使用虚构样本试一遍。");
  };
  $("pdf-demo").onclick = async () => {
    const id = ++sequence;
    clearResult();
    busy(true);
    status("正在读取虚构 PDF 样本…");
    controller = new AbortController();
    try {
      const response = await fetch(new URL("./pdf-demo.pdf", import.meta.url), {
        signal: controller.signal,
      });
      if (!response.ok) throw Error();
      const bytes = await response.arrayBuffer();
      if (sequence !== id) return;
      void run(
        new File([bytes], "SYNTHETIC-preflight-demo.pdf", {
          type: "application/pdf",
        }),
        "demo",
      );
    } catch {
      if (sequence === id) {
        status(
          controller?.signal.aborted
            ? "已取消。[PDF_CANCELLED]"
            : "样本读取失败，可重试或选择本机文件。[PDF_READ_FAILED]",
          true,
        );
        controller = null;
        busy(false);
      }
    }
  };
  $("pdf-download").onclick = () => {
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "finevidence-unverified-pages.json";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  busy(false);
}
