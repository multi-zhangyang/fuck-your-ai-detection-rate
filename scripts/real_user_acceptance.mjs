import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND_URL = process.env.FYADR_REAL_FRONTEND_URL || "http://127.0.0.1:1421";
const DEBUG_PORT = Number(process.env.FYADR_REAL_DEBUG_PORT || 19333);
const PHASE = process.env.FYADR_REAL_PHASE || "configure";
const API_KEY = process.env.FYADR_REAL_API_KEY || "";
const BASE_URL = process.env.FYADR_REAL_BASE_URL || "";
const MODEL = process.env.FYADR_REAL_MODEL || "";
const ALLOW_CONFIG_MUTATION = process.env.FYADR_REAL_ALLOW_CONFIG_MUTATION === "1";
const SOURCE_DOCX = process.env.FYADR_REAL_SOURCE_DOCX || "";
const SOURCE_TXT = process.env.FYADR_REAL_SOURCE_TXT || "";
const SELECT_COUNT = Math.max(1, Number(process.env.FYADR_REAL_SELECT_COUNT || 8));
const MIN_SUGGESTED_ORDER = Math.max(0, Number(process.env.FYADR_REAL_MIN_SUGGESTED_ORDER || 0));
const CONCURRENCY = Math.min(16, Math.max(1, Number(process.env.FYADR_REAL_CONCURRENCY || 2)));
const REQUIRE_NUMERIC_SELECTION = process.env.FYADR_REAL_REQUIRE_NUMERIC_SELECTION === "1";
const PROTECTED_TERMS = process.env.FYADR_REAL_PROTECTED_TERMS || "MMC-MTDC，PSCAD";
const REAL_TEMPLATE_NAME = process.env.FYADR_REAL_TEMPLATE_NAME || "真实验收二次润色";
const REAL_PLAN_NAME = process.env.FYADR_REAL_PLAN_NAME || "真实两步改写验收";
const STOP_AND_RESUME = process.env.FYADR_REAL_STOP_AND_RESUME === "1";
const MANUAL_NUMBER_EDIT = process.env.FYADR_REAL_MANUAL_NUMBER_EDIT === "1";
const CURRENT_DOCUMENT_ID = process.env.FYADR_REAL_DOCUMENT_ID || "";
const CURRENT_RUN_ID = process.env.FYADR_REAL_RUN_ID || "";
const KEEP_ORIGINAL_PARAGRAPH_ID = process.env.FYADR_REAL_KEEP_ORIGINAL_PARAGRAPH_ID || "";
const SECOND_PROMPT_CONTENT = [
  "请在不改变事实、数字、引用、URL、专有名词和技术含义的前提下，对下列文字做第二次自然化润色。",
  "保留原有信息，不添加解释、标题或评价，只输出完整的润色结果。",
  "",
  "{{text}}",
].join("\n");
const VALIDATION_DIR = resolve(
  process.env.FYADR_REAL_OUTPUT_DIR
    || resolve(ROOT_DIR, "finish", "regression", "real-user"),
);
const SCREENSHOT_DIR = resolve(VALIDATION_DIR, "screenshots");
const DOWNLOAD_DIR = resolve(VALIDATION_DIR, "downloads");
const REPORT_PATH = resolve(VALIDATION_DIR, `browser-${PHASE}.json`);
const STREAM_TRACE_PATH = resolve(VALIDATION_DIR, `browser-${PHASE}-stream-trace.json`);

mkdirSync(SCREENSHOT_DIR, { recursive: true });
mkdirSync(DOWNLOAD_DIR, { recursive: true });

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

function redact(value) {
  const text = String(value ?? "");
  return API_KEY ? text.split(API_KEY).join("[redacted]") : text;
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.callbacks = new Map();
    this.handlers = new Map();
  }

  connect() {
    return new Promise((resolveConnect, rejectConnect) => {
      this.socket = new WebSocket(this.webSocketUrl);
      this.socket.addEventListener("open", resolveConnect, { once: true });
      this.socket.addEventListener("error", rejectConnect, { once: true });
      this.socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data || "{}"));
        if (message.id && this.callbacks.has(message.id)) {
          const callback = this.callbacks.get(message.id);
          this.callbacks.delete(message.id);
          if (message.error) callback.reject(new Error(message.error.message || JSON.stringify(message.error)));
          else callback.resolve(message.result || {});
          return;
        }
        for (const handler of this.handlers.get(message.method) || []) {
          handler(message.params || {});
        }
      });
    });
  }

  send(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`Browser connection is not open for ${method}.`));
    }
    const id = this.nextId++;
    return new Promise((resolveSend, rejectSend) => {
      this.callbacks.set(id, { resolve: resolveSend, reject: rejectSend });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.socket?.close();
    } catch {
      // The browser is intentionally kept alive between real-user phases.
    }
  }
}

async function getPageTarget() {
  const targets = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then((response) => response.json());
  const page = targets.find((item) => item.type === "page" && String(item.url || "").startsWith(FRONTEND_URL))
    || targets.find((item) => item.type === "page");
  if (!page?.webSocketDebuggerUrl) throw new Error("没有找到 FYADR 浏览器页面。 ");
  return page;
}

