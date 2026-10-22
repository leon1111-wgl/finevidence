import { createReplay, verifyReplay, MAX_REPLAY_BYTES } from "./replay.mjs";
import { sha256 } from "./engine.mjs";
const $ = (id) => document.getElementById(id);
function download(payload, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function bindHandoff(corpus, manifest, getCurrent) {
  let verification = null;
  const status = (message, error = false) => {
    const n = $("replay-status");
    n.textContent = message;
    n.className = error ? "error" : "small";
    n.setAttribute("role", error ? "alert" : "status");
  };
  const exportStatus = (message, error = false) => {
    const n = $("replay-export-status");
    n.hidden = false;
    n.textContent = message;
    n.className = error ? "error" : "small";
    n.setAttribute("role", error ? "alert" : "status");
  };
  $("replay-file").disabled = false;
  $("replay-export").onclick = () => {
    const current = getCurrent();
    if (!current) return;
    try {
      const record = createReplay(
        corpus,
        manifest,
        current.request,
        current.review,
      );
      download(record, "finevidence-replay.json");
      exportStatus(
        "复算包已导出。它是确定性工具的重算快照；原始执行记录仍可从页首导出。",
      );
    } catch {
      exportStatus(
        "当前结果不能导出复算包，请重新运行支持的确定性任务。[REQUEST_INVALID]",
        true,
      );
    }
  };
  $("replay-report").onclick = () => {
    if (verification) download(verification, "finevidence-verification.json");
  };
  $("replay-file").onchange = async () => {
    const file = $("replay-file").files[0];
    if (!file) return;
    verification = null;
    $("replay-report").disabled = true;
    $("replay-checks").replaceChildren();
    $("replay-detail").textContent = "";
    // The native picker is cleared for reselection; this identity survives it.
    // Clear every old digest before any asynchronous work or failure.
    $("replay-identity").hidden = false;
    $("replay-name").textContent = file.name;
    $("replay-hash-short").textContent = "";
    $("replay-hash-full").textContent = "";
    $("replay-fingerprint").hidden = true;
    $("replay-fingerprint").open = false;
    $("replay-hash-state").textContent = "读取中，尚未生成";
    $("handoff").setAttribute("aria-busy", "true");
    $("replay-file").disabled = true;
    status("正在本机读取文件并重新执行确定性工具…");
    try {
      // Yield a paint so assistive technology and visible UI can observe loading.
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      if (file.size > MAX_REPLAY_BYTES) throw Error("FILE_LIMIT");
      const bytes = await file.arrayBuffer();
      let raw;
      try {
        raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw Error("UTF8_INVALID");
      }
      verification = {
        ...verifyReplay(raw, corpus, manifest),
        file_name: file.name,
        file_sha256: await sha256(bytes),
        verified_at: new Date().toISOString(),
      };
      $("replay-hash-state").textContent = "";
      $("replay-hash-short").textContent = verification.file_sha256.slice(
        0,
        12,
      );
      $("replay-hash-full").textContent = verification.file_sha256;
      $("replay-fingerprint").hidden = false;
      for (const check of verification.checks) {
        const li = document.createElement("li");
        li.textContent = `${check.passed ? "一致" : "未通过"} · ${check.label}${check.passed ? "" : ` [${check.code}]`}`;
        li.className = check.passed ? "" : "error";
        for (const diff of check.differences || []) {
          const detail = document.createElement("p");
          detail.className = "difference";
          detail.textContent = `${diff.path}\n文件：${diff.received}\n当前样本：${diff.expected}`;
          li.append(detail);
        }
        $("replay-checks").append(li);
      }
      const failure = verification.checks.find((c) => !c.passed);
      status(
        verification.passed
          ? "内容与当前受信样本复算一致。此结果不认证交接者或人工审批。"
          : `发现差异或文件不受支持，请核对下列项目。[${failure.code}]`,
        !verification.passed,
      );
      const detail = [];
      if (verification.recomputed_display)
        detail.push(`当前受信样本复算：${verification.recomputed_display}`);
      if (verification.request)
        detail.push(
          `${verification.request.company} · ${verification.request.year} · ${verification.request.operation}`,
        );
      if (verification.citation_count !== undefined)
        detail.push(
          `文件声明已核对 ${verification.reviewed_count} / ${verification.citation_count} 项（未经身份认证）。`,
        );
      if (verification.warnings.includes("VERSION_DIFFERS"))
        detail.push("代码版本不同，已按当前版本复算；未执行旧代码。");
      if (verification.notes)
        detail.push(`交接备注（未经认证）：${verification.notes}`);
      $("replay-detail").textContent = detail.join("\n");
      $("replay-report").disabled = false;
    } catch (e) {
      $("replay-hash-state").textContent = "未完成复核，未生成指纹";
      const code = ["FILE_LIMIT", "UTF8_INVALID"].includes(e.message)
        ? e.message
        : "FILE_READ_FAILED";
      status(
        `文件未被处理。请选择 256 KiB 以内的 UTF-8 复算包后重试。[${code}]`,
        true,
      );
    } finally {
      $("replay-file").value = "";
      $("replay-file").disabled = false;
      $("handoff").setAttribute("aria-busy", "false");
    }
  };
}
