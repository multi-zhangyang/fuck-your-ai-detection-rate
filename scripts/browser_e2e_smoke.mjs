import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = resolve(ROOT_DIR, "app");
const REPORT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_smoke_report.json");
const SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_smoke_failure.png");
const HOME_SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_home.png");
const RUNNING_SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_running.png");
const RESULTS_SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_results.png");
const MODEL_SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_model.png");
const MODEL_OFFICIAL_SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_model_deepseek.png");
const MODEL_MOBILE_SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_model_mobile.png");
const PROMPT_SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_prompt.png");
const PROMPT_PLAN_SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_prompt_plan.png");
const SCOPE_SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_scope.png");
const PROTECTION_SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_protection.png");
const SETTINGS_SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_settings.png");
const MANUAL_REVIEW_SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_manual_review.png");
const DIFF_SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_diff.png");
const COMPLETED_ACTIONS_SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_completed_actions.png");
const CONTINUE_SETTINGS_SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_continue_settings.png");
const EXPORT_WARNING_SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_export_warning.png");
const RECENT_SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_recent.png");
const TABLET_SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_tablet.png");
const MOBILE_SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_mobile.png");
const DEFAULT_TIMEOUT_MS = 90_000;

const SCOPE_FIXTURE_DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="1"/></w:pPr><w:r><w:t>智能门禁系统设计与实现</w:t></w:r></w:p>
    <w:p><w:r><w:t>摘要：本研究围绕校园门禁场景设计二维码验证流程，并通过10组实验完成可追溯的权限管理。</w:t></w:r></w:p>
    <w:p><w:r><w:t>关键词：门禁系统；二维码；权限管理</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="1"/></w:pPr><w:r><w:t>第一章 绪论</w:t></w:r></w:p>
    <w:p><w:r><w:t>系统采用分层架构，实验值10，能够支持访客登记、二维码核验和通行记录追溯。</w:t></w:r></w:p>
    <w:p><w:r><w:t>图1-1 系统总体架构</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="1"/></w:pPr><w:r><w:t>致谢</w:t></w:r></w:p>
    <w:p><w:r><w:t>在论文完成过程中，感谢指导教师在需求分析与论文修改方面给予的帮助。</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="1"/></w:pPr><w:r><w:t>参考文献</w:t></w:r></w:p>
    <w:p><w:r><w:t>[1] 张三. 智能门禁系统设计与实现[J]. 软件工程, 2024.</w:t></w:r></w:p>
    <w:p><w:r><w:t>[2] Li Ming. Access Control Workflow Design[J]. Systems, 2023.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Abstract: This paper designs a QR-code access-control workflow and verifies its traceable permission management.</w:t></w:r></w:p>
    <w:p><w:r><w:t>KeyWords: access control; QR code; permission management</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`;

const SCOPE_FIXTURE_EXPECTATIONS = [
  { label: "论文标题", text: "智能门禁系统设计与实现", selected: false },
  { label: "行内中文摘要", text: "摘要：本研究围绕校园门禁场景设计二维码验证流程，并通过10组实验完成可追溯的权限管理。", selected: true },
  { label: "中文关键词", text: "关键词：门禁系统；二维码；权限管理", selected: false },
  { label: "正文标题", text: "第一章 绪论", selected: false },
  { label: "正文", text: "系统采用分层架构，实验值10，能够支持访客登记、二维码核验和通行记录追溯。", selected: true },
  { label: "题注", text: "图1-1 系统总体架构", selected: false },
  { label: "致谢标题", text: "致谢", selected: false },
  { label: "致谢正文", text: "在论文完成过程中，感谢指导教师在需求分析与论文修改方面给予的帮助。", selected: true },
  { label: "参考文献标题", text: "参考文献", selected: false },
  { label: "中文参考文献", text: "[1] 张三. 智能门禁系统设计与实现[J]. 软件工程, 2024.", selected: false },
  { label: "英文参考文献", text: "[2] Li Ming. Access Control Workflow Design[J]. Systems, 2023.", selected: false },
  { label: "参考文献后的行内英文摘要", text: "Abstract: This paper designs a QR-code access-control workflow and verifies its traceable permission management.", selected: true },
  { label: "英文关键词", text: "KeyWords: access control; QR code; permission management", selected: false },
];

class ManagedProcess {
  constructor(name, command, args, options = {}) {
    this.name = name;
    this.command = command;
    this.args = args;
    this.logs = [];
    this.exitCode = null;
    this.process = spawn(command, args, {
      cwd: options.cwd || ROOT_DIR,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const append = (stream, chunk) => {
      const text = String(chunk || "");
      this.logs.push(`[${stream}] ${text}`);
      if (this.logs.length > 80) this.logs.splice(0, this.logs.length - 80);
    };
    this.process.stdout?.on("data", (chunk) => append("stdout", chunk));
    this.process.stderr?.on("data", (chunk) => append("stderr", chunk));
    this.process.on("exit", (code) => {
      this.exitCode = code;
    });
  }

  tail() {
    return this.logs.join("").slice(-5000);
  }

  stop() {
    if (!this.process || this.process.killed || this.exitCode !== null) return;
    this.process.kill("SIGTERM");
    windowlessKillFallback(this.process);
  }
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.callbacks = new Map();
    this.eventHandlers = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.webSocketUrl);
      this.socket.addEventListener("open", () => resolve());
      this.socket.addEventListener("error", () => reject(new Error("Failed to connect to browser CDP websocket.")), { once: true });
      this.socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data || "{}"));
        if (message.id && this.callbacks.has(message.id)) {
          const { resolve: resolveCallback, reject: rejectCallback } = this.callbacks.get(message.id);
          this.callbacks.delete(message.id);
          if (message.error) {
            rejectCallback(new Error(message.error.message || JSON.stringify(message.error)));
          } else {
            resolveCallback(message.result || {});
          }
          return;
        }
        if (message.method) {
          const handlers = this.eventHandlers.get(message.method) || [];
          handlers.forEach((handler) => handler(message.params || {}));
        }
      });
    });
  }

  on(eventName, handler) {
    const handlers = this.eventHandlers.get(eventName) || [];
    handlers.push(handler);
    this.eventHandlers.set(eventName, handlers);
  }

  send(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`Browser CDP socket is not open for ${method}.`));
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.socket.send(payload);
    });
  }

  close() {
    try {
      this.socket?.close();
    } catch {
      // Ignore close errors during cleanup.
    }
  }
}

function windowlessKillFallback(childProcess) {
  setTimeout(() => {
    if (!childProcess.killed && childProcess.exitCode === null) {
      childProcess.kill("SIGKILL");
    }
  }, 2500).unref?.();
}

function npmInvocation(args) {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "npm", ...args],
    };
  }
  return { command: "npm", args };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function requestOk(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForHttp(url, timeoutMs, label, managedProcess = null) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (managedProcess?.exitCode !== null) {
      throw new Error(`${label} exited early with code ${managedProcess.exitCode}.\n${managedProcess.tail()}`);
    }
    if (await requestOk(url)) {
      return;
    }
    await wait(500);
  }
  throw new Error(`Timed out waiting for ${label}: ${url}\n${managedProcess?.tail() || ""}`);
}

function getBrowserCandidates() {
  const candidates = [];
  if (process.env.FYADR_E2E_BROWSER) candidates.push(process.env.FYADR_E2E_BROWSER);
  if (process.platform === "win32") {
    const roots = [
      process.env.PROGRAMFILES,
      process.env["PROGRAMFILES(X86)"],
      process.env.LOCALAPPDATA,
    ].filter(Boolean);
    for (const root of roots) {
      candidates.push(
        join(root, "Google", "Chrome", "Application", "chrome.exe"),
        join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
        join(root, "Chromium", "Application", "chrome.exe"),
      );
    }
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge",
      "/usr/bin/microsoft-edge-stable",
    );
  }
  return candidates.filter((candidate, index, list) => candidate && list.indexOf(candidate) === index);
}

function findBrowserExecutable() {
  const browser = getBrowserCandidates().find((candidate) => existsSync(candidate));
  if (!browser) {
    throw new Error("未找到 Chrome / Edge。可设置 FYADR_E2E_BROWSER 指向浏览器可执行文件后重试。");
  }
  return browser;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function evaluate(client, expression, timeoutMs = 5000) {
  const result = await withTimeout(
    client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: timeoutMs,
    }),
    timeoutMs + 1000,
    `Runtime.evaluate timed out: ${expression.slice(0, 120)}`,
  );
  if (result.exceptionDetails) {
    throw new Error(`Browser evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result?.value;
}

async function waitForText(client, text, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await evaluate(client, `document.body?.innerText?.includes(${JSON.stringify(text)}) ?? false`, 3000);
    if (found) return;
    await wait(250);
  }
  const body = await evaluate(client, "document.body?.innerText?.slice(0, 1200) ?? ''", 3000);
  throw new Error(`Timed out waiting for text: ${text}\nCurrent page text:\n${body}`);
}

async function waitForTextGone(client, text, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await evaluate(client, `document.body?.innerText?.includes(${JSON.stringify(text)}) ?? false`, 3000);
    if (!found) return;
    await wait(250);
  }
  throw new Error(`Timed out waiting for text to disappear: ${text}`);
}

async function waitForExpression(client, expression, label, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await evaluate(client, expression, 3000);
    if (found) return;
    await wait(250);
  }
  const body = await evaluate(client, "document.body?.innerText?.slice(0, 1200) ?? ''", 3000);
  throw new Error(`Timed out waiting for ${label}\nCurrent page text:\n${body}`);
}

async function clickElementByText(client, text, preferLast = false) {
  return evaluate(client, `(() => {
    const needle = ${JSON.stringify(text)};
    const preferLast = ${JSON.stringify(preferLast)};
    const selector = 'button,a,[role="button"],[role="option"],summary,label,input,textarea,[tabindex]';
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const isEnabled = (element) => !element.disabled && element.getAttribute('aria-disabled') !== 'true';
    const labelOf = (element) => (
      element.getAttribute('aria-label')
      || element.innerText
      || element.value
      || element.getAttribute('title')
      || element.textContent
      || ''
    ).replace(/\\s+/g, ' ').trim();
    const visibleCandidates = Array.from(document.querySelectorAll(selector)).filter((element) => isVisible(element));
    const pick = (items) => preferLast ? items[items.length - 1] : items[0];
    const exactVisible = visibleCandidates.filter((element) => labelOf(element) === needle);
    const exact = exactVisible.filter(isEnabled);
    if (exactVisible.length && !exact.length) return null;
    const partial = visibleCandidates.filter((element) => isEnabled(element) && labelOf(element).includes(needle));
    const element = pick(exact) || pick(partial);
    if (!element) return null;
    element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
    const label = labelOf(element);
    element.click();
    return label;
  })()`);
}