async function evaluate(client, expression, timeoutMs = 8_000) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: timeoutMs,
  });
  if (result.exceptionDetails) {
    throw new Error(`Browser evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result?.value;
}

async function bodyText(client) {
  return evaluate(client, "document.body?.innerText?.slice(0, 5000) || ''", 4_000);
}

async function waitForExpression(client, expression, label, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(client, expression, 4_000)) return Date.now() - started;
    await wait(250);
  }
  throw new Error(`等待${label}超时。当前页面：\n${await bodyText(client)}`);
}

async function waitForText(client, text, timeoutMs = 20_000) {
  return waitForExpression(
    client,
    `document.body?.innerText?.includes(${JSON.stringify(text)}) || false`,
    `“${text}”`,
    timeoutMs,
  );
}

async function waitForAnyText(client, texts, timeoutMs = 20_000) {
  const expression = `(() => {
    const text = document.body?.innerText || '';
    return ${JSON.stringify(texts)}.find((item) => text.includes(item)) || '';
  })()`;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await evaluate(client, expression, 4_000);
    if (found) return { text: found, elapsedMs: Date.now() - started };
    await wait(250);
  }
  throw new Error(`等待 ${texts.join(" / ")} 超时。当前页面：\n${await bodyText(client)}`);
}

async function clickTarget(client, expression, label, timeoutMs = 20_000) {
  await waitForExpression(client, expression, label, timeoutMs);
  await wait(80);
  const point = await evaluate(client, expression, 4_000);
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`无法定位真实点击位置：${label}`);
  }
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await wait(180);
}

async function clickByText(client, text, { preferLast = false, timeoutMs = 20_000 } = {}) {
  const expression = `(() => {
    const needle = ${JSON.stringify(text)};
    const preferLast = ${JSON.stringify(preferLast)};
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const label = (element) => (
      element.getAttribute('aria-label') || element.innerText || element.value
      || element.getAttribute('title') || element.textContent || ''
    ).replace(/\\s+/g, ' ').trim();
    const candidates = Array.from(document.querySelectorAll('button,a,[role="button"],[role="tab"],[role="option"],summary,label'))
      .filter((element) => visible(element) && !element.disabled && element.getAttribute('aria-disabled') !== 'true');
    const exact = candidates.filter((element) => label(element) === needle);
    const partial = candidates.filter((element) => label(element).includes(needle));
    const list = exact.length ? exact : partial;
    const element = preferLast ? list[list.length - 1] : list[0];
    if (!element) return false;
    element.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`;
  await clickTarget(client, expression, `可点击控件“${text}”`, timeoutMs);
}

async function setControlValue(client, selector, value) {
  await clickSelector(client, selector);
  await client.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
  await client.send("Input.insertText", { text: value });
  await wait(120);
}

async function setSliderValue(client, selector, value) {
  const limits = await evaluate(client, `(() => {
    const slider = document.querySelector(${JSON.stringify(selector)});
    if (!slider || slider.getAttribute('role') !== 'slider') return null;
    slider.focus();
    return {
      min: Number(slider.getAttribute('aria-valuemin')),
      max: Number(slider.getAttribute('aria-valuemax')),
    };
  })()`);
  if (!limits || value < limits.min || value > limits.max) {
    throw new Error(`并发滑块无法设置为 ${value}：${JSON.stringify(limits)}`);
  }
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Home", code: "Home", windowsVirtualKeyCode: 36, nativeVirtualKeyCode: 36 });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Home", code: "Home", windowsVirtualKeyCode: 36, nativeVirtualKeyCode: 36 });
  for (let current = limits.min; current < value; current += 1) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
  }
  await waitForExpression(
    client,
    `document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-valuenow') === ${JSON.stringify(String(value))}`,
    `并发滑块变为 ${value}`,
    5_000,
  );
}

async function clickSelector(client, selector) {
  const expression = `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element || element.disabled) return false;
    element.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`;
  await clickTarget(client, expression, `可点击控件 ${selector}`);
}

async function setCheckbox(client, selector, checked) {
  const state = await evaluate(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    return element.getAttribute('data-state') === 'checked' || element.checked === true;
  })()`);
  if (state === null) throw new Error(`没有找到复选框 ${selector}`);
  if (state !== checked) await clickSelector(client, selector);
}

async function chooseVisibleComboboxOption(client, index, optionText) {
  const expression = `(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const controls = Array.from(document.querySelectorAll('button[role="combobox"]')).filter(visible);
    const element = controls[${Number(index)}];
    if (!element || element.disabled) return false;
    element.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`;
  await clickTarget(client, expression, `第 ${index + 1} 个提示词选择框`);
  await clickByText(client, optionText, { preferLast: true });
}

async function removeAllPlanSteps(client) {
  while (await evaluate(client, `(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    return Array.from(document.querySelectorAll('button[aria-label="移除步骤"]')).filter(visible).length;
  })()`)) {
    const expression = `(() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const buttons = Array.from(document.querySelectorAll('button[aria-label="移除步骤"]')).filter(visible);
      const element = buttons[buttons.length - 1];
      if (!element || element.disabled) return false;
      element.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`;
    await clickTarget(client, expression, "移除已有提示词步骤");
  }
}

async function uploadFile(client, filePath) {
  if (!existsSync(filePath)) throw new Error(`测试文件不存在：${filePath}`);
  await client.send("DOM.enable");
  const documentNode = await client.send("DOM.getDocument", { depth: 2, pierce: true });
  const input = await client.send("DOM.querySelector", {
    nodeId: documentNode.root.nodeId,
    selector: 'input[type="file"]',
  });
  if (!input.nodeId) throw new Error("页面没有文件选择控件。 ");
  await client.send("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [resolve(filePath)] });
}

async function screenshot(client, name) {
  const path = resolve(SCREENSHOT_DIR, `${PHASE}-${name}.png`);
  const result = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(path, Buffer.from(result.data, "base64"));
  return path;
}

async function setViewport(client, width, height, mobile = false) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
  await wait(250);
}

async function auditUi(client, label) {
  return evaluate(client, `(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const nameOf = (element) => (
      element.getAttribute('aria-label')
      || (element.labels && Array.from(element.labels).map((item) => item.innerText).join(' '))
      || element.innerText || element.getAttribute('title') || element.textContent || ''
    ).replace(/\\s+/g, ' ').trim();
    const interactives = Array.from(document.querySelectorAll('button,a[href],input,textarea,select,[role="button"],[role="tab"],[role="checkbox"],[role="combobox"]'))
      .filter(visible);
    const missingNames = interactives.filter((element) => !nameOf(element)).map((element) => element.outerHTML.slice(0, 180));
    const tinyTargets = interactives.filter((element) => {
      const rect = element.getBoundingClientRect();
      return !element.disabled && (rect.width < 28 || rect.height < 28);
    }).map((element) => ({ name: nameOf(element).slice(0, 80), width: Math.round(element.getBoundingClientRect().width), height: Math.round(element.getBoundingClientRect().height) }));
    const ids = Array.from(document.querySelectorAll('[id]')).map((element) => element.id).filter(Boolean);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const outsideViewport = Array.from(document.querySelectorAll('main button, main input, main textarea, main [role="combobox"]'))
      .filter(visible)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > innerWidth + 1;
      })
      .map((element) => nameOf(element).slice(0, 80));
    const main = document.querySelector('[data-testid="rewrite-main-panel"]')?.getBoundingClientRect();
    const task = document.querySelector('[data-testid="rewrite-task-panel"]')?.getBoundingClientRect();
    return {
      label: ${JSON.stringify(label)},
      viewport: { width: innerWidth, height: innerHeight },
      page: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      missingNames,
      tinyTargets,
      duplicateIds,
      outsideViewport,
      rewriteLayout: main && task ? {
        mainWidth: Math.round(main.width),
        taskWidth: Math.round(task.width),
        taskAtRight: task.left >= main.right - 1,
        overlaps: !(main.right <= task.left || task.right <= main.left || main.bottom <= task.top || task.bottom <= main.top),
      } : null,
    };
  })()`);
}

async function auditScopeDialog(client, label) {
  return evaluate(client, `(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return { label: ${JSON.stringify(label)}, missing: true };
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0
        && rect.left < innerWidth && rect.top < innerHeight
        && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const receivesPointer = (element) => {
      const itemRect = element.getBoundingClientRect();
      const x = Math.max(0, Math.min(innerWidth - 1, itemRect.left + itemRect.width / 2));
      const y = Math.max(0, Math.min(innerHeight - 1, itemRect.top + itemRect.height / 2));
      const hit = document.elementFromPoint(x, y);
      return Boolean(hit && (hit === element || element.contains(hit) || hit.contains(element)));
    };
    const nameOf = (element) => (
      element.getAttribute('aria-label')
      || (element.labels && Array.from(element.labels).map((item) => item.innerText).join(' '))
      || element.innerText || element.getAttribute('title') || element.textContent || ''
    ).replace(/\\s+/g, ' ').trim();
    const rect = dialog.getBoundingClientRect();
    const interactives = Array.from(dialog.querySelectorAll('button,input,[role="tab"],[role="checkbox"]')).filter(visible);
    const ids = Array.from(dialog.querySelectorAll('[id]')).map((item) => item.id).filter(Boolean);
    const panel = dialog.querySelector('[role="tabpanel"]');
    const scrollViewport = Array.from(dialog.querySelectorAll('div')).find((item) => {
      const style = getComputedStyle(item);
      return style.overflowY === 'scroll' && item.closest('[role="tabpanel"]');
    });
    const confirm = Array.from(dialog.querySelectorAll('button')).find((item) => (item.innerText || '').includes('确认正文范围') || (item.innerText || '').includes('保存范围调整'));
    const confirmRect = confirm?.getBoundingClientRect();
    const footerRect = confirm?.parentElement?.getBoundingClientRect();
    const scrollRect = scrollViewport?.getBoundingClientRect();
    return {
      label: ${JSON.stringify(label)},
      viewport: { width: innerWidth, height: innerHeight },
      rect: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height), right: Math.round(rect.right), bottom: Math.round(rect.bottom) },
      withinViewport: rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1,
      horizontalOverflow: dialog.scrollWidth > dialog.clientWidth + 1,
      activeTab: dialog.querySelector('[role="tab"][aria-selected="true"]')?.innerText?.replace(/\\s+/g, ' ').trim() || '',
      visibleRows: panel?.querySelectorAll('[data-slot="field"] [role="checkbox"]').length || 0,
      missingNames: interactives.filter((item) => !nameOf(item)).map((item) => item.outerHTML.slice(0, 160)),
      duplicateIds: [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))],
      outsideDialog: interactives.filter(receivesPointer).filter((item) => {
        const itemRect = item.getBoundingClientRect();
        return itemRect.left < rect.left - 1 || itemRect.right > rect.right + 1 || itemRect.top < rect.top - 1 || itemRect.bottom > rect.bottom + 1;
      }).map((item) => nameOf(item).slice(0, 80)),
      confirmVisible: Boolean(confirmRect && confirmRect.top >= 0 && confirmRect.bottom <= innerHeight),
      scrollOverlapsFooter: Boolean(scrollRect && footerRect && scrollRect.bottom > footerRect.top + 1),
      scrollArea: scrollViewport ? { clientHeight: scrollViewport.clientHeight, scrollHeight: scrollViewport.scrollHeight, canScroll: scrollViewport.scrollHeight > scrollViewport.clientHeight } : null,
    };
  })()`);
}

async function configureModel(client) {
  if (!API_KEY) throw new Error("configure 阶段缺少 FYADR_REAL_API_KEY。 ");
  await setViewport(client, 1440, 1000, false);
  await client.send("Page.navigate", { url: `${FRONTEND_URL}/` });
  await waitForText(client, "开始改写", 30_000);
  await clickByText(client, "模型连接");
  await waitForExpression(client, "Boolean(document.querySelector('#base-url'))", "模型连接向导");
  await clickByText(client, "新建连接");
  await waitForExpression(client, "Boolean(document.querySelector('#profile-name'))", "新建模型连接");

  await setControlValue(client, "#profile-name", "Cardinalize");
  await setControlValue(client, "#base-url", BASE_URL);
  await setControlValue(client, "#api-key", API_KEY);
  await clickSelector(client, "#make-default");

  const modelsStarted = Date.now();
  await clickSelector(client, 'button[aria-label="获取模型"]');
  const modelsOutcome = await waitForAnyText(client, ["模型已更新", "未返回模型", "模型读取失败"], 90_000);
  const modelsElapsedMs = Date.now() - modelsStarted;
  const modelIsSelect = await evaluate(client, "document.querySelector('#profile-model')?.getAttribute('role') === 'combobox'");
  if (modelIsSelect) {
    await clickSelector(client, "#profile-model");
    const targetAvailable = await evaluate(client, `Array.from(document.querySelectorAll('[role="option"]')).some((item) => (item.innerText || '').trim() === ${JSON.stringify(MODEL)})`);
    if (targetAvailable) {
      await clickByText(client, MODEL, { preferLast: true });
    } else {
      await clickByText(client, "手动输入", { preferLast: true });
    }
  }
  const manualModelInput = await evaluate(client, "document.querySelector('#profile-model')?.tagName === 'INPUT'");
  if (manualModelInput) await setControlValue(client, "input#profile-model", MODEL);

  const testStarted = Date.now();
  await clickByText(client, "验证连接");
  const testOutcome = await waitForAnyText(client, ["连接正常", "连接失败"], 360_000);
  const testElapsedMs = Date.now() - testStarted;
  const modelScreenshot = await screenshot(client, "model-connected");
  if (testOutcome.text !== "连接正常") {
    throw new Error(`模型连接测试失败。当前页面：\n${await bodyText(client)}`);
  }
  await clickByText(client, "保存", { preferLast: true });
  await waitForText(client, "连接已保存", 30_000);

  const desktopAudit = await auditUi(client, "model-desktop");
  await setViewport(client, 1024, 768, false);
  const tabletAudit = await auditUi(client, "model-tablet");
  const tabletScreenshot = await screenshot(client, "model-tablet");
  await setViewport(client, 390, 844, true);
  const mobileAudit = await auditUi(client, "model-mobile");
  const mobileScreenshot = await screenshot(client, "model-mobile");
  await setViewport(client, 1440, 1000, false);

  return {
    phase: "configure",
    modelsOutcome: modelsOutcome.text,
    modelsElapsedMs,
    testOutcome: testOutcome.text,
    testElapsedMs,
    screenshots: [modelScreenshot, tabletScreenshot, mobileScreenshot],
    uiAudits: [desktopAudit, tabletAudit, mobileAudit],
  };
}

async function configurePromptPlan(client) {
  await setViewport(client, 1440, 1000, false);
  await client.send("Page.navigate", { url: `${FRONTEND_URL}/` });
  await waitForText(client, "任务控制台", 30_000);
  await clickByText(client, "提示词方案");
  await waitForExpression(client, "Boolean(document.querySelector('[data-testid=\"prompt-workspace\"]'))", "提示词配置页");

  await clickByText(client, "提示词");
  const templateList = await evaluate(client, `(() => {
    const workspace = document.querySelector('[data-testid="prompt-workspace"]');
    const buttons = Array.from(workspace?.querySelectorAll('button') || []);
    return buttons.map((button) => (button.innerText || '').split(/\\r?\\n/).map((item) => item.trim()).filter(Boolean))
      .filter((lines) => lines.includes('内置') || lines.includes('自定义'));
  })()`);
  const builtInTemplateName = templateList.find((lines) => lines.includes("内置"))?.[0] || "";
  if (!builtInTemplateName) throw new Error(`页面中没有可用的内置提示词：${JSON.stringify(templateList)}`);

  const existingTemplate = templateList.some((lines) => lines[0] === REAL_TEMPLATE_NAME);
  if (existingTemplate) await clickByText(client, REAL_TEMPLATE_NAME);
  else await clickByText(client, "新建");
  await waitForExpression(client, "Boolean(document.querySelector('#template-name'))", "提示词编辑表单");
  const templateReadOnly = await evaluate(client, "Boolean(document.querySelector('#template-name')?.disabled)");
  if (templateReadOnly) throw new Error("真实验收提示词意外变成只读，无法通过界面更新。 ");
  await setControlValue(client, "#template-name", REAL_TEMPLATE_NAME);
  await setControlValue(client, "#template-description", "真实文档两步流式验收使用");
  await setControlValue(client, "#template-content", SECOND_PROMPT_CONTENT);
  await clickByText(client, "保存", { preferLast: true });
  await waitForText(client, "提示词已保存", 30_000);

  await clickByText(client, "改写方案");
  await waitForExpression(client, "Boolean(document.querySelector('#plan-name'))", "改写方案编辑表单");
  const planList = await evaluate(client, `(() => {
    const workspace = document.querySelector('[data-testid="prompt-workspace"]');
    return Array.from(workspace?.querySelectorAll('button') || [])
      .map((button) => (button.innerText || '').split(/\\r?\\n/).map((item) => item.trim()).filter(Boolean))
      .filter((lines) => lines.some((line) => line.includes('步')));
  })()`);
  const existingPlan = planList.some((lines) => lines[0] === REAL_PLAN_NAME);
  if (existingPlan) await clickByText(client, REAL_PLAN_NAME);
  else await clickByText(client, "新建");
  await waitForExpression(client, "Boolean(document.querySelector('#plan-name'))", "方案名称输入框");
  const planReadOnly = await evaluate(client, "Boolean(document.querySelector('#plan-name')?.disabled)");
  if (planReadOnly) throw new Error("真实验收方案意外变成只读，无法通过界面更新。 ");
  await setControlValue(client, "#plan-name", REAL_PLAN_NAME);
  await setControlValue(client, "#plan-description", "内置改写后再做一次自然化润色");
  await removeAllPlanSteps(client);
  await clickByText(client, "添加第一个步骤");
  await chooseVisibleComboboxOption(client, 0, builtInTemplateName);
  await clickByText(client, "增加步骤");
  await chooseVisibleComboboxOption(client, 1, REAL_TEMPLATE_NAME);
  await setCheckbox(client, "#default-plan", true);
  await clickByText(client, "保存", { preferLast: true });
  await waitForText(client, "提示词方案已保存", 30_000);

  const saved = await evaluate(client, `(() => {
    const workspace = document.querySelector('[data-testid="prompt-workspace"]');
    const selected = Array.from(workspace?.querySelectorAll('button') || [])
      .find((button) => (button.innerText || '').includes(${JSON.stringify(REAL_PLAN_NAME)}));
    const selects = Array.from(document.querySelectorAll('button[role="combobox"]'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    return {
      selectedPlanText: (selected?.innerText || '').replace(/\\s+/g, ' ').trim(),
      stepLabels: selects.map((item) => (item.innerText || '').replace(/\\s+/g, ' ').trim()),
      isDefault: document.querySelector('#default-plan')?.getAttribute('data-state') === 'checked',
    };
  })()`);
  if (saved.stepLabels.length !== 2 || saved.stepLabels[0] !== builtInTemplateName || saved.stepLabels[1] !== REAL_TEMPLATE_NAME || !saved.isDefault) {
    throw new Error(`两步方案没有按界面设置成功：${JSON.stringify(saved)}`);
  }

  const desktopScreenshot = await screenshot(client, "prompt-plan-desktop");
  const desktopAudit = await auditUi(client, "prompt-plan-desktop");
  await setViewport(client, 1024, 768, false);
  const tabletAudit = await auditUi(client, "prompt-plan-tablet");
  const tabletScreenshot = await screenshot(client, "prompt-plan-tablet");
  await setViewport(client, 390, 844, true);
  const mobileAudit = await auditUi(client, "prompt-plan-mobile");
  const mobileScreenshot = await screenshot(client, "prompt-plan-mobile");
  await setViewport(client, 1440, 1000, false);

  return {
    phase: "configure_prompts",
    templateName: REAL_TEMPLATE_NAME,
    planName: REAL_PLAN_NAME,
    builtInTemplateName,
    saved,
    screenshots: [desktopScreenshot, tabletScreenshot, mobileScreenshot],
    uiAudits: [desktopAudit, tabletAudit, mobileAudit],
  };
}

async function clickScopeTab(client, prefix) {
  const expression = `(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const tab = Array.from(dialog?.querySelectorAll('[role="tab"]') || [])
      .find((item) => (item.innerText || '').replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(prefix)}));
    if (!tab || tab.disabled) return false;
    tab.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = tab.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`;
  await clickTarget(client, expression, `范围分组“${prefix}”`);
}

async function chooseScopeParagraphs(client, count) {
  await clickByText(client, "清空");
  await clickScopeTab(client, "建议");
  await wait(250);
  const candidates = await evaluate(client, `(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return { error: 'scope dialog missing' };
    const panel = dialog.querySelector('[role="tabpanel"]');
    const checkboxes = Array.from(panel?.querySelectorAll('[role="checkbox"]') || [])
      .filter((item) => !item.disabled && item.getAttribute('aria-disabled') !== 'true');
    const allChoices = checkboxes.map((checkbox) => {
      const container = checkbox.closest('[data-slot="field"]');
      const body = container?.querySelector('[data-slot="field-description"]')?.innerText || '';
      return {
        id: checkbox.id,
        text: (container?.innerText || '').replace(/\\s+/g, ' ').trim(),
        hasNumber: /\\d/.test(body),
      };
    }).filter((item) => item.id && item.text.length >= 55);
    let choices = allChoices.slice(0, ${Number(count)});
    if (${JSON.stringify(REQUIRE_NUMERIC_SELECTION)}) {
      const numeric = allChoices.find((item) => item.hasNumber);
      if (numeric) choices = [numeric, ...allChoices.filter((item) => item.id !== numeric.id)].slice(0, ${Number(count)});
    }
    return {
      available: checkboxes.length,
      candidateCount: allChoices.length,
      choices,
    };
  })()`);
  if (candidates.error || candidates.choices?.length !== count) {
    throw new Error(`正文范围选择失败：${JSON.stringify(candidates)}`);
  }
  if (REQUIRE_NUMERIC_SELECTION && !candidates.choices.some((item) => item.hasNumber)) {
    throw new Error(`建议正文中没有选到含数字段落：${JSON.stringify(candidates)}`);
  }
  for (const choice of candidates.choices) {
    await clickSelector(client, `#${choice.id}`);
  }
  await wait(350);
  return {
    available: candidates.available,
    candidateCount: candidates.candidateCount,
    chosen: candidates.choices.length,
    paragraphIds: candidates.choices.map((item) => item.id.replace(/^paragraph-/, "")),
    numericParagraphId: candidates.choices.find((item) => item.hasNumber)?.id.replace(/^paragraph-/, "") || "",
    previews: candidates.choices.map((item) => item.text.slice(0, 90)),
  };
}

