import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import net from "node:net";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = resolve(ROOT_DIR, "app");
const REPORT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_smoke_report.json");
const SCREENSHOT_PATH = resolve(ROOT_DIR, "finish", "regression", "browser_e2e_smoke_failure.png");
const DEFAULT_TIMEOUT_MS = 90_000;
const OVERALL_TIMEOUT_MS = 210_000;
const CDP_COMMAND_TIMEOUT_MS = 10_000;
const ROUTE_TIMEOUT_MS = 12_000;

let smokeDeadline = Number.POSITIVE_INFINITY;

const WORKBENCH_VIEW_CASES = [
  { view: "home", label: "工作台", expected: "文档入口" },
  { view: "quality", label: "降检报告", expected: "尚未载入论文", alternate: "降检诊断" },
  { view: "model", label: "模型配置", expected: "默认连接" },
  { view: "prompts", label: "提示词", selector: "textarea" },
  { view: "protection", label: "保护区地图", expected: "文档边界地图" },
  { view: "history", label: "历史记录", expected: "继续处理与导出" },
  { view: "diagnostics", label: "启动诊断", expected: "重新自检" },
];

class ManagedProcess {
  constructor(name, command, args, options = {}) {
    this.name = name;
    this.command = command;
    this.args = args;
    this.logs = [];
    this.exitCode = null;
    this.exitSignal = null;
    this.exited = false;
    this.spawnError = null;
    this.stopPromise = null;
    this.process = spawn(command, args, {
      cwd: options.cwd || ROOT_DIR,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    const append = (stream, chunk) => {
      const text = String(chunk || "");
      this.logs.push(`[${stream}] ${text}`);
      if (this.logs.length > 80) this.logs.splice(0, this.logs.length - 80);
    };
    this.process.stdout?.on("data", (chunk) => append("stdout", chunk));
    this.process.stderr?.on("data", (chunk) => append("stderr", chunk));
    this.process.on("error", (error) => {
      this.spawnError = error;
      append("process", error instanceof Error ? error.message : String(error));
    });
    this.exitPromise = new Promise((resolveExit) => {
      this.process.once("exit", (code, signal) => {
        this.exitCode = code;
        this.exitSignal = signal;
        this.exited = true;
        resolveExit();
      });
    });
  }

  tail() {
    return this.logs.join("").slice(-5000);
  }

  async stop() {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = this.stopProcessTree();
    return this.stopPromise;
  }

  async stopProcessTree() {
    const pid = this.process?.pid;
    if (!pid) return;
    if (process.platform === "win32") {
      await killWindowsProcessTree(pid);
      return;
    }

    signalPosixProcessTree(pid, "SIGTERM");
    await Promise.race([this.exitPromise, wait(1500)]);
    if (isPosixProcessTreeAlive(pid)) {
      signalPosixProcessTree(pid, "SIGKILL");
      await Promise.race([this.exitPromise, wait(1000)]);
    }
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
    return withTimeout(new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.webSocketUrl);
      this.socket.addEventListener("open", () => resolve());
      this.socket.addEventListener("error", () => reject(new Error("Failed to connect to browser CDP websocket.")), { once: true });
      this.socket.addEventListener("close", () => {
        for (const { reject: rejectCallback, timer } of this.callbacks.values()) {
          clearTimeout(timer);
          rejectCallback(new Error("Browser CDP socket closed before the command completed."));
        }
        this.callbacks.clear();
      });
      this.socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data || "{}"));
        if (message.id && this.callbacks.has(message.id)) {
          const { resolve: resolveCallback, reject: rejectCallback, timer } = this.callbacks.get(message.id);
          this.callbacks.delete(message.id);
          clearTimeout(timer);
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
    }), boundedTimeout(CDP_COMMAND_TIMEOUT_MS, "browser CDP connection"), "Timed out connecting to browser CDP websocket.");
  }

  on(eventName, handler) {
    const handlers = this.eventHandlers.get(eventName) || [];
    handlers.push(handler);
    this.eventHandlers.set(eventName, handlers);
  }

  send(method, params = {}, timeoutMs = CDP_COMMAND_TIMEOUT_MS) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`Browser CDP socket is not open for ${method}.`));
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.callbacks.delete(id);
        reject(new Error(`Browser CDP command timed out: ${method}`));
      }, boundedTimeout(timeoutMs, `browser CDP command ${method}`));
      this.callbacks.set(id, { resolve, reject, timer });
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

function signalPosixProcessTree(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") {
      try {
        process.kill(pid, signal);
      } catch {
        // The process already exited between the checks.
      }
    }
  }
}

function isPosixProcessTreeAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function killWindowsProcessTree(pid) {
  return new Promise((resolveKill) => {
    const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      try {
        killer.kill();
      } catch {
        // Ignore cleanup races.
      }
      resolveKill();
    }, 5000);
    killer.once("error", () => {
      clearTimeout(timer);
      resolveKill();
    });
    killer.once("exit", () => {
      clearTimeout(timer);
      resolveKill();
    });
  });
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

function pythonExecutable() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const localCandidates = process.platform === "win32"
    ? [resolve(ROOT_DIR, ".venv", "Scripts", "python.exe")]
    : [resolve(ROOT_DIR, ".venv", "bin", "python")];
  return localCandidates.find((candidate) => existsSync(candidate))
    || (process.platform === "win32" ? "python" : "python3");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boundedTimeout(timeoutMs, label) {
  const remaining = smokeDeadline - Date.now();
  if (remaining <= 0) {
    throw new Error(`Browser E2E exceeded its ${OVERALL_TIMEOUT_MS}ms internal budget while waiting for ${label}.`);
  }
  return Math.max(1, Math.min(timeoutMs, remaining));
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
  const timer = setTimeout(() => controller.abort(), boundedTimeout(timeoutMs, `HTTP request ${url}`));
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
  const effectiveTimeout = boundedTimeout(timeoutMs, label);
  while (Date.now() - started < effectiveTimeout) {
    if (managedProcess?.spawnError) {
      throw new Error(`${label} failed to start: ${managedProcess.spawnError.message}\n${managedProcess.tail()}`);
    }
    if (managedProcess?.exited) {
      const status = managedProcess.exitSignal ? `signal ${managedProcess.exitSignal}` : `code ${managedProcess.exitCode}`;
      throw new Error(`${label} exited early with ${status}.\n${managedProcess.tail()}`);
    }
    if (await requestOk(url, Math.min(2000, effectiveTimeout))) {
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
      "/snap/bin/chromium",
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

async function getFreePort(excludedPorts = new Set()) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = await new Promise((resolvePort, rejectPort) => {
      const server = net.createServer();
      server.unref();
      server.on("error", rejectPort);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        const candidate = typeof address === "object" && address ? address.port : 0;
        server.close(() => resolvePort(candidate));
      });
    });
    if (port > 0 && !excludedPorts.has(port)) return port;
  }
  throw new Error("Unable to allocate distinct local ports for browser E2E.");
}

