import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import net from "node:net";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = resolve(ROOT_DIR, "docs", "images");
const FRONTEND_URL = process.env.FYADR_SCREENSHOT_URL || "http://127.0.0.1:1420";
const TIMEOUT_MS = 30_000;

function wait(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function getFreePort() {
  return new Promise((resolvePromise, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePromise(port));
    });
  });
}

function browserCandidates() {
  const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
  return roots.flatMap((root) => [
    join(root, "Google", "Chrome", "Application", "chrome.exe"),
    join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
  ]);
}

function findBrowser() {
  const browser = browserCandidates().find((candidate) => existsSync(candidate));
  if (!browser) throw new Error("未找到 Chrome 或 Edge。");
  return browser;
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  connect() {
    return new Promise((resolvePromise, reject) => {
      this.socket = new WebSocket(this.url);
      this.socket.addEventListener("open", resolvePromise, { once: true });
      this.socket.addEventListener("error", () => reject(new Error("无法连接浏览器调试端口。")), { once: true });
      this.socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data || "{}"));
        if (!message.id || !this.pending.has(message.id)) return;
        const callback = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) callback.reject(new Error(message.error.message || JSON.stringify(message.error)));
        else callback.resolve(message.result || {});
      });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.socket?.close();
    } catch {
      // Browser shutdown is best-effort.
    }
  }
}

async function waitForHttp(url, timeoutMs = TIMEOUT_MS) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // Retry until the local app or browser is ready.
    }
    await wait(250);
  }
  throw new Error(`等待地址超时：${url}`);
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(`浏览器脚本执行失败：${JSON.stringify(result.exceptionDetails)}`);
  return result.result?.value;
}

async function waitFor(client, expression, label, timeoutMs = TIMEOUT_MS) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(client, expression)) return;
    await wait(200);
  }
  const body = await evaluate(client, "document.body?.innerText?.slice(0, 1200) || ''");
  throw new Error(`等待${label}超时。\n${body}`);
}

async function clickSelector(client, selector) {
  const point = await evaluate(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element || element.disabled) return false;
    element.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!point) throw new Error(`找不到可点击控件：${selector}`);
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await wait(250);
}