async function observeRunUntilComplete(client, runStarted, timeoutMs = 1_800_000) {
  const started = Date.now();
  const latestRevision = new Map();
  const stepSequences = new Map();
  const timeline = [];
  let firstVisibleDeltaMs = null;
  let firstStreamScreenshot = "";
  let secondStepScreenshot = "";
  let maxVisibleGenerating = 0;
  let maxReportedConcurrentParagraphs = 0;

  while (Date.now() - started < timeoutMs) {
    const snapshot = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="rewrite-task-panel"]');
      const review = document.querySelector('[aria-labelledby="rewrite-review-title"]');
      const cards = Array.from(document.querySelectorAll('[data-live-part]')).map((card) => {
        const status = card.querySelector('[data-live-status]')?.innerText || '';
        const text = card.querySelector('[data-live-text]')?.innerText || '';
        return {
          id: card.getAttribute('data-live-part') || '',
          revision: Number(card.getAttribute('data-live-revision') || 0),
          stepIndex: Number(card.getAttribute('data-live-step') || 0),
          stepLabel: card.querySelector('[data-live-step-label]')?.innerText || '',
          status,
          text,
        };
      });
      const activity = document.querySelector('[data-run-activity]')?.innerText || '';
      const concurrentMatch = activity.match(/正在处理\\s*(\\d+)\\s*段正文/);
      const resumable = Array.from(document.querySelectorAll('button')).some((item) =>
        !item.disabled && (item.innerText || '').replace(/\\s+/g, ' ').trim() === '继续未完成内容'
      );
      return {
        completed: (panel?.innerText || '').includes('改写完成'),
        resumable,
        reviewText: (review?.innerText || '').slice(0, 500),
        concurrentParagraphs: concurrentMatch ? Number(concurrentMatch[1]) : 0,
        cards,
      };
    })()`);
    maxReportedConcurrentParagraphs = Math.max(maxReportedConcurrentParagraphs, snapshot.concurrentParagraphs || 0);
    maxVisibleGenerating = Math.max(
      maxVisibleGenerating,
      snapshot.cards.filter((item) => item.status.includes("生成中")).length,
    );
    let traceChanged = false;
    for (const card of snapshot.cards) {
      if (!card.text.trim() || card.revision <= 0) continue;
      if (firstVisibleDeltaMs === null) {
        firstVisibleDeltaMs = Date.now() - runStarted;
        firstStreamScreenshot = await screenshot(client, "first-stream");
      }
      if (card.stepIndex === 1 && !secondStepScreenshot) {
        secondStepScreenshot = await screenshot(client, "second-step-stream");
      }
      const sequence = stepSequences.get(card.id) || [];
      if (!sequence.includes(card.stepIndex)) sequence.push(card.stepIndex);
      stepSequences.set(card.id, sequence);
      if ((latestRevision.get(card.id) || -1) < card.revision) {
        latestRevision.set(card.id, card.revision);
        traceChanged = true;
        timeline.push({
          elapsedMs: Date.now() - runStarted,
          chunkId: card.id,
          revision: card.revision,
          stepIndex: card.stepIndex,
          stepLabel: card.stepLabel,
          textLength: card.text.length,
          textPreview: card.text.slice(0, 100),
        });
      }
    }
    const result = {
        firstVisibleDeltaMs,
        firstStreamScreenshot,
        secondStepScreenshot,
        maxVisibleGenerating,
        maxReportedConcurrentParagraphs,
        chunkIds: [...stepSequences.keys()],
        stepSequences: Object.fromEntries(stepSequences),
        timeline,
        settledStatus: snapshot.completed ? "completed" : snapshot.resumable ? "paused" : "running",
      };
    if (traceChanged || snapshot.completed || snapshot.resumable) {
      writeFileSync(STREAM_TRACE_PATH, JSON.stringify(result, null, 2), "utf-8");
    }
    if (snapshot.completed || snapshot.resumable) {
      if (snapshot.completed && firstVisibleDeltaMs === null) throw new Error("任务完成了，但页面从未显示真实流式正文。 ");
      return result;
    }
    await wait(100);
  }
  throw new Error(`等待真实流式任务完成超时。当前页面：\n${await bodyText(client)}`);
}

function mergeStreamEvidence(parts) {
  const stepSequences = new Map();
  const timeline = parts.flatMap((item) => item.timeline || []).sort((left, right) => left.elapsedMs - right.elapsedMs);
  for (const event of timeline) {
    const sequence = stepSequences.get(event.chunkId) || [];
    if (!sequence.includes(event.stepIndex)) sequence.push(event.stepIndex);
    stepSequences.set(event.chunkId, sequence);
  }
  return {
    firstVisibleDeltaMs: parts.map((item) => item.firstVisibleDeltaMs).filter((value) => value !== null).sort((a, b) => a - b)[0] ?? null,
    firstStreamScreenshot: parts.find((item) => item.firstStreamScreenshot)?.firstStreamScreenshot || "",
    secondStepScreenshot: parts.find((item) => item.secondStepScreenshot)?.secondStepScreenshot || "",
    maxVisibleGenerating: Math.max(0, ...parts.map((item) => item.maxVisibleGenerating || 0)),
    maxReportedConcurrentParagraphs: Math.max(0, ...parts.map((item) => item.maxReportedConcurrentParagraphs || 0)),
    chunkIds: [...stepSequences.keys()],
    stepSequences: Object.fromEntries(stepSequences),
    timeline,
    settledStatus: parts.at(-1)?.settledStatus || "",
    resumeCount: Math.max(0, parts.length - 1),
  };
}

async function observeAndResumeUntilComplete(client, runStarted, maxResumes = 3) {
  const parts = [];
  for (let attempt = 0; attempt <= maxResumes; attempt += 1) {
    const part = await observeRunUntilComplete(client, runStarted);
    parts.push(part);
    const combined = mergeStreamEvidence(parts);
    writeFileSync(STREAM_TRACE_PATH, JSON.stringify(combined, null, 2), "utf-8");
    if (part.settledStatus === "completed") return combined;
    if (part.settledStatus !== "paused" || attempt >= maxResumes) {
      throw new Error(`任务未能完成：${JSON.stringify({ settledStatus: part.settledStatus, resumeCount: attempt })}`);
    }
    await screenshot(client, `paused-before-resume-${attempt + 1}`);
    await clickByText(client, "继续未完成内容");
    await waitForText(client, "正在改写", 30_000);
  }
  throw new Error("任务多次继续后仍未完成。 ");
}

async function clickReviewAction(client, paragraphId, label) {
  const expression = `(() => {
    const card = document.querySelector('[data-review-paragraph="' + CSS.escape(${JSON.stringify(paragraphId)}) + '"]');
    const element = Array.from(card?.querySelectorAll('button') || [])
      .find((item) => (item.innerText || '').replace(/\\s+/g, ' ').trim() === ${JSON.stringify(label)});
    if (!element || element.disabled) return false;
    element.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`;
  await clickTarget(client, expression, `第 ${paragraphId} 段的“${label}”`);
}

async function resetSavedManualReviews(client) {
  let resetCount = 0;
  while (true) {
    const paragraphId = await evaluate(client, `(() => {
      const cards = Array.from(document.querySelectorAll('[data-review-paragraph]'));
      const card = cards.find((item) => Array.from(item.querySelectorAll('button')).some((button) =>
        (button.innerText || '').includes('手动编辑') && button.getAttribute('data-state') === 'on'
      ));
      return card?.getAttribute('data-review-paragraph') || '';
    })()`);
    if (!paragraphId) return resetCount;
    await clickReviewAction(client, paragraphId, "采用改写");
    await waitForExpression(client, `(() => {
      const card = document.querySelector('[data-review-paragraph="' + CSS.escape(${JSON.stringify(paragraphId)}) + '"]');
      const manual = Array.from(card?.querySelectorAll('button') || []).find((item) => (item.innerText || '').includes('手动编辑'));
      return manual?.getAttribute('data-state') !== 'on' && !(card?.innerText || '').includes('正在保存');
    })()`, "恢复采用模型改写", 30_000);
    resetCount += 1;
  }
}

async function manuallyChangeNumber(client, preferredParagraphId = "") {
  const paragraphIds = await evaluate(client, `Array.from(document.querySelectorAll('[data-review-paragraph]')).map((item) => item.getAttribute('data-review-paragraph')).filter(Boolean)`);
  const orderedIds = preferredParagraphId
    ? [preferredParagraphId, ...paragraphIds.filter((item) => item !== preferredParagraphId)]
    : paragraphIds;
  let target = null;
  let selector = "";
  let before = "";
  for (const paragraphId of orderedIds) {
    await clickReviewAction(client, paragraphId, "手动编辑");
    selector = `[id=${JSON.stringify(`manual-${paragraphId}`)}]`;
    await waitForExpression(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`, "手动编辑文本框");
    before = await evaluate(client, `document.querySelector(${JSON.stringify(selector)})?.value || ''`);
    if (/\d/.test(before)) {
      target = { paragraphId };
      break;
    }
    await clickReviewAction(client, paragraphId, "采用改写");
    await wait(350);
  }
  if (!target?.paragraphId) throw new Error("所有可见改写正文都不含数字，无法完成‘修改已有数字’验收。 ");
  const match = before.match(/\d/);
  if (!match || match.index === undefined) throw new Error("没有定位到需要修改的已有数字。 ");
  const oldDigit = match[0];
  const newDigit = oldDigit === "9" ? "8" : String(Number(oldDigit) + 1);
  const after = `${before.slice(0, match.index)}${newDigit}${before.slice(match.index + oldDigit.length)}`;
  await setControlValue(client, selector, after);
  await clickReviewAction(client, target.paragraphId, "保存手动内容");
  await waitForExpression(client, `(() => {
    const card = document.querySelector('[data-review-paragraph="' + CSS.escape(${JSON.stringify(target.paragraphId)}) + '"]');
    const saving = (card?.innerText || '').includes('正在保存');
    const manual = Array.from(card?.querySelectorAll('button') || []).find((item) => (item.innerText || '').includes('手动编辑'));
    return !saving && manual?.getAttribute('data-state') === 'on';
  })()`, "手动内容保存完成", 30_000);
  await wait(500);
  await clickByText(client, "仅看改写");
  const saved = await evaluate(client, `(() => {
    const card = document.querySelector('[data-review-paragraph="' + CSS.escape(${JSON.stringify(target.paragraphId)}) + '"]');
    const textarea = document.querySelector(${JSON.stringify(selector)});
    return {
      cardText: (card?.innerText || '').slice(0, 2500),
      textareaValue: textarea?.value || '',
      warningCount: Array.from(card?.querySelectorAll('li') || []).length,
      hasManualLabel: (card?.innerText || '').includes('当前采用的手动内容'),
      liveCards: document.querySelectorAll('[data-live-part]').length,
    };
  })()`);
  if (saved.textareaValue !== after || !saved.hasManualLabel || saved.warningCount < 1 || saved.liveCards !== 0) {
    throw new Error(`手动数字修改没有按提醒模式保存：${JSON.stringify({ ...saved, textareaValue: saved.textareaValue.slice(0, 120) })}`);
  }
  const editedTextPath = resolve(VALIDATION_DIR, `manual-edit-${target.paragraphId}.txt`);
  writeFileSync(editedTextPath, after, "utf-8");
  return {
    paragraphId: target.paragraphId,
    oldDigit,
    newDigit,
    changeKind: "changed_existing_digit",
    beforeLength: before.length,
    afterLength: after.length,
    editedTextPath,
    editedTextSha256: createHash("sha256").update(after, "utf-8").digest("hex"),
    warningCount: saved.warningCount,
  };
}