function parsePort(value, label) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${label} must be an integer between 1 and 65535.`);
  }
  return port;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    boundedTimeout(timeoutMs, `HTTP request ${url}`),
  );
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function evaluate(client, expression, timeoutMs = 5000) {
  const bounded = boundedTimeout(timeoutMs, "Runtime.evaluate");
  const result = await withTimeout(
    client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: bounded,
    }),
    bounded + 1000,
    `Runtime.evaluate timed out: ${expression.slice(0, 120)}`,
  );
  if (result.exceptionDetails) {
    throw new Error(`Browser evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result?.value;
}

async function waitForText(client, text, timeoutMs = 10_000) {
  const started = Date.now();
  const effectiveTimeout = boundedTimeout(timeoutMs, `text ${text}`);
  while (Date.now() - started < effectiveTimeout) {
    try {
      const found = await evaluate(client, `document.body?.innerText?.includes(${JSON.stringify(text)}) ?? false`, 3000);
      if (found) return;
    } catch {
      // A navigation can replace the execution context between CDP calls.
    }
    await wait(250);
  }
  let diagnostic = null;
  try {
    diagnostic = await evaluate(client, `({
      href: location.href,
      activeViews: Array.from(document.querySelectorAll('[data-workbench-view][aria-current="page"]'))
        .map((item) => item.getAttribute('data-workbench-view')),
      body: document.body?.innerText?.slice(0, 1200) ?? '',
    })`, 3000);
  } catch {
    // Preserve the original timeout when the renderer is unresponsive too.
  }
  throw new Error(`Timed out waiting for text: ${text}\nPage: ${diagnostic?.href || "unknown"}\nActive: ${JSON.stringify(diagnostic?.activeViews || [])}\nCurrent page text:\n${diagnostic?.body || ""}`);
}

async function waitForTextGone(client, text, timeoutMs = 10_000) {
  const started = Date.now();
  const effectiveTimeout = boundedTimeout(timeoutMs, `text disappearance ${text}`);
  while (Date.now() - started < effectiveTimeout) {
    try {
      const found = await evaluate(client, `document.body?.innerText?.includes(${JSON.stringify(text)}) ?? false`, 3000);
      if (!found) return;
    } catch {
      // Retry while the page swaps execution contexts.
    }
    await wait(250);
  }
  throw new Error(`Timed out waiting for text to disappear: ${text}`);
}

async function waitForExpression(client, expression, label, timeoutMs = 10_000) {
  const started = Date.now();
  const effectiveTimeout = boundedTimeout(timeoutMs, label);
  while (Date.now() - started < effectiveTimeout) {
    try {
      const found = await evaluate(client, expression, 3000);
      if (found) return;
    } catch {
      // Retry transient CDP context loss or a busy page during navigation.
    }
    await wait(250);
  }
  let body = "";
  try {
    body = await evaluate(client, "document.body?.innerText?.slice(0, 1200) ?? ''", 3000);
  } catch {
    // Preserve the original timeout when the renderer is unresponsive too.
  }
  throw new Error(`Timed out waiting for ${label}\nCurrent page text:\n${body}`);
}

async function findClickablePointByText(client, text) {
  return evaluate(client, `(() => {
    const needle = ${JSON.stringify(text)};
    const selector = 'button,a,[role="button"],summary,label,input,textarea,[tabindex]';
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const isEnabled = (element) => !element.disabled && element.getAttribute('aria-disabled') !== 'true';
    const labelOf = (element) => [
      element.innerText,
      element.value,
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.textContent,
    ].filter(Boolean).join(' ').replace(/\\s+/g, ' ').trim();
    const candidates = Array.from(document.querySelectorAll(selector)).filter((element) => isVisible(element) && isEnabled(element));
    const exact = candidates.find((element) => labelOf(element) === needle);
    const partial = candidates.find((element) => labelOf(element).includes(needle));
    const element = exact || partial;
    if (!element) return null;
    element.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = element.getBoundingClientRect();
    return {
      x: Math.max(1, Math.min(window.innerWidth - 1, rect.left + rect.width / 2)),
      y: Math.max(1, Math.min(window.innerHeight - 1, rect.top + rect.height / 2)),
      label: labelOf(element),
    };
  })()`);
}

async function clickByText(client, text, timeoutMs = 10_000) {
  const started = Date.now();
  const effectiveTimeout = boundedTimeout(timeoutMs, `clickable text ${text}`);
  let point = null;
  while (Date.now() - started < effectiveTimeout) {
    point = await findClickablePointByText(client, text);
    if (point) break;
    await wait(250);
  }
  if (!point) {
    let body = "";
    try {
      body = await evaluate(client, "document.body?.innerText?.slice(0, 1200) ?? ''", 3000);
    } catch {
      // Preserve the original click failure when the renderer is unresponsive too.
    }
    throw new Error(`Unable to find enabled clickable text: ${text}\nCurrent page text:\n${body}`);
  }
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await wait(150);
  return point;
}

async function clickWorkbenchTab(client, value, label) {
  const focused = await evaluate(client, `(() => {
    const target = Array.from(document.querySelectorAll('[role="tab"]'))
      .find((item) => item.getAttribute('data-value') === ${JSON.stringify(value)} || item.textContent?.trim() === ${JSON.stringify(label)});
    if (!(target instanceof HTMLElement) || target.getAttribute('aria-disabled') === 'true' || target.hasAttribute('disabled')) return false;
    target.focus();
    return true;
  })()`, 3000);
  if (!focused) throw new Error(`Unable to focus workbench tab: ${label}`);
  await pressKey(client, "Enter");
  await waitForExpression(
    client,
    `document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() === ${JSON.stringify(label)}`,
    `${label} tab activation`,
    12_000,
  );
}

async function pressKey(client, key) {
  const keyData = {
    Escape: { code: "Escape", keyCode: 27 },
    Enter: { code: "Enter", keyCode: 13, text: "\r" },
    Tab: { code: "Tab", keyCode: 9 },
    Backspace: { code: "Backspace", keyCode: 8 },
  }[key] || { code: key, keyCode: 0 };
  const base = {
    key,
    code: keyData.code,
    windowsVirtualKeyCode: keyData.keyCode,
    nativeVirtualKeyCode: keyData.keyCode,
  };
  if (keyData.text) base.text = keyData.text;
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", ...base });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  await wait(150);
}

async function navigateTo(client, url) {
  await client.send("Page.navigate", { url });
  await wait(450);
}

async function reloadPage(client) {
  await client.send("Page.reload", { ignoreCache: true });
  await wait(650);
}

