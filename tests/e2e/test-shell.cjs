/*
 * Юнит-тесты упрощённого shell-загрузчика (без браузера), документ §11.
 * Проверяем цепочку источников localStorage → api.php?action=asset → статика →
 * нативный <script src>, обязательные таймауты на заголовки и тело, общий сторож
 * прогресса, единый терминальный лог и аварийную заглушку.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const runtime = fs.readFileSync(path.join(root, "web", "shell-runtime.js"), "utf8");

const JS = "./assets/app-X.js";
const JS_KEY = "logus_shell_js_" + hash(JS);

function hash(s) {
  let h = 9;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 387420489);
  return (h ^ (h >>> 13)) >>> 0;
}

const BODY = "/* bundle */" + "x".repeat(1200);

function makeEl(tag) {
  const classes = new Set();
  const children = [];
  const el = {
    tagName: tag.toUpperCase(),
    text: "",
    textContent: "",
    className: "",
    src: "",
    scrollTop: 0,
    scrollHeight: 0,
    childNodes: children,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : on ? classes.add(c) : classes.delete(c)),
    },
    appendChild(child) {
      children.push(child);
      return child;
    },
    removeChild(child) {
      const i = children.indexOf(child);
      if (i >= 0) children.splice(i, 1);
      return child;
    },
    get firstChild() {
      return children[0] || null;
    },
    setAttribute(k, v) {
      this._attrs = this._attrs || {};
      this._attrs[k] = v;
    },
    getAttribute(k) {
      return (this._attrs && this._attrs[k]) || null;
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector() {
      return null;
    },
  };
  return el;
}