function downloadSnapshot() {
  return new Map(readdirSync(DOWNLOAD_DIR)
    .filter((name) => !name.endsWith(".crdownload"))
    .map((name) => {
      const metadata = statSync(resolve(DOWNLOAD_DIR, name));
      return [name, { mtimeMs: metadata.mtimeMs, size: metadata.size }];
    }));
}

function latestDownloadedFile(previousFiles) {
  const files = readdirSync(DOWNLOAD_DIR)
    .filter((name) => !name.endsWith(".crdownload"))
    .map((name) => {
      const path = resolve(DOWNLOAD_DIR, name);
      const metadata = statSync(path);
      return { name, path, mtimeMs: metadata.mtimeMs, size: metadata.size };
    })
    .filter((item) => {
      if (previousFiles instanceof Set) return !previousFiles.has(item.name);
      const previous = previousFiles.get(item.name);
      return !previous || item.mtimeMs > previous.mtimeMs + 1 || item.size !== previous.size;
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  return files[0] || null;
}

async function waitForDownload(previousFiles, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const file = latestDownloadedFile(previousFiles);
    if (file && statSync(file.path).size > 0) return file;
    await wait(500);
  }
  throw new Error("等待浏览器下载文件超时。 ");
}

async function recentSnapshot(client) {
  return evaluate(client, `Array.from(document.querySelectorAll('[data-recent-document]')).map((card) => ({
    id: card.getAttribute('data-recent-document') || '',
    name: card.getAttribute('data-recent-name') || '',
    status: card.getAttribute('data-recent-status') || '',
    text: (card.innerText || '').replace(/\\s+/g, ' ').trim(),
    actions: Array.from(card.querySelectorAll('button')).map((button) => ({
      name: (button.getAttribute('aria-label') || button.innerText || '').replace(/\\s+/g, ' ').trim(),
      disabled: Boolean(button.disabled),
    })),
  }))`);
}

async function clickRecentAction(client, documentId, action) {
  const expression = `(() => {
    const card = document.querySelector('[data-recent-document="' + CSS.escape(${JSON.stringify(documentId)}) + '"]');
    const action = ${JSON.stringify(action)};
    const buttons = Array.from(card?.querySelectorAll('button') || []);
    const button = buttons.find((item) => {
      const name = (item.getAttribute('aria-label') || item.innerText || '').replace(/\\s+/g, ' ').trim();
      return action === '删除' ? name.startsWith('删除 ') : name === action;
    });
    if (!button || button.disabled) return false;
    button.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`;
  await clickTarget(client, expression, `最近文档 ${documentId} 的“${action}”`);
}

async function recentDocumentsFlow(client) {
  if (!SOURCE_DOCX) throw new Error("recent_documents 阶段缺少 FYADR_REAL_SOURCE_DOCX。 ");
  await setViewport(client, 1440, 1000, false);
  await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOAD_DIR });
  await client.send("Page.setInterceptFileChooserDialog", { enabled: true });
  await client.send("Page.navigate", { url: `${FRONTEND_URL}/` });
  await waitForText(client, "任务控制台", 30_000);
  await clickByText(client, "最近文档");
  await waitForText(client, "继续处理与导出", 30_000);

  const initialItems = await recentSnapshot(client);
  const completed = initialItems.find((item) => item.status === "completed" && item.actions.some((action) => action.name === "导出" && !action.disabled));
  if (!completed) throw new Error(`最近文档中没有可打开、可导出的已完成任务：${JSON.stringify(initialItems)}`);
  const recentDesktopScreenshot = await screenshot(client, "recent-desktop");
  const desktopAudit = await auditUi(client, "recent-desktop");

  await clickRecentAction(client, completed.id, "打开");
  await waitForText(client, "改写完成", 30_000);
  const opened = await evaluate(client, `(() => {
    const word = Array.from(document.querySelectorAll('button')).find((item) => (item.innerText || '').trim() === '导出 Word');
    const resume = Array.from(document.querySelectorAll('button')).some((item) => (item.innerText || '').trim() === '继续未完成内容');
    return { title: document.body?.innerText?.includes(${JSON.stringify(completed.name)}) || false, wordEnabled: Boolean(word && !word.disabled), resume };
  })()`);
  if (!opened.title || !opened.wordEnabled || opened.resume) throw new Error(`最近文档打开后的状态错误：${JSON.stringify(opened)}`);

  await client.send("Page.reload", { ignoreCache: true });
  await waitForText(client, "任务控制台", 30_000);
  await waitForText(client, "改写完成", 30_000);
  const restored = await evaluate(client, `(() => {
    const word = Array.from(document.querySelectorAll('button')).find((item) => (item.innerText || '').trim() === '导出 Word');
    return {
      hasDocument: document.body?.innerText?.includes(${JSON.stringify(completed.name)}) || false,
      wordEnabled: Boolean(word && !word.disabled),
      reviewCards: document.querySelectorAll('[data-review-paragraph]').length,
    };
  })()`);
  if (!restored.hasDocument || !restored.wordEnabled || restored.reviewCards < 1) {
    throw new Error(`刷新后没有恢复已完成任务：${JSON.stringify(restored)}`);
  }
  const restoredScreenshot = await screenshot(client, "restored-after-refresh");

  await clickByText(client, "更换文档");
  await uploadFile(client, SOURCE_DOCX);
  await waitForExpression(
    client,
    `Boolean(document.querySelector('[role="dialog"]')?.innerText?.includes('确认正文范围'))`,
    "重复文档范围弹窗",
    120_000,
  );
  await clickByText(client, "取消", { preferLast: true });
  await clickByText(client, "最近文档");
  await waitForText(client, "继续处理与导出", 30_000);
  const withDuplicate = await recentSnapshot(client);
  const initialIds = new Set(initialItems.map((item) => item.id));
  const duplicate = withDuplicate.find((item) => !initialIds.has(item.id));
  if (!duplicate) throw new Error("通过界面重复上传后，最近文档没有出现新记录。 ");

  await clickRecentAction(client, duplicate.id, "删除");
  await waitForText(client, "删除这篇文档？", 10_000);
  const confirmation = await evaluate(client, `(() => {
    const dialog = document.querySelector('[role="alertdialog"]');
    return {
      count: document.querySelectorAll('[role="alertdialog"]').length,
      mentionsName: (dialog?.innerText || '').includes(${JSON.stringify(duplicate.name)}),
      hasCancel: Array.from(dialog?.querySelectorAll('button') || []).some((item) => (item.innerText || '').trim() === '取消'),
      hasConfirm: Array.from(dialog?.querySelectorAll('button') || []).some((item) => (item.innerText || '').trim() === '确认删除'),
    };
  })()`);
  if (confirmation.count !== 1 || !confirmation.mentionsName || !confirmation.hasCancel || !confirmation.hasConfirm) {
    throw new Error(`删除确认弹窗不完整：${JSON.stringify(confirmation)}`);
  }
  const deleteConfirmationScreenshot = await screenshot(client, "delete-confirmation");
  await clickByText(client, "取消", { preferLast: true });
  if (!(await recentSnapshot(client)).some((item) => item.id === duplicate.id)) throw new Error("取消删除仍移除了文档。 ");

  await clickRecentAction(client, duplicate.id, "删除");
  await waitForText(client, "删除这篇文档？", 10_000);
  await clickByText(client, "确认删除", { preferLast: true });
  await waitForExpression(
    client,
    `!document.querySelector('[data-recent-document="' + CSS.escape(${JSON.stringify(duplicate.id)}) + '"]')`,
    "重复测试文档删除完成",
    30_000,
  );

  await setViewport(client, 1024, 768, false);
  const tabletAudit = await auditUi(client, "recent-tablet");
  const tabletScreenshot = await screenshot(client, "recent-tablet");
  await setViewport(client, 390, 844, true);
  const mobileAudit = await auditUi(client, "recent-mobile");
  const mobileScreenshot = await screenshot(client, "recent-mobile");
  await setViewport(client, 1440, 1000, false);

  return {
    phase: "recent_documents",
    initialCount: initialItems.length,
    openedDocument: { id: completed.id, name: completed.name },
    opened,
    restored,
    duplicate: { id: duplicate.id, name: duplicate.name },
    deleteConfirmation: confirmation,
    finalCount: (await recentSnapshot(client)).length,
    screenshots: [recentDesktopScreenshot, restoredScreenshot, deleteConfirmationScreenshot, tabletScreenshot, mobileScreenshot],
    uiAudits: [desktopAudit, tabletAudit, mobileAudit],
  };
}

async function txtFlow(client) {
  if (!SOURCE_TXT) throw new Error("txt_flow 阶段缺少 FYADR_REAL_SOURCE_TXT。 ");
  await setViewport(client, 1440, 1000, false);
  await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOAD_DIR });
  await client.send("Page.setInterceptFileChooserDialog", { enabled: true });
  await client.send("Page.navigate", { url: `${FRONTEND_URL}/` });
  await waitForText(client, "任务控制台", 30_000);
  await clickByText(client, "开始改写");
  const hasDocument = await evaluate(client, `Array.from(document.querySelectorAll('button')).some((item) => (item.innerText || '').trim() === '更换文档')`);
  await clickByText(client, hasDocument ? "更换文档" : "上传 DOCX 或 TXT");
  await uploadFile(client, SOURCE_TXT);
  await waitForText(client, "TXT 可直接改写，导出内容不包含 Word 排版。", 120_000);
  await waitForExpression(
    client,
    `Boolean(document.querySelector('[role="dialog"]')?.innerText?.includes('确认正文范围'))`,
    "TXT 正文范围弹窗",
    30_000,
  );
  const scope = await evaluate(client, `(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const boxes = Array.from(dialog?.querySelectorAll('[role="checkbox"]') || []);
    return { total: boxes.length, checked: boxes.filter((item) => item.getAttribute('data-state') === 'checked').length };
  })()`);
  if (!scope.checked) await clickByText(client, "选择全部可选段落");
  const scopeScreenshot = await screenshot(client, "txt-scope");
  await clickByText(client, "确认正文范围", { preferLast: true });
  await waitForText(client, "范围已确认", 30_000);

  const selectedPlanLabel = await evaluate(client, "document.querySelector('#run-prompt-plan')?.innerText?.replace(/\\s+/g, ' ').trim() || ''");
  if (!selectedPlanLabel.startsWith(REAL_PLAN_NAME)) {
    await clickSelector(client, "#run-prompt-plan");
    await clickByText(client, REAL_PLAN_NAME, { preferLast: true });
  }
  const confirmedPlanLabel = await evaluate(client, "document.querySelector('#run-prompt-plan')?.innerText?.replace(/\\s+/g, ' ').trim() || ''");
  if (!confirmedPlanLabel.startsWith(REAL_PLAN_NAME)) throw new Error(`TXT 流程没有选中两步方案：${confirmedPlanLabel}`);

  const runStarted = Date.now();
  await clickByText(client, "开始改写", { preferLast: true });
  await waitForText(client, "正在改写", 30_000);
  const streamEvidence = await observeAndResumeUntilComplete(client, runStarted);
  await waitForExpression(client, "Boolean(document.querySelector('[data-text-diff]'))", "TXT Diff 审阅结果", 60_000);
  const transitionedChunkIds = Object.entries(streamEvidence.stepSequences)
    .filter(([, steps]) => steps.includes(0) && steps.includes(1))
    .map(([chunkId]) => chunkId);
  if (!transitionedChunkIds.length) throw new Error(`TXT 流程没有观察到两步流式切换：${JSON.stringify(streamEvidence.stepSequences)}`);

  const exportState = await evaluate(client, `(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const word = buttons.find((item) => (item.innerText || '').trim() === '导出 Word');
    const txt = buttons.find((item) => (item.innerText || '').trim() === '导出 TXT');
    return {
      textMode: document.body?.innerText?.includes('文本模式') || false,
      wordDisabled: Boolean(word?.disabled),
      txtEnabled: Boolean(txt && !txt.disabled),
      reviewCards: document.querySelectorAll('[data-review-paragraph]').length,
    };
  })()`);
  if (!exportState.textMode || !exportState.wordDisabled || !exportState.txtEnabled || exportState.reviewCards < 1) {
    throw new Error(`TXT 完成后的导出状态错误：${JSON.stringify(exportState)}`);
  }

  const previousDownloads = downloadSnapshot();
  await clickByText(client, "导出 TXT");
  const exportOutcome = await waitForAnyText(client, ["导出前确认变化提醒", "文件已导出"], 120_000);
  let warningConfirmationCount = 0;
  if (exportOutcome.text === "导出前确认变化提醒") {
    await clickByText(client, "确认并导出", { preferLast: true });
    warningConfirmationCount = 1;
    await waitForText(client, "文件已导出", 120_000);
  }
  const download = await waitForDownload(previousDownloads);
  const downloadedText = readFileSync(download.path, "utf-8");
  if (!download.name.toLowerCase().endsWith(".txt") || !downloadedText.trim()) {
    throw new Error(`TXT 下载件无效：${JSON.stringify({ name: download.name, size: download.size })}`);
  }
  const completedScreenshot = await screenshot(client, "txt-completed");

  const desktopAudit = await auditUi(client, "txt-desktop");
  await setViewport(client, 1024, 768, false);
  const tabletAudit = await auditUi(client, "txt-tablet");
  const tabletScreenshot = await screenshot(client, "txt-tablet");
  await setViewport(client, 390, 844, true);
  const mobileAudit = await auditUi(client, "txt-mobile");
  const mobileScreenshot = await screenshot(client, "txt-mobile");
  await setViewport(client, 1440, 1000, false);

  return {
    phase: "txt_flow",
    source: resolve(SOURCE_TXT),
    scope,
    selectedPlan: confirmedPlanLabel,
    streamEvidence,
    transitionedChunkIds,
    exportState,
    warningConfirmationCount,
    download: { ...download, sha256: createHash("sha256").update(downloadedText, "utf-8").digest("hex") },
    screenshots: [scopeScreenshot, streamEvidence.firstStreamScreenshot, streamEvidence.secondStepScreenshot, completedScreenshot, tabletScreenshot, mobileScreenshot].filter(Boolean),
    uiAudits: [desktopAudit, tabletAudit, mobileAudit],
  };
}