async function navigateBrowserHistory(client, offset) {
  const currentHref = await evaluate(client, "location.href", 3000);
  let history = null;
  const syncStarted = Date.now();
  while (Date.now() - syncStarted < boundedTimeout(5000, "browser history synchronization")) {
    const candidate = await client.send("Page.getNavigationHistory");
    const currentEntry = candidate.entries?.[Number(candidate.currentIndex)];
    if (currentEntry?.url === currentHref) {
      history = candidate;
      break;
    }
    await wait(100);
  }
  if (!history) {
    throw new Error(`Browser history did not synchronize with the current page: ${currentHref}`);
  }
  const currentIndex = Number(history.currentIndex);
  const targetIndex = currentIndex + offset;
  const target = history.entries?.[targetIndex];
  if (target?.id == null) {
    throw new Error(`Browser history offset ${offset} is unavailable: ${JSON.stringify({ currentIndex, targetIndex, length: history.entries?.length || 0 })}`);
  }
  await client.send("Page.navigateToHistoryEntry", { entryId: target.id }, 20_000);
  let stableObservations = 0;
  let latest = null;
  const navigationStarted = Date.now();
  while (Date.now() - navigationStarted < boundedTimeout(8000, "browser history entry navigation")) {
    const candidate = await client.send("Page.getNavigationHistory");
    const candidateIndex = Number(candidate.currentIndex);
    const candidateEntry = candidate.entries?.[candidateIndex];
    const href = await evaluate(client, "location.href", 3000).catch(() => "");
    latest = { candidateIndex, entryId: candidateEntry?.id, entryUrl: candidateEntry?.url, href };
    if (candidateIndex === targetIndex && candidateEntry?.id === target.id && href === target.url) {
      stableObservations += 1;
      if (stableObservations >= 2) return;
    } else {
      stableObservations = 0;
    }
    await wait(100);
  }
  throw new Error(`Browser history entry did not settle: ${JSON.stringify({ offset, currentIndex, targetIndex, target, latest })}`);
}

async function getActiveElementSummary(client) {
  return evaluate(client, `(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return { tag: "", id: "", text: "", role: "" };
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || "",
      text: (element.innerText || element.getAttribute("aria-label") || "").trim().slice(0, 120),
      role: element.getAttribute("role") || "",
      isSidebarTrigger: element.matches('[data-sidebar="trigger"]'),
    };
  })()`, 3000);
}

async function waitForWorkbenchView(client, testCase, timeoutMs = 20_000) {
  const routeExpression = testCase.view === "home"
    ? `!new URLSearchParams(location.search).has("view")`
    : `new URLSearchParams(location.search).get("view") === ${JSON.stringify(testCase.view)}`;
  const contentExpression = testCase.selector
    ? `Boolean(document.querySelector(${JSON.stringify(testCase.selector)}))`
    : `document.body?.innerText?.includes(${JSON.stringify(testCase.expected)})${testCase.alternate ? ` || document.body?.innerText?.includes(${JSON.stringify(testCase.alternate)})` : ""}`;
  const snapshotExpression = `(() => {
    const routeReady = Boolean(${routeExpression});
    const contentReady = Boolean(${contentExpression});
    const titleReady = document.title === ${JSON.stringify(`${testCase.label} | FYADR`)};
    const activeViews = Array.from(document.querySelectorAll('[data-workbench-view][aria-current="page"]'))
      .map((item) => item.getAttribute('data-workbench-view'));
    const activeReady = activeViews.length === 1 && activeViews[0] === ${JSON.stringify(testCase.view)};
    return {
      ok: routeReady && contentReady && titleReady && activeReady,
      routeReady,
      contentReady,
      titleReady,
      activeReady,
      href: location.href,
      activeViews,
    };
  })()`;
  const started = Date.now();
  const effectiveTimeout = boundedTimeout(timeoutMs, `${testCase.label} route`);
  let latestSnapshot = null;
  while (Date.now() - started < effectiveTimeout) {
    try {
      latestSnapshot = await evaluate(client, snapshotExpression, 3000);
      if (latestSnapshot?.ok) return;
    } catch {
      // Retry while navigation replaces the execution context.
    }
    await wait(250);
  }
  let diagnostic = null;
  try {
    diagnostic = await evaluate(client, `({
      href: location.href,
      body: document.body?.innerText?.slice(0, 1200) ?? '',
      readyState: document.readyState,
    })`, 3000);
  } catch {
    // Preserve the route failure when the renderer is unresponsive too.
  }
  throw new Error(`${testCase.label} route, content, and active navigation state did not settle: ${JSON.stringify({ latestSnapshot, diagnostic })}`);
}

async function makePromptDraftDirty(client, suffix) {
  const result = await evaluate(client, `(() => {
    const textarea = document.querySelector("textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) return null;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    const nextValue = textarea.value + ${JSON.stringify(suffix)};
    setter?.call(textarea, nextValue);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    return nextValue;
  })()`, 3000);
  if (typeof result !== "string") throw new Error("Unable to create a dirty prompt draft.");
  await wait(200);
  return result;
}

async function settleVisibleConfirmation(client, label) {
  const clicked = await evaluate(client, `(() => {
    const dialog = document.querySelector('[role="alertdialog"]');
    const button = Array.from(dialog?.querySelectorAll("button") || [])
      .find((item) => item.textContent?.trim() === ${JSON.stringify(label)});
    button?.click();
    return Boolean(button);
  })()`, 3000);
  if (!clicked) throw new Error(`Visible confirmation is missing action: ${label}`);
  await waitForTextGone(client, "放弃未保存的修改？", 12_000);
}

async function captureScreenshot(client, path) {
  try {
    const result = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, 5000);
    if (result.data) {
      writeFileSync(path, Buffer.from(result.data, "base64"));
    }
  } catch {
    // Screenshot is best-effort.
  }
}

async function getPageWebSocket(debugPort, targetUrl) {
  const response = await fetchWithTimeout(`http://127.0.0.1:${debugPort}/json/list`);
  if (!response.ok) throw new Error(`Unable to list browser page targets: ${response.status}`);
  const list = await response.json();
  const page = list.find((item) => item.type === "page" && String(item.url || "").startsWith(targetUrl))
    || list.find((item) => item.type === "page");
  if (!page?.webSocketDebuggerUrl) {
    throw new Error("Unable to find browser page target.");
  }
  return page.webSocketDebuggerUrl;
}

async function createFreshPageClient(debugPort, url) {
  const response = await fetchWithTimeout(
    `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`,
    { method: "PUT" },
  );
  if (!response.ok) throw new Error(`Unable to create a fresh browser page target: ${response.status}`);
  const target = await response.json();
  if (!target.webSocketDebuggerUrl) throw new Error("Fresh browser page target did not expose a websocket.");
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Log.enable").catch(() => undefined);
  return client;
}

async function closePageTarget(debugPort, client) {
  const targetId = String(client?.webSocketUrl || "").split("/").filter(Boolean).at(-1);
  client?.close();
  if (!targetId) throw new Error("Unable to determine the old browser target ID.");
  const response = await fetchWithTimeout(
    `http://127.0.0.1:${debugPort}/json/close/${encodeURIComponent(targetId)}`,
  );
  if (!response.ok) throw new Error(`Unable to close the old browser page target: ${response.status}`);
}

async function resetBrowserPage(client, url) {
  await client.send("Page.stopLoading").catch(() => undefined);
  await client.send("Page.navigate", { url: "about:blank" }).catch(() => undefined);
  await wait(700);
  await client.send("Page.navigate", { url });
  await wait(700);
}