async function clickByText(client, text, timeoutMs = 10_000, preferLast = false) {
  const started = Date.now();
  let label = null;
  while (Date.now() - started < timeoutMs) {
    label = await clickElementByText(client, text, preferLast);
    if (label) break;
    await wait(250);
  }
  if (!label) {
    const body = await evaluate(client, "document.body?.innerText?.slice(0, 1200) ?? ''", 3000);
    throw new Error(`Unable to find enabled clickable text: ${text}\nCurrent page text:\n${body}`);
  }
  await wait(150);
  return label;
}

async function clickSelector(client, selector) {
  const started = Date.now();
  let point = null;
  while (Date.now() - started < 3000) {
    point = await evaluate(client, `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element || element.disabled) return null;
      element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (!hit || (hit !== element && !element.contains(hit))) return null;
      return { x, y };
    })()`);
    if (point) break;
    await wait(50);
  }
  if (!point) throw new Error(`Unable to click selector: ${selector}`);
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await wait(150);
}

async function selectTabByText(client, text) {
  const selected = await evaluate(client, `(() => {
    const needle = ${JSON.stringify(text)};
    const tab = Array.from(document.querySelectorAll('[role="tab"]')).find((element) => (
      (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim() === needle
      && !element.disabled
      && element.getBoundingClientRect().width > 0
      && element.getBoundingClientRect().height > 0
    ));
    if (!tab) return false;
    tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    tab.click();
    return true;
  })()`, 3000);
  if (!selected) throw new Error(`Unable to select tab: ${text}`);
  await wait(200);
}

async function selectReviewDecision(client, text) {
  const selector = `button[aria-label="${text}"]`;
  await clickSelector(client, selector);
  await waitForExpression(
    client,
    `document.querySelector(${JSON.stringify(selector)})?.getAttribute('data-state') === 'on'`,
    `review decision ${text}`,
    12_000,
  );
}

async function openReviewParagraphBrowser(client) {
  const alreadyOpen = await evaluate(client, "Boolean(document.querySelector('[data-review-nav]'))", 3000);
  if (!alreadyOpen) {
    await clickSelector(client, '[aria-label="选择段落"]');
    await waitForExpression(
      client,
      "Boolean(document.querySelector('[data-review-nav]'))",
      "paragraph browser to open",
      12_000,
    );
  }
}

async function getReviewParagraphIds(client, incompleteOnly = false) {
  await openReviewParagraphBrowser(client);
  return evaluate(
    client,
    `Array.from(document.querySelectorAll('[data-review-nav]'))
      .filter((item) => ${incompleteOnly ? "item.getAttribute('data-review-complete') !== 'true'" : "true"})
      .map((item) => item.getAttribute('data-review-nav'))
      .filter(Boolean)`,
    3000,
  );
}

async function chooseReviewParagraph(client, paragraphId) {
  await openReviewParagraphBrowser(client);
  const selected = await evaluate(
    client,
    `(() => {
      const paragraphId = ${JSON.stringify(paragraphId)};
      const item = Array.from(document.querySelectorAll('[data-review-nav]')).find((candidate) =>
        candidate.getAttribute('data-review-nav') === paragraphId
      );
      if (!item) return false;
      item.click();
      return true;
    })()`,
    3000,
  );
  if (!selected) throw new Error(`Unable to choose review paragraph: ${paragraphId}`);
  await waitForExpression(
    client,
    `document.querySelector('[data-review-detail]')?.getAttribute('data-review-paragraph') === ${JSON.stringify(paragraphId)}`,
    `review paragraph ${paragraphId} to open`,
    12_000,
  );
}