async function protectionMapFlow(client) {
  await setViewport(client, 1440, 1000, false);
  await client.send("Page.navigate", { url: `${FRONTEND_URL}/` });
  await waitForText(client, "任务控制台", 30_000);
  await clickByText(client, "最近文档");
  await waitForText(client, "继续处理与导出", 30_000);
  const items = await recentSnapshot(client);
  const completedDocx = items.find((item) => item.status === "completed" && item.text.includes("DOCX"));
  if (!completedDocx) throw new Error(`最近文档中没有已完成 DOCX：${JSON.stringify(items)}`);
  await clickRecentAction(client, completedDocx.id, "打开");
  await waitForText(client, "改写完成", 30_000);
  await clickByText(client, "保护区地图");
  await waitForText(client, "文档边界地图", 30_000);
  await waitForText(client, "已建立", 30_000);

  const summary = await evaluate(client, `(() => {
    const text = document.body?.innerText || '';
    const statValue = (label) => {
      const labelNode = Array.from(document.querySelectorAll('p')).find((item) => (item.innerText || '').trim() === label);
      const valueNode = labelNode?.parentElement?.querySelector('h3');
      const value = Number((valueNode?.innerText || '').trim());
      return Number.isFinite(value) ? value : null;
    };
    return {
      totalUnits: statValue('总单元'),
      editableUnits: statValue('本次改写'),
      protectedUnits: statValue('原样保留'),
      hasBoundaryStrip: text.includes('文档结构条'),
      hasReasonDistribution: text.includes('保护原因分布'),
      hasSequence: text.includes('完整边界序列'),
      hasNoScoringPromise: text.includes('不评分、不回退'),
      canReturn: Array.from(document.querySelectorAll('button')).some((item) => (item.innerText || '').trim() === '返回当前任务'),
    };
  })()`);
  if (!summary.totalUnits || !summary.editableUnits || !summary.protectedUnits || summary.editableUnits + summary.protectedUnits !== summary.totalUnits || !summary.hasBoundaryStrip || !summary.hasReasonDistribution || !summary.hasSequence || !summary.hasNoScoringPromise || !summary.canReturn) {
    throw new Error(`保护区地图信息不完整：${JSON.stringify(summary)}`);
  }

  const desktopAudit = await auditUi(client, "protection-desktop");
  const desktopScreenshot = await screenshot(client, "protection-desktop");
  await setViewport(client, 1024, 768, false);
  const tabletAudit = await auditUi(client, "protection-tablet");
  const tabletScreenshot = await screenshot(client, "protection-tablet");
  await setViewport(client, 390, 844, true);
  const mobileAudit = await auditUi(client, "protection-mobile");
  const mobileScreenshot = await screenshot(client, "protection-mobile");
  await setViewport(client, 1440, 1000, false);
  await clickByText(client, "返回当前任务");
  await waitForText(client, "改写完成", 30_000);

  return {
    phase: "protection_map",
    document: { id: completedDocx.id, name: completedDocx.name },
    summary,
    returnedToCompletedRun: true,
    screenshots: [desktopScreenshot, tabletScreenshot, mobileScreenshot],
    uiAudits: [desktopAudit, tabletAudit, mobileAudit],
  };
}

async function clearApiKeyFlow(client) {
  await setViewport(client, 1440, 1000, false);
  await client.send("Page.navigate", { url: `${FRONTEND_URL}/` });
  await waitForText(client, "任务控制台", 30_000);
  await clickByText(client, "模型连接");
  await waitForExpression(client, "Boolean(document.querySelector('#api-key'))", "模型连接编辑器", 30_000);
  const hadSavedKey = await evaluate(client, "Boolean(document.querySelector('#clear-api-key'))");
  if (hadSavedKey) {
    await setCheckbox(client, "#clear-api-key", true);
    await clickByText(client, "保存连接", { preferLast: true });
    await waitForText(client, "首页现在可以直接选择这个模型连接。", 30_000);
  }

  await client.send("Page.reload", { ignoreCache: true });
  await waitForText(client, "任务控制台", 30_000);
  await clickByText(client, "模型连接");
  await waitForExpression(client, "Boolean(document.querySelector('#api-key'))", "刷新后的模型连接编辑器", 30_000);
  const cleared = await evaluate(client, `(() => {
    const keyInput = document.querySelector('#api-key');
    return {
      clearControlPresent: Boolean(document.querySelector('#clear-api-key')),
      inputValueLength: keyInput?.value?.length || 0,
      placeholderMentionsSavedKey: (keyInput?.getAttribute('placeholder') || '').includes('已保存'),
    };
  })()`);
  if (cleared.clearControlPresent || cleared.inputValueLength || cleared.placeholderMentionsSavedKey) {
    throw new Error(`隔离配置的 API Key 没有通过界面清空：${JSON.stringify(cleared)}`);
  }
  const screenshotPath = await screenshot(client, "api-key-cleared");
  return {
    phase: "clear_api_key",
    hadSavedKey,
    cleared,
    screenshots: [screenshotPath],
    uiAudits: [await auditUi(client, "api-key-cleared")],
  };
}

async function scopeAuditFlow(client) {
  if (!SOURCE_DOCX) throw new Error("scope_audit 阶段缺少 FYADR_REAL_SOURCE_DOCX。 ");
  await setViewport(client, 1440, 1000, false);
  await client.send("Page.setInterceptFileChooserDialog", { enabled: true });
  await client.send("Page.navigate", { url: `${FRONTEND_URL}/` });
  await waitForText(client, "任务控制台", 30_000);
  await clickByText(client, "开始改写");
  const hasDocument = await evaluate(client, `Array.from(document.querySelectorAll('button')).some((item) => (item.innerText || '').trim() === '更换文档')`);
  await clickByText(client, hasDocument ? "更换文档" : "上传 DOCX 或 TXT");
  await uploadFile(client, SOURCE_DOCX);
  await waitForExpression(
    client,
    `Boolean(document.querySelector('[role="dialog"]')?.innerText?.includes('确认正文范围'))`,
    "正文范围弹窗",
    120_000,
  );

  const screenshots = [await screenshot(client, "desktop")];
  const audits = [await auditScopeDialog(client, "scope-desktop")];
  await setViewport(client, 1024, 768, false);
  audits.push(await auditScopeDialog(client, "scope-tablet"));
  screenshots.push(await screenshot(client, "tablet"));
  await setViewport(client, 390, 844, true);
  audits.push(await auditScopeDialog(client, "scope-mobile"));
  screenshots.push(await screenshot(client, "mobile"));

  for (const audit of audits) {
    if (!audit.withinViewport || audit.horizontalOverflow || audit.missingNames?.length || audit.duplicateIds?.length || !audit.confirmVisible || audit.scrollOverlapsFooter) {
      throw new Error(`范围弹窗 UI 审计未通过：${JSON.stringify(audit)}`);
    }
  }

  await clickScopeTab(client, "可选");
  const availableAudit = await auditScopeDialog(client, "scope-mobile-available");
  screenshots.push(await screenshot(client, "mobile-available"));
  await clickScopeTab(client, "保留");
  const protectedAudit = await auditScopeDialog(client, "scope-mobile-protected");
  screenshots.push(await screenshot(client, "mobile-protected"));
  await setControlValue(client, "#scope-search", "公式");
  const protectedSearchRows = await evaluate(client, `document.querySelector('[role="dialog"] [role="tabpanel"]')?.querySelectorAll('[data-slot="field"] [role="checkbox"]').length || 0`);
  screenshots.push(await screenshot(client, "mobile-protected-search"));
  await clickByText(client, "取消");

  return {
    phase: "scope_audit",
    source: resolve(SOURCE_DOCX),
    screenshots,
    uiAudits: [...audits, availableAudit, protectedAudit],
    protectedSearchRows,
  };
}

