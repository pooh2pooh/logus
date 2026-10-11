/*
 * Упрощённый shell-загрузчик кабинета клиента.
 *
 * В HTML НЕТ тега <script src> основного бандла: загрузчик сам инжектит его
 * классическим <script> с текстом (IIFE). Это защищает от «вечной загрузки»
 * в Яндекс.Браузере, когда тег ресурса не шлёт ни load, ни error.
 *
 * Цепочка источников: localStorage (мгновенно) → api.php?action=asset → статика.
 * У каждого шага — свой дедлайн на заголовки И отдельно на тело; сверху общий
 * сторож прогресса. Итог всегда один из двух: приложение готово либо заглушка
 * с кнопкой «Повторить». Промежуточного «висит спиннер навсегда» нет.
 */
(function () {
  "use strict";

  var CONFIG = window.__LOGUS_SHELL_CONFIG__ || {};
  var VERSION = CONFIG.version || "0.1.0";
  var JS = CONFIG.js || "";
  var CSS = CONFIG.css || "";
  var ASSET = CONFIG.asset || "";
  var DIAG = CONFIG.diag || "";

  var HEADER_TIMEOUT = CONFIG.primaryTimeoutMs || 6000; // ждём заголовки
  var BODY_TIMEOUT = CONFIG.timeoutMs || 8000;          // ждём тело
  var POST_INJECT_TIMEOUT = CONFIG.postInjectTimeoutMs || 4000;
  var WATCHDOG = CONFIG.watchdogMs || 20000;

  var JS_NAME = JS ? JS.replace(/^.*\//, "") : "";
  var JS_KEY = "logus_shell_js_" + hash(JS);
  var MAX_LOG_LINES = 200;
  var LOG_AUTOHIDE_MS = 1600;

  var started = Date.now();
  var ready = false;
  var reported = false;
  var logOpenedByUser = false;
  var logLines = [];
  var watchdog = null;

  function hash(s) {
    var h = 9;
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 387420489);
    return (h ^ (h >>> 13)) >>> 0;
  }

  function stamp() {
    var ms = Date.now() - started;
    return "[" + (ms < 1000 ? ms + "ms" : (ms / 1000).toFixed(1) + "s") + "]";
  }

  function box() {
    return document.getElementById("shell-log");
  }

  function write(level, message) {
    var line = stamp() + " " + message;
    logLines.push(level + " " + line);
    if (logLines.length > 300) logLines.shift();

    var node = document.createElement("div");
    node.className = "shell-log__line shell-log__line--" + level;
    node.textContent = line; // textContent, не innerHTML — защита от XSS
    var b = box();
    if (b) {
      b.appendChild(node);
      while (b.childNodes.length > MAX_LOG_LINES) b.removeChild(b.firstChild);
      b.scrollTop = b.scrollHeight;
      if (!logOpenedByUser) armAutohide();
    }
    var fn = level === "error" ? "error" : level === "warn" ? "warn" : "log";
    try { console[fn]("[shell]", line); } catch (e) {}
  }

  var autohide = null;
  function armAutohide() {
    if (autohide) clearTimeout(autohide);
    autohide = setTimeout(function () {
      if (!logOpenedByUser) hideLog();
    }, LOG_AUTOHIDE_MS);
  }

  function showLog() {
    var b = box();
    if (b) b.classList.remove("is-hidden");
  }
  function hideLog() {
    var b = box();
    if (b) b.classList.add("is-hidden");
  }

  // --------------------------------------------------------------- network
  function readBody(res, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        try { if (res && res.body && res.body.cancel) res.body.cancel(); } catch (e) {}
        reject(new Error("таймаут чтения тела " + ms + "мс"));
      }, ms);
      res.text().then(
        function (t) { if (!done) { done = true; clearTimeout(timer); resolve(t); } },
        function (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } },
      );
    });
  }

  function fetchText(url, headerMs, bodyMs) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, headerMs);
    return fetch(url, { signal: ctrl.signal, cache: "no-store", credentials: "same-origin" })
      .then(function (res) {
        clearTimeout(timer);
        if (!res || !res.ok) throw new Error("HTTP " + (res ? res.status : "?"));
        return readBody(res, bodyMs);
      }, function (err) {
        clearTimeout(timer);
        throw err;
      });
  }

  function validBundle(text) {
    return typeof text === "string" && text.length >= 600 && !/^\s*</.test(text);
  }

  // --------------------------------------------------------------- storage
  function lsGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) {}
  }
  function store(text) {
    if (!validBundle(text)) return;
    lsSet(JS_KEY, text);
  }

  // --------------------------------------------------------------- inject
  function inject(text, source) {
    var script = document.createElement("script");
    script.text = text;
    document.body.appendChild(script);
    if (window.__LOGUS_APP_MOUNTED__) {
      write("ok", "бандл загружен (" + source + ")");
      markReady(source);
      return true;
    }
    return false;
  }

  function markReady(source) {
    if (ready) return;
    ready = true;
    if (watchdog) clearTimeout(watchdog);
    if (window.__LOGUS_LOADER__) window.__LOGUS_LOADER__.ready = true;
    write("ok", "приложение готово (" + source + ", " + (Date.now() - started) + "мс)");
    end();
    report("ready");
  }

  // --------------------------------------------------------------- sources
  function tryCache(done) {
    var text = lsGet(JS_KEY);
    if (!validBundle(text)) { done(false); return; }
    write("info", "пробуем локальную копию бандла");
    if (inject(text, "localStorage")) { done(true); return; }
    write("warn", "локальная копия не исполнилась — переходим к сети");
    done(false);
  }

  function tryAsset(done) {
    if (!ASSET) { done(false); return; }
    var url = ASSET + (ASSET.indexOf("?") >= 0 ? "&" : "?") + "f=" + encodeURIComponent(JS_NAME);
    write("net", "→ asset " + JS_NAME);
    fetchText(url, HEADER_TIMEOUT, BODY_TIMEOUT).then(
      function (text) {
        if (!validBundle(text)) throw new Error("ответ не похож на бандл");
        store(text);
        if (!inject(text, "api.php")) throw new Error("не исполнился");
        done(true);
      },
      function (err) {
        write("warn", "asset не удалось: " + err.message);
        done(false);
      },
    );
  }

  function tryStatic(done) {
    write("net", "→ static " + JS);
    fetchText(JS, HEADER_TIMEOUT, BODY_TIMEOUT).then(
      function (text) {
        if (!validBundle(text)) throw new Error("ответ не похож на бандл");
        store(text);
        if (!inject(text, "static")) throw new Error("не исполнился");
        done(true);
      },
      function (err) {
        write("error", "static не удалось: " + err.message);
        done(false);
      },
    );
  }

  // --------------------------------------------------------------- fallback
  function fallback(code, detail) {
    if (ready) return;
    if (watchdog) clearTimeout(watchdog);
    write("error", "не удалось загрузить интерфейс: " + code);
    var overlay = document.getElementById("shell-overlay");
    if (overlay) overlay.classList.add("is-hidden");
    document.body.classList.remove("shell-busy");
    var fb = document.getElementById("shell-fallback");
    var dt = document.getElementById("shell-fallback-detail");
    if (dt) dt.textContent = detail || code;
    if (fb) fb.classList.remove("is-hidden");
    report("fallback:" + code);
  }

  // --------------------------------------------------------------- watchdog
  function armWatchdog() {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(function () {
      if (!ready) fallback("APP_TIMEOUT", "Загрузка заняла слишком много времени");
    }, WATCHDOG);
  }

  // --------------------------------------------------------------- diag
  function report(reason) {
    if (reported || !DIAG) return;
    reported = true;
    try {
      var payload = JSON.stringify({
        reason: reason,
        version: VERSION,
        href: window.location.href,
        userAgent: navigator.userAgent,
        ready: ready,
        mounted: !!window.__LOGUS_APP_MOUNTED__,
        config: { js: JS, css: CSS, asset: ASSET },
        log: logLines.slice(-100),
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(DIAG, new Blob([payload], { type: "application/json" }));
      }
    } catch (e) {}
  }

  // --------------------------------------------------------------- public api
  function end() {
    var overlay = document.getElementById("shell-overlay");
    if (overlay) overlay.classList.add("is-hidden");
    document.body.classList.remove("shell-busy");
    var toggle = document.getElementById("shell-log-toggle");
    if (toggle) toggle.classList.remove("is-hidden");
  }

  window.__LOGUS_LOADER__ = {
    version: VERSION,
    ready: false,
    info: function (m) { write("info", m); },
    ok: function (m) { write("ok", m); },
    warn: function (m) { write("warn", m); },
    error: function (m) { write("error", m); },
    net: function (m) { write("net", m); },
    log: function (level, m) { write(level, m); },
    show: function () { showLog(); },
    hide: function () { hideLog(); },
    begin: function (label) { armingProgress(label); },
    end: function () { end(); },
    clear: function () { logLines = []; var b = box(); if (b) b.textContent = ""; },
    restart: function () { window.location.reload(); },
    report: function () { report("manual"); },
    isReady: function () { return ready; },
  };

  var prog = null;
  function armingProgress(label) {
    document.body.classList.add("cursor-progress");
    if (label) write("info", label);
    if (prog) clearTimeout(prog);
    prog = setTimeout(function () { document.body.classList.remove("cursor-progress"); }, 3000);
  }

  // --------------------------------------------------------------- boot
  function boot() {
    write("info", "загрузчик v" + VERSION);
    var early = window.__LOGUS_SHELL_EARLY_ERRORS__;
    if (early && early.length) {
      for (var i = 0; i < early.length; i++) {
        var e = early[i];
        write("error", "ранняя ошибка: " + (e && e.message ? e.message : String(e)));
      }
    }
    armWatchdog();

    var toggle = document.getElementById("shell-log-toggle");
    if (toggle) {
      toggle.addEventListener("click", function () {
        logOpenedByUser = true;
        var b = box();
        var hidden = b && b.classList.contains("is-hidden");
        if (hidden) { showLog(); toggle.setAttribute("aria-pressed", "true"); }
        else { hideLog(); toggle.setAttribute("aria-pressed", "false"); }
      });
    }

    window.addEventListener("error", function (ev) {
      var msg = ev && ev.message ? ev.message : "ошибка ресурса";
      write("error", "window.onerror: " + msg);
    }, true);

    window.addEventListener("unhandledrejection", function (ev) {
      var r = ev && ev.reason;
      write("error", "unhandledrejection: " + (r && r.message ? r.message : String(r)));
    });

    tryCache(function (ok) {
      if (ok) return;
      tryAsset(function (ok2) {
        if (ok2) return;
        tryStatic(function (ok3) {
          if (!ok3) fallback("APP_LOAD_FAILED", "Ни один источник не отдал бандл");
        });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
