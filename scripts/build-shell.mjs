/*
 * Пост-обработка Vite → отказоустойчивый shell-загрузчик.
 *
 * В HTML НЕТ тега <script src> основного бандла: загрузчик сам подключает
 * основной источник (PHP-ассет или статику), затем перебирает резервы.
 * Источники зеркал перечисляются в web/shell-config.js, его копия с
 * подставленными jsDelivr-зеркалами ложится рядом с index.html.
 *
 * Зеркала нужны, когда origin (медленный/заблокированный хостинг) не отдаёт
 * бандл без VPN: тогда тот же файл берётся с другого домена (CDN) мгновенно.
 *
 * !!! ВАЖНО: чтобы зеркала работали, сгенерированные assets/app-<hash>.js|css
 * и shell-config.js НУЖНО закоммитить и запушить (jsDelivr отдаёт их из git).
 */
import { readFileSync, writeFileSync, readdirSync, unlinkSync, statSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const webDir = path.join(root, "web");
const assetsDir = path.join(root, "assets");

function findAsset(re) {
  let best = null;
  let bestMtime = -1;
  for (const name of readdirSync(assetsDir)) {
    if (!re.test(name) || name.endsWith(".map")) continue;
    const mtime = statSync(path.join(assetsDir, name)).mtimeMs;
    if (mtime > bestMtime) {
      best = name;
      bestMtime = mtime;
    }
  }
  return best;
}

const jsName = findAsset(/^app-.*\.js$/i);
const cssName = findAsset(/^app-.*\.css$/i);
if (!jsName || !cssName) {
  console.error("build-shell: не найдены assets/app-*.js и app-*.css (сначала запустите vite build)");
  process.exit(1);
}

const builtHtml = readFileSync(path.join(root, "index.html"), "utf8");
const titleMatch = builtHtml.match(/<title>([^<]*)<\/title>/);
const title = titleMatch ? titleMatch[1] : "Logus Nova";

// Ветка для ссылок jsDelivr: gh/<repo>@<branch>. По умолчанию — текущая ветка
// git, иначе MIRROR_BRANCH, иначе main. В эталоне ветка жёстко main.
function detectBranch() {
  if (process.env.MIRROR_BRANCH) return process.env.MIRROR_BRANCH;
  try {
    const b = execSync("git symbolic-ref --short HEAD", { cwd: root, encoding: "utf8" }).trim();
    if (b) return b;
  } catch (e) {}
  return "main";
}

// owner/repo из git-remotes (или MIRROR_REPO). Пусто — зеркал не будет,
// загрузчик молча уйдёт на остальные источники.
function detectRepo() {
  if (process.env.MIRROR_REPO) return process.env.MIRROR_REPO;
  try {
    const remote = execSync("git remote get-url origin", { cwd: root, encoding: "utf8" }).trim();
    const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remote);
    if (m) return m[1] + "/" + m[2];
  } catch (e) {}
  return "";
}

// Режим раздачи бандла: mirror (CDN-зеркало, хостинг вне РФ) | origin (сам
// хостинг, сервер в РФ) | auto. Значение по умолчанию — mirror; переопределяется
// переменной окружения SERVE_MODE. На сервере готовый shell-config.js правится
// вручную (см. docs/DEPLOYMENT.md, скрипт serving-mode).
const serveMode = (process.env.SERVE_MODE || "mirror").toLowerCase();
const mode = ["mirror", "origin", "auto"].indexOf(serveMode) === -1 ? "mirror" : serveMode;

const branch = detectBranch();
const repo = detectRepo();
function mirrorUrls(file) {
  if (!repo) return [];
  return [
    `https://cdn.jsdelivr.net/gh/${repo}@${branch}/assets/${file}`,
    `https://fastly.jsdelivr.net/gh/${repo}@${branch}/assets/${file}`,
  ];
}
const jsMirrors = mirrorUrls(jsName);
const cssMirrors = mirrorUrls(cssName);

const runtime = readFileSync(path.join(webDir, "shell-runtime.js"), "utf8");

const hasApi = existsSync(path.join(root, "api.php"));
const assetEndpoint = hasApi ? "./api.php?action=asset" : "";
const diagEndpoint = hasApi ? "./api.php?action=diag" : "";

const configInline = `window.__LOGUS_SHELL_CONFIG__ = {
  version: "0.1.0",
  mode: ${JSON.stringify(mode)},
  js: "./assets/${jsName}",
  css: "./assets/${cssName}",
  asset: ${JSON.stringify(assetEndpoint)},
  diag: ${JSON.stringify(diagEndpoint)},
  timeoutMs: 8000,
  primaryTimeoutMs: 6000,
  fallbackGraceMs: 4000,
  postInjectTimeoutMs: 4000,
  readyWatchdogMs: 20000,
  earlyFallbackMs: 1500,
  rangeChunkBytes: 8192,
  rangePool: 4,
  rangeTimeoutMs: 1500,
  rangeRetries: 6,
  rangeRetryDelayMs: 120,
  rangeHedgeMs: 500,
  mirrorTimeoutMs: 5000
};`;