async function runDocumentFlow(client) {
  if (!SOURCE_DOCX) throw new Error("run 阶段缺少 FYADR_REAL_SOURCE_DOCX。 ");
  await setViewport(client, 1440, 1000, false);
  await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOAD_DIR });
  await client.send("Page.setInterceptFileChooserDialog", { enabled: true });
  await client.send("Page.navigate", { url: `${FRONTEND_URL}/` });
  await waitForText(client, "任务控制台", 30_000);
  await clickByText(client, "开始改写");
  const hasDocument = await evaluate(client, `Array.from(document.querySelectorAll('button')).some((item) => (item.innerText || '').trim() === '更换文档')`);
  await clickByText(client, hasDocument ? "更换文档" : "上传 DOCX 或 TXT");

  const uploadStarted = Date.now();
  await uploadFile(client, SOURCE_DOCX);
  await waitForText(client, "文档已读取", 120_000);
  await waitForExpression(
    client,
    `Boolean(document.querySelector('[role="dialog"]')?.innerText?.includes('确认正文范围'))`,
    "正文范围弹窗",
    30_000,
  );
  const uploadElapsedMs = Date.now() - uploadStarted;
  const scopeScreenshot = await screenshot(client, "scope-default");
  const scopeDefaults = await evaluate(client, `(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const panel = dialog?.querySelector('[role="tabpanel"]');
    const boxes = Array.from(panel?.querySelectorAll('[role="checkbox"]') || []);
    const first = boxes.find((item) => !item.disabled && item.getAttribute('aria-disabled') !== 'true');
    const firstField = first?.closest('[data-slot="field"]');
    const firstLabel = first?.id ? dialog?.querySelector('label[for="' + CSS.escape(first.id) + '"]') : null;
    const orderMatch = (firstLabel?.innerText || '').match(/第\\s*(\\d+)\\s*段/);
    return {
      total: boxes.length,
      checked: boxes.filter((item) => item.getAttribute('data-state') === 'checked').length,
      disabled: boxes.filter((item) => item.disabled || item.getAttribute('aria-disabled') === 'true').length,
      activeTab: dialog?.querySelector('[role="tab"][aria-selected="true"]')?.innerText?.replace(/\\s+/g, ' ').trim() || '',
      firstOrder: orderMatch ? Number(orderMatch[1]) : null,
      firstPreview: (firstField?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
    };
  })()`);
  if (!scopeDefaults.activeTab.startsWith("建议")) {
    throw new Error(`范围弹窗没有默认打开建议正文：${JSON.stringify(scopeDefaults)}`);
  }
  if (!scopeDefaults.firstOrder || scopeDefaults.firstOrder < MIN_SUGGESTED_ORDER) {
    throw new Error(`建议正文仍从前置内容开始：${JSON.stringify(scopeDefaults)}`);
  }

  const scopeDesktopAudit = await auditScopeDialog(client, "scope-desktop");
  await setViewport(client, 1024, 768, false);
  const scopeTabletAudit = await auditScopeDialog(client, "scope-tablet");
  const scopeTabletScreenshot = await screenshot(client, "scope-tablet");
  await setViewport(client, 390, 844, true);
  const scopeMobileAudit = await auditScopeDialog(client, "scope-mobile");
  const scopeMobileScreenshot = await screenshot(client, "scope-mobile");
  await setViewport(client, 1440, 1000, false);
  const scopeChoice = await chooseScopeParagraphs(client, SELECT_COUNT);
  await clickByText(client, "确认正文范围", { preferLast: true });
  await waitForText(client, "范围已确认", 30_000);

  const selectedPlanLabel = await evaluate(client, "document.querySelector('#run-prompt-plan')?.innerText?.replace(/\\s+/g, ' ').trim() || ''");
  if (!selectedPlanLabel.startsWith(REAL_PLAN_NAME)) {
    await clickSelector(client, "#run-prompt-plan");
    await clickByText(client, REAL_PLAN_NAME, { preferLast: true });
  }
  const confirmedPlanLabel = await evaluate(client, "document.querySelector('#run-prompt-plan')?.innerText?.replace(/\\s+/g, ' ').trim() || ''");
  if (!confirmedPlanLabel.startsWith(REAL_PLAN_NAME)) throw new Error(`首页没有选中真实两步方案：${confirmedPlanLabel}`);

  await clickByText(client, "高级设置");
  const concurrencyExpression = `(() => {
    const labels = Array.from(document.querySelectorAll('label')).filter((item) => (item.innerText || '').includes('同时处理'));
    const region = labels[0]?.closest('[data-slot="field"]') || labels[0]?.parentElement?.parentElement;
    const button = Array.from(region?.querySelectorAll('button') || []).find((item) => (item.innerText || '').trim() === ${JSON.stringify(String(CONCURRENCY))});
    if (!button || button.disabled) return false;
    button.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`;
  await clickTarget(client, concurrencyExpression, `${CONCURRENCY} 路并行选项`);
  const concurrencySelected = true;
  await setControlValue(client, "#protected-terms", PROTECTED_TERMS);

  const runStarted = Date.now();
  await clickByText(client, "开始改写", { preferLast: true });
  await waitForText(client, "正在改写", 30_000);
  let firstVisibleDeltaMs = null;
  let streamScreenshot = "";
  let streamEvidence = null;
  let stoppedProgress = null;

  if (STOP_AND_RESUME) {
    firstVisibleDeltaMs = await waitForExpression(
      client,
      `Array.from(document.querySelectorAll('[data-live-part]')).some((card) => Number(card.getAttribute('data-live-revision') || 0) > 0 && Boolean(card.querySelector('[data-live-text]')?.innerText?.trim()))`,
      "页面出现首个实时正文",
      360_000,
    );
    streamScreenshot = await screenshot(client, "first-stream");
    await wait(900);
    await clickByText(client, "停止并保存进度");
    await waitForText(client, "继续未完成内容", 60_000);
    stoppedProgress = await evaluate(client, `(() => {
      const panel = document.querySelector('[data-testid="rewrite-task-panel"]');
      return (panel?.innerText || '').replace(/\\s+/g, ' ').trim();
    })()`);
    await screenshot(client, "stopped");
    await clickByText(client, "继续未完成内容");
    await waitForExpression(
      client,
      `(() => {
        const panel = document.querySelector('[data-testid="rewrite-task-panel"]');
        return (panel?.innerText || '').includes('改写完成');
      })()`,
      "全部所选正文改写完成",
      1_800_000,
    );
  } else {
    streamEvidence = await observeAndResumeUntilComplete(client, runStarted);
    firstVisibleDeltaMs = streamEvidence.firstVisibleDeltaMs;
    streamScreenshot = streamEvidence.firstStreamScreenshot;
    const transitionedChunkIds = Object.entries(streamEvidence.stepSequences)
      .filter(([, steps]) => steps.includes(0) && steps.includes(1))
      .map(([chunkId]) => chunkId);
    if (!transitionedChunkIds.length) {
      throw new Error(`页面没有观察到同一分块从提示词步骤 1/2 切换到 2/2：${JSON.stringify(streamEvidence.stepSequences)}`);
    }
    const expectedConcurrent = Math.min(CONCURRENCY, SELECT_COUNT);
    if (streamEvidence.maxReportedConcurrentParagraphs < expectedConcurrent) {
      throw new Error(`页面最多只显示 ${streamEvidence.maxReportedConcurrentParagraphs} 段并行，未达到设置的 ${expectedConcurrent}。`);
    }
  }
  const completedElapsedMs = Date.now() - runStarted;
  await waitForExpression(client, "Boolean(document.querySelector('[data-text-diff]'))", "Diff 审阅结果", 60_000);
  const resultScreenshot = await screenshot(client, "completed-diff");
  const review = await evaluate(client, `(() => {
    const cards = Array.from(document.querySelectorAll('[data-review-paragraph]'));
    return {
      cards: cards.length,
      warnings: cards.filter((item) => (item.innerText || '').includes('请人工核对')).length,
      diffAdded: document.querySelectorAll('[data-diff-added]').length,
      diffRemoved: document.querySelectorAll('[data-diff-removed]').length,
      incomplete: cards.filter((item) => (item.innerText || '').includes('未完成')).length,
    };
  })()`);
  const manualEdit = MANUAL_NUMBER_EDIT ? await manuallyChangeNumber(client, scopeChoice.numericParagraphId) : null;
  const manualScreenshot = manualEdit ? await screenshot(client, "manual-number-warning") : "";
  const reviewAfterManual = manualEdit ? await evaluate(client, `(() => {
    const cards = Array.from(document.querySelectorAll('[data-review-paragraph]'));
    return {
      cards: cards.length,
      warnings: cards.filter((item) => (item.innerText || '').includes('请人工核对')).length,
      taskCompleted: (document.querySelector('[data-testid="rewrite-task-panel"]')?.innerText || '').includes('改写完成'),
      liveCards: document.querySelectorAll('[data-live-part]').length,
    };
  })()`) : null;

  const previousDownloads = downloadSnapshot();
  await clickByText(client, "导出 Word");
  const exportOutcome = await waitForAnyText(client, ["导出前确认变化提醒", "文件已导出", "为保护原文格式，已停止 Word 导出"], 120_000);
  let warningConfirmationCount = 0;
  if (exportOutcome.text === "导出前确认变化提醒") {
    const visibleWarningDialogs = await evaluate(client, `Array.from(document.querySelectorAll('[role="dialog"]')).filter((item) => (item.innerText || '').includes('导出前确认变化提醒')).length`);
    if (visibleWarningDialogs !== 1) throw new Error(`导出警告确认弹窗数量异常：${visibleWarningDialogs}`);
    await clickByText(client, "确认并导出", { preferLast: true });
    warningConfirmationCount += 1;
    await waitForText(client, "文件已导出", 120_000);
  } else if (exportOutcome.text !== "文件已导出") {
    throw new Error(`Word 导出失败。当前页面：\n${await bodyText(client)}`);
  }
  if (MANUAL_NUMBER_EDIT && warningConfirmationCount !== 1) {
    throw new Error(`手动改变数字后没有只进行一次警告确认：${warningConfirmationCount}`);
  }
  const download = await waitForDownload(previousDownloads);
  const exportScreenshot = await screenshot(client, "exported");

  const desktopAudit = await auditUi(client, "rewrite-desktop");
  await setViewport(client, 1024, 768, false);
  const tabletAudit = await auditUi(client, "rewrite-tablet");
  const tabletScreenshot = await screenshot(client, "rewrite-tablet");
  await setViewport(client, 390, 844, true);
  const mobileAudit = await auditUi(client, "rewrite-mobile");
  const mobileScreenshot = await screenshot(client, "rewrite-mobile");
  await setViewport(client, 1440, 1000, false);

  return {
    phase: "run",
    source: resolve(SOURCE_DOCX),
    uploadElapsedMs,
    scopeDefaults,
    scopeChoice,
    concurrency: CONCURRENCY,
    selectedPlan: confirmedPlanLabel,
    stopAndResume: STOP_AND_RESUME,
    stoppedProgress,
    firstVisibleDeltaMs,
    streamEvidence,
    completedElapsedMs,
    review,
    manualEdit,
    reviewAfterManual,
    warningConfirmationCount,
    download,
    screenshots: [scopeScreenshot, scopeTabletScreenshot, scopeMobileScreenshot, streamScreenshot, resultScreenshot, manualScreenshot, exportScreenshot, tabletScreenshot, mobileScreenshot].filter(Boolean),
    uiAudits: [scopeDesktopAudit, scopeTabletAudit, scopeMobileAudit, desktopAudit, tabletAudit, mobileAudit],
  };
}

