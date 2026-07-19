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
      const backend = new ManagedProcess("backend", pythonExecutable(), ["scripts/web_app.py"], { cwd: ROOT_DIR });
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
    const browserArgs = [
      "--headless=new",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-gpu",
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

    const initialRoute = await evaluate(browserClient, "location.search", 3000);
    if (initialRoute && !initialRoute.includes("view=home")) {
      throw new Error(`Initial workbench route was not canonicalized: ${initialRoute}`);
    }
    await clickByText(browserClient, "模型配置");
    await waitForText(browserClient, "默认连接", 12_000);
    const modelRoute = await evaluate(browserClient, "location.search", 3000);
    if (!modelRoute.includes("view=model")) throw new Error(`Model navigation did not update the URL: ${modelRoute}`);
    await evaluate(browserClient, "history.back()", 3000);
    await waitForExpression(browserClient, "!location.search.includes('view=model')", "browser Back URL transition", 12_000);
    await waitForText(browserClient, "改写对照", 12_000);
    const backRoute = await evaluate(browserClient, "location.search", 3000);
    if (backRoute.includes("view=model")) throw new Error(`Back navigation did not restore the home route: ${backRoute}`);
    await evaluate(browserClient, "history.forward()", 3000);
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
    await clickByText(browserClient, "打开通知与任务中心");
    await waitForText(browserClient, "通知与任务中心", 12_000);
    const notificationCenterIsDialog = await evaluate(browserClient, "Boolean(document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]'))", 3000);
    if (!notificationCenterIsDialog) {
      throw new Error("Notification center drawer is missing dialog accessibility attributes.");
    }
    await pressKey(browserClient, "Escape");
    await waitForTextGone(browserClient, "通知与任务中心", 12_000);
    checks.push("prompt workspace renders and notification center opens/closes with Escape");

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

    const mobileSidebarOpened = await evaluate(browserClient, `(() => {
      const trigger = document.querySelector('[data-sidebar="trigger"]');
      if (!(trigger instanceof HTMLElement)) return false;
      trigger.click();
      return true;
    })()`, 3000);
    if (!mobileSidebarOpened) {
      throw new Error("Mobile sidebar trigger is unavailable.");
    }
    await waitForText(browserClient, "工作台导航", 12_000);
    const mobilePromptNavigationClicked = await evaluate(browserClient, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.trim() === '提示词');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`, 3000);
    if (!mobilePromptNavigationClicked) {
      throw new Error("Prompt navigation item is unavailable in the mobile sidebar.");
    }
    await waitForExpression(browserClient, "Boolean(document.querySelector('textarea'))", "mobile prompt editor textarea", 12_000);
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

    const mobilePromptDirty = await evaluate(browserClient, `(() => {
      const textarea = document.querySelector('textarea');
      if (!(textarea instanceof HTMLTextAreaElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea, textarea.value + ' ');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`, 3000);
    if (!mobilePromptDirty) throw new Error("Unable to create a dirty prompt draft for mobile guard testing.");
    await wait(250);
    await evaluate(browserClient, "document.querySelector('[data-sidebar=\"trigger\"]')?.click()", 3000);
    await waitForText(browserClient, "工作台导航", 12_000);
    const dirtyNavigationClicked = await evaluate(browserClient, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.trim() === '工作台');
      button?.click();
      return Boolean(button);
    })()`, 3000);
    if (!dirtyNavigationClicked) throw new Error("Unable to request mobile navigation away from the dirty prompt.");
    await waitForText(browserClient, "放弃未保存的提示词修改？", 12_000);
    const dirtyCancelClicked = await evaluate(browserClient, `(() => {
      const dialog = document.querySelector('[role="alertdialog"]');
      const button = Array.from(dialog?.querySelectorAll('button') || []).find((item) => item.textContent?.trim() === '取消');
      button?.click();
      return Boolean(button);
    })()`, 3000);
    if (!dirtyCancelClicked) throw new Error("Dirty prompt confirmation is missing its cancel action.");
    await waitForTextGone(browserClient, "放弃未保存的提示词修改？", 12_000);
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