async function clickText(client, text, preferLast = false) {
  const point = await evaluate(client, `(() => {
    const needle = ${JSON.stringify(text)};
    const candidates = Array.from(document.querySelectorAll('button,a,[role="button"],[role="menuitem"],[role="tab"]'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !element.disabled && element.getAttribute('aria-disabled') !== 'true';
      });
    const exact = candidates.filter((element) => (
      element.getAttribute('aria-label') || element.innerText || element.textContent || ''
    ).replace(/\\s+/g, ' ').trim() === needle);
    const partial = candidates.filter((element) => (
      element.getAttribute('aria-label') || element.innerText || element.textContent || ''
    ).replace(/\\s+/g, ' ').trim().includes(needle));
    const list = exact.length ? exact : partial;
    const element = ${preferLast ? "list[list.length - 1]" : "list[0]"};
    if (!element) return false;
    element.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!point) {
    const visible = await evaluate(client, `Array.from(document.querySelectorAll('button,a,[role="button"],[role="menuitem"],[role="tab"]'))
      .filter((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; })
      .map((element) => (element.getAttribute('aria-label') || element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim())
      .filter(Boolean)`);
    throw new Error(`找不到可点击文字：${text}\n当前控件：${visible.join(' | ')}`);
  }
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await wait(250);
}

async function openRadixTrigger(client, selector) {
  const opened = await evaluate(client, `(() => {
    const element = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (!element || element.disabled) return false;
    element.focus();
    return true;
  })()`);
  if (!opened) throw new Error(`无法打开菜单：${selector}`);
  await client.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await wait(350);
}

async function setViewport(client, width, height) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });
  await wait(500);
}

async function capture(client, name) {
  await evaluate(client, `(() => {
    document.querySelectorAll('[data-sonner-toast]').forEach((toast) => toast.remove());
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
    return true;
  })()`);
  await wait(150);
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  writeFileSync(resolve(OUTPUT_DIR, name), Buffer.from(result.data, "base64"));
  process.stdout.write(`captured ${name}\n`);
}

async function maskModelConfiguration(client) {
  await evaluate(client, `(() => {
    const mask = '••••••••';
    const list = document.querySelector('[data-testid="model-profile-list"]');
    const entries = Array.from(list?.querySelectorAll('button') || []);
    entries.forEach((entry) => {
      const title = entry.querySelector('[data-slot="item-title"]');
      const description = entry.querySelector('[data-slot="item-description"]');
      const label = (entry.innerText || entry.textContent || '').trim();
      if (label.includes('DeepSeek 官方') || label.includes('新建连接')) return;
      if (title) title.textContent = mask;
      if (description) description.textContent = mask;
    });
    ['#profile-name', '#base-url', '#api-key'].forEach((selector) => {
      const input = document.querySelector(selector);
      if (!input) return;
      input.value = mask;
      input.placeholder = mask;
    });
    const editor = document.querySelector('[data-testid="model-profile-editor"]');
    const title = editor?.querySelector('.text-lg.font-semibold');
    if (title && !title.textContent.includes('DeepSeek')) title.textContent = mask;
    Array.from(editor?.querySelectorAll('[role="combobox"]') || []).forEach((trigger) => {
      const span = trigger.querySelector('span');
      if (span) span.textContent = mask;
    });
    return true;
  })()`);
}

async function maskPromptContent(client) {
  await evaluate(client, `(() => {
    const editor = document.querySelector('#template-content');
    if (editor) {
      editor.value = '••••••••••••••••••••';
      editor.placeholder = '••••••••';
    }
    return true;
  })()`);
}

async function scrollFirstCheckedScopeItem(client) {
  await evaluate(client, `(() => {
    const checked = document.querySelector('[role="checkbox"][data-state="checked"]');
    const item = checked?.closest('[id^="scope-unit-"]') || checked;
    item?.scrollIntoView({ block: 'center', inline: 'nearest' });
    return Boolean(item);
  })()`);
  await wait(250);
}

async function maskTaskModel(client) {
  await evaluate(client, `(() => {
    const trigger = document.querySelector('[data-testid="rewrite-model-profile"]');
    const value = trigger?.querySelector('span');
    if (value) value.textContent = '••••••••';
    return true;
  })()`);
}

async function main() {
  const recentResponse = await waitForHttp(`${FRONTEND_URL}/api/recent-documents`);
  const recent = await recentResponse.json();
  const document = (recent.items || []).find((item) => item.latestRunStatus === "completed" && item.latestRunId)
    || (recent.items || []).find((item) => item.latestRunId);
  if (!document) throw new Error("没有找到可截图的已运行文档。");

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const debugPort = await getFreePort();
  const profileDir = mkdtempSync(join(tmpdir(), "fyadr-readme-capture-"));
  const browser = spawn(findBrowser(), [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-gpu",
    "--window-size=1440,1000",
    FRONTEND_URL,
  ], { stdio: "ignore", windowsHide: true });

  let client;
  try {
    await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
    const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
    const page = pages.find((item) => item.type === "page" && String(item.url || "").startsWith(FRONTEND_URL))
      || pages.find((item) => item.type === "page");
    if (!page?.webSocketDebuggerUrl) throw new Error("没有找到浏览器页面。");

    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    const workspaceBootstrap = await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        localStorage.setItem('fyadr.themeMode', 'light');
        localStorage.setItem('fyadr.themeMode.defaultDarkMigrated', '1');
        localStorage.setItem('fyadr.workspace.v2', ${JSON.stringify(JSON.stringify({ documentId: document.id, runId: document.latestRunId }))});
      `,
    });
    await client.send("Page.navigate", { url: FRONTEND_URL });
    await waitFor(client, `document.body?.innerText?.includes(${JSON.stringify(document.name)})`, "论文工作台");
    await waitFor(client, "Boolean(document.querySelector('[data-review-detail]'))", "逐段审阅");
    if (workspaceBootstrap.identifier) {
      await client.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: workspaceBootstrap.identifier });
    }
    await setViewport(client, 1440, 1000);

    await capture(client, "home.png");
    await capture(client, "workbench.png");

    await clickSelector(client, 'button[aria-label="差异"]');
    await waitFor(client, "document.querySelector('[data-text-diff]')?.getAttribute('data-diff-mode') === 'changes'", "差异视图");
    await capture(client, "diff-review.png");
    await clickSelector(client, 'button[aria-label="对照"]');

    await clickText(client, "手动编辑");
    await waitFor(client, "Boolean(document.querySelector('textarea[id^=" + JSON.stringify("manual-") + "]'))", "手动编辑框");
    await capture(client, "manual-review.png");
    await clickText(client, "取消");

    await evaluate(client, `localStorage.setItem('fyadr.workspace.v2', ${JSON.stringify(JSON.stringify({ documentId: document.id, runId: "" }))})`);
    await client.send("Page.reload", { ignoreCache: false });
    await waitFor(client, `document.body?.innerText?.includes(${JSON.stringify(document.name)})`, "待开始的论文工作台");
    await waitFor(client, "document.querySelector('[data-testid=\"rewrite-open-task-actions\"]') === null", "待开始状态");
    await openRadixTrigger(client, 'button[aria-label="文档操作"]');
    await clickText(client, "正文范围");
    await waitFor(client, "Boolean(document.querySelector('[role=\"dialog\"]'))", "正文范围窗口");
    await scrollFirstCheckedScopeItem(client);
    await capture(client, "document-scope.png");
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", windowsVirtualKeyCode: 27 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", windowsVirtualKeyCode: 27 });
    await wait(300);

    await clickText(client, "保护区地图");
    await waitFor(client, "Boolean(document.querySelector('[data-testid=\"protection-map-workspace\"]'))", "保护区地图");
    await scrollFirstCheckedScopeItem(client);
    await capture(client, "protection-map.png");

    await clickText(client, "模型连接");
    await waitFor(client, "Boolean(document.querySelector('[data-testid=\"model-profile-editor\"]'))", "模型连接");
    await evaluate(client, `(() => {
      const list = document.querySelector('[data-testid="model-profile-list"]');
      const custom = Array.from(list?.querySelectorAll('button') || []).find((entry) => {
        const label = (entry.innerText || entry.textContent || '').trim();
        return label && !label.includes('DeepSeek 官方') && !label.includes('新建连接');
      });
      custom?.click();
      return Boolean(custom);
    })()`);
    await wait(300);
    await maskModelConfiguration(client);
    await capture(client, "model-connections.png");

    await client.send("Page.reload", { ignoreCache: false });
    await waitFor(client, `document.body?.innerText?.includes(${JSON.stringify(document.name)})`, "模型页截图后刷新");
    await clickText(client, "模型连接");
    await waitFor(client, "Boolean(document.querySelector('[data-testid=\"model-profile-editor\"]'))", "模型连接刷新");
    await clickText(client, "DeepSeek 官方");
    await wait(300);
    await maskModelConfiguration(client);
    await capture(client, "model-deepseek.png");

    await client.send("Page.reload", { ignoreCache: false });
    await waitFor(client, `document.body?.innerText?.includes(${JSON.stringify(document.name)})`, "官方模型页截图后刷新");
    await clickText(client, "提示词");
    await waitFor(client, "Boolean(document.querySelector('#template-content'))", "提示词编辑器");
    await maskPromptContent(client);
    await capture(client, "prompt-template.png");

    await clickText(client, "最近文档");
    await waitFor(client, `document.body?.innerText?.includes(${JSON.stringify(document.name)})`, "最近文档");
    await capture(client, "recent-documents.png");

    await evaluate(client, `localStorage.setItem('fyadr.workspace.v2', ${JSON.stringify(JSON.stringify({ documentId: document.id, runId: document.latestRunId }))})`);
    await client.send("Page.reload", { ignoreCache: false });
    await waitFor(client, `document.body?.innerText?.includes(${JSON.stringify(document.name)})`, "已完成的论文工作台");
    await waitFor(client, "Boolean(document.querySelector('[data-review-detail]'))", "已完成任务");
    await clickSelector(client, '[data-testid="rewrite-open-task-actions"]');
    await waitFor(client, "Boolean(document.querySelector('[data-testid=\"rewrite-task-sheet\"]'))", "继续与导出");
    await maskTaskModel(client);
    await capture(client, "completed-actions.png");
    await capture(client, "continue-rewrite.png");

    await client.send("Page.reload", { ignoreCache: false });
    await waitFor(client, "Boolean(document.querySelector('[data-review-detail]'))", "继续设置截图后刷新");
    await clickSelector(client, '[data-testid="rewrite-open-task-actions"]');
    await waitFor(client, "Boolean(document.querySelector('[data-testid=\"rewrite-task-sheet\"]'))", "处理设置面板");
    await clickText(client, "处理");
    await waitFor(client, "Boolean(document.querySelector('[data-testid=\"rewrite-concurrency\"]'))", "处理设置");
    await capture(client, "rewrite-settings.png");

    await clickText(client, "下载 Word");
    await waitFor(client, "Array.from(document.querySelectorAll('[role=\"dialog\"]')).some((item) => item.innerText.includes('导出前确认'))", "导出提醒");
    await capture(client, "export-warning.png");
    await clickText(client, "返回审阅");
    await waitFor(client, "Boolean(document.querySelector('[data-testid=\"review-filter-warnings\"][data-state=\"on\"]'))", "提醒筛选");
    await capture(client, "warning-review.png");

    await setViewport(client, 1024, 900);
    await capture(client, "responsive-tablet.png");
    await setViewport(client, 390, 844);
    await capture(client, "responsive-mobile.png");

    await clickText(client, "Toggle Sidebar");
    await clickText(client, "模型连接");
    await waitFor(client, "Boolean(document.querySelector('[data-testid=\"model-profile-editor\"]'))", "移动端模型连接");
    await maskModelConfiguration(client);
    await capture(client, "model-mobile.png");

    process.stdout.write(`source document: ${document.name}\n`);
  } finally {
    client?.close();
    browser.kill();
    await wait(300);
    rmSync(profileDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