async function runDocumentFlowCurrent(client) {
  if (!SOURCE_DOCX) throw new Error("run 阶段缺少 FYADR_REAL_SOURCE_DOCX。 ");
  await setViewport(client, 1440, 1000, false);
  await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOAD_DIR });
  await client.send("Page.navigate", { url: `${FRONTEND_URL}/` });
  await waitForText(client, "开始改写", 30_000);
  await clickByText(client, "开始改写");

  const hasDocument = await evaluate(client, "Boolean(document.querySelector('[data-testid=\"rewrite-workspace-grid\"]'))");
  if (hasDocument) {
    await clickSelector(client, 'button[aria-label="文档操作"]');
    await clickByText(client, "更换文档");
  }

  const uploadStarted = Date.now();
  await uploadFile(client, SOURCE_DOCX);
  await waitForText(client, "文档已读取", 120_000);
  await waitForExpression(
    client,
    `Boolean(Array.from(document.querySelectorAll('[role="dialog"]')).find((item) => (item.innerText || '').includes('正文范围')))`,
    "正文范围弹窗",
    30_000,
  );
  const uploadElapsedMs = Date.now() - uploadStarted;
  const scopeScreenshot = await screenshot(client, "scope-default");
  const scopeDefaults = await evaluate(client, `(() => {
    const dialog = Array.from(document.querySelectorAll('[role="dialog"]')).find((item) => (item.innerText || '').includes('正文范围'));
    const units = Array.from(dialog?.querySelectorAll('[id^="scope-unit-"]') || []);
    const boxes = units.map((unit) => unit.querySelector('[role="checkbox"]')).filter(Boolean);
    const checked = boxes.filter((item) => item.getAttribute('data-state') === 'checked');
    const structuralPattern = /^(图\s*\d|表\s*\d|参考文献|目录|致谢|附录|关键词|keywords?)/i;
    const structuralSelected = units.filter((unit) => {
      const box = unit.querySelector('[role="checkbox"]');
      if (box?.getAttribute('data-state') !== 'checked') return false;
      const description = unit.querySelector('[data-slot="item-description"]')?.innerText?.trim() || '';
      return structuralPattern.test(description);
    }).length;
    const selectedOrders = checked.map((box) => {
      const title = box.closest('[data-slot="item"]')?.querySelector('[data-slot="item-title"]')?.innerText || '';
      const match = title.match(/第\s*(\d+)\s*段/);
      return match ? Number(match[1]) : null;
    }).filter((value) => value !== null);
    return {
      units: units.length,
      selectable: boxes.length,
      selected: checked.length,
      fixed: units.length - boxes.length,
      structuralSelected,
      firstSelectedOrder: selectedOrders[0] || null,
      lastSelectedOrder: selectedOrders.at(-1) || null,
    };
  })()`);
  if (!scopeDefaults.selected) throw new Error(`没有识别到正文：${JSON.stringify(scopeDefaults)}`);

  await clickByText(client, "保存正文范围", { preferLast: true });
  await waitForText(client, "正文范围已保存", 30_000);
  await waitForExpression(client, "Boolean(document.querySelector('[data-testid=\"rewrite-task-sheet\"]'))", "改写设置", 30_000);
  await wait(500);

  let modelLabel = await evaluate(client, "document.querySelector('#run-model-profile')?.innerText?.replace(/\\s+/g, ' ').trim() || ''");
  if (!modelLabel.includes("Cardinalize")) {
    await clickSelector(client, "#run-model-profile");
    await clickByText(client, "Cardinalize", { preferLast: true });
    modelLabel = await evaluate(client, "document.querySelector('#run-model-profile')?.innerText?.replace(/\\s+/g, ' ').trim() || ''");
  }
  const promptPlanLabel = await evaluate(client, "document.querySelector('#run-prompt-plan')?.innerText?.replace(/\\s+/g, ' ').trim() || ''");
  await clickByText(client, "处理");
  await setSliderValue(client, '[data-testid="rewrite-concurrency"] [role="slider"]', CONCURRENCY);
  await setControlValue(client, "#protected-terms", PROTECTED_TERMS);
  const processingSettings = await evaluate(client, `(() => {
    const sheet = document.querySelector('[data-testid="rewrite-task-sheet"]');
    const active = (text) => Array.from(sheet?.querySelectorAll('button') || []).find((item) => (item.innerText || '').trim() === text)?.getAttribute('data-state') === 'on';
    return {
      standardChunking: active('标准'),
      twoRounds: active('2'),
      concurrency: Number(sheet?.querySelector('[data-testid="rewrite-concurrency"] [role="slider"]')?.getAttribute('aria-valuenow') || 0),
    };
  })()`);
  if (!processingSettings.standardChunking || !processingSettings.twoRounds || processingSettings.concurrency !== CONCURRENCY) {
    throw new Error(`改写设置没有按产品默认值生效：${JSON.stringify(processingSettings)}`);
  }

  const runStarted = Date.now();
  await clickByText(client, "开始改写", { preferLast: true });
  await waitForExpression(client, "Boolean(document.querySelector('[data-testid=\"rewrite-run-progress\"]'))", "整体改写进度", 30_000);

  const timeline = [];
  let firstDeltaMs = null;
  let firstStreamScreenshot = "";
  let stopped = null;
  let stopRequested = false;
  let resumeCount = 0;
  let maxRunningChunks = 0;
  let completedTelemetry = null;
  const deadline = Date.now() + 7_200_000;

  while (Date.now() < deadline) {
    const telemetry = await currentRunTelemetry(client);
    if (!telemetry || telemetry.error) {
      await wait(500);
      continue;
    }
    maxRunningChunks = Math.max(maxRunningChunks, telemetry.chunks.running || 0);
    timeline.push({
      elapsedMs: Date.now() - runStarted,
      status: telemetry.status,
      completedParagraphs: telemetry.paragraphs.completed,
      completedChunks: telemetry.chunks.completed,
      runningChunks: telemetry.chunks.running,
      pausedChunks: telemetry.chunks.paused,
      revisionSum: telemetry.chunks.revisionSum,
    });
    if (timeline.length % 5 === 0) writeFileSync(STREAM_TRACE_PATH, JSON.stringify({ timeline, firstDeltaMs, resumeCount }, null, 2), "utf-8");

    if (firstDeltaMs === null && telemetry.chunks.revisionSum > 0) {
      firstDeltaMs = Date.now() - runStarted;
      firstStreamScreenshot = await screenshot(client, "first-upstream-delta");
    }

    if (STOP_AND_RESUME && !stopRequested && firstDeltaMs !== null && telemetry.status === "running") {
      await wait(800);
      await clickByText(client, "停止");
      stopRequested = true;
      const stopDeadline = Date.now() + 60_000;
      while (Date.now() < stopDeadline) {
        const current = await currentRunTelemetry(client);
        if (current && ["paused", "cancelled"].includes(current.status)) {
          stopped = current;
          break;
        }
        await wait(300);
      }
      if (!stopped) throw new Error("真实任务停止后没有进入可继续状态。 ");
      await screenshot(client, "stopped");
      await clickByText(client, "继续");
      await waitForText(client, "继续未完成内容", 30_000);
      await clickByText(client, "继续未完成内容", { preferLast: true });
      resumeCount += 1;
      await waitForExpression(client, "Boolean(document.querySelector('[data-testid=\"rewrite-run-progress\"]'))", "继续后的整体进度", 30_000);
      continue;
    }

    if (telemetry.status === "completed") {
      completedTelemetry = telemetry;
      break;
    }
    if (["paused", "cancelled"].includes(telemetry.status)) {
      if (resumeCount >= 8) throw new Error(`真实任务多次继续后仍暂停：${JSON.stringify(telemetry)}`);
      await clickByText(client, "继续");
      await waitForText(client, "继续未完成内容", 30_000);
      await clickByText(client, "继续未完成内容", { preferLast: true });
      resumeCount += 1;
      await waitForExpression(client, "Boolean(document.querySelector('[data-testid=\"rewrite-run-progress\"]'))", "自动继续后的整体进度", 30_000);
    }
    await wait(1_000);
  }

  writeFileSync(STREAM_TRACE_PATH, JSON.stringify({ timeline, firstDeltaMs, resumeCount }, null, 2), "utf-8");
  if (!completedTelemetry) throw new Error("真实文档在两小时内没有完成整轮改写。 ");
  if (completedTelemetry.chunks.completed !== completedTelemetry.chunks.total || completedTelemetry.paragraphs.incomplete) {
    throw new Error(`任务显示完成但仍有未完成内容：${JSON.stringify(completedTelemetry)}`);
  }
  if (completedTelemetry.snapshot.executionStepCount !== 2 || completedTelemetry.chunks.minCompletedSteps !== 2) {
    throw new Error(`两轮改写没有完整执行：${JSON.stringify(completedTelemetry)}`);
  }

  const completedElapsedMs = Date.now() - runStarted;
  await waitForExpression(client, "Boolean(document.querySelector('[data-review-detail]'))", "完成后的段落审阅", 60_000);
  const resultScreenshot = await screenshot(client, "completed-diff");
  const review = await evaluate(client, `(() => ({
    diffVisible: Boolean(document.querySelector('[data-text-diff]')),
    addedMarks: document.querySelectorAll('[data-diff-added]').length,
    removedMarks: document.querySelectorAll('[data-diff-removed]').length,
    chunkDetailsHidden: !document.querySelector('[data-chunk-track], [data-review-chunk], [data-live-part]'),
  }))()`);

  const previousDownloads = downloadSnapshot();
  await clickByText(client, "导出");
  await waitForExpression(client, "Boolean(document.querySelector('[data-testid=\"rewrite-task-sheet\"]'))", "导出操作", 30_000);
  await clickByText(client, "Word");
  const exportOutcome = await waitForAnyText(client, ["导出前确认", "文件已导出", "文件无法生成", "导出失败"], 120_000);
  let warningConfirmationCount = 0;
  if (exportOutcome.text === "导出前确认") {
    await clickByText(client, "继续导出 Word", { preferLast: true });
    warningConfirmationCount = 1;
    await waitForText(client, "文件已导出", 120_000);
  } else if (exportOutcome.text !== "文件已导出") {
    throw new Error(`Word 导出失败。当前页面：\n${await bodyText(client)}`);
  }
  const download = await waitForDownload(previousDownloads);
  const downloadedBytes = readFileSync(download.path);
  if (downloadedBytes.length < 4 || downloadedBytes.subarray(0, 2).toString("ascii") !== "PK") {
    throw new Error(`下载的 Word 文件无效：${JSON.stringify(download)}`);
  }
  const exportedTelemetry = await currentRunTelemetry(client);
  const exportScreenshot = await screenshot(client, "exported");

  await pressEscape(client);
  const desktopAudit = await auditUi(client, "rewrite-desktop");
  await setViewport(client, 1024, 768, false);
  const tabletAudit = await auditUi(client, "rewrite-tablet");
  const tabletScreenshot = await screenshot(client, "rewrite-tablet");
  await setViewport(client, 390, 844, true);
  const mobileAudit = await auditUi(client, "rewrite-mobile");
  const mobileScreenshot = await screenshot(client, "rewrite-mobile");
  await setViewport(client, 1440, 1000, false);

  return {
    phase: "run",
    source: {
      path: resolve(SOURCE_DOCX),
      bytes: statSync(SOURCE_DOCX).size,
      sha256: createHash("sha256").update(readFileSync(SOURCE_DOCX)).digest("hex"),
    },
    uploadElapsedMs,
    scope: scopeDefaults,
    modelLabel,
    promptPlanLabel,
    processingSettings,
    stopAndResume: STOP_AND_RESUME,
    stopped: stopped ? { status: stopped.status, progress: stopped.progress, chunks: stopped.chunks } : null,
    firstDeltaMs,
    resumeCount,
    maxRunningChunks,
    completedElapsedMs,
    completed: completedTelemetry,
    review,
    warningConfirmationCount,
    export: {
      name: download.name,
      path: download.path,
      bytes: download.size,
      sha256: createHash("sha256").update(downloadedBytes).digest("hex"),
      formatAudit: exportedTelemetry?.formatAudit || null,
    },
    screenshots: [scopeScreenshot, firstStreamScreenshot, resultScreenshot, exportScreenshot, tabletScreenshot, mobileScreenshot].filter(Boolean),
    uiAudits: [desktopAudit, tabletAudit, mobileAudit],
  };
}

async function currentRunTelemetry(client) {
  return evaluate(client, `(async () => {
    const pointer = JSON.parse(localStorage.getItem('fyadr.workspace.v2') || 'null');
    if (!pointer?.runId) return null;
    const response = await fetch('/api/runs/' + encodeURIComponent(pointer.runId));
    if (!response.ok) return { error: 'run_http_' + response.status, id: pointer.runId };
    const run = await response.json();
    const chunks = Array.isArray(run.chunks) ? run.chunks : [];
    const paragraphs = Array.isArray(run.paragraphs) ? run.paragraphs : [];
    const completedStepCounts = chunks.map((item) => Number(item.stepIndex || 0));
    const chunkStatuses = Object.fromEntries(['pending', 'running', 'paused', 'cancelled', 'completed'].map((status) => [
      status,
      chunks.filter((item) => item.status === status).length,
    ]));
    return {
      id: run.id,
      status: run.status,
      progress: run.progress,
      snapshot: {
        modelName: run.snapshot?.modelProfile?.name || '',
        model: run.snapshot?.modelProfile?.model || '',
        protocol: run.snapshot?.modelProfile?.protocol || '',
        promptPlan: run.snapshot?.promptPlan?.name || '',
        concurrency: run.snapshot?.concurrency || 0,
        repeatCount: run.snapshot?.repeatCount || 0,
        chunking: run.snapshot?.chunking || null,
        executionStepCount: run.snapshot?.promptPlan?.steps?.length || 0,
        selectedParagraphCount: run.snapshot?.document?.selectedParagraphIds?.length || 0,
      },
      chunks: {
        total: chunks.length,
        ...chunkStatuses,
        revisionSum: chunks.reduce((sum, item) => sum + Number(item.revision || 0), 0),
        streaming: chunks.filter((item) => String(item.streamText || '').length > 0).length,
        changed: chunks.filter((item) => item.status === 'completed' && String(item.finalText || '') !== String(item.originalText || '')).length,
        minCompletedSteps: completedStepCounts.length ? Math.min(...completedStepCounts) : 0,
        maxCompletedSteps: completedStepCounts.length ? Math.max(...completedStepCounts) : 0,
      },
      paragraphs: {
        total: paragraphs.length,
        completed: paragraphs.filter((item) => item.complete).length,
        incomplete: paragraphs.filter((item) => !item.complete).length,
        warnings: paragraphs.reduce((sum, item) => sum + (item.warnings?.length || 0) + (item.warningCheckError ? 1 : 0), 0),
      },
      formatAudit: run.formatAudit ? {
        status: run.formatAudit.status || '',
        forceExported: Boolean(run.formatAudit.forceExported),
        issueCount: run.formatAudit.issues?.length || 0,
      } : null,
    };
  })()`, 20_000);
}

async function pressEscape(client) {
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await wait(200);
}