function makeEnv({ ls = {}, asset = "./api.php?action=asset", diag = "", assetOk = true, assetHangHeaders = false, assetHangBody = false, staticOk = true, staticHangHeaders = false, staticHangBody = false, nativeScript = "error", headerMs = 120, bodyMs = 120, watchdogMs = 1500, mount = true, ready = false, earlyErrors = [] } = {}) {
  const storage = new Map(Object.entries(ls));
  const yielded = { scripts: [], nativeScripts: [] };
  const fetchCalls = [];
  const listeners = {};
  const els = {
    "shell-overlay": makeEl("div"),
    "shell-log": makeEl("div"),
    "shell-log-toggle": makeEl("button"),
    "shell-fallback": makeEl("div"),
    "shell-fallback-detail": makeEl("code"),
  };
  els["shell-fallback"].classList.add("is-hidden");
  els["shell-log-toggle"].classList.add("is-hidden");

  const windowObj = {
    __LOGUS_SHELL_CONFIG__: {
      js: JS,
      css: "./assets/app-Y.css",
      asset,
      diag,
      version: "test",
      primaryTimeoutMs: headerMs,
      timeoutMs: bodyMs,
      postInjectTimeoutMs: 60,
      watchdogMs,
    },
    __LOGUS_APP_MOUNTED__: false,
    __LOGUS_SHELL_EARLY_ERRORS__: earlyErrors,
    __APP_READY__: !!ready,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    },
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    removeEventListener() {},
    location: { reload() { windowObj._reloaded = true; } },
  };

  const body = makeEl("body");
  body.appendChild = (node) => {
    if (node.tagName === "SCRIPT" && !node.src && node.text && node.text.length > 600) {
      yielded.scripts.push(node);
      if (mount) windowObj.__LOGUS_APP_MOUNTED__ = true;
    } else if (node.tagName === "SCRIPT") {
      yielded.scripts.push(node);
    }
    return node;
  };

  // <head> принимает нативный <script src>. nativeScript задаёт исход загрузки:
  // "ok" — main.tsx выполнился (mount) и шлёт onload; "error" — onerror;
  // "hang" — ни load, ни error (проверка таймаута).
  const head = makeEl("head");
  head.appendChild = (node) => {
    if (node && node.tagName === "SCRIPT" && node.src) {
      yielded.scripts.push(node);
      yielded.nativeScripts.push(node);
      if (nativeScript === "ok") {
        windowObj.__LOGUS_APP_MOUNTED__ = true;
        setTimeout(() => { if (node.onload) node.onload(); }, 0);
      } else if (nativeScript === "error") {
        setTimeout(() => { if (node.onerror) node.onerror(); }, 0);
      }
    }
    return node;
  };

  const documentObj = {
    readyState: "complete",
    body,
    head,
    createElement: makeEl,
    getElementById: (id) => els[id] || (els[id] = makeEl("div")),
    addEventListener() {},
  };

  const navigatorObj = {
    userAgent: "test",
    sendBeacon: (url, blob) => {
      fetchCalls.push({ url, beacon: true });
      return true;
    },
  };

  const fetchMock = (url, opts = {}) => {
    fetchCalls.push({ url, opts });
    const signal = opts.signal;
    const hang = () =>
      new Promise((_, reject) => {
        if (signal) {
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });

    const hangBody = () =>
      new Promise((_, reject) => {
        if (signal) {
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });

    if (String(url).includes("action=asset")) {
      if (assetHangHeaders) return hang();
      if (!assetOk) return Promise.resolve({ ok: false, status: 500, text: async () => "" });
      if (assetHangBody) return Promise.resolve({ ok: true, status: 200, text: () => hangBody() });
      return Promise.resolve({ ok: true, status: 200, text: async () => BODY });
    }
    // статика
    if (staticHangHeaders) return hang();
    if (staticHangBody) return Promise.resolve({ ok: true, status: 200, text: () => hangBody() });
    if (!staticOk) return Promise.resolve({ ok: false, status: 404, text: async () => "" });
    return Promise.resolve({ ok: true, status: 200, text: async () => BODY });
  };

  Function(
    "window",
    "document",
    "fetch",
    "setTimeout",
    "clearTimeout",
    "console",
    "navigator",
    "AbortController",
    "Blob",
    runtime,
  )(windowObj, documentObj, fetchMock, setTimeout, clearTimeout, { log() {}, warn() {}, error() {} }, navigatorObj, AbortController, class Blob { constructor(parts) { this.len = parts.join("").length; } });

  return {
    yielded,
    storage,
    fetchCalls,
    els,
    windowObj,
    get fallbackVisible() {
      return !els["shell-fallback"].classList.contains("is-hidden");
    },
    get fallbackCode() {
      return els["shell-fallback-detail"].textContent;
    },
    get overlayHidden() {
      return els["shell-overlay"].classList.contains("is-hidden");
    },
    get logText() {
      return els["shell-log"].childNodes.map((n) => n.textContent).join("\n");
    },
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok) {
  results.push({ name, ok: !!ok });
  console.log((ok ? "PASS" : "FAIL") + " — " + name);
}

(async () => {
  // 0. Регресс: таймауты прерывают fetch через AbortController, а не отменяют уже
  //    заблокированный поток (иначе unhandledrejection «locked stream»).
  {
    check("нет отмены заблокированного потока (body.cancel)", !/body\s*\.\s*cancel/.test(runtime));
    check("таймаут тела реализован через AbortError", /AbortError/.test(runtime));
    check("есть резервный источник <script src>", /tryNativeScript/.test(runtime));
  }

  // 1. Нет кэша → бандл берётся через api.php?action=asset и выполняется инлайном.
  {
    const env = makeEnv({});
    await wait(60);
    check("основной источник — api.php?action=asset", env.fetchCalls.some((c) => String(c.url).includes("action=asset")));
    check("бандл выполнен инлайном (без <script src>)", env.yielded.scripts.length === 1 && !env.yielded.scripts[0].src);
    check("приложение помечено готовым, оверлей скрыт", env.overlayHidden && !env.fallbackVisible && env.windowObj.__LOGUS_LOADER__.isReady());
    check("бандл закэширован в localStorage", env.storage.has(JS_KEY));
  }

  // 2. Кэш в localStorage → мгновенный запуск, сеть не трогаем.
  {
    const env = makeEnv({ ls: { [JS_KEY]: BODY } });
    await wait(40);
    check("из кэша запуск без обращений к сети", env.yielded.scripts.length === 1 && env.fetchCalls.length === 0);
  }

  // 3. asset недоступен (HTTP 500) → резерв — статика.
  {
    const env = makeEnv({ assetOk: false });
    await wait(80);
    check("при сбое asset подхватывается статика", env.yielded.scripts.length === 1 && !env.fallbackVisible && env.windowObj.__LOGUS_LOADER__.isReady());
  }

  // 4. Заголовки asset «висят» → таймаут → статика.
  {
    const env = makeEnv({ assetHangHeaders: true });
    await wait(250);
    check("таймаут заголовков asset переключает на статику", env.windowObj.__LOGUS_LOADER__.isReady() && !env.fallbackVisible);
  }

  // 5. Тело asset «виснет» после 200 → таймаут чтения → статика.
  {
    const env = makeEnv({ assetHangBody: true });
    await wait(250);
    check("таймаут чтения тела asset переключает на статику", env.windowObj.__LOGUS_LOADER__.isReady() && !env.fallbackVisible);
  }

  // 5b. Тело статики «виснет» → подхватывает нативный <script src>, приложение готово.
  {
    const env = makeEnv({ assetOk: false, staticHangBody: true, nativeScript: "ok" });
    await wait(260);
    check("при зависании тела статики вставлен <script src>", env.yielded.nativeScripts.length === 1 && env.yielded.nativeScripts[0].src === JS);
    check("нативный <script src> доводит приложение до готовности", env.windowObj.__LOGUS_LOADER__.isReady() && !env.fallbackVisible);
  }

  // 6. Все источники недоступны (fetch + script) → заглушка с кодом и «Повторить».
  {
    const env = makeEnv({ assetOk: false, staticOk: false, nativeScript: "error" });
    await wait(220);
    check("при недоступности всех источников показана заглушка", env.fallbackVisible);
    check("причина APP_LOAD_FAILED записана в лог", env.logText.includes("APP_LOAD_FAILED"));
  }

  // 6b. <script src> не шлёт ни load, ни error → таймаут → заглушка.
  {
    const env = makeEnv({ assetOk: false, staticOk: false, nativeScript: "hang" });
    await wait(280);
    check("зависший <script src> приводит к заглушке по таймауту", env.fallbackVisible);
  }

  // 7. Общий сторож прогресса: источники «висят» дольше сторожа → APP_TIMEOUT.
  {
    const env = makeEnv({ assetHangHeaders: true, staticHangHeaders: true, headerMs: 400, watchdogMs: 150 });
    await wait(260);
    check("сторож прогресса даёт APP_TIMEOUT", env.fallbackVisible && env.logText.includes("APP_TIMEOUT"));
  }

  // 8. Маячок диагностики уходит на action=diag при сбое.
  {
    const env = makeEnv({ assetOk: false, staticOk: false, diag: "./api.php?action=diag" });
    await wait(120);
    check("маячок диагностики отправлен на action=diag", env.fetchCalls.some((c) => String(c.url).includes("action=diag")));
  }

  // 9. Ранние ошибки из буфера попадают в терминальный лог.
  {
    const env = makeEnv({ earlyErrors: [{ message: "ранняя-ошибка-маркер" }] });
    await wait(40);
    check("ранняя ошибка выведена в лог", env.logText.includes("ранняя-ошибка-маркер"));
  }

  // 10. restart() показывает оверлей, прячет заглушку и перезагружает страницу.
  {
    const env = makeEnv({ assetOk: false, staticOk: false });
    await wait(220);
    env.windowObj.__LOGUS_LOADER__.restart();
    check("restart() перезагружает страницу", env.windowObj._reloaded === true);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nИТОГ: ${results.length - failed.length}/${results.length} пройдено`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error("ТЕСТ ПРОВАЛЕН:", e.message);
  process.exit(1);
});
