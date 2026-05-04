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
const BACKEND_URL = process.env.FYADR_E2E_BACKEND_URL || "http://127.0.0.1:8765";
const DEFAULT_TIMEOUT_MS = 90_000;

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
  let point = null;
  while (Date.now() - started < timeoutMs) {
    point = await findClickablePointByText(client, text);
    if (point) break;
    await wait(250);
  }
  if (!point) {
    const body = await evaluate(client, "document.body?.innerText?.slice(0, 1200) ?? ''", 3000);
    throw new Error(`Unable to find enabled clickable text: ${text}\nCurrent page text:\n${body}`);
  }
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await wait(150);
  return point;
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
  let backendStartedBySmoke = false;
  const browserExecutable = findBrowserExecutable();
  const frontendPort = Number(process.env.FYADR_E2E_FRONTEND_PORT || await getFreePort());
  const debugPort = Number(process.env.FYADR_E2E_DEBUG_PORT || await getFreePort());
  const frontendUrl = process.env.FYADR_E2E_URL || `http://127.0.0.1:${frontendPort}`;
  const backendHealthUrl = `${BACKEND_URL}/api/ping`;

  try {
    if (!(await requestOk(backendHealthUrl, 2000))) {
      const backend = new ManagedProcess("backend", process.env.PYTHON || "python", ["scripts/web_app.py"], { cwd: ROOT_DIR });
      managedProcesses.push(backend);
      await waitForHttp(backendHealthUrl, DEFAULT_TIMEOUT_MS, "backend", backend);
      backendStartedBySmoke = true;
      checks.push("backend started or became reachable");
    } else {
      checks.push("backend already reachable");
    }

    const npmDev = npmInvocation(["run", "dev", "--", "--host", "127.0.0.1", "--port", String(frontendPort), "--strictPort"]);
    const frontend = new ManagedProcess("vite", npmDev.command, npmDev.args, { cwd: APP_DIR });
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
    await browserClient.send("Page.navigate", { url: frontendUrl });
    await waitForText(browserClient, "当前文件", DEFAULT_TIMEOUT_MS);
    await waitForText(browserClient, "文档入口", DEFAULT_TIMEOUT_MS);
    await waitForText(browserClient, "上传文档", DEFAULT_TIMEOUT_MS);
    checks.push("home page renders with global task dashboard and card controls");

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
        await waitForText(browserClient, "已取消选择文档", 12_000);
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

    await clickByText(browserClient, "学校规范");
    await waitForText(browserClient, "学校排版规范", 12_000);
    await clickByText(browserClient, "历史记录");
    await waitForText(browserClient, "继续处理与导出", 12_000);
    await clickByText(browserClient, "启动诊断");
    await waitForText(browserClient, "重新自检", 12_000);
    await clickByText(browserClient, "提示词预览");
    await waitForExpression(browserClient, "Boolean(document.querySelector('pre code'))", "prompt preview code block", 12_000);
    const promptPageUsesFixedBoundary = await evaluate(browserClient, "Boolean(document.querySelector('pre code') && getComputedStyle(document.documentElement).overflow === 'hidden' && getComputedStyle(document.body).overflow === 'hidden')", 3000);
    if (!promptPageUsesFixedBoundary) {
      throw new Error("Prompt preview page did not render inside the fixed page boundary.");
    }
    checks.push("primary sidebar navigation remains responsive");

    await clickByText(browserClient, "工作台");
    await waitForText(browserClient, "改写对照", 12_000);
    await clickByText(browserClient, "打开通知与任务中心");
    await waitForText(browserClient, "通知与任务中心", 12_000);
    const notificationCenterIsDialog = await evaluate(browserClient, "Boolean(document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]'))", 3000);
    if (!notificationCenterIsDialog) {
      throw new Error("Notification center drawer is missing dialog accessibility attributes.");
    }
    await pressKey(browserClient, "Escape");
    await waitForTextGone(browserClient, "通知与任务中心", 12_000);
    checks.push("prompt preview renders and notification center opens/closes with Escape");

    return {
      ok: true,
      createdAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      reportPath: REPORT_PATH,
      frontendUrl,
      backendUrl: BACKEND_URL,
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
      backendUrl: BACKEND_URL,
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