async function exportCurrentRun(client) {
  await setViewport(client, 1440, 1000, false);
  await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOAD_DIR });
  await client.send("Page.navigate", { url: `${FRONTEND_URL}/` });
  await waitForText(client, "开始改写", 30_000);
  if (CURRENT_DOCUMENT_ID && CURRENT_RUN_ID) {
    await evaluate(client, `localStorage.setItem('fyadr.workspace.v2', ${JSON.stringify(JSON.stringify({ documentId: CURRENT_DOCUMENT_ID, runId: CURRENT_RUN_ID }))})`);
    await client.send("Page.reload", { ignoreCache: true });
    await waitForText(client, "开始改写", 30_000);
  }
  await clickByText(client, "开始改写");
  await waitForExpression(client, "Boolean(document.querySelector('[data-review-detail]'))", "完成后的段落审阅", 60_000);

  let reviewChoice = null;
  if (KEEP_ORIGINAL_PARAGRAPH_ID) {
    await clickSelector(client, 'a[aria-label="选择段落"]');
    await waitForExpression(client, `Boolean(document.querySelector(${JSON.stringify(`[data-review-nav="${KEEP_ORIGINAL_PARAGRAPH_ID}"]`)}))`, "需要保留原文的段落", 30_000);
    await clickSelector(client, `[data-review-nav="${KEEP_ORIGINAL_PARAGRAPH_ID}"]`);
    await waitForExpression(client, `document.querySelector('[data-review-paragraph]')?.getAttribute('data-review-paragraph') === ${JSON.stringify(KEEP_ORIGINAL_PARAGRAPH_ID)}`, "目标段落审阅", 30_000);
    await wait(700);
    await clickSelector(client, 'button[aria-label="保留原文"]');
    await waitForExpression(client, `document.querySelector('button[aria-label="保留原文"]')?.getAttribute('data-state') === 'on'`, "保留原文选择保存", 30_000);
    reviewChoice = { paragraphId: KEEP_ORIGINAL_PARAGRAPH_ID, decision: "original" };
  }

  const telemetry = await currentRunTelemetry(client);
  if (!telemetry || telemetry.status !== "completed") {
    throw new Error(`当前任务尚未完成：${JSON.stringify(telemetry)}`);
  }
  if (telemetry.snapshot.executionStepCount !== 2 || telemetry.chunks.minCompletedSteps !== 2) {
    throw new Error(`当前任务没有完成两轮：${JSON.stringify(telemetry)}`);
  }
  const review = await evaluate(client, `(() => ({
    detailVisible: Boolean(document.querySelector('[data-review-detail]')),
    diffVisible: Boolean(document.querySelector('[data-text-diff]')),
    addedMarks: document.querySelectorAll('[data-diff-added]').length,
    removedMarks: document.querySelectorAll('[data-diff-removed]').length,
    chunkDetailsHidden: !document.querySelector('[data-chunk-track], [data-review-chunk], [data-live-part]'),
  }))()`);
  const reviewScreenshot = await screenshot(client, "completed-current-diff");

  const previousDownloads = downloadSnapshot();
  const started = Date.now();
  await clickByText(client, "导出");
  await waitForExpression(client, "Boolean(document.querySelector('[data-testid=\"rewrite-task-sheet\"]'))", "导出操作", 30_000);
  await clickByText(client, "Word");
  const outcome = await waitForAnyText(client, ["导出前确认", "文件已导出", "文件无法生成", "导出失败"], 120_000);
  let warningConfirmationCount = 0;
  if (outcome.text === "导出前确认") {
    await clickByText(client, "继续导出 Word", { preferLast: true });
    warningConfirmationCount = 1;
    await waitForText(client, "文件已导出", 120_000);
  } else if (outcome.text !== "文件已导出") {
    throw new Error(`Word 导出失败。当前页面：\n${await bodyText(client)}`);
  }
  const download = await waitForDownload(previousDownloads);
  const downloadedBytes = readFileSync(download.path);
  if (downloadedBytes.length < 4 || downloadedBytes.subarray(0, 2).toString("ascii") !== "PK") {
    throw new Error(`下载的 Word 文件无效：${JSON.stringify(download)}`);
  }
  const exportedTelemetry = await currentRunTelemetry(client);
  const exportedScreenshot = await screenshot(client, "exported-current-run");
  return {
    phase: "export_current",
    exportElapsedMs: Date.now() - started,
    telemetry,
    review,
    reviewChoice,
    warningConfirmationCount,
    download: {
      name: download.name,
      path: download.path,
      bytes: download.size,
      sha256: createHash("sha256").update(downloadedBytes).digest("hex"),
      formatAudit: exportedTelemetry?.formatAudit || null,
    },
    screenshots: [reviewScreenshot, exportedScreenshot],
    uiAudits: [await auditUi(client, "export-current-desktop")],
  };
}

async function resumeCurrentRunFlow(client) {
  await setViewport(client, 1440, 1000, false);
  await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOAD_DIR });
  await client.send("Page.navigate", { url: `${FRONTEND_URL}/` });
  await waitForText(client, "任务控制台", 30_000);
  await clickByText(client, "开始改写");
  const initial = await waitForAnyText(client, ["继续未完成内容", "改写完成"], 30_000);
  if (initial.text !== "继续未完成内容") throw new Error("当前任务已经完成，无法验证暂停后的真实继续流程。 ");
  const beforeResume = await evaluate(client, `(() => {
    const cards = Array.from(document.querySelectorAll('[data-review-paragraph]'));
    return {
      taskText: (document.querySelector('[data-testid="rewrite-task-panel"]')?.innerText || '').replace(/\\s+/g, ' ').trim(),
      paragraphs: cards.length,
      completed: cards.filter((item) => !(item.innerText || '').includes('未完成')).length,
      incomplete: cards.filter((item) => (item.innerText || '').includes('未完成')).length,
    };
  })()`);
  const pausedScreenshot = await screenshot(client, "current-paused");
  const runStarted = Date.now();
  await clickByText(client, "继续未完成内容");
  await waitForText(client, "正在改写", 30_000);
  const streamEvidence = await observeAndResumeUntilComplete(client, runStarted);
  if (streamEvidence.maxReportedConcurrentParagraphs > beforeResume.incomplete) {
    throw new Error(`继续任务重跑了超过未完成段落数量的内容：${JSON.stringify({ beforeResume, streamEvidence })}`);
  }
  const transitionedChunkIds = Object.entries(streamEvidence.stepSequences)
    .filter(([, steps]) => steps.includes(0) && steps.includes(1))
    .map(([chunkId]) => chunkId);
  if (!transitionedChunkIds.length) {
    throw new Error(`继续任务没有观察到同一分块的两步流式切换：${JSON.stringify(streamEvidence.stepSequences)}`);
  }

  await waitForExpression(client, "Boolean(document.querySelector('[data-text-diff]'))", "继续后的 Diff 审阅结果", 60_000);
  const completedScreenshot = await screenshot(client, "resumed-completed-diff");
  const reviewBeforeManual = await evaluate(client, `(() => {
    const cards = Array.from(document.querySelectorAll('[data-review-paragraph]'));
    return {
      cards: cards.length,
      incomplete: cards.filter((item) => (item.innerText || '').includes('未完成')).length,
      warnings: cards.filter((item) => (item.innerText || '').includes('请人工核对')).length,
      diffAdded: document.querySelectorAll('[data-diff-added]').length,
      diffRemoved: document.querySelectorAll('[data-diff-removed]').length,
    };
  })()`);
  const manualEdit = await manuallyChangeNumber(client);
  const manualScreenshot = await screenshot(client, "resumed-manual-number-warning");

  const previousDownloads = downloadSnapshot();
  await clickByText(client, "导出 Word");
  const exportOutcome = await waitForAnyText(client, ["导出前确认变化提醒", "文件已导出", "为保护原文格式，已停止 Word 导出"], 120_000);
  let warningConfirmationCount = 0;
  if (exportOutcome.text === "导出前确认变化提醒") {
    const visibleWarningDialogs = await evaluate(client, `Array.from(document.querySelectorAll('[role="dialog"]')).filter((item) => (item.innerText || '').includes('导出前确认变化提醒')).length`);
    if (visibleWarningDialogs !== 1) throw new Error(`导出警告确认弹窗数量异常：${visibleWarningDialogs}`);
    await clickByText(client, "确认并导出", { preferLast: true });
    warningConfirmationCount += 1;
    await waitForText(client, "文件已导出", 120_000);
  } else if (exportOutcome.text !== "文件已导出") {
    throw new Error(`Word 导出失败。当前页面：\n${await bodyText(client)}`);
  }
  if (warningConfirmationCount !== 1) throw new Error(`数字变化没有触发一次性导出确认：${warningConfirmationCount}`);
  const download = await waitForDownload(previousDownloads);
  const exportedScreenshot = await screenshot(client, "resumed-exported");

  const desktopAudit = await auditUi(client, "resume-desktop");
  await setViewport(client, 1024, 768, false);
  const tabletAudit = await auditUi(client, "resume-tablet");
  const tabletScreenshot = await screenshot(client, "resume-tablet");
  await setViewport(client, 390, 844, true);
  const mobileAudit = await auditUi(client, "resume-mobile");
  const mobileScreenshot = await screenshot(client, "resume-mobile");
  await setViewport(client, 1440, 1000, false);

  return {
    phase: "resume_current",
    beforeResume,
    streamEvidence,
    transitionedChunkIds,
    reviewBeforeManual,
    manualEdit,
    warningConfirmationCount,
    download,
    screenshots: [pausedScreenshot, streamEvidence.firstStreamScreenshot, streamEvidence.secondStepScreenshot, completedScreenshot, manualScreenshot, exportedScreenshot, tabletScreenshot, mobileScreenshot].filter(Boolean),
    uiAudits: [desktopAudit, tabletAudit, mobileAudit],
  };
}

async function redoManualNumberFlow(client) {
  await setViewport(client, 1440, 1000, false);
  await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOAD_DIR });
  await client.send("Page.navigate", { url: `${FRONTEND_URL}/` });
  await waitForText(client, "任务控制台", 30_000);
  await clickByText(client, "开始改写");
  await waitForText(client, "改写完成", 30_000);
  await clickByText(client, "仅看改写");

  const resetManualCount = await resetSavedManualReviews(client);
  const manualEdit = await manuallyChangeNumber(client);
  if (manualEdit.changeKind !== "changed_existing_digit" || !manualEdit.oldDigit) {
    throw new Error(`没有真实修改已有数字：${JSON.stringify(manualEdit)}`);
  }
  const manualScreenshot = await screenshot(client, "changed-existing-number-warning");
  const reviewState = await evaluate(client, `(() => {
    const cards = Array.from(document.querySelectorAll('[data-review-paragraph]'));
    return {
      manualParagraphs: cards.filter((card) => Array.from(card.querySelectorAll('button')).some((item) => (item.innerText || '').includes('手动编辑') && item.getAttribute('data-state') === 'on')).map((card) => card.getAttribute('data-review-paragraph')),
      warningCards: cards.filter((card) => (card.innerText || '').includes('请人工核对')).length,
      running: Boolean(document.querySelector('[data-run-activity]')),
    };
  })()`);
  if (reviewState.manualParagraphs.length !== 1 || reviewState.manualParagraphs[0] !== manualEdit.paragraphId || reviewState.warningCards < 1 || reviewState.running) {
    throw new Error(`数字修改后审阅状态异常：${JSON.stringify(reviewState)}`);
  }

  const previousDownloads = downloadSnapshot();
  await clickByText(client, "导出 Word");
  const exportOutcome = await waitForAnyText(client, ["导出前确认变化提醒", "文件已导出", "为保护原文格式，已停止 Word 导出"], 120_000);
  let warningConfirmationCount = 0;
  if (exportOutcome.text === "导出前确认变化提醒") {
    const dialogs = await evaluate(client, `Array.from(document.querySelectorAll('[role="dialog"]')).filter((item) => (item.innerText || '').includes('导出前确认变化提醒')).length`);
    if (dialogs !== 1) throw new Error(`导出警告弹窗数量异常：${dialogs}`);
    await clickByText(client, "确认并导出", { preferLast: true });
    warningConfirmationCount = 1;
    await waitForText(client, "文件已导出", 120_000);
  } else if (exportOutcome.text !== "文件已导出") {
    throw new Error(`Word 导出失败。当前页面：\n${await bodyText(client)}`);
  }
  if (warningConfirmationCount !== 1) throw new Error("修改已有数字后没有出现一次性提醒确认。 ");
  const download = await waitForDownload(previousDownloads);
  const exportedScreenshot = await screenshot(client, "changed-existing-number-exported");
  return {
    phase: "redo_manual_number",
    resetManualCount,
    manualEdit,
    reviewState,
    warningConfirmationCount,
    download,
    screenshots: [manualScreenshot, exportedScreenshot],
    uiAudits: [await auditUi(client, "changed-number-desktop")],
  };
}

async function run() {
  const mutationPhases = new Set(["configure", "configure_prompts", "clear_api_key"]);
  if (mutationPhases.has(PHASE) && !ALLOW_CONFIG_MUTATION) {
    throw new Error("该验收阶段会修改模型或提示词配置；请使用隔离配置目录，并显式设置 FYADR_REAL_ALLOW_CONFIG_MUTATION=1。");
  }
  if (PHASE === "configure" && (!BASE_URL.trim() || !MODEL.trim())) {
    throw new Error("配置验收必须通过 FYADR_REAL_BASE_URL 和 FYADR_REAL_MODEL 显式提供测试连接，脚本不会内置个人模型配置。");
  }
  const target = await getPageTarget();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send("Runtime.enable");
  await client.send("Page.enable");
  await client.send("DOM.enable");
  try {
    if (PHASE === "configure") return await configureModel(client);
    if (PHASE === "configure_prompts") return await configurePromptPlan(client);
    if (PHASE === "scope_audit") return await scopeAuditFlow(client);
    if (PHASE === "run") return await runDocumentFlowCurrent(client);
    if (PHASE === "export_current") return await exportCurrentRun(client);
    if (PHASE === "resume_current") return await resumeCurrentRunFlow(client);
    if (PHASE === "redo_manual_number") return await redoManualNumberFlow(client);
    if (PHASE === "recent_documents") return await recentDocumentsFlow(client);
    if (PHASE === "txt_flow") return await txtFlow(client);
    if (PHASE === "protection_map") return await protectionMapFlow(client);
    if (PHASE === "clear_api_key") return await clearApiKeyFlow(client);
    throw new Error(`未知真实验收阶段：${PHASE}`);
  } finally {
    client.close();
  }
}

const startedAt = new Date().toISOString();
let report;
try {
  const result = await run();
  report = { ok: true, startedAt, finishedAt: new Date().toISOString(), ...result };
} catch (error) {
  report = {
    ok: false,
    phase: PHASE,
    startedAt,
    finishedAt: new Date().toISOString(),
    error: redact(error instanceof Error ? error.message : error),
  };
}
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");
const output = redact(JSON.stringify(report, null, 2));
if (report.ok) console.log(output);
else console.error(output);
process.exit(report.ok ? 0 : 1);
