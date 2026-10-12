/*
 * Браузерные e2e-сценарии кабинета клиента (документ §11).
 * Сценарий выбирается через SCENARIO: base | empty | error | slow | mobile.
 * Проверяем пользовательское поведение, а не внутренности.
 */
const { connect, waitFor, sleep, makeReporter } = require("./_cdp.cjs");

const SCENARIO = process.env.SCENARIO || "base";
const APP = process.env.APP_URL || "http://127.0.0.1:8090/index.html";
const PASSWORD = process.env.LOGUS_PASSWORD || "logus2026";

const reporter = makeReporter();
const check = reporter.check;

async function login(cdp) {
  const hasForm = await waitFor(cdp, "!!document.querySelector('#username')", 8000);
  if (!hasForm) return false;
  await cdp.evaluate(`(() => {
    const set = (el, v) => {
      const proto = Object.getPrototypeOf(el);
      const d = Object.getOwnPropertyDescriptor(proto, 'value');
      d.set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(document.querySelector('#username'), 'demo');
    set(document.querySelector('#password'), ${JSON.stringify(PASSWORD)});
    return true;
  })()`);
  const submitted = await cdp.evaluate(`(() => { const f = document.querySelector('form'); if (!f) return false; (f.requestSubmit ? f.requestSubmit() : f.querySelector('button[type=submit]').click()); return true; })()`);
  return submitted;
}

(async () => {
  const cdp = await connect();

  if (SCENARIO === "mobile") {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  }

  await cdp.send("Page.navigate", { url: APP });
  const ready = await waitFor(cdp, "window.__APP_READY__ === true", 12000);
  check("приложение сигнализирует о готовности (__APP_READY__)", ready);
  check("нет аварийной заглушки загрузчика", !(await cdp.evaluate("!!document.querySelector('#shell-fallback:not(.is-hidden)')")));

  if (SCENARIO === "base") check("до входа показана форма логина", await waitFor(cdp, "!!document.querySelector('#username')", 6000));

  await login(cdp);

  if (SCENARIO === "slow") {
    const skeleton = await waitFor(cdp, "!!document.querySelector('.skeleton')", 1200);
    check("во время медленной загрузки показаны скелетоны", skeleton);
    const appeared = await waitFor(cdp, "document.querySelectorAll('.order-card').length > 0", 15000);
    check("после загрузки появились заказы", appeared);
  } else if (SCENARIO === "empty" || SCENARIO === "error") {
    const empty = await waitFor(cdp, "!!document.querySelector('.empty')", 12000);
    check("показано состояние «пусто» (деградация без падения)", empty);
    check("нет карточек заказов", (await cdp.evaluate("document.querySelectorAll('.order-card').length")) === 0);
  } else {
    const cards = await waitFor(cdp, "document.querySelectorAll('.order-card').length > 0", 12000);
    check("после входа отображается список заказов", cards);
    check("показана сводка по статусам", await cdp.evaluate("!!document.querySelector('.summary')"));
  }

  if (SCENARIO === "mobile") {
    await waitFor(cdp, "document.querySelectorAll('.order-card').length > 0", 12000);
    const overflow = await cdp.evaluate("document.documentElement.scrollWidth - window.innerWidth");
    check(`нет горизонтального переполнения (Δ=${overflow}px)`, overflow <= 1);
    const topbar = await cdp.evaluate("(() => { const el = document.querySelector('.topbar'); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= window.innerWidth + 1; })()");
    check("шапка вписывается в вьюпорт 390px", topbar);
    await cdp.evaluate("document.querySelector('.order-card').click()");
    check("карточка заказа открывает диалог на мобильном", await waitFor(cdp, "!!document.querySelector('.dialog')", 5000));
    const dialogFits = await cdp.evaluate("(() => { const el = document.querySelector('.dialog'); if (!el) return false; const r = el.getBoundingClientRect(); return r.left >= -1 && r.right <= window.innerWidth + 1; })()");
    check("диалог вписывается в ширину экрана", dialogFits);
  }

  if (SCENARIO === "base") {
    // Карточка заказа → диалог с историей и документами.
    await cdp.evaluate("document.querySelector('.order-card').click()");
    check("клик по карточке открывает диалог", await waitFor(cdp, "!!document.querySelector('.dialog')", 5000));
    check("в диалоге есть история статуса", await waitFor(cdp, "document.querySelectorAll('.timeline li').length > 0", 4000));
    check("в диалоге есть документы", await cdp.evaluate("document.querySelectorAll('.dialog .doc').length > 0"));
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    check("Escape закрывает диалог", await waitFor(cdp, "!document.querySelector('.dialog')", 4000));

    // Поиск: заведомо несуществующий запрос → пусто.
    await cdp.evaluate(`(() => { const el = document.querySelector('input[type=search]'); const proto = Object.getPrototypeOf(el); Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, 'zzz-неттакого'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    check("поиск без совпадений показывает «пусто»", await waitFor(cdp, "!!document.querySelector('.empty')", 4000));

    // Уведомления.
    await cdp.evaluate("Array.from(document.querySelectorAll('button')).find(b => (b.getAttribute('aria-label')||'').startsWith('Уведомления')).click()");
    check("открывается панель уведомлений", await waitFor(cdp, "!!document.querySelector('.notif')", 5000));
    check("в уведомлениях есть записи", await cdp.evaluate("document.querySelectorAll('.notif li').length > 0"));
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitFor(cdp, "!document.querySelector('.notif')", 4000);

    // Смена темы.
    const before = await cdp.evaluate("document.documentElement.getAttribute('data-theme')");
    await cdp.evaluate("Array.from(document.querySelectorAll('button')).find(b => /тему/.test(b.getAttribute('aria-label')||'')).click()");
    await sleep(150);
    const after = await cdp.evaluate("document.documentElement.getAttribute('data-theme')");
    check(`переключатель темы меняет оформление (${before}→${after})`, before !== after);
  }

  const consoleClean = cdp.consoleErrors.length === 0 && cdp.exceptions.length === 0;
  check("нет ошибок в консоли и исключений", consoleClean);
  if (!consoleClean) {
    console.log("  console:", cdp.consoleErrors);
    console.log("  exceptions:", cdp.exceptions);
  }

  const failed = reporter.results.filter((r) => !r.ok);
  console.log(`\n[${SCENARIO}] ИТОГ: ${reporter.results.length - failed.length}/${reporter.results.length}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error("FAILED:", e.stack || e.message);
  process.exit(1);
});