const icons = {
  svg: existsSync(path.join(root, "icon.svg")),
  ico: existsSync(path.join(root, "favicon.ico")),
  apple: existsSync(path.join(root, "apple-touch-icon.png")),
  manifest: existsSync(path.join(root, "site.webmanifest")),
};
const iconLinks = [
  icons.svg ? `    <link rel="icon" type="image/svg+xml" href="./icon.svg" />` : "",
  icons.ico ? `    <link rel="icon" href="./favicon.ico" sizes="any" />` : "",
  icons.apple ? `    <link rel="apple-touch-icon" href="./apple-touch-icon.png" />` : "",
  icons.manifest ? `    <link rel="manifest" href="./site.webmanifest" />` : "",
]
  .filter(Boolean)
  .join("\n");

const shellHtml = `<!doctype html>
<html lang="ru" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${title}</title>
${iconLinks}
    <meta name="theme-color" content="#0f1115" />
    <style>
      html, body { margin: 0; height: 100%; }
      body { background: #0f1115; }
      body.shell-busy, body.shell-busy * { cursor: progress !important; }
      .is-hidden { opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }

      #shell-overlay {
        position: fixed; inset: 0; z-index: 9990; display: grid; place-items: center;
        background: #0f1115; transition: opacity .35s ease, visibility .35s ease;
      }
      #shell-overlay .shell-spin {
        width: 44px; height: 44px; border-radius: 50%;
        border: 4px solid rgba(76, 139, 245, 0.25); border-top-color: #4c8bf5;
        animation: shellspin .7s linear infinite;
      }
      @keyframes shellspin { to { transform: rotate(360deg); } }

      .shell-loader { display: flex; flex-direction: column; align-items: center; gap: 14px; }
      .shell-loader__map { width: 280px; height: 130px; overflow: visible; }
      .shell-loader__line { stroke: rgba(154, 163, 178, 0.18); stroke-width: 2; fill: none; }
      .shell-loader__line--active { stroke: #4c8bf5; stroke-width: 2.5; stroke-dasharray: 6 4; animation: dash 1.2s linear infinite; }
      @keyframes dash { to { stroke-dashoffset: -20; } }
      .shell-loader__station { fill: rgba(154, 163, 178, 0.35); }
      .shell-loader__station--active { fill: #4c8bf5; animation: pulse 1.6s ease-in-out infinite; }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      .shell-loader__dot { fill: #4c8bf5; filter: drop-shadow(0 0 6px rgba(76, 139, 245, 0.6)); animation: dotmove 3s ease-in-out infinite; }
      @keyframes dotmove {
        0% { transform: translate(0, 0); }
        25% { transform: translate(60px, -20px); }
        50% { transform: translate(120px, 10px); }
        75% { transform: translate(180px, -15px); }
        100% { transform: translate(240px, 0); }
      }
      .shell-loader__label {
        font: 500 13px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        color: #9aa3b2; letter-spacing: 0.02em; min-height: 18px;
        transition: opacity 0.4s ease, transform 0.4s ease;
      }
      .shell-loader__label.is-fading { opacity: 0; transform: translateY(4px); }

      #shell-log {
        position: fixed; left: 50%; bottom: 20px; z-index: 10002;
        width: min(680px, calc(100vw - 32px)); max-height: 42vh; overflow: auto;
        transform: translateX(-50%);
        background: rgba(8, 10, 14, 0.94); border: 1px solid #2a2f3a; border-radius: 12px;
        padding: 12px 14px; text-align: left; color: #c7cdd8;
        font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        transition: opacity .3s ease, visibility .3s ease, transform .3s ease;
      }
      #shell-log.is-hidden { transform: translateX(-50%) translateY(8px); }
      .shell-log__line { white-space: pre-wrap; word-break: break-word; }
      .shell-log__line--info { color: #9aa3b2; }
      .shell-log__line--ok { color: #4ade80; }
      .shell-log__line--warn { color: #fbbf24; }
      .shell-log__line--error { color: #f87171; }
      .shell-log__line--net { color: #60a5fa; }

      #shell-log-toggle {
        position: fixed; right: 14px; bottom: 14px; z-index: 10003;
        padding: 6px 12px; border-radius: 999px; border: 1px solid #2a2f3a;
        background: #181b22; color: #9aa3b2; font: 12px system-ui, sans-serif;
        cursor: pointer; opacity: .55; transition: opacity .2s ease;
      }
      #shell-log-toggle:hover { opacity: 1; }

      #shell-fallback {
        position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center;
        padding: 24px; background: #0f1115; color: #e7e9ee;
        font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; text-align: center;
        transition: opacity .3s ease, visibility .3s ease;
      }
      #shell-fallback .card { max-width: 480px; }
      #shell-fallback code { color: #9aa3b2; word-break: break-word; }
      #shell-fallback .shell-btn {
        font: inherit; color: #fff; background: #2f6ae0; border: none; border-radius: 10px;
        padding: 10px 18px; cursor: pointer;
      }
      [hidden] { display: none !important; }
    </style>
    <link id="shell-css" rel="stylesheet" href="./assets/${cssName}" />
    <script>${configInline}</script>
    <script>window.__LOGUS_SHELL_EARLY_ERRORS__=[];window.addEventListener("error",function(e){var a=window.__LOGUS_SHELL_EARLY_ERRORS__;if(a&&a.length<50)a.push(e);},true);</script>
  </head>
  <body class="shell-busy">
    <div id="root"></div>
    <div id="shell-overlay" aria-hidden="true">
      <div class="shell-loader" role="status" aria-live="polite">
        <svg class="shell-loader__map" viewBox="0 0 280 130" aria-hidden="true">
          <g class="shell-loader__lines">
            <path class="shell-loader__line" d="M 10 110 H 270" />
            <path class="shell-loader__line" d="M 10 65 H 270" />
            <path class="shell-loader__line" d="M 10 20 H 270" />
            <path class="shell-loader__line" d="M 50 10 V 120" />
            <path class="shell-loader__line" d="M 140 10 V 120" />
            <path class="shell-loader__line" d="M 230 10 V 120" />
            <path class="shell-loader__line" d="M 10 110 L 270 20" />
            <path class="shell-loader__line" d="M 10 20 L 270 110" />
          </g>
          <g class="shell-loader__stations">
            <circle class="shell-loader__station" cx="50" cy="110" r="3" />
            <circle class="shell-loader__station" cx="140" cy="65" r="3" />
            <circle class="shell-loader__station" cx="230" cy="20" r="3" />
            <circle class="shell-loader__station" cx="50" cy="65" r="3" />
            <circle class="shell-loader__station" cx="140" cy="20" r="3" />
            <circle class="shell-loader__station" cx="230" cy="110" r="3" />
            <circle class="shell-loader__station" cx="95" cy="87" r="3" />
            <circle class="shell-loader__station" cx="185" cy="42" r="3" />
          </g>
          <circle class="shell-loader__dot" r="5" cx="140" cy="65" />
        </svg>
        <div class="shell-loader__label" id="shell-loader-label">Загружаем заказы</div>
      </div>
    </div>
    <div id="shell-log" role="log" aria-live="polite"></div>
    <button id="shell-log-toggle" class="is-hidden" type="button" aria-pressed="false">лог</button>
    <div id="shell-fallback" class="is-hidden">
      <div class="card">
        <p>Интерфейс не удалось загрузить ни из локальной копии, ни из CDN-зеркал.</p>
        <p><code id="shell-fallback-detail"></code></p>
        <p><button class="shell-btn" type="button" onclick="var L=window.__LOGUS_LOADER__;if(L&&L.restart){L.restart();}else{location.reload();}">Повторить</button></p>
      </div>
    </div>
    <noscript>Для работы интерфейса нужен включённый JavaScript.</noscript>
    <script src="./shell-config.js"></script>
    <script>${runtime}</script>
  </body>
</html>
`;

writeFileSync(path.join(root, "index.html"), shellHtml);

// shell-config.js: подставляем зеркала в шаблон и кладём рядом с index.html.
const templatePath = path.join(webDir, "shell-config.js");
const template = readFileSync(templatePath, "utf8");
const shellConfig = template
  .replace("%%SERVE_MODE%%", JSON.stringify(mode))
  .replace("%%JS_MIRRORS%%", JSON.stringify(jsMirrors, null, 2))
  .replace("%%CSS_MIRRORS%%", JSON.stringify(cssMirrors, null, 2));
writeFileSync(path.join(root, "shell-config.js"), shellConfig);

let removed = 0;
try {
  const keep = new Set([jsName, cssName, `${jsName}.map`, `${cssName}.map`]);
  for (const name of readdirSync(assetsDir)) {
    if (!keep.has(name)) {
      unlinkSync(path.join(assetsDir, name));
      removed++;
    }
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

console.log(`build-shell: собран index.html + shell-config.js (${jsName}, ${cssName}, режим: ${mode}${removed ? `, удалено ассетов: ${removed}` : ""})`);
console.log(`build-shell: зеркала ${repo ? `→ ${repo}@${branch}` : "не найдены (нет github remote)"}`);