async function verifyWorkbenchDeepLink(client, frontendUrl, testCase) {
  const directUrl = new URL(frontendUrl);
  directUrl.searchParams.set("source", "sidebar-e2e");
  if (testCase.view !== "home") directUrl.searchParams.set("view", testCase.view);
  directUrl.hash = `view-${testCase.view}`;
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await navigateTo(client, directUrl.href);
      await waitForWorkbenchView(client, testCase, ROUTE_TIMEOUT_MS);
      const directState = await evaluate(client, `({
        source: new URLSearchParams(location.search).get("source"),
        hash: location.hash,
        hrefState: (() => {
          const href = document.querySelector('[data-workbench-view=${JSON.stringify(testCase.view)}]')?.getAttribute("href") || "";
          if (!href) return null;
          const url = new URL(href, location.href);
          return {
            href,
            source: url.searchParams.get("source"),
            view: url.searchParams.get("view"),
            hash: url.hash,
          };
        })(),
      })`, 3000);
      const expectedHrefView = testCase.view === "home" ? null : testCase.view;
      if (
        directState?.source !== "sidebar-e2e"
        || directState?.hash !== `#view-${testCase.view}`
        || !directState?.hrefState?.href
        || directState.hrefState.source !== "sidebar-e2e"
        || directState.hrefState.view !== expectedHrefView
        || directState.hrefState.hash !== `#view-${testCase.view}`
      ) {
        throw new Error(`${testCase.label} deep link did not preserve URL state or expose a native href: ${JSON.stringify(directState)}`);
      }
      await evaluate(client, `window.__fyadrE2eReloadSentinel = ${JSON.stringify(testCase.view)}`, 3000);
      await reloadPage(client);
      await waitForWorkbenchView(client, testCase, ROUTE_TIMEOUT_MS);
      const reloadState = await evaluate(client, `({
        sentinelCleared: typeof window.__fyadrE2eReloadSentinel === "undefined",
        source: new URLSearchParams(location.search).get("source"),
        hash: location.hash,
      })`, 3000);
      if (!reloadState?.sentinelCleared || reloadState?.source !== "sidebar-e2e" || reloadState?.hash !== `#view-${testCase.view}`) {
        throw new Error(`${testCase.label} reload did not recover the deep-linked view: ${JSON.stringify(reloadState)}`);
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await resetBrowserPage(client, directUrl.href).catch(() => undefined);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${testCase.label} deep-link verification failed.`);
}

async function runSmoke() {
  const started = Date.now();
  smokeDeadline = started + OVERALL_TIMEOUT_MS;
  rmSync(SCREENSHOT_PATH, { force: true });
  const checks = [];
  const warnings = [];
  const managedProcesses = [];
  let browserClient = null;
  let browserProcess = null;
  let userDataDir = "";
  let backendConfigDir = "";
  let backendStartedBySmoke = false;
  const mobileOnly = process.env.FYADR_E2E_MOBILE_ONLY === "1";
  const browserExecutable = findBrowserExecutable();
  const configuredBackendUrl = process.env.FYADR_E2E_BACKEND_URL?.trim();
  const allocatedPorts = new Set();
  const backendPortForDefault = configuredBackendUrl ? null : await getFreePort(allocatedPorts);
  if (backendPortForDefault) allocatedPorts.add(backendPortForDefault);
  const backendUrl = configuredBackendUrl || `http://127.0.0.1:${backendPortForDefault}`;
  const backendAddress = new URL(backendUrl);
  const configuredBackendPort = backendAddress.port || (backendAddress.protocol === "https:" ? "443" : "80");
  if (configuredBackendUrl) allocatedPorts.add(parsePort(configuredBackendPort, "backend port"));
  const frontendPort = process.env.FYADR_E2E_FRONTEND_PORT
    ? parsePort(process.env.FYADR_E2E_FRONTEND_PORT, "FYADR_E2E_FRONTEND_PORT")
    : await getFreePort(allocatedPorts);
  allocatedPorts.add(frontendPort);
  const debugPort = process.env.FYADR_E2E_DEBUG_PORT
    ? parsePort(process.env.FYADR_E2E_DEBUG_PORT, "FYADR_E2E_DEBUG_PORT")
    : await getFreePort(allocatedPorts);
  allocatedPorts.add(debugPort);
  const frontendUrl = process.env.FYADR_E2E_URL || `http://127.0.0.1:${frontendPort}`;
  const backendHealthUrl = `${backendUrl}/api/ping`;

  try {
    if (!(await requestOk(backendHealthUrl, 2000))) {
      if (configuredBackendUrl && process.env.FYADR_E2E_START_BACKEND !== "1") {
        throw new Error(`Configured E2E backend is unreachable: ${backendUrl}`);
      }
      if (!["127.0.0.1", "localhost"].includes(backendAddress.hostname)) {
        throw new Error(`Refusing to start a managed E2E backend on a non-local host: ${backendAddress.hostname}`);
      }
      backendConfigDir = mkdtempSync(join(tmpdir(), "fyadr-e2e-config-"));
      const backend = new ManagedProcess("backend", pythonExecutable(), ["scripts/web_app.py"], {
        cwd: ROOT_DIR,
        env: {
          WEB_HOST: backendAddress.hostname,
          WEB_PORT: configuredBackendPort,
          FYADR_APP_CONFIG_DIR: backendConfigDir,
          FYADR_API_KEY: "",
          OPENAI_API_KEY: "",
          FYADR_BASE_URL: "",
          OPENAI_BASE_URL: "",
          FYADR_MODEL: "",
        },
      });
      managedProcesses.push(backend);
      await waitForHttp(backendHealthUrl, DEFAULT_TIMEOUT_MS, "backend", backend);
      backendStartedBySmoke = true;
      checks.push("backend started or became reachable");
    } else {
      checks.push("backend already reachable");
    }

    const npmDev = npmInvocation(["run", "dev", "--", "--host", "127.0.0.1", "--port", String(frontendPort), "--strictPort"]);
    const frontend = new ManagedProcess("vite", npmDev.command, npmDev.args, {
      cwd: APP_DIR,
      env: { FYADR_E2E_BACKEND_URL: backendUrl },
    });
    managedProcesses.push(frontend);
    await waitForHttp(frontendUrl, DEFAULT_TIMEOUT_MS, "frontend", frontend);
    checks.push("frontend dev server reachable");

    userDataDir = mkdtempSync(join(tmpdir(), "fyadr-e2e-"));
    const browserArgs = [
      "--headless=new",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-features=Translate,MediaRouter,OptimizationHints",
      "--disable-gpu",
      "--disable-sync",
      "--metrics-recording-only",
      "--window-size=1440,1000",
      frontendUrl,
    ];
    if (typeof process.getuid === "function" && process.getuid() === 0) {
      browserArgs.unshift("--no-sandbox");
    }
    browserProcess = new ManagedProcess("browser", browserExecutable, browserArgs);
    managedProcesses.push(browserProcess);
    await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, DEFAULT_TIMEOUT_MS, "browser CDP", browserProcess);

    const webSocketUrl = await getPageWebSocket(debugPort, frontendUrl);
    browserClient = new CdpClient(webSocketUrl);
    await browserClient.connect();
    await browserClient.send("Page.enable");
    await browserClient.send("Runtime.enable");
    await browserClient.send("Log.enable").catch(() => undefined);
    await waitForText(browserClient, "当前文件", DEFAULT_TIMEOUT_MS);
    await waitForText(browserClient, "文档入口", DEFAULT_TIMEOUT_MS);
    await waitForText(browserClient, "上传文档", DEFAULT_TIMEOUT_MS);
    checks.push("home page renders with global task dashboard and card controls");

    if (!mobileOnly) {
    for (const [index, testCase] of WORKBENCH_VIEW_CASES.entries()) {
      if (index > 0) {
        const previousRouteClient = browserClient;
        browserClient = await createFreshPageClient(debugPort, "about:blank");
        await closePageTarget(debugPort, previousRouteClient).catch((error) => {
          warnings.push(`old ${WORKBENCH_VIEW_CASES[index - 1].view} route target cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
      await verifyWorkbenchDeepLink(browserClient, frontendUrl, testCase);
    }
    checks.push("all seven sidebar views support direct deep links, native hrefs, active state, and reload recovery");

    const invalidUrl = new URL(frontendUrl);
    invalidUrl.searchParams.set("source", "sidebar-invalid");
    invalidUrl.searchParams.set("view", "not-a-view");
    invalidUrl.hash = "invalid-view";
    // Validate invalid-route normalization in a clean target. The route
    // matrix intentionally performs many reloads and can leave a Chromium
    // renderer under transient pressure; that must not change this assertion.
    const matrixClient = browserClient;
    browserClient = await createFreshPageClient(debugPort, invalidUrl.href);
    await closePageTarget(debugPort, matrixClient).catch((error) => {
      warnings.push(`old browser matrix target cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
    });
    await waitForText(browserClient, "当前文件", DEFAULT_TIMEOUT_MS);
    await waitForWorkbenchView(browserClient, WORKBENCH_VIEW_CASES[0], ROUTE_TIMEOUT_MS);
    const normalizedInvalidRoute = await evaluate(browserClient, `({ search: location.search, hash: location.hash })`, 3000);
    if (normalizedInvalidRoute?.search !== "?source=sidebar-invalid" || normalizedInvalidRoute?.hash !== "#invalid-view") {
      throw new Error(`Invalid workbench route was not normalized while preserving unrelated URL state: ${JSON.stringify(normalizedInvalidRoute)}`);
    }
    checks.push("invalid view values normalize to home without losing unrelated query or hash state");

    // Route-matrix navigations intentionally create many document history
    // entries. Start the interaction checks in a fresh target so Back/Forward
    // assertions exercise the product's own entries, not the matrix history.
    const invalidRouteClient = browserClient;
    browserClient = await createFreshPageClient(debugPort, frontendUrl);
    await closePageTarget(debugPort, invalidRouteClient).catch((error) => {
      warnings.push(`old browser invalid-route target cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
    });
    await waitForText(browserClient, "当前文件", DEFAULT_TIMEOUT_MS);
    await waitForWorkbenchView(browserClient, WORKBENCH_VIEW_CASES[0]);

    const initialRoute = await evaluate(browserClient, "location.search", 3000);
    if (initialRoute && !initialRoute.includes("view=home")) {
      throw new Error(`Initial workbench route was not canonicalized: ${initialRoute}`);
    }
    await clickByText(browserClient, "模型配置");
    await waitForText(browserClient, "默认连接", 12_000);
    const modelRoute = await evaluate(browserClient, "location.search", 3000);
    if (!modelRoute.includes("view=model")) throw new Error(`Model navigation did not update the URL: ${modelRoute}`);
    await navigateBrowserHistory(browserClient, -1);
    await waitForExpression(browserClient, "!location.search.includes('view=model')", "browser Back URL transition", 12_000);
    await waitForText(browserClient, "改写对照", 12_000);
    const backRoute = await evaluate(browserClient, "location.search", 3000);
    if (backRoute.includes("view=model")) throw new Error(`Back navigation did not restore the home route: ${backRoute}`);
    await navigateBrowserHistory(browserClient, 1);
    await waitForText(browserClient, "默认连接", 12_000);
    const forwardRoute = await evaluate(browserClient, "location.search", 3000);
    if (!forwardRoute.includes("view=model")) throw new Error(`Forward navigation did not restore the model route: ${forwardRoute}`);
    await browserClient.send("Page.reload", { ignoreCache: true });
    await wait(750);
    await waitForText(browserClient, "默认连接", 12_000);
    const reloadRoute = await evaluate(browserClient, "location.search", 3000);
    if (!reloadRoute.includes("view=model")) throw new Error(`Reload lost the deep-linked view: ${reloadRoute}`);
    const desktopSidebarSemantics = await evaluate(browserClient, `(() => {
      const rail = document.querySelector('[data-sidebar="rail"]');
      const railHost = rail?.closest('[data-side="left"]');
      const trigger = document.querySelector('[data-sidebar="trigger"]');
      const navigation = document.querySelector('[role="navigation"][aria-label="工作台主导航"]');
      return {
        rail: Boolean(rail),
        railNested: Boolean(railHost),
        trigger: Boolean(trigger),
        controls: trigger?.getAttribute('aria-controls') || '',
        expanded: trigger?.getAttribute('aria-expanded') || '',
        navigation: Boolean(navigation),
      };
    })()`, 3000);
    if (!desktopSidebarSemantics?.rail || !desktopSidebarSemantics.railNested || !desktopSidebarSemantics.controls || !desktopSidebarSemantics.expanded || !desktopSidebarSemantics.navigation) {
      throw new Error(`Desktop sidebar rail or accessibility semantics are incomplete: ${JSON.stringify(desktopSidebarSemantics)}`);
    }
    await evaluate(browserClient, `document.querySelector('[data-sidebar="trigger"]')?.click()`, 3000);
    await wait(250);
    const collapsedSidebar = await evaluate(browserClient, `(() => {
      const sidebar = document.querySelector('[data-side="left"]');
      return { state: sidebar?.getAttribute('data-state'), cookie: document.cookie };
    })()`, 3000);
    if (collapsedSidebar?.state !== "collapsed" || !collapsedSidebar.cookie.includes("sidebar_state=false")) {
      throw new Error(`Sidebar collapse did not persist: ${JSON.stringify(collapsedSidebar)}`);
    }
    await browserClient.send("Page.reload", { ignoreCache: true });
    await wait(750);
    await waitForText(browserClient, "默认连接", 12_000);
    const restoredSidebarState = await evaluate(browserClient, "document.querySelector('[data-side=\"left\"]')?.getAttribute('data-state')", 3000);
    if (restoredSidebarState !== "collapsed") throw new Error(`Sidebar cookie was not restored after reload: ${restoredSidebarState}`);
    await evaluate(browserClient, "document.querySelector('[data-sidebar=\"trigger\"]')?.click()", 3000);
    await wait(250);
    await clickByText(browserClient, "工作台");
    await waitForText(browserClient, "改写对照", 12_000);
    checks.push("URL deep-link, Back/Forward, reload recovery, sidebar cookie, rail, and ARIA semantics work in a real browser");

    let fileChooserIntercepted = false;
    try {
      await browserClient.send("Page.setInterceptFileChooserDialog", { enabled: true, cancel: true });
      fileChooserIntercepted = true;
    } catch (error) {
      warnings.push(`file chooser cancel smoke skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (fileChooserIntercepted && backendStartedBySmoke) {
      const hasRestoredDocument = await evaluate(browserClient, `document.body?.innerText?.includes("源文档 ·") ?? false`, 3000);
      if (!hasRestoredDocument && await findClickablePointByText(browserClient, "上传文档")) {
        await clickByText(browserClient, "上传文档");
        await wait(750);
        const cancelNoticeVisible = await evaluate(browserClient, `document.body?.innerText?.includes("已取消选择文档") ?? false`, 3000);
        if (!cancelNoticeVisible) {
          warnings.push("browser canceled the intercepted file chooser without dispatching a page-level cancel event");
        }
        await clickByText(browserClient, "模型配置");
        await waitForText(browserClient, "默认连接", 12_000);
        await clickByText(browserClient, "工作台");
        await waitForText(browserClient, "改写对照", 12_000);
        checks.push("document picker cancel releases UI and navigation remains clickable");
      } else {
        warnings.push("file chooser cancel smoke skipped because an existing document is already restored in the local backend state");
        await clickByText(browserClient, "模型配置");
        await waitForText(browserClient, "默认连接", 12_000);
        await clickByText(browserClient, "工作台");
        await waitForText(browserClient, "改写对照", 12_000);
        checks.push("existing document state still allows sidebar navigation");
      }
    } else if (fileChooserIntercepted) {
      warnings.push("file chooser cancel smoke skipped because an already-running local backend may carry user document state");
      await clickByText(browserClient, "模型配置");
      await waitForText(browserClient, "默认连接", 12_000);
      await clickByText(browserClient, "工作台");
      await waitForText(browserClient, "改写对照", 12_000);
      checks.push("existing local backend state still allows sidebar navigation");
    }

    await waitForText(browserClient, "改写对照", 10_000);
    await waitForText(browserClient, "文档入口", 10_000);
    checks.push("inline Diff workbench is visible inside the home canvas");

    await clickByText(browserClient, "工作台");
    await waitForText(browserClient, "改写对照", 10_000);
    checks.push("home controls remain visible beside inline Diff workbench");

    await clickByText(browserClient, "历史记录");
    await waitForText(browserClient, "继续处理与导出", 12_000);
    await clickByText(browserClient, "启动诊断");
    await waitForText(browserClient, "重新自检", 12_000);
    await clickByText(browserClient, "提示词");
    await waitForExpression(browserClient, "Boolean(document.querySelector('textarea'))", "prompt editor textarea", 12_000);
    const promptPageUsesFixedBoundary = await evaluate(browserClient, "Boolean(document.querySelector('textarea') && getComputedStyle(document.documentElement).overflow === 'hidden' && getComputedStyle(document.body).overflow === 'hidden')", 3000);
    if (!promptPageUsesFixedBoundary) {
      throw new Error("Prompt workspace did not render inside the fixed page boundary.");
    }
    await clickWorkbenchTab(browserClient, "workflows", "流程模板");
    await waitForText(browserClient, "保存流程", 12_000);
    const workflowEditorState = await evaluate(browserClient, `(() => ({
      tab: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() || "",
      nameInput: Array.from(document.querySelectorAll('input')).some((item) => item.getBoundingClientRect().width > 0 && item.getAttribute('type') !== 'hidden'),
      numberInputs: Array.from(document.querySelectorAll('input[type="number"]')).filter((item) => item.getBoundingClientRect().width > 0).length,
      save: Array.from(document.querySelectorAll('button')).some((item) => item.textContent?.trim() === '保存流程' && item.getBoundingClientRect().width > 0),
    }))()`, 3000);
    if (workflowEditorState?.tab !== "流程模板" || !workflowEditorState.nameInput || workflowEditorState.numberInputs < 2 || !workflowEditorState.save) {
      throw new Error(`Workflow editor did not render its real controls: ${JSON.stringify(workflowEditorState)}`);
    }
    const expandedWorkflowDraft = await evaluate(browserClient, `(() => {
      const label = Array.from(document.querySelectorAll('label'))
        .find((item) => item.textContent?.trim() === '默认编排上限');
      const input = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
      if (!(input instanceof HTMLInputElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, '4');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`, 3000);
    if (!expandedWorkflowDraft) throw new Error("Workflow sequence-limit input is unavailable.");
    await waitForExpression(browserClient, `Array.from(document.querySelectorAll('button')).some((item) => item.textContent?.trim() === '添加一轮' && !item.disabled)`, "four-round workflow add action", 12_000);
    const addWorkflowRoundFocused = await evaluate(browserClient, `(() => {
      const button = Array.from(document.querySelectorAll('button'))
        .find((item) => item.textContent?.trim() === '添加一轮' && !item.disabled);
      if (!(button instanceof HTMLButtonElement)) return false;
      button.focus();
      return document.activeElement === button;
    })()`, 3000);
    if (!addWorkflowRoundFocused) throw new Error("Workflow add action could not receive keyboard focus.");
    await pressKey(browserClient, "Enter");
    await waitForExpression(browserClient, `Boolean(document.querySelector('button[aria-label="第 4 轮：移除"]'))`, "four-round workflow draft", 12_000);
    const reorderedFocus = await evaluate(browserClient, `(() => {
      const button = document.querySelector('button[aria-label="第 1 轮：下移"]');
      if (!(button instanceof HTMLElement)) return false;
      button.focus();
      button.click();
      return true;
    })()`, 3000);
    if (!reorderedFocus) throw new Error("Workflow sequence reorder control is unavailable.");
    await waitForExpression(browserClient, `document.activeElement?.getAttribute("aria-label") === "第 2 轮：下移"`, "workflow reorder focus retention", 12_000);
    const resetWorkflowFocused = await evaluate(browserClient, `(() => {
      const button = Array.from(document.querySelectorAll('button'))
        .find((item) => item.textContent?.trim() === '还原' && !item.disabled);
      if (!(button instanceof HTMLElement)) return false;
      button.focus();
      return true;
    })()`, 3000);
    if (!resetWorkflowFocused) throw new Error("Workflow reset action is unavailable after reordering.");
    await pressKey(browserClient, "Enter");
    await waitForExpression(browserClient, `document.querySelector('button') && Array.from(document.querySelectorAll('button')).some((item) => item.textContent?.trim() === '保存流程' && item.disabled)`, "workflow draft reset", 12_000);
    await clickWorkbenchTab(browserClient, "prompts", "提示词库");
    await waitForExpression(browserClient, "Boolean(document.querySelector('textarea'))", "prompt editor after workflow tab", 12_000);
    checks.push("prompt workspace edits a four-round workflow draft, preserves reorder focus, resets, and returns to prompt editing");
    checks.push("primary sidebar navigation remains responsive");

    await clickByText(browserClient, "工作台");
    await waitForText(browserClient, "改写对照", 12_000);
    await clickByText(browserClient, "降检报告");
    await waitForExpression(
      browserClient,
      `document.body?.innerText?.includes("降检诊断") || document.body?.innerText?.includes("尚未载入论文")`,
      "rate-audit report or honest empty state",
      20_000,
    );
    const hasRateAudit = await evaluate(browserClient, `document.body?.innerText?.includes("降检诊断") ?? false`, 3000);
    if (hasRateAudit) {
      await waitForText(browserClient, "降检策略 × 正文与格式硬约束", 12_000);
      await waitForText(browserClient, "正文范围与格式锁", 12_000);
      checks.push("rate-audit report renders the dual strategy/content contract gate");
    } else {
      checks.push("rate-audit report renders an honest empty state without a selected document");
    }
    await clickByText(browserClient, "工作台");
    await waitForText(browserClient, "改写对照", 12_000);

    await clickByText(browserClient, "提示词");
    await waitForWorkbenchView(browserClient, WORKBENCH_VIEW_CASES.find((item) => item.view === "prompts"));
    const desktopDraft = await makePromptDraftDirty(browserClient, " desktop-navigation-guard");
    await clickByText(browserClient, "工作台");
    await waitForText(browserClient, "放弃未保存的修改？", 12_000);
    await settleVisibleConfirmation(browserClient, "取消");
    await waitForWorkbenchView(browserClient, WORKBENCH_VIEW_CASES.find((item) => item.view === "prompts"));
    const desktopCancelState = await evaluate(browserClient, `({
      value: document.querySelector("textarea")?.value || "",
      route: new URLSearchParams(location.search).get("view"),
    })`, 3000);
    if (desktopCancelState?.route !== "prompts" || desktopCancelState?.value !== desktopDraft) {
      throw new Error(`Desktop dirty-navigation cancel lost the route or draft: ${JSON.stringify(desktopCancelState)}`);
    }
    await clickByText(browserClient, "工作台");
    await waitForText(browserClient, "放弃未保存的修改？", 12_000);
    await settleVisibleConfirmation(browserClient, "放弃修改");
    await waitForWorkbenchView(browserClient, WORKBENCH_VIEW_CASES[0]);
    checks.push("desktop dirty sidebar navigation preserves drafts on cancel and leaves only after confirmation");

    await clickByText(browserClient, "模型配置");
    await waitForWorkbenchView(browserClient, WORKBENCH_VIEW_CASES.find((item) => item.view === "model"));
    await clickByText(browserClient, "提示词");
    await waitForWorkbenchView(browserClient, WORKBENCH_VIEW_CASES.find((item) => item.view === "prompts"));
    const historyDraft = await makePromptDraftDirty(browserClient, " history-traversal-guard");
    await navigateBrowserHistory(browserClient, -2);
    await waitForText(browserClient, "放弃未保存的修改？", 12_000);
    await settleVisibleConfirmation(browserClient, "取消");
    await waitForWorkbenchView(browserClient, WORKBENCH_VIEW_CASES.find((item) => item.view === "prompts"));
    const restoredHistoryDraft = await evaluate(browserClient, `document.querySelector("textarea")?.value || ""`, 3000);
    if (restoredHistoryDraft !== historyDraft) {
      throw new Error("Cancelled multi-entry Back traversal did not preserve the prompt draft.");
    }
    await navigateBrowserHistory(browserClient, -2);
    await waitForText(browserClient, "放弃未保存的修改？", 12_000);
    await settleVisibleConfirmation(browserClient, "放弃修改");
    await waitForWorkbenchView(browserClient, WORKBENCH_VIEW_CASES[0]);
    await navigateBrowserHistory(browserClient, 1);
    await waitForWorkbenchView(browserClient, WORKBENCH_VIEW_CASES.find((item) => item.view === "model"));
    await navigateBrowserHistory(browserClient, 1);
    await waitForWorkbenchView(browserClient, WORKBENCH_VIEW_CASES.find((item) => item.view === "prompts"));
    checks.push("dirty multi-entry Back cancellation/restoration, confirmation, and subsequent Forward traversal work in a real browser");

    const staleTraversalDraft = await makePromptDraftDirty(browserClient, " stale-history-confirmation");
    await navigateBrowserHistory(browserClient, -2);
    await waitForText(browserClient, "放弃未保存的修改？", 12_000);
    await navigateBrowserHistory(browserClient, 2);
    await waitForWorkbenchView(browserClient, WORKBENCH_VIEW_CASES.find((item) => item.view === "prompts"));
    await waitForTextGone(browserClient, "放弃未保存的修改？", 12_000);
    const staleTraversalState = await evaluate(browserClient, `({
      value: document.querySelector("textarea")?.value || "",
      route: new URLSearchParams(location.search).get("view"),
    })`, 3000);
    if (staleTraversalState?.route !== "prompts" || staleTraversalState?.value !== staleTraversalDraft) {
      throw new Error(`Stale history confirmation cleared or navigated the current prompt draft: ${JSON.stringify(staleTraversalState)}`);
    }
    await clickByText(browserClient, "工作台");
    await waitForText(browserClient, "放弃未保存的修改？", 12_000);
    await settleVisibleConfirmation(browserClient, "取消");
    await waitForWorkbenchView(browserClient, WORKBENCH_VIEW_CASES.find((item) => item.view === "prompts"));
    const guardedAfterStaleConfirmation = await evaluate(browserClient, `document.querySelector("textarea")?.value || ""`, 3000);
    if (guardedAfterStaleConfirmation !== staleTraversalDraft) {
      throw new Error("A stale history confirmation disabled the live prompt draft guard.");
    }
    await clickByText(browserClient, "工作台");
    await waitForText(browserClient, "放弃未保存的修改？", 12_000);
    await settleVisibleConfirmation(browserClient, "放弃修改");
    await waitForWorkbenchView(browserClient, WORKBENCH_VIEW_CASES[0]);
    checks.push("rapid Back/Forward invalidates stale discard confirmations without clearing the live prompt draft guard");

    await clickByText(browserClient, "打开通知与任务中心");
    await waitForText(browserClient, "通知与任务中心", 12_000);
    const notificationCenterIsDialog = await evaluate(browserClient, "Boolean(document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]'))", 3000);
    if (!notificationCenterIsDialog) {
      throw new Error("Notification center drawer is missing dialog accessibility attributes.");
    }
    await pressKey(browserClient, "Escape");
    await waitForTextGone(browserClient, "通知与任务中心", 12_000);
    checks.push("prompt workspace renders and notification center opens/closes with Escape");
    }

    await browserClient.send("Emulation.setDeviceMetricsOverride", {
      width: 720,
      height: 900,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 720,
      screenHeight: 900,
    });
    await wait(350);
    await evaluate(browserClient, "document.querySelector('[data-sidebar=\"trigger\"]')?.click()", 3000);
    await waitForText(browserClient, "工作台导航", 12_000);
    const tabletRailVisible = await evaluate(browserClient, `(() => {
      const rail = document.querySelector('[data-sidebar="rail"]');
      if (!(rail instanceof HTMLElement)) return false;
      const style = getComputedStyle(rail);
      const rect = rail.getBoundingClientRect();
      return style.display !== "none" && rect.width > 0 && rect.height > 0;
    })()`, 3000);
    if (tabletRailVisible) {
      throw new Error("Desktop sidebar rail is visible inside the 720px mobile drawer.");
    }
    await pressKey(browserClient, "Escape");
    await waitForExpression(browserClient, `!document.querySelector('[data-sidebar="sidebar"][data-mobile="true"]')`, "tablet sidebar Escape close", 12_000);
    checks.push("640–767px mobile drawer hides the desktop sidebar rail");

    await browserClient.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });
    await wait(350);
    const mobileHeaderState = await evaluate(browserClient, `(() => {
      const notification = document.querySelector('button[aria-label="打开通知与任务中心"]');
      const subbar = document.querySelector('.vercel-subbar');
      const productName = Array.from(document.querySelectorAll('header span')).find((item) => item.textContent?.trim() === '论文 AI 降检平台');
      if (!notification || !subbar || !productName) return null;
      const rect = notification.getBoundingClientRect();
      const productRect = productName.getBoundingClientRect();
      return {
        notificationVisible: rect.left >= 0 && rect.right <= window.innerWidth && rect.width >= 32,
        productNameVisible: productRect.left >= 0 && productRect.right <= window.innerWidth && productRect.width > 0,
        subbarFits: subbar.scrollWidth <= subbar.clientWidth + 2,
        documentFits: document.documentElement.scrollWidth <= window.innerWidth + 2,
      };
    })()`, 3000);
    if (!mobileHeaderState?.notificationVisible || !mobileHeaderState?.productNameVisible || !mobileHeaderState?.subbarFits || !mobileHeaderState?.documentFits) {
      throw new Error(`Mobile global status controls are clipped: ${JSON.stringify(mobileHeaderState)}`);
    }
    await clickByText(browserClient, "打开通知与任务中心");
    await waitForText(browserClient, "通知与任务中心", 12_000);
    await pressKey(browserClient, "Escape");
    await waitForTextGone(browserClient, "通知与任务中心", 12_000);

    const mobileTriggerFocused = await evaluate(browserClient, `(() => {
      const trigger = document.querySelector('[data-sidebar="trigger"]');
      if (!(trigger instanceof HTMLElement)) return false;
      trigger.focus();
      return true;
    })()`, 3000);
    if (!mobileTriggerFocused) {
      throw new Error("Mobile sidebar trigger is unavailable.");
    }
    await pressKey(browserClient, "Enter");
    await waitForText(browserClient, "工作台导航", 12_000);
    await pressKey(browserClient, "Escape");
    await waitForExpression(browserClient, `!document.querySelector('[data-sidebar="sidebar"][data-mobile="true"]')`, "mobile sidebar Escape close", 12_000);
    const escapeFocus = await getActiveElementSummary(browserClient);
    if (!escapeFocus?.isSidebarTrigger || escapeFocus?.text !== "切换侧边栏") {
      throw new Error(`Escape did not restore focus to the mobile sidebar trigger: ${JSON.stringify(escapeFocus)}`);
    }

    await pressKey(browserClient, "Enter");
    await waitForText(browserClient, "工作台导航", 12_000);
    const mobilePromptNavigationFocused = await evaluate(browserClient, `(() => {
      const link = Array.from(document.querySelectorAll('[data-workbench-view="prompts"]'))
        .find((item) => item instanceof HTMLElement && item.getBoundingClientRect().width > 0);
      if (!(link instanceof HTMLElement)) return false;
      link.focus();
      return true;
    })()`, 3000);
    if (!mobilePromptNavigationFocused) {
      throw new Error("Prompt navigation item is unavailable in the mobile sidebar.");
    }
    await pressKey(browserClient, "Enter");
    await waitForExpression(browserClient, "Boolean(document.querySelector('textarea'))", "mobile prompt editor textarea", 12_000);
    await waitForExpression(browserClient, "document.activeElement?.id === 'fyadr-main-content'", "mobile navigation focus transfer to main content", 12_000);
    checks.push("mobile keyboard Enter/Escape and close-reason focus restoration work end to end");
    const mobilePromptEditorReachable = await evaluate(browserClient, `(() => {
      const textarea = document.querySelector('textarea');
      if (!textarea) return false;
      textarea.scrollIntoView({ block: 'center' });
      const rect = textarea.getBoundingClientRect();
      return rect.height >= 80 && rect.bottom > 0 && rect.top < window.innerHeight;
    })()`, 3000);
    if (!mobilePromptEditorReachable) {
      throw new Error("Prompt editor is not reachable in the 390x844 mobile viewport.");
    }
    checks.push("390px mobile product header, page width, and prompt editor remain reachable");

    await makePromptDraftDirty(browserClient, " mobile-navigation-guard");
    await evaluate(browserClient, "document.querySelector('[data-sidebar=\"trigger\"]')?.click()", 3000);
    await waitForText(browserClient, "工作台导航", 12_000);
    const dirtyNavigationClicked = await evaluate(browserClient, `(() => {
      const link = Array.from(document.querySelectorAll('[data-workbench-view="home"]'))
        .find((item) => item instanceof HTMLElement && item.getBoundingClientRect().width > 0);
      link?.click();
      return Boolean(link);
    })()`, 3000);
    if (!dirtyNavigationClicked) throw new Error("Unable to request mobile navigation away from the dirty prompt.");
    await waitForText(browserClient, "放弃未保存的修改？", 12_000);
    const dirtyCancelClicked = await evaluate(browserClient, `(() => {
      const dialog = document.querySelector('[role="alertdialog"]');
      const button = Array.from(dialog?.querySelectorAll('button') || []).find((item) => item.textContent?.trim() === '取消');
      button?.click();
      return Boolean(button);
    })()`, 3000);
    if (!dirtyCancelClicked) throw new Error("Dirty prompt confirmation is missing its cancel action.");
    await waitForTextGone(browserClient, "放弃未保存的修改？", 12_000);
    const mobileDirtyCancelState = await evaluate(browserClient, `(() => {
      const sheet = document.querySelector('[data-sidebar="sidebar"][data-mobile="true"]');
      const rect = sheet?.getBoundingClientRect();
      return { route: location.search, drawerVisible: Boolean(sheet && rect && rect.width > 0 && rect.height > 0) };
    })()`, 3000);
    if (!mobileDirtyCancelState.route.includes("view=prompts") || !mobileDirtyCancelState.drawerVisible) {
      throw new Error(`Mobile dirty-cancel did not keep the route/drawer intact: ${JSON.stringify(mobileDirtyCancelState)}`);
    }
    checks.push("mobile dirty prompt cancellation keeps the drawer open and preserves the current route");

    return {
      ok: true,
      createdAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      reportPath: REPORT_PATH,
      frontendUrl,
      backendUrl,
      browserExecutable,
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
    await Promise.all(managedProcesses.reverse().map((managedProcess) => managedProcess.stop()));
    if (userDataDir) {
      await removeTemporaryDirectory(userDataDir);
    }
    if (backendConfigDir) {
      await removeTemporaryDirectory(backendConfigDir);
    }
  }
}

async function removeTemporaryDirectory(directory) {
  for (const delay of [0, 250, 750]) {
    if (delay) await wait(delay);
    try {
      rmSync(directory, { recursive: true, force: true });
      if (!existsSync(directory)) return;
    } catch {
      // Retry after platform file-lock races.
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