async function setControlValue(client, selector, value) {
  const focused = await evaluate(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    element.focus();
    element.select();
    return true;
  })()`);
  if (!focused) throw new Error(`Unable to set control: ${selector}`);
  await client.send("Input.insertText", { text: value });
  await wait(100);
}

async function uploadFile(client, filePath) {
  await client.send("DOM.enable");
  const documentNode = await client.send("DOM.getDocument", { depth: 2, pierce: true });
  const node = await client.send("DOM.querySelector", {
    nodeId: documentNode.root.nodeId,
    selector: 'input[type="file"]',
  });
  if (!node.nodeId) throw new Error("Document file input was not found.");
  await client.send("DOM.setFileInputFiles", { nodeId: node.nodeId, files: [filePath] });
  await wait(200);
}

async function pressKey(client, key) {
  const keyCode = key === "Escape" ? 27 : 0;
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
  await wait(150);
}

async function captureScreenshot(client, path) {
  try {
    const result = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    if (result.data) {
      writeFileSync(path, Buffer.from(result.data, "base64"));
    }
  } catch {
    // Screenshot is best-effort.
  }
}

async function getPageWebSocket(debugPort, targetUrl) {
  const list = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
  const page = list.find((item) => item.type === "page" && String(item.url || "").startsWith(targetUrl))
    || list.find((item) => item.type === "page");
  if (!page?.webSocketDebuggerUrl) {
    throw new Error("Unable to find browser page target.");
  }
  return page.webSocketDebuggerUrl;
}

async function runSmoke() {
  const started = Date.now();
  const checks = [];
  const warnings = [];
  const managedProcesses = [];
  let browserClient = null;
  let browserProcess = null;
  let userDataDir = "";
  let backendDataDir = "";
  let fixtureDir = "";
  const browserExecutable = findBrowserExecutable();
  const mockPort = Number(process.env.FYADR_E2E_MOCK_PORT || await getFreePort());
  const mockUrl = `http://127.0.0.1:${mockPort}`;
  const externalBackendUrl = process.env.FYADR_E2E_BACKEND_URL || "";
  const backendPort = Number(process.env.FYADR_E2E_BACKEND_PORT || await getFreePort());
  const backendUrl = externalBackendUrl || `http://127.0.0.1:${backendPort}`;
  const frontendPort = Number(process.env.FYADR_E2E_FRONTEND_PORT || await getFreePort());
  const debugPort = Number(process.env.FYADR_E2E_DEBUG_PORT || await getFreePort());
  const frontendUrl = process.env.FYADR_E2E_URL || `http://127.0.0.1:${frontendPort}`;
  const backendHealthUrl = `${backendUrl}/api/ping`;

  try {
    fixtureDir = mkdtempSync(join(tmpdir(), "fyadr-e2e-fixtures-"));
    const docxFixturePath = join(fixtureDir, "示例文档.docx");
    const docxFixtureXmlPath = join(fixtureDir, "示例文档-document.xml");
    const txtFixturePath = join(fixtureDir, "示例文档.txt");
    const downloadDir = join(fixtureDir, "downloads");
    mkdirSync(downloadDir, { recursive: true });
    writeFileSync(docxFixtureXmlPath, SCOPE_FIXTURE_DOCUMENT_XML, "utf-8");
    writeFileSync(txtFixturePath, "TXT 实验值为 10。", "utf-8");
    const fixtureResult = spawnSync(
      process.env.PYTHON || "python",
      [
        "-c",
        "import pathlib,sys; sys.path.insert(0, 'scripts'); from core_docx_regression import fixture_docx; pathlib.Path(sys.argv[2]).write_bytes(fixture_docx(pathlib.Path(sys.argv[1]).read_bytes()))",
        docxFixtureXmlPath,
        docxFixturePath,
      ],
      { cwd: ROOT_DIR, encoding: "utf-8", windowsHide: true },
    );
    if (fixtureResult.status !== 0) {
      throw new Error(`Unable to create DOCX fixture.\n${fixtureResult.stderr || fixtureResult.stdout || ""}`);
    }

    const provider = new ManagedProcess("mock-provider", process.env.PYTHON || "python", ["scripts/e2e_mock_provider.py"], {
      cwd: ROOT_DIR,
      env: { FYADR_MOCK_PORT: String(mockPort) },
    });
    managedProcesses.push(provider);
    await waitForHttp(`${mockUrl}/health`, DEFAULT_TIMEOUT_MS, "mock model provider", provider);
    checks.push("isolated streaming model provider ready");

    if (!externalBackendUrl) {
      backendDataDir = mkdtempSync(join(tmpdir(), "fyadr-e2e-backend-"));
      const backend = new ManagedProcess("backend", process.env.PYTHON || "python", ["scripts/web_app.py"], {
        cwd: ROOT_DIR,
        env: {
          FYADR_CONFIG_DIR: join(backendDataDir, "config"),
          FYADR_DATA_DIR: join(backendDataDir, "data"),
          FYADR_PORT: String(backendPort),
        },
      });
      managedProcesses.push(backend);
      await waitForHttp(backendHealthUrl, DEFAULT_TIMEOUT_MS, "backend", backend);
      checks.push("backend started or became reachable");
    } else if (await requestOk(backendHealthUrl, 2000)) {
      checks.push("backend already reachable");
    } else {
      throw new Error(`External backend is not reachable: ${backendHealthUrl}`);
    }

    const npmDev = npmInvocation(["run", "dev", "--", "--host", "127.0.0.1", "--port", String(frontendPort), "--strictPort", "--force"]);
    const frontend = new ManagedProcess("vite", npmDev.command, npmDev.args, {
      cwd: APP_DIR,
      env: { FYADR_BACKEND_URL: backendUrl },
    });
    managedProcesses.push(frontend);
    await waitForHttp(frontendUrl, DEFAULT_TIMEOUT_MS, "frontend", frontend);
    checks.push("frontend dev server reachable");

    userDataDir = mkdtempSync(join(tmpdir(), "fyadr-e2e-"));
    browserProcess = new ManagedProcess("browser", browserExecutable, [
      "--headless=new",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-gpu",
      "--window-size=1440,1000",
      frontendUrl,
    ]);
    managedProcesses.push(browserProcess);
    await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, DEFAULT_TIMEOUT_MS, "browser CDP", browserProcess);

    const webSocketUrl = await getPageWebSocket(debugPort, frontendUrl);
    browserClient = new CdpClient(webSocketUrl);
    await browserClient.connect();
    await browserClient.send("Page.enable");
    await browserClient.send("Runtime.enable");
    await browserClient.send("Log.enable").catch(() => undefined);
    await browserClient.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        localStorage.setItem('fyadr.themeMode', 'light');
        localStorage.setItem('fyadr.themeMode.defaultDarkMigrated', '1');
      `,
    });
    await browserClient.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir }).catch(() => undefined);
    await browserClient.send("Page.navigate", { url: frontendUrl });
    await waitForText(browserClient, "选择文件", DEFAULT_TIMEOUT_MS);
    checks.push("focused rewrite home renders");

    await clickByText(browserClient, "模型连接");
    await waitForText(browserClient, "DeepSeek 官方", 12_000);
    await waitForExpression(browserClient, "Boolean(document.querySelector('#base-url'))", "model profile editor", 12_000);
    const officialDeepSeek = await evaluate(
      browserClient,
      `(() => {
        const editor = document.querySelector('[data-testid="model-profile-editor"]');
        const connectionList = document.querySelector('[data-testid="model-profile-list"]');
        const form = editor?.querySelector('[data-testid="model-profile-form"]');
        const baseUrl = editor?.querySelector('#base-url');
        const defaultSwitch = editor?.querySelector('#make-default');
        const newConnectionButton = Array.from(connectionList?.querySelectorAll('button') || [])
          .find((item) => (item.innerText || '').includes('新建连接'));
        const firstProfileButton = Array.from(connectionList?.querySelectorAll('button') || [])
          .find((item) => !(item.innerText || '').includes('新建连接'));
        const protocolLabels = Array.from(editor?.querySelectorAll('button[aria-label]') || []).map((item) => item.getAttribute('aria-label'));
        const buttons = Array.from(editor?.querySelectorAll('button') || []).map((item) => (item.innerText || '').trim());
        return {
          found: Boolean(editor),
          officialTitle: editor?.innerText.includes('DeepSeek 官方') || false,
          officialUrl: baseUrl?.value || '',
          officialUrlLocked: Boolean(baseUrl?.readOnly),
          hasChat: protocolLabels.includes('使用 Chat Completions'),
          hasResponses: protocolLabels.includes('使用 Responses'),
          hasReasoningChoices: ['关闭', '低', '高', '最大'].every((label) => buttons.includes(label)),
          hasModelDiscovery: Boolean(editor?.querySelector('button[aria-label="获取模型"]')),
          hasHardcodedModel: editor?.innerText.includes('deepseek-flash') || editor?.innerText.includes('deepseek-v4-pro') || false,
          hasDeleteAction: Boolean(editor?.querySelector('[aria-label="删除连接"]')),
          defaultControlInHeader: Boolean(defaultSwitch && form && !form.contains(defaultSwitch)),
          createActionBeforeProfiles: Boolean(
            newConnectionButton
            && firstProfileButton
            && (newConnectionButton.compareDocumentPosition(firstProfileButton) & Node.DOCUMENT_POSITION_FOLLOWING)
          ),
          pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        };
      })()`,
      3000,
    );
    if (
      !officialDeepSeek.found
      || !officialDeepSeek.officialTitle
      || officialDeepSeek.officialUrl !== "https://api.deepseek.com"
      || !officialDeepSeek.officialUrlLocked
      || !officialDeepSeek.hasChat
      || !officialDeepSeek.hasResponses
      || !officialDeepSeek.hasReasoningChoices
      || !officialDeepSeek.hasModelDiscovery
      || officialDeepSeek.hasHardcodedModel
      || officialDeepSeek.hasDeleteAction
      || !officialDeepSeek.defaultControlInHeader
      || !officialDeepSeek.createActionBeforeProfiles
      || officialDeepSeek.pageOverflow
    ) {
      throw new Error(`Official DeepSeek preset is incomplete or editable: ${JSON.stringify(officialDeepSeek)}`);
    }
    await clickSelector(browserClient, 'button[aria-label="使用 Responses"]');
    await waitForExpression(
      browserClient,
      `document.querySelector('button[aria-label="使用 Responses"]')?.getAttribute('data-state') === 'on'`,
      "DeepSeek Responses protocol selection",
      3000,
    );
    await clickByText(browserClient, "最大");
    await waitForExpression(
      browserClient,
      "Boolean(document.querySelector('#profile-temperature')?.disabled)",
      "DeepSeek reasoning disables temperature",
      3000,
    );
    await captureScreenshot(browserClient, MODEL_OFFICIAL_SCREENSHOT_PATH);
    checks.push("official DeepSeek preset locks its endpoint, supports both protocols and exposes official reasoning levels without a delete action");

    await clickByText(browserClient, "新建连接");
    await waitForExpression(browserClient, "Boolean(document.querySelector('#profile-name'))", "custom connection editor", 12_000);
    const blankConnectionActions = await evaluate(
      browserClient,
      `(() => {
        const actions = document.querySelector('[data-testid="model-profile-actions"]');
        const buttons = Array.from(actions?.querySelectorAll('button') || []);
        const validate = buttons.find((button) => button.innerText.includes('验证连接'));
        const save = buttons.find((button) => button.innerText.trim() === '保存');
        return {
          validateEnabled: Boolean(validate && !validate.disabled),
          saveEnabled: Boolean(save && !save.disabled),
        };
      })()`,
      3000,
    );
    if (!blankConnectionActions.validateEnabled || !blankConnectionActions.saveEnabled) {
      throw new Error(`Incomplete connection actions are silently disabled: ${JSON.stringify(blankConnectionActions)}`);
    }
    await clickByText(browserClient, "获取模型");
    await waitForText(browserClient, "无法获取模型", 3000);
    await clickByText(browserClient, "验证连接");
    await waitForText(browserClient, "无法验证连接", 3000);
    await clickByText(browserClient, "保存");
    await waitForText(browserClient, "无法保存", 3000);
    await setControlValue(browserClient, "#profile-name", "本地连接一");
    await setControlValue(browserClient, "#base-url", `${mockUrl}/v1`);
    await setControlValue(browserClient, "#api-key", "e2e-local-key");
    await clickByText(browserClient, "获取模型");
    const actionsDuringModelLoad = await evaluate(
      browserClient,
      `(() => {
        const actions = document.querySelector('[data-testid="model-profile-actions"]');
        const buttons = Array.from(actions?.querySelectorAll('button') || []);
        const validate = buttons.find((button) => button.innerText.includes('验证连接'));
        const save = buttons.find((button) => button.innerText.trim() === '保存');
        return {
          validateEnabled: Boolean(validate && !validate.disabled),
          saveEnabled: Boolean(save && !save.disabled),
        };
      })()`,
      3000,
    );
    if (!actionsDuringModelLoad.validateEnabled || !actionsDuringModelLoad.saveEnabled) {
      throw new Error(`Model discovery incorrectly locks unrelated actions: ${JSON.stringify(actionsDuringModelLoad)}`);
    }
    checks.push("model validation and save remain actionable during incomplete input and model discovery");
    await waitForExpression(
      browserClient,
      "Boolean(document.querySelector('[data-testid=\"model-profile-form\"]')?.innerText.includes('example-chat'))",
      "discovered model to populate the model selector",
      12_000,
    );
    await clickByText(browserClient, "验证连接");
    await waitForText(browserClient, "连接正常", 12_000);
    await clickByText(browserClient, "保存");
    await waitForText(browserClient, "已保存", 12_000);
    await clickSelector(browserClient, "#make-default");
    await waitForExpression(
      browserClient,
      "document.querySelector('#make-default')?.getAttribute('data-state') === 'checked'",
      "default connection switch to turn on",
      3000,
    );
    await clickByText(browserClient, "保存");
    await waitForExpression(
      browserClient,
      `(async () => {
        const settings = await fetch('/api/settings').then((response) => response.json());
        const profile = settings.modelProfiles.find((item) => item.name === '本地连接一');
        return Boolean(profile && settings.defaultModelProfileId === profile.id);
      })()`,
      "default connection to persist",
      12_000,
    );
    await clickSelector(browserClient, "#make-default");
    await waitForExpression(
      browserClient,
      "document.querySelector('#make-default')?.getAttribute('data-state') === 'unchecked'",
      "default connection switch to turn off",
      3000,
    );
    await clickByText(browserClient, "保存");
    await waitForExpression(
      browserClient,
      `(async () => {
        const settings = await fetch('/api/settings').then((response) => response.json());
        return settings.defaultModelProfileId === '';
      })()`,
      "default connection to clear",
      12_000,
    );
    checks.push("connection creation stays beside the list and the default connection can be selected and cleared");
    const toastOnlyFeedback = await evaluate(
      browserClient,
      `(() => {
        const form = document.querySelector('[data-testid="model-profile-form"]');
        return {
          hasNotificationCenter: Boolean(document.querySelector('[data-testid="notification-center"]')),
          hasNotificationTrigger: Array.from(document.querySelectorAll('button')).some((item) =>
            (item.getAttribute('aria-label') || '').includes('通知')
          ),
          feedbackStillOccupiesForm: Boolean(form?.innerText.includes('连接正常') || form?.innerText.includes('连接已保存')),
          persistsHistory: localStorage.getItem('fyadr.notificationHistory') !== null,
        };
      })()`,
      3000,
    );
    if (
      toastOnlyFeedback.hasNotificationCenter
      || toastOnlyFeedback.hasNotificationTrigger
      || toastOnlyFeedback.feedbackStillOccupiesForm
      || toastOnlyFeedback.persistsHistory
    ) {
      throw new Error(`Operation feedback still duplicates or persists notifications: ${JSON.stringify(toastOnlyFeedback)}`);
    }
    checks.push("operation feedback stays in transient toasts without a duplicate notification center or stored history");
    const savedKeyEditor = await evaluate(
      browserClient,
      `(() => {
        const input = document.querySelector('#api-key');
        return input ? { value: input.value, placeholder: input.getAttribute('placeholder') || '' } : null;
      })()`,
      3000,
    );
    if (!savedKeyEditor || savedKeyEditor.value !== "" || !savedKeyEditor.placeholder.includes("留空不变")) {
      throw new Error(`Saved API key editor has ambiguous keep/replace semantics: ${JSON.stringify(savedKeyEditor)}`);
    }
    await clickByText(browserClient, "验证连接");
    await waitForText(browserClient, "连接正常", 12_000);
    await clickByText(browserClient, "新建连接");
    await waitForExpression(browserClient, "document.querySelector('#profile-name')?.value === ''", "blank OpenAI-compatible channel editor", 3000);
    await setControlValue(browserClient, "#profile-name", "本地连接二");
    await setControlValue(browserClient, "#base-url", `${mockUrl}/v1`);
    await setControlValue(browserClient, "#api-key", "e2e-second-key");
    await setControlValue(browserClient, "#profile-model", "example-chat");
    await clickByText(browserClient, "保存");
    await waitForText(browserClient, "已保存", 12_000);
    await waitForExpression(
      browserClient,
      `(async () => {
        const settings = await fetch('/api/settings').then((response) => response.json());
        return settings.modelProfiles.filter((profile) => profile.provider !== 'deepseek').length === 2;
      })()`,
      "two saved OpenAI-compatible connections",
      12_000,
    );
    checks.push("OpenAI-compatible channels can be created more than once, save secrets locally, and preserve an existing key when its editor is blank");
    await waitForExpression(
      browserClient,
      "!document.querySelector('[data-sonner-toast]')",
      "model notification to clear before documentation capture",
      12_000,
    );
    await captureScreenshot(browserClient, MODEL_SCREENSHOT_PATH);

    await browserClient.send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
    await wait(300);
    const compactModelLayout = await evaluate(
      browserClient,
      `(() => {
        const workspace = document.querySelector('[data-slot="resizable-panel-group"]:has([data-testid="model-profile-editor"])');
        const editor = document.querySelector('[data-testid="model-profile-editor"]');
        const form = document.querySelector('[data-testid="model-profile-form"]');
        const actions = document.querySelector('[data-testid="model-profile-actions"]');
        const connectionList = document.querySelector('[data-testid="model-profile-list"]');
        const sidebar = document.querySelector('[data-state][data-collapsible][data-variant][data-side]');
        if (!workspace || !editor || !form || !actions || !connectionList) return {
          found: false,
          workspace: Boolean(workspace),
          editor: Boolean(editor),
          form: Boolean(form),
          actions: Boolean(actions),
          connectionList: Boolean(connectionList),
          sidebar: Boolean(sidebar),
        };
        const editorRect = editor.getBoundingClientRect();
        const listRect = connectionList.getBoundingClientRect();
        const actionsRect = actions.getBoundingClientRect();
        return {
          found: true,
          editorWidth: Math.round(editorRect.width),
          listIsLeft: listRect.right <= editorRect.left,
          navigationState: sidebar?.getAttribute('data-state') || '',
          pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          actionsVisible: actionsRect.top >= 0 && actionsRect.bottom <= window.innerHeight + 1,
          connectionCount: connectionList.querySelectorAll('button').length,
          hasFormContent: form.scrollHeight > 0,
        };
      })()`,
      3000,
    );
    if (
      !compactModelLayout.found
      || compactModelLayout.navigationState !== "collapsed"
      || compactModelLayout.pageOverflow
      || !compactModelLayout.listIsLeft
      || compactModelLayout.editorWidth < 560
      || !compactModelLayout.actionsVisible
      || compactModelLayout.connectionCount < 3
      || !compactModelLayout.hasFormContent
    ) {
      throw new Error(`Medium-width model settings layout is cramped or overflowing: ${JSON.stringify(compactModelLayout)}`);
    }
    await browserClient.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await wait(300);
    const mobileModelLayout = await evaluate(
      browserClient,
      `(() => {
        const workspace = document.querySelector('[data-testid="model-profile-workspace"]')
          || document.querySelector('[data-slot="resizable-panel-group"]:has([data-testid="model-profile-editor"])');
        const editor = document.querySelector('[data-testid="model-profile-editor"]');
        const footer = editor?.querySelector('[data-testid="model-profile-actions"]');
        const controls = Array.from(editor?.querySelectorAll('input, button') || []).filter((item) => {
          const rect = item.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        return {
          found: Boolean(workspace && editor),
          pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          clippedControls: controls.filter((item) => {
            const rect = item.getBoundingClientRect();
            return rect.left < -1 || rect.right > window.innerWidth + 1;
          }).length,
          actionsVisible: footer ? (() => {
            const rect = footer.getBoundingClientRect();
            return rect.top >= 0 && rect.bottom <= window.innerHeight + 1;
          })() : false,
        };
      })()`,
      3000,
    );
    if (!mobileModelLayout.found || mobileModelLayout.pageOverflow || mobileModelLayout.clippedControls || !mobileModelLayout.actionsVisible) {
      throw new Error(`Mobile model settings layout clips controls or overflows: ${JSON.stringify(mobileModelLayout)}`);
    }
    await captureScreenshot(browserClient, MODEL_MOBILE_SCREENSHOT_PATH);
    await browserClient.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await wait(300);
    checks.push("model settings stack into readable list and editor regions at tablet and mobile widths without horizontal overflow");

    await clickByText(browserClient, "提示词方案");
    await waitForText(browserClient, "提示词", 12_000);
    await waitForExpression(browserClient, "Boolean(document.querySelector('textarea'))", "prompt editor textarea", 12_000);
    await clickByText(browserClient, "新建", 12_000);
    await waitForExpression(
      browserClient,
      "Boolean(document.querySelector('#template-name') && !document.querySelector('#template-name').disabled)",
      "new prompt template editor",
      12_000,
    );
    await setControlValue(browserClient, "#template-name", "学术表达优化");
    await setControlValue(browserClient, "#template-content", "请保持事实并改写以下内容。\n\n待改写内容：\n{{text}}");
    await clickByText(browserClient, "保存", 12_000);
    await waitForText(browserClient, "提示词已保存", 12_000);
    checks.push("a new prompt template opens an editable form and can be saved");
    await waitForExpression(
      browserClient,
      "!document.querySelector('[data-sonner-toast]')",
      "prompt notification to clear before documentation capture",
      12_000,
    );
    await captureScreenshot(browserClient, PROMPT_SCREENSHOT_PATH);
    const promptEditorSize = await evaluate(
      browserClient,
      `(() => {
        const workspace = document.querySelector('[data-testid="prompt-workspace"]');
        const editor = document.querySelector('#template-content');
        if (!workspace || !editor) return { found: false };
        const workspaceRect = workspace.getBoundingClientRect();
        const editorRect = editor.getBoundingClientRect();
        return {
          found: true,
          workspaceHeight: workspaceRect.height,
          editorHeight: editorRect.height,
          fillsWorkspace: editorRect.height >= Math.min(480, workspaceRect.height * 0.55),
        };
      })()`,
      3000,
    );
    if (!promptEditorSize.found || !promptEditorSize.fillsWorkspace) {
      throw new Error(`Prompt editor leaves most of the editor panel unused: ${JSON.stringify(promptEditorSize)}`);
    }
    checks.push("prompt content editor fills the available editor panel");
    const promptPageUsesFixedBoundary = await evaluate(browserClient, "Boolean(document.querySelector('textarea') && getComputedStyle(document.documentElement).overflow === 'hidden' && getComputedStyle(document.body).overflow === 'hidden')", 3000);
    if (!promptPageUsesFixedBoundary) {
      throw new Error("Prompt workspace did not render inside the fixed page boundary.");
    }
    await browserClient.send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
    await wait(300);
    const compactPromptLayout = await evaluate(
      browserClient,
      `(() => {
        const workspace = document.querySelector('[data-testid="prompt-workspace"]');
        const editor = document.querySelector('#template-content');
        if (!workspace || !editor) return { found: false };
        editor.scrollIntoView({ block: 'center' });
        const rect = editor.getBoundingClientRect();
        return {
          found: true,
          editorVisible: rect.width > 0 && rect.height > 0 && rect.right <= window.innerWidth + 1,
          pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          workspaceContained: workspace.getBoundingClientRect().bottom <= window.innerHeight + 1,
        };
      })()`,
      3000,
    );
    if (!compactPromptLayout.found || !compactPromptLayout.editorVisible || compactPromptLayout.pageOverflow || !compactPromptLayout.workspaceContained) {
      throw new Error(`Compact prompt workspace clipped its editor: ${JSON.stringify(compactPromptLayout)}`);
    }
    await browserClient.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await wait(300);
    checks.push("prompt library stacks into a scrollable editor instead of clipping at medium widths");
    await selectTabByText(browserClient, "方案");
    await waitForText(browserClient, "执行步骤", 12_000);
    await clickByText(browserClient, "新建", 12_000);
    await setControlValue(browserClient, "#plan-name", "表达优化方案");
    await clickByText(browserClient, "添加步骤", 12_000);
    await clickSelector(browserClient, '[data-testid="prompt-plan-step-1"]');
    await clickByText(browserClient, "学术表达优化", 12_000, true);
    await clickByText(browserClient, "保存", 12_000);
    await waitForText(browserClient, "方案已保存", 12_000);
    checks.push("a custom prompt plan can be created from the UI with an ordered first step");
    await waitForExpression(
      browserClient,
      "!document.querySelector('[data-sonner-toast]')",
      "prompt plan notification to clear before documentation capture",
      12_000,
    );
    await captureScreenshot(browserClient, PROMPT_PLAN_SCREENSHOT_PATH);
    await clickByText(browserClient, "最近文档");
    await waitForText(browserClient, "还没有文档", 12_000);
    await captureScreenshot(browserClient, RECENT_SCREENSHOT_PATH);
    await clickByText(browserClient, "开始改写");
    await waitForText(browserClient, "选择文件", 12_000);
    await waitForExpression(
      browserClient,
      "!document.querySelector('[data-sonner-toast]')",
      "home notification to clear before documentation capture",
      12_000,
    );
    await captureScreenshot(browserClient, HOME_SCREENSHOT_PATH);
    const desktopRewriteLayout = await evaluate(
      browserClient,
      `(() => {
        const empty = Array.from(document.querySelectorAll('[data-slot="empty"]')).find((item) =>
          (item.innerText || '').includes('选择文档')
        );
        const main = document.querySelector('main');
        if (!empty || !main) return { found: false };
        const emptyRect = empty.getBoundingClientRect();
        const mainRect = main.getBoundingClientRect();
        return {
          found: true,
          contained: emptyRect.top >= mainRect.top - 1
            && emptyRect.left >= mainRect.left - 1
            && emptyRect.right <= mainRect.right + 1
            && emptyRect.bottom <= mainRect.bottom + 1,
          pageVerticalOverflow: document.documentElement.scrollHeight > window.innerHeight + 1,
          pageHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          taskPanelAbsent: !document.querySelector('[data-testid="rewrite-task-panel"]'),
        };
      })()`,
      3000,
    );
    if (
      !desktopRewriteLayout.found
      || !desktopRewriteLayout.contained
      || desktopRewriteLayout.pageVerticalOverflow
      || desktopRewriteLayout.pageHorizontalOverflow
      || !desktopRewriteLayout.taskPanelAbsent
    ) {
      throw new Error(`Empty rewrite workspace escaped its fixed boundary: ${JSON.stringify(desktopRewriteLayout)}`);
    }
    checks.push("empty rewrite workspace stays focused and contained without a redundant task panel");

    await uploadFile(browserClient, docxFixturePath);
    await waitForText(browserClient, "文档已读取", 12_000);
    await waitForText(browserClient, "保存正文范围", 12_000);
    await waitForExpression(
      browserClient,
      "!document.querySelector('[data-sonner-toast]')",
      "upload notification to clear before scope capture",
      12_000,
    );
    await captureScreenshot(browserClient, SCOPE_SCREENSHOT_PATH);
    await clickByText(browserClient, "保存正文范围", 12_000, true);
    await waitForText(browserClient, "开始改写", 12_000);
    await waitForExpression(
      browserClient,
      "Boolean(document.querySelector('[data-testid=\"rewrite-task-sheet\"]'))",
      "rewrite settings sheet after scope confirmation",
      12_000,
    );
    await wait(500);
    const uploadedDesktopLayout = await evaluate(
      browserClient,
      `(() => {
        const main = document.querySelector('[data-testid="rewrite-main-panel"]');
        const workspace = document.querySelector('[data-testid="rewrite-workspace-grid"]');
        const task = document.querySelector('[data-testid="rewrite-task-sheet"]');
        if (!main || !workspace || !task) return { found: false };
        const mainRect = main.getBoundingClientRect();
        const workspaceRect = workspace.getBoundingClientRect();
        const taskRect = task.getBoundingClientRect();
        return {
          found: true,
          mainWidth: Math.round(mainRect.width),
          taskWidth: Math.round(taskRect.width),
          manuscriptUsesWorkspace: Math.abs(mainRect.width - workspaceRect.width) <= 2,
          taskFitsViewport: taskRect.left >= -1 && taskRect.right <= window.innerWidth + 1,
          taskContainsPlan: task.innerText.includes('模型连接') && task.innerText.includes('提示词方案'),
          permanentTaskPanelAbsent: !document.querySelector('[data-testid="rewrite-task-panel"]'),
          pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        };
      })()`,
      3000,
    );
    if (
      !uploadedDesktopLayout.found
      || !uploadedDesktopLayout.manuscriptUsesWorkspace
      || !uploadedDesktopLayout.taskFitsViewport
      || !uploadedDesktopLayout.taskContainsPlan
      || !uploadedDesktopLayout.permanentTaskPanelAbsent
      || uploadedDesktopLayout.pageOverflow
    ) {
      throw new Error(`Uploaded rewrite workspace did not keep settings separate from the manuscript: ${JSON.stringify(uploadedDesktopLayout)}`);
    }
    await pressKey(browserClient, "Escape");
    await waitForExpression(browserClient, "!document.querySelector('[data-testid=\"rewrite-task-sheet\"]')", "desktop rewrite settings sheet to close", 12_000);
    checks.push("uploaded desktop workspace gives the manuscript full width and opens settings only in a temporary sheet");

    await clickSelector(browserClient, 'button[aria-label="文档操作"]');
    await clickByText(browserClient, "保护区地图", 12_000);
    await waitForExpression(
      browserClient,
      "Boolean(document.querySelector('[data-testid=\"protection-map-workspace\"] [id^=\"scope-unit-\"]'))",
      "protection range list",
      12_000,
    );
    const scopeSelectionSnapshot = await evaluate(
      browserClient,
      `(() => {
        const expected = ${JSON.stringify(SCOPE_FIXTURE_EXPECTATIONS)};
        const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const units = Array.from(document.querySelectorAll('[id^="scope-unit-"]'));
        return expected.map((item) => {
          const unit = units.find((candidate) => {
            const description = candidate.querySelector('[data-slot="item-description"]');
            return description
              ? normalize(description.textContent) === normalize(item.text)
              : normalize(candidate.textContent).includes(normalize(item.text));
          });
          const checkbox = unit?.querySelector('[role="checkbox"],input[type="checkbox"]');
          return {
            ...item,
            found: Boolean(unit),
            hasCheckbox: Boolean(checkbox),
            actualSelected: Boolean(checkbox?.checked)
              || checkbox?.getAttribute('data-state') === 'checked'
              || checkbox?.getAttribute('aria-checked') === 'true',
          };
        });
      })()`,
      3000,
    );
    const incorrectScopeSelections = scopeSelectionSnapshot.filter((item) => (
      !item.found || !item.hasCheckbox || item.actualSelected !== item.selected
    ));
    if (incorrectScopeSelections.length) {
      throw new Error(`Suggested body scope omitted prose or included structural text: ${JSON.stringify(incorrectScopeSelections)}`);
    }
    const selectedFixtureParagraphCount = scopeSelectionSnapshot.filter((item) => item.actualSelected).length;
    if (selectedFixtureParagraphCount !== 4) {
      throw new Error(`Expected exactly four prose paragraphs in the suggested body scope, found ${selectedFixtureParagraphCount}.`);
    }

    const protectionWorkspace = await evaluate(
      browserClient,
      `(() => {
        const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const workspace = document.querySelector('[data-testid="protection-map-workspace"]');
        const main = workspace?.closest('main');
        const firstUnit = workspace?.querySelector('[id^="scope-unit-"]');
        const viewport = firstUnit?.closest('[data-radix-scroll-area-viewport]');
        const returnButton = Array.from(workspace?.querySelectorAll('button') || []).find((item) =>
          normalize(item.innerText) === '返回开始改写'
        );
        if (!workspace || !main || !viewport || !returnButton) return { found: false };
        const workspaceRect = workspace.getBoundingClientRect();
        const mainRect = main.getBoundingClientRect();
        const footerTopBefore = returnButton.getBoundingClientRect().top;
        const pageScrollBefore = window.scrollY;
        const maximumScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        viewport.scrollTop = maximumScrollTop;
        const internalScrollTop = viewport.scrollTop;
        const footerTopAfter = returnButton.getBoundingClientRect().top;
        const pageScrollAfter = window.scrollY;
        viewport.scrollTop = 0;
        const exposesLegacyFillAllText = (workspace.innerText || '').includes('选择全部可回填段落');
        const hasStructureNavigation = (workspace.innerText || '').includes('文档结构');
        const exposesInternalStyleNames = /\bheading\s*\d*\b/i.test(workspace.innerText || '');
        const hasCompactFilter = Boolean(workspace.querySelector('button[aria-label="筛选正文范围"]'));
        const scopeLists = workspace.querySelectorAll('[id^="scope-unit-"]');
        return {
          found: true,
          htmlOverflow: getComputedStyle(document.documentElement).overflow,
          bodyOverflow: getComputedStyle(document.body).overflow,
          mainOverflow: getComputedStyle(main).overflow,
          workspaceContained: workspaceRect.top >= mainRect.top - 1
            && workspaceRect.left >= mainRect.left - 1
            && workspaceRect.right <= mainRect.right + 1
            && workspaceRect.bottom <= mainRect.bottom + 1,
          footerVisible: footerTopBefore >= mainRect.top && footerTopBefore < mainRect.bottom,
          internalOverflow: maximumScrollTop > 1,
          internalHorizontalOverflow: viewport.scrollWidth > viewport.clientWidth + 1,
          internalScrollTop,
          footerStayedFixed: Math.abs(footerTopAfter - footerTopBefore) < 1,
          pageStayedFixed: pageScrollBefore === pageScrollAfter,
          pageVerticalOverflow: document.documentElement.scrollHeight > window.innerHeight + 1,
          pageHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          hasStructureNavigation,
          exposesLegacyFillAllText,
          exposesInternalStyleNames,
          hasCompactFilter,
          scopeUnitCount: scopeLists.length,
        };
      })()`,
      3000,
    );
    if (
      !protectionWorkspace.found
      || !["hidden", "clip"].includes(protectionWorkspace.htmlOverflow)
      || !["hidden", "clip"].includes(protectionWorkspace.bodyOverflow)
      || !["hidden", "clip"].includes(protectionWorkspace.mainOverflow)
      || !protectionWorkspace.workspaceContained
      || !protectionWorkspace.footerVisible
      || !protectionWorkspace.internalOverflow
      || protectionWorkspace.internalHorizontalOverflow
      || protectionWorkspace.internalScrollTop <= 0
      || !protectionWorkspace.footerStayedFixed
      || !protectionWorkspace.pageStayedFixed
      || protectionWorkspace.pageVerticalOverflow
      || protectionWorkspace.pageHorizontalOverflow
      || protectionWorkspace.hasStructureNavigation
      || protectionWorkspace.exposesLegacyFillAllText
      || protectionWorkspace.exposesInternalStyleNames
      || !protectionWorkspace.hasCompactFilter
      || protectionWorkspace.scopeUnitCount < SCOPE_FIXTURE_EXPECTATIONS.length
    ) {
      throw new Error(`Protection map did not stay inside a fixed, internally scrollable workspace: ${JSON.stringify(protectionWorkspace)}`);
    }
    await waitForExpression(
      browserClient,
      "!document.querySelector('[data-sonner-toast]')",
      "scope notification to clear before documentation capture",
      12_000,
    );
    await captureScreenshot(browserClient, PROTECTION_SCREENSHOT_PATH);
    const selectedBeforeCancel = await evaluate(browserClient, "document.querySelectorAll('[role=\"checkbox\"][data-state=\"checked\"]').length", 3000);
    await clickSelector(browserClient, 'button[aria-label="范围操作"]');
    await clickByText(browserClient, "清空改写范围", 12_000);
    await clickByText(browserClient, "返回开始改写", 12_000);
    await waitForText(browserClient, "开始改写", 12_000);
    await clickSelector(browserClient, 'button[aria-label="文档操作"]');
    await clickByText(browserClient, "保护区地图", 12_000);
    await waitForExpression(
      browserClient,
      "Boolean(document.querySelector('[data-testid=\"protection-map-workspace\"] [id^=\"scope-unit-\"]'))",
      "protection range list to reopen",
      12_000,
    );
    const selectedAfterCancel = await evaluate(browserClient, "document.querySelectorAll('[role=\"checkbox\"][data-state=\"checked\"]').length", 3000);
    if (selectedBeforeCancel !== selectedAfterCancel || selectedAfterCancel === 0) {
      throw new Error(`Leaving the boundary editor did not discard its unsaved selection (${selectedBeforeCancel} -> ${selectedAfterCancel}).`);
    }
    await clickByText(browserClient, "返回开始改写", 12_000);
    checks.push("inline Chinese and post-reference English abstracts, body prose, and acknowledgements stay in the suggested scope while headings, captions, keywords, and references stay out");
    checks.push("protection map uses one fixed, internally scrollable range list without duplicate structure panels or internal style labels");

    await clickByText(browserClient, "改写设置", 12_000);
    await waitForExpression(
      browserClient,
      "Boolean(document.querySelector('[data-testid=\"rewrite-task-sheet\"]'))",
      "rewrite settings sheet to reopen",
      12_000,
    );
    await wait(500);
    const taskPlanControls = await evaluate(
      browserClient,
      `(() => {
        const task = document.querySelector('[data-testid="rewrite-task-sheet"]');
        if (!task) return { found: false };
        const visibleComboboxes = Array.from(task.querySelectorAll('[role="combobox"]')).filter((control) => {
          const rect = control.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && !control.disabled;
        });
        const text = task.innerText || '';
        return {
          found: true,
          visibleComboboxes: visibleComboboxes.length,
          hasModel: text.includes('模型连接'),
          hasPrompt: text.includes('提示词方案'),
        };
      })()`,
      3000,
    );
    await selectTabByText(browserClient, "处理");
    const taskProcessingControls = await evaluate(
      browserClient,
      `(() => {
        const task = document.querySelector('[data-testid="rewrite-task-sheet"]');
        const text = task?.innerText || '';
        const concurrencyOptions = Array.from(task?.querySelectorAll('[data-testid^="rewrite-concurrency-"]') || [])
          .map((item) => (item.textContent || '').trim());
        return {
          found: Boolean(task),
          hasChunking: text.includes('段内分块'),
          hasRounds: text.includes('轮数'),
          hasConcurrency: text.includes('同时改写块数'),
          concurrencyOptions,
        };
      })()`,
      3000,
    );
    if (
      !taskPlanControls.found
      || taskPlanControls.visibleComboboxes < 2
      || !taskPlanControls.hasModel
      || !taskPlanControls.hasPrompt
      || !taskProcessingControls.found
      || !taskProcessingControls.hasChunking
      || !taskProcessingControls.hasRounds
      || !taskProcessingControls.hasConcurrency
      || !taskProcessingControls.concurrencyOptions.includes("1 块")
      || !taskProcessingControls.concurrencyOptions.includes("8 块")
      || !taskProcessingControls.concurrencyOptions.includes("16 块")
    ) {
      throw new Error(`Uploaded document settings sheet is not configurable: ${JSON.stringify({ taskPlanControls, taskProcessingControls })}`);
    }
    await clickSelector(browserClient, '[data-testid="rewrite-concurrency-8"]');
    await captureScreenshot(browserClient, SETTINGS_SCREENSHOT_PATH);
    checks.push("rewrite settings expose model, prompt, practiced chunking, rounds, and real 1–16 concurrency in a temporary sheet");

    await clickByText(browserClient, "开始改写", 12_000, true);
    await waitForExpression(
      browserClient,
      "Boolean(document.querySelector('[data-testid=\"rewrite-run-progress\"]'))",
      "overall rewrite progress to appear",
      15_000,
    );
    await wait(700);
    const runningRecent = await fetch(`${backendUrl}/api/recent-documents`).then((response) => response.json());
    const runningId = runningRecent.items?.[0]?.latestRunId;
    const runningSnapshot = runningId
      ? await fetch(`${backendUrl}/api/runs/${encodeURIComponent(runningId)}`).then((response) => response.json())
      : null;
    if (runningSnapshot?.snapshot?.concurrency !== 8) {
      throw new Error(`Concurrency selected in the UI was not used by the run: ${JSON.stringify(runningSnapshot?.snapshot)}`);
    }
    checks.push("selected concurrency is persisted in the backend run snapshot");
    const runningWorkspace = await evaluate(
      browserClient,
      `(() => {
        const progress = document.querySelector('[data-testid="rewrite-run-progress"]');
        const progressText = progress?.innerText || '';
        return {
          found: Boolean(progress),
          hasProgressBar: Boolean(progress?.querySelector('[role="progressbar"]')),
          showsParagraphProgress: progressText.includes('/') && progressText.includes('段'),
          manuscriptVisible: Boolean(progress?.querySelector('[data-testid="rewrite-manuscript-preview"]')),
          reviewHidden: !document.querySelector('[data-review-detail]'),
          chunkTrackHidden: !document.querySelector('[data-chunk-track], [data-review-chunk], [data-chunk-detail]'),
          liveTextHidden: !document.querySelector('[data-live-text], [data-live-chunk-text]'),
          taskSheetClosed: !document.querySelector('[data-testid="rewrite-task-sheet"]'),
          progressHidesChunkDetails: !progressText.includes('块'),
        };
      })()`,
      3000,
    );
    if (
      !runningWorkspace.found
      || !runningWorkspace.hasProgressBar
      || !runningWorkspace.showsParagraphProgress
      || !runningWorkspace.manuscriptVisible
      || !runningWorkspace.reviewHidden
      || !runningWorkspace.chunkTrackHidden
      || !runningWorkspace.liveTextHidden
      || !runningWorkspace.taskSheetClosed
      || !runningWorkspace.progressHidesChunkDetails
    ) {
      throw new Error(`Running workspace still exposes internal chunk processing: ${JSON.stringify(runningWorkspace)}`);
    }
    await waitForExpression(
      browserClient,
      "!document.querySelector('[data-sonner-toast]')",
      "start notification to clear before running capture",
      12_000,
    );
    await captureScreenshot(browserClient, RUNNING_SCREENSHOT_PATH);
    checks.push("running tasks show only overall paragraph progress while chunk streaming and concurrency stay internal");
    await clickByText(browserClient, "停止", 12_000);
    await waitForText(browserClient, "继续", 15_000);
    await waitForExpression(browserClient, "Boolean(document.querySelector('[data-review-detail]'))", "review after stopping", 12_000);
    const incompleteReviewIds = await getReviewParagraphIds(browserClient, true);
    if (!incompleteReviewIds.length) {
      throw new Error("Stopping the streaming task did not leave any incomplete paragraph to review.");
    }
    await chooseReviewParagraph(browserClient, incompleteReviewIds[0]);
    await clickByText(browserClient, "手动编辑", 3000);
    await waitForExpression(browserClient, "Boolean(document.querySelector('textarea[id^=\"manual-\"]'))", "manual editor for an incomplete paragraph", 12_000);
    const manualEditorSize = await evaluate(
      browserClient,
      `(() => {
        const editor = document.querySelector('textarea[id^="manual-"]');
        const review = document.querySelector('[data-review-detail]');
        if (!editor || !review) return { found: false };
        const editorRect = editor.getBoundingClientRect();
        const reviewRect = review.getBoundingClientRect();
        return {
          found: true,
          editorHeight: editorRect.height,
          reviewHeight: reviewRect.height,
          largeEnough: editorRect.height >= Math.min(320, reviewRect.height * 0.42),
        };
      })()`,
      3000,
    );
    if (!manualEditorSize.found || !manualEditorSize.largeEnough) {
      throw new Error(`Manual editor is too small for paragraph review: ${JSON.stringify(manualEditorSize)}`);
    }
    await setControlValue(browserClient, 'textarea[id^="manual-"]', "模型中断后由用户手动补写的正文。");
    await waitForExpression(
      browserClient,
      "!document.querySelector('[data-sonner-toast]')",
      "stop notification to clear before manual review capture",
      12_000,
    );
    await captureScreenshot(browserClient, MANUAL_REVIEW_SCREENSHOT_PATH);
    await clickByText(browserClient, "保存", 12_000);
    await waitForExpression(
      browserClient,
      `Boolean(
        document.querySelector('[data-review-detail]')?.innerText.includes('模型中断后由用户手动补写的正文。')
        && !document.querySelector('textarea[id^="manual-"]')
      )`,
      "saved manual content to remain visible",
      12_000,
    );

    for (const paragraphId of incompleteReviewIds.slice(1)) {
      await chooseReviewParagraph(browserClient, paragraphId);
      await selectReviewDecision(browserClient, "保留原文");
    }
    await clickByText(browserClient, "继续", 12_000);
    await waitForText(browserClient, "继续未完成内容", 12_000);
    await waitForExpression(
      browserClient,
      `(() => {
        const task = document.querySelector('[data-testid="rewrite-task-sheet"]');
        const exportButton = Array.from(document.querySelectorAll('button')).find((item) =>
          task?.contains(item) && (item.innerText || '').trim() === 'Word'
        );
        return Boolean(task && exportButton && !exportButton.disabled);
      })()`,
      "DOCX export to become available after every incomplete paragraph is manually resolved or kept original",
      12_000,
    );
    checks.push("manual text or an explicit keep-original decision resolves incomplete paragraphs without a mechanical run-status gate");
    await clickByText(browserClient, "继续未完成内容", 12_000);
    await waitForExpression(
      browserClient,
      `Boolean(document.querySelector('[data-review-detail]'))
        && Boolean(document.querySelector('[data-testid="rewrite-open-task-actions"]'))`,
      "completed review workspace",
      35_000,
    );
    await waitForExpression(browserClient, "Boolean(document.querySelector('[data-review-detail]'))", "completed review", 12_000);
    const completedReviewIds = await getReviewParagraphIds(browserClient);
    const warningParagraphId = completedReviewIds[1] || completedReviewIds[0];
    await chooseReviewParagraph(browserClient, warningParagraphId);
    await selectReviewDecision(browserClient, "采用改写");
    await waitForExpression(
      browserClient,
      "Boolean(document.querySelector('button[aria-label$=\"项提醒\"]'))",
      "rewrite warning reminder",
      12_000,
    );
    await clickByText(browserClient, "差异");
    await waitForExpression(
      browserClient,
      "document.querySelector('[data-text-diff]')?.getAttribute('data-diff-mode') === 'changes'",
      "optional marked diff view",
      12_000,
    );
    await waitForExpression(
      browserClient,
      "Boolean(document.querySelector('[data-text-diff] [data-diff-added]') && document.querySelector('[data-text-diff] [data-diff-removed]'))",
      "real added and removed diff markers to render",
      12_000,
    );
    await captureScreenshot(browserClient, DIFF_SCREENSHOT_PATH);
    const hasFixtureAnnotations = await evaluate(
      browserClient,
      `Array.from(document.querySelectorAll('[data-review-paragraph]')).some((item) =>
        (item.innerText || '').includes('（改写）')
      )`,
      3000,
    );
    if (hasFixtureAnnotations) {
      throw new Error("Model output contains a synthetic rewrite annotation from the test provider.");
    }
    await clickByText(browserClient, "对照");
    await waitForExpression(
      browserClient,
      "document.querySelector('[data-text-diff]')?.getAttribute('data-diff-mode') === 'compare'",
      "clean comparison view",
      12_000,
    );
    await clickSelector(browserClient, '[data-testid="rewrite-open-task-actions"]');
    await waitForExpression(
      browserClient,
      "Boolean(document.querySelector('[data-testid=\"rewrite-task-sheet\"]'))",
      "completed task actions sheet",
      12_000,
    );
    const configurableContinuePlan = await evaluate(
      browserClient,
      `(() => {
        const task = document.querySelector('[data-testid="rewrite-task-sheet"]');
        if (!task) return { found: false };
        const visibleComboboxes = Array.from(task.querySelectorAll('[role="combobox"]')).filter((control) => {
          const rect = control.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        const text = task.innerText || '';
        return {
          found: true,
          visibleComboboxes: visibleComboboxes.length,
          title: task.querySelector('h2')?.textContent?.trim() || '',
          hasModel: text.includes('模型连接') && text.includes('本地连接一'),
          hasPlan: text.includes('提示词方案') && text.includes('经典改写'),
          pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        };
      })()`,
      3000,
    );
    if (
      !configurableContinuePlan.found
      || configurableContinuePlan.title !== "继续改写"
      || configurableContinuePlan.visibleComboboxes < 2
      || !configurableContinuePlan.hasModel
      || !configurableContinuePlan.hasPlan
      || configurableContinuePlan.pageOverflow
    ) {
      throw new Error(`Completed task sheet cannot configure the next pass: ${JSON.stringify(configurableContinuePlan)}`);
    }
    await selectTabByText(browserClient, "处理");
    const configurableContinueProcessing = await evaluate(
      browserClient,
      `(() => {
        const task = document.querySelector('[data-testid="rewrite-task-sheet"]');
        const text = task?.innerText || '';
        return {
          found: Boolean(task),
          hasChunking: text.includes('段内分块'),
          hasRounds: text.includes('改写轮数'),
          hasConcurrency: text.includes('同时改写块数'),
          hasProtectedTerms: text.includes('保护词'),
        };
      })()`,
      3000,
    );
    if (
      !configurableContinueProcessing.found
      || !configurableContinueProcessing.hasChunking
      || !configurableContinueProcessing.hasRounds
      || !configurableContinueProcessing.hasConcurrency
      || !configurableContinueProcessing.hasProtectedTerms
    ) {
      throw new Error(`Completed task sheet is missing next-pass processing settings: ${JSON.stringify(configurableContinueProcessing)}`);
    }
    await selectTabByText(browserClient, "方案");
    await wait(600);
    await captureScreenshot(browserClient, COMPLETED_ACTIONS_SCREENSHOT_PATH);
    await pressKey(browserClient, "Escape");
    await waitForExpression(browserClient, "!document.querySelector('[data-testid=\"rewrite-task-sheet\"]')", "completed task sheet to close", 12_000);
    await waitForExpression(
      browserClient,
      `Boolean(
        document.querySelector('[data-text-diff] [data-diff-side="original"]')
        && document.querySelector('[data-text-diff] [data-diff-side="rewritten"]')
        && document.querySelector('[data-review-text]')
      )`,
      "original and rewritten versions to remain visible together",
      12_000,
    );
    await captureScreenshot(browserClient, RESULTS_SCREENSHOT_PATH);
    const longReviewContainment = await evaluate(
      browserClient,
      `(() => {
        const panel = document.querySelector('[data-testid="rewrite-main-panel"]');
        const root = document.querySelector('[data-testid="rewrite-results-scroll"]');
        const review = document.querySelector('[data-review-paragraph]');
        const viewport = review?.querySelector('[data-review-scroll] [data-radix-scroll-area-viewport]');
        const host = viewport?.firstElementChild;
        if (!panel || !root || !review || !viewport || !host) return { found: false };
        const sentinel = document.createElement('div');
        sentinel.setAttribute('data-layout-sentinel', 'true');
        sentinel.style.height = '2000px';
        host.appendChild(sentinel);
        const panelRect = panel.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        const result = {
          found: true,
          pageOverflow: document.documentElement.scrollHeight > window.innerHeight + 1,
          rootContained: rootRect.top >= panelRect.top - 1 && rootRect.bottom <= panelRect.bottom + 1,
          internalOverflow: viewport.scrollHeight > viewport.clientHeight + 1,
          viewportHeight: viewport.clientHeight,
          contentHeight: viewport.scrollHeight,
        };
        sentinel.remove();
        return result;
      })()`,
      3000,
    );
    if (!longReviewContainment.found || longReviewContainment.pageOverflow || !longReviewContainment.rootContained || !longReviewContainment.internalOverflow) {
      throw new Error(`Long review content escaped the fixed-height workspace: ${JSON.stringify(longReviewContainment)}`);
    }
    checks.push("DOCX runs hidden chunk streams, stops, resumes unfinished chunks, then renders paragraph-level diffs and warnings");
    checks.push("multi-round output contains no synthetic rewrite labels and long reviews scroll inside the workspace");
    checks.push("completed task actions inherit the previous setup and expose a complete next-pass configuration sheet");
    checks.push("review shows the complete original and rewritten versions together with separate diff markers");

    await selectReviewDecision(browserClient, "保留原文");
    await waitForExpression(
      browserClient,
      "!document.querySelector('button[aria-label$=\"项提醒\"]')",
      "warning to clear for the paragraph kept as original",
      12_000,
    );
    checks.push("keeping original clears that paragraph's advisory warning without changing other results");

    await selectReviewDecision(browserClient, "采用改写");
    await waitForExpression(
      browserClient,
      "Boolean(document.querySelector('button[aria-label$=\"项提醒\"]'))",
      "warning to follow the restored rewrite decision",
      12_000,
    );

    await clickSelector(browserClient, '[data-testid="rewrite-open-task-actions"]');
    await waitForExpression(browserClient, "Boolean(document.querySelector('[data-testid=\"rewrite-task-sheet\"]'))", "export sheet", 12_000);
    await clickByText(browserClient, "Word", 12_000);
    await waitForText(browserClient, "导出前确认", 12_000);
    const warningLocations = await evaluate(
      browserClient,
      `(() => {
        const list = document.querySelector('[data-testid="export-warning-locations"]');
        const text = list?.innerText || '';
        return {
          found: Boolean(list),
          hasParagraph: /第\\s*\\d+\\s*段/.test(text),
          hasDetail: text.includes('数字') || text.includes('引用') || text.includes('URL') || text.includes('保护词'),
        };
      })()`,
      3000,
    );
    if (!warningLocations.found || !warningLocations.hasParagraph || !warningLocations.hasDetail) {
      throw new Error(`Export warning does not identify its paragraph and changed value: ${JSON.stringify(warningLocations)}`);
    }
    await captureScreenshot(browserClient, EXPORT_WARNING_SCREENSHOT_PATH);
    await clickByText(browserClient, "继续导出 Word", 12_000, true);
    await waitForText(browserClient, "文件已导出", 20_000);
    await waitForTextGone(browserClient, "导出前确认", 12_000);
    await pressKey(browserClient, "Escape");
    await waitForExpression(browserClient, "!document.querySelector('[data-testid=\"rewrite-task-sheet\"]')", "export sheet to close", 12_000);
    checks.push("warning confirmation exports a format-audited DOCX");

    await wait(500);
    await clickByText(browserClient, "手动编辑", 12_000);
    await waitForExpression(browserClient, "Boolean(document.querySelector('textarea[id^=\"manual-\"]'))", "manual review editor", 12_000);
    await setControlValue(browserClient, 'textarea[id^="manual-"]', "手动审阅后的正文保留数字 10。");
    const exportDisabledWhileEditing = await evaluate(
      browserClient,
      `Boolean(document.querySelector('[data-testid="rewrite-open-task-actions"]')?.disabled)`,
      3000,
    );
    if (!exportDisabledWhileEditing) {
      throw new Error("Export stayed enabled while manual review text was unsaved.");
    }
    await clickByText(browserClient, "保存", 12_000);
    checks.push("manual review must be saved before export and can then be stored");

    const previousRunId = (await fetch(`${backendUrl}/api/recent-documents`).then((response) => response.json())).items?.[0]?.latestRunId;
    const providerRequestsBeforeContinue = (await fetch(`${mockUrl}/stats`).then((response) => response.json())).requests?.length || 0;
    await clickSelector(browserClient, '[data-testid="rewrite-open-task-actions"]');
    await waitForText(browserClient, "继续改写", 12_000);
    await clickSelector(browserClient, '#run-model-profile');
    await clickByText(browserClient, "本地连接二 · example-chat", 12_000, true);
    await clickSelector(browserClient, '#run-prompt-plan');
    await clickByText(browserClient, "表达优化方案", 12_000, true);
    await selectTabByText(browserClient, "处理");
    await clickSelector(browserClient, '[data-testid="rewrite-chunk-long"]');
    await clickSelector(browserClient, '[data-testid="rewrite-repeat-3"]');
    await clickSelector(browserClient, '[data-testid="rewrite-concurrency-4"]');
    await setControlValue(browserClient, "#protected-terms", "关键术语");
    await waitForExpression(
      browserClient,
      "!document.querySelector('[data-sonner-toast]')",
      "export notification to clear before next-pass capture",
      12_000,
    );
    await captureScreenshot(browserClient, CONTINUE_SETTINGS_SCREENSHOT_PATH);
    await clickByText(browserClient, "继续改写", 12_000, true);
    await waitForExpression(
      browserClient,
      `(async () => {
        const recent = await fetch('/api/recent-documents').then((response) => response.json());
        const latestRunId = recent.items?.[0]?.latestRunId;
        if (!latestRunId || latestRunId === ${JSON.stringify(previousRunId)}) return false;
        const latest = await fetch('/api/runs/' + encodeURIComponent(latestRunId)).then((response) => response.json());
        return latest.snapshot?.iteration === 2
          && latest.snapshot?.modelProfile?.name === '本地连接二'
          && latest.snapshot?.promptPlan?.name === '表达优化方案'
          && latest.snapshot?.chunking?.preset === 'long'
          && latest.snapshot?.repeatCount === 3
          && latest.snapshot?.concurrency === 4
          && latest.snapshot?.protectedTerms?.includes('关键术语');
      })()`,
      "continued rewrite task to use a new persisted run",
      20_000,
    );
    await waitForExpression(
      browserClient,
      `Boolean(document.querySelector('[data-review-detail]') && document.querySelector('[data-testid="rewrite-open-task-actions"]'))`,
      "continued rewrite task to complete",
      35_000,
    );
    const continuedRecent = await fetch(`${backendUrl}/api/recent-documents`).then((response) => response.json());
    const continuedRunId = continuedRecent.items?.[0]?.latestRunId;
    const continuedRun = await fetch(`${backendUrl}/api/runs/${encodeURIComponent(continuedRunId)}`).then((response) => response.json());
    const continuedProviderRequests = (await fetch(`${mockUrl}/stats`).then((response) => response.json())).requests?.slice(providerRequestsBeforeContinue) || [];
    if (
      continuedRun.snapshot?.iteration !== 2
      || continuedRun.snapshot?.parentRunId !== previousRunId
      || continuedRun.snapshot?.modelProfile?.name !== "本地连接二"
      || continuedRun.snapshot?.promptPlan?.name !== "表达优化方案"
      || continuedRun.snapshot?.chunking?.preset !== "long"
      || continuedRun.snapshot?.repeatCount !== 3
      || continuedRun.snapshot?.concurrency !== 4
      || !continuedRun.snapshot?.protectedTerms?.includes("关键术语")
      || !continuedRun.chunks?.some((chunk) => String(chunk.originalText || '').includes('手动审阅后的正文'))
    ) {
      throw new Error(`Continue rewrite did not use the reviewed output: ${JSON.stringify(continuedRun.snapshot)}`);
    }
    if (
      !continuedProviderRequests.length
      || continuedProviderRequests.some((item) => item.credential !== "secondary")
      || continuedProviderRequests.some((item) => item.model !== "example-chat")
      || !continuedProviderRequests.some((item) => item.prompt.includes("请保持事实并改写以下内容"))
      || !continuedProviderRequests.some((item) => item.prompt.includes("手动审阅后的正文"))
    ) {
      throw new Error(`Continue rewrite did not send the selected model, prompt, or reviewed text upstream: ${JSON.stringify(continuedProviderRequests.map((item) => ({
        credential: item.credential,
        model: item.model,
        hasSelectedPrompt: item.prompt.includes("请保持事实并改写以下内容"),
        hasReviewedText: item.prompt.includes("手动审阅后的正文"),
      })))}`);
    }
    checks.push("completed results can start a fully reconfigured next pass whose selected model, prompt, processing settings, and reviewed input all reach the backend and provider");

    await clickByText(browserClient, "最近文档");
    await waitForText(browserClient, "示例文档.docx", 12_000);
    await clickByText(browserClient, "打开", 12_000);
    await waitForText(browserClient, "示例文档.docx", 12_000);
    checks.push("recent DOCX can be reopened");

    await browserClient.send("Page.reload", { ignoreCache: true });
    await waitForExpression(
      browserClient,
      "Boolean(document.querySelector('[data-testid=\"rewrite-main-panel\"]') && document.querySelector('[data-review-detail]'))",
      "restored review workspace",
      20_000,
    );
    await waitForText(browserClient, "示例文档.docx", 20_000);
    await waitForExpression(
      browserClient,
      `Boolean(document.querySelector('[data-testid="rewrite-open-task-actions"]:not(:disabled)'))`,
      "restored export action",
      20_000,
    );
    checks.push("page refresh restores the active document and its persisted review task");

    await clickSelector(browserClient, '[data-testid="rewrite-open-task-actions"]');
    await waitForText(browserClient, "继续改写", 12_000);
    await clickByText(browserClient, "新建改写任务", 12_000);
    await browserClient.send("Page.reload", { ignoreCache: true });
    await waitForText(browserClient, "示例文档.docx", 20_000);
    await waitForText(browserClient, "改写设置", 20_000);
    checks.push("starting a new task remains intentional after refresh instead of reopening the old run");
    await clickSelector(browserClient, 'button[aria-label="文档操作"]');
    await clickByText(browserClient, "更换文档", 12_000);
    await uploadFile(browserClient, txtFixturePath);
    await waitForText(browserClient, "保存正文范围", 12_000);
    await clickByText(browserClient, "保存正文范围", 12_000, true);
    await waitForText(browserClient, "开始改写", 12_000);
    await clickByText(browserClient, "开始改写", 12_000, true);
    await waitForExpression(
      browserClient,
      `Boolean(document.querySelector('[data-review-detail]'))
        && Boolean(document.querySelector('[data-testid="rewrite-open-task-actions"]'))`,
      "completed TXT review workspace",
      25_000,
    );
    await clickSelector(browserClient, '[data-testid="rewrite-open-task-actions"]');
    await clickByText(browserClient, "TXT", 12_000);
    await waitForText(browserClient, "导出前确认", 12_000);
    await clickByText(browserClient, "继续导出 TXT", 12_000, true);
    await waitForText(browserClient, "文件已导出", 20_000);
    await waitForTextGone(browserClient, "导出前确认", 12_000);
    await pressKey(browserClient, "Escape");
    await waitForExpression(browserClient, "!document.querySelector('[data-testid=\"rewrite-task-sheet\"]')", "TXT export sheet to close", 12_000);
    checks.push("TXT simplified workflow rewrites and exports");

    await clickByText(browserClient, "最近文档");
    await waitForText(browserClient, "示例文档.txt", 12_000);
    await waitForExpression(
      browserClient,
      "!document.querySelector('[data-sonner-toast]')",
      "recent document notification to clear before documentation capture",
      12_000,
    );
    await captureScreenshot(browserClient, RECENT_SCREENSHOT_PATH);
    await clickByText(browserClient, "打开", 12_000);
    await waitForText(browserClient, "示例文档.txt", 12_000);

    await browserClient.send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
    await wait(500);
    const tabletLayout = await evaluate(
      browserClient,
      `(() => {
        const workspace = document.querySelector('[data-testid="rewrite-workspace-grid"]');
        const main = document.querySelector('[data-testid="rewrite-main-panel"]');
        const actionButton = Array.from(workspace?.querySelectorAll('button') || []).find((button) =>
          ['改写设置', '继续', '继续 / 导出'].includes((button.innerText || '').trim())
        );
        if (!workspace || !main) return { found: false };
        return {
          found: true,
          mainVisible: getComputedStyle(main).display !== 'none',
          taskAbsent: !document.querySelector('[data-testid="rewrite-task-panel"]'),
          actionButtonVisible: Boolean(actionButton && actionButton.getBoundingClientRect().width > 0),
          pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        };
      })()`,
      3000,
    );
    if (!tabletLayout.found || !tabletLayout.mainVisible || !tabletLayout.taskAbsent || !tabletLayout.actionButtonVisible || tabletLayout.pageOverflow) {
      throw new Error(`Medium-width workspace is cramped or overflowing: ${JSON.stringify(tabletLayout)}`);
    }
    await clickSelector(browserClient, '[data-testid="rewrite-open-task-actions"]');
    await waitForExpression(browserClient, "Boolean(document.querySelector('[data-testid=\\\"rewrite-task-sheet\\\"]'))", "tablet task sheet", 12_000);
    await wait(500);
    const tabletTaskVisible = await evaluate(
      browserClient,
      `(() => {
        const task = document.querySelector('[data-testid="rewrite-task-sheet"]');
        if (!task) return false;
        const rect = task.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= window.innerWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1;
      })()`,
      3000,
    );
    if (!tabletTaskVisible) throw new Error("Medium-width task sheet is not usable.");
    await browserClient.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await browserClient.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
    await waitForExpression(browserClient, "!document.querySelector('[data-testid=\\\"rewrite-task-sheet\\\"]')", "tablet task sheet to close", 12_000);
    await captureScreenshot(browserClient, TABLET_SCREENSHOT_PATH);
    checks.push("1024px manuscript workspace keeps task actions in a sheet instead of forcing a cramped sidebar");

    await browserClient.send("Emulation.setDeviceMetricsOverride", { width: 768, height: 900, deviceScaleFactor: 1, mobile: false });
    await wait(500);
    const narrowTabletLayout = await evaluate(
      browserClient,
      `(() => {
        const workspace = document.querySelector('[data-testid="rewrite-workspace-grid"]');
        const main = document.querySelector('[data-testid="rewrite-main-panel"]');
        if (!workspace || !main) return { found: false };
        return {
          found: true,
          mainVisible: getComputedStyle(main).display !== 'none',
          taskAbsent: !document.querySelector('[data-testid="rewrite-task-panel"]'),
          pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        };
      })()`,
      3000,
    );
    if (!narrowTabletLayout.found || !narrowTabletLayout.mainVisible || !narrowTabletLayout.taskAbsent || narrowTabletLayout.pageOverflow) {
      throw new Error(`768px workbench is cramped or overflowing: ${JSON.stringify(narrowTabletLayout)}`);
    }
    checks.push("768px workbench keeps the manuscript canvas visible without horizontal overflow");

    await browserClient.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await wait(500);
    await clickSelector(browserClient, '[data-testid="rewrite-open-task-actions"]');
    await waitForExpression(browserClient, "Boolean(document.querySelector('[data-testid=\\\"rewrite-task-sheet\\\"]'))", "mobile task sheet", 12_000);
    await wait(500);
    const hasHorizontalOverflow = await evaluate(browserClient, "document.documentElement.scrollWidth > window.innerWidth + 1", 3000);
    if (hasHorizontalOverflow) {
      throw new Error("Mobile workbench has horizontal page overflow.");
    }
    await browserClient.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await browserClient.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
    await waitForExpression(browserClient, "!document.querySelector('[data-testid=\\\"rewrite-task-sheet\\\"]')", "mobile task sheet to close", 12_000);
    const mobileReviewLabels = await evaluate(
      browserClient,
      `(() => {
        const pane = document.querySelector('[data-diff-layout="tabs"] [data-state="active"] [data-diff-pane]');
        if (!pane) return { found: false, labels: [] };
        const labels = Array.from(pane.querySelectorAll('[data-slot="item-title"]'))
          .filter((item) => item.getBoundingClientRect().width > 0)
          .map((item) => (item.textContent || '').trim())
          .filter(Boolean);
        return { found: true, labels };
      })()`,
      3000,
    );
    if (!mobileReviewLabels.found || mobileReviewLabels.labels.length) {
      throw new Error(`Mobile diff repeats the active tab as an extra pane heading: ${JSON.stringify(mobileReviewLabels)}`);
    }
    await captureScreenshot(browserClient, MOBILE_SCREENSHOT_PATH);
    checks.push("four primary pages and accessible editors remain responsive");
    checks.push("mobile workbench stays within the viewport without repeated diff labels");

    await browserClient.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await browserClient.send("Page.reload", { ignoreCache: true });
    await waitForText(browserClient, "示例文档.txt", 20_000);
    await clickByText(browserClient, "最近文档", 12_000);
    await waitForText(browserClient, "示例文档.txt", 12_000);
    await clickByText(browserClient, "删除 示例文档.txt", 12_000);
    await waitForText(browserClient, "删除这篇文档", 12_000);
    await clickByText(browserClient, "确认删除", 12_000);
    await waitForTextGone(browserClient, "示例文档.txt", 12_000);
    await clickByText(browserClient, "开始改写", 12_000);
    await waitForText(browserClient, "选择文件", 12_000);
    await browserClient.send("Page.reload", { ignoreCache: true });
    await waitForText(browserClient, "选择文件", 20_000);
    checks.push("deleting the active recent document clears the workspace and its refresh pointer");

    return {
      ok: true,
      createdAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      reportPath: REPORT_PATH,
      frontendUrl,
      backendUrl,
      browserExecutable,
      screenshots: {
        home: HOME_SCREENSHOT_PATH,
        running: RUNNING_SCREENSHOT_PATH,
        results: RESULTS_SCREENSHOT_PATH,
        model: MODEL_SCREENSHOT_PATH,
        modelOfficial: MODEL_OFFICIAL_SCREENSHOT_PATH,
        modelMobile: MODEL_MOBILE_SCREENSHOT_PATH,
        prompt: PROMPT_SCREENSHOT_PATH,
        promptPlan: PROMPT_PLAN_SCREENSHOT_PATH,
        scope: SCOPE_SCREENSHOT_PATH,
        protection: PROTECTION_SCREENSHOT_PATH,
        settings: SETTINGS_SCREENSHOT_PATH,
        recent: RECENT_SCREENSHOT_PATH,
        manualReview: MANUAL_REVIEW_SCREENSHOT_PATH,
        diff: DIFF_SCREENSHOT_PATH,
        completedActions: COMPLETED_ACTIONS_SCREENSHOT_PATH,
        continueSettings: CONTINUE_SETTINGS_SCREENSHOT_PATH,
        exportWarning: EXPORT_WARNING_SCREENSHOT_PATH,
        tablet: TABLET_SCREENSHOT_PATH,
        mobile: MOBILE_SCREENSHOT_PATH,
      },
      checks,
      warnings,
    };
  } catch (error) {
    if (browserClient) {
      await captureScreenshot(browserClient, SCREENSHOT_PATH);
    }
    return {
      ok: false,
      createdAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      reportPath: REPORT_PATH,
      screenshotPath: existsSync(SCREENSHOT_PATH) ? SCREENSHOT_PATH : "",
      frontendUrl,
      backendUrl,
      browserExecutable,
      checks,
      warnings,
      error: error instanceof Error ? error.message : String(error),
      processLogs: Object.fromEntries(managedProcesses.map((item) => [item.name, item.tail()])),
    };
  } finally {
    browserClient?.close();
    for (const managedProcess of managedProcesses.reverse()) {
      managedProcess.stop();
    }
    if (userDataDir) {
      setTimeout(() => {
        try {
          rmSync(userDataDir, { recursive: true, force: true });
        } catch {
          // Ignore temp cleanup failures on Windows while Chrome exits.
        }
      }, 1000).unref?.();
    }
    if (backendDataDir) {
      setTimeout(() => {
        try {
          rmSync(backendDataDir, { recursive: true, force: true });
        } catch {
          // Ignore temporary backend cleanup failures while the process exits.
        }
      }, 1000).unref?.();
    }
    if (fixtureDir) {
      setTimeout(() => {
        try {
          rmSync(fixtureDir, { recursive: true, force: true });
        } catch {
          // Ignore temporary download locks while Chrome exits.
        }
      }, 1000).unref?.();
    }
  }
}

mkdirSync(dirname(REPORT_PATH), { recursive: true });
const report = await runSmoke();
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");
const output = JSON.stringify(report, null, 2);
if (report.ok) {
  console.log(output);
} else {
  console.error(output);
}
process.exit(report.ok ? 0 : 1);
