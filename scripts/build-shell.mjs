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

      .shell-loader { display: flex; flex-direction: column; align-items: center; gap: 16px; perspective: 900px; }
      .shell-loader__map {
        width: 300px; height: 170px; overflow: visible;
        transform: rotateX(48deg) rotateZ(-6deg);
        transform-style: preserve-3d;
        border-radius: 12px;
        background: #1a1d24;
        box-shadow: 0 18px 40px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.06);
      }
      .shell-loader__roads { stroke: #2a2f3a; stroke-width: 5; fill: none; stroke-linecap: round; stroke-linejoin: round; }
      .shell-loader__roads--minor { stroke: #23272f; stroke-width: 3.5; }
      .shell-loader__highway { stroke: #3a4050; stroke-width: 7; fill: none; stroke-linecap: round; }
      .shell-loader__highway-line { stroke: rgba(255,255,255,.08); stroke-width: 1; fill: none; stroke-dasharray: 4 5; }
      .shell-loader__block { fill: #22262e; }
      .shell-loader__block--alt { fill: #252a33; }
      .shell-loader__park { fill: #1e2229; }
      .shell-loader__park--alt { fill: #20242c; }
      .shell-loader__route {
        fill: none;
        stroke-linecap: round; stroke-linejoin: round;
        filter: drop-shadow(0 2px 4px rgba(231,233,238,.3));
      }
      .shell-loader__route--seg1 { stroke: #e7e9ee; animation: route-draw 9s ease-in-out infinite; }
      .shell-loader__route--seg2 { stroke: #d8dce2; animation: route-draw 9s ease-in-out infinite 3s; }
      .shell-loader__route--seg3 { stroke: #dee1e8; animation: route-draw 9s ease-in-out infinite 6s; }
      @keyframes route-draw {
        0% { stroke-dashoffset: 300; opacity: 0; }
        6% { opacity: 1; }
        22% { stroke-dashoffset: 0; opacity: 1; }
        34% { stroke-dashoffset: 0; opacity: 1; }
        44% { opacity: 0; }
        100% { stroke-dashoffset: 300; opacity: 0; }
      }
      .shell-loader__marker {
        transform-box: fill-box;
        transform-origin: center bottom;
        opacity: 0;
        transform: translate(var(--mx, 0), var(--my, 0)) translateZ(28px);
      }
      .shell-loader__marker--seg1-start { --mx: 35px; --my: 55px; animation: marker-seg1 9s ease-in-out infinite; }
      .shell-loader__marker--seg1-end { --mx: 280px; --my: 115px; animation: marker-seg1 9s ease-in-out infinite; }
      .shell-loader__marker--seg2-start { --mx: 280px; --my: 30px; animation: marker-seg2 9s ease-in-out infinite 3s; }
      .shell-loader__marker--seg2-end { --mx: 45px; --my: 90px; animation: marker-seg2 9s ease-in-out infinite 3s; }
      .shell-loader__marker--seg3-start { --mx: 45px; --my: 145px; animation: marker-seg3 9s ease-in-out infinite 6s; }
      .shell-loader__marker--seg3-end { --mx: 235px; --my: 5px; animation: marker-seg3 9s ease-in-out infinite 6s; }
      @keyframes marker-seg1 {
        0%, 4%, 44%, 100% { opacity: 0; }
        6%, 40% { opacity: 1; }
      }
      @keyframes marker-seg2 {
        0%, 34%, 74%, 100% { opacity: 0; }
        36%, 70% { opacity: 1; }
      }
      @keyframes marker-seg3 {
        0%, 64%, 94%, 100% { opacity: 0; }
        66%, 90% { opacity: 1; }
      }
      .shell-loader__dot {
        fill: #fff; stroke: #e7e9ee; stroke-width: 2;
        filter: drop-shadow(0 2px 3px rgba(0,0,0,.5));
        animation: dot-travel 9s ease-in-out infinite;
      }
      @keyframes dot-travel {
        0% { offset-distance: 0%; opacity: 0; }
        6% { opacity: 1; }
        22% { offset-distance: 100%; opacity: 1; }
        34% { offset-distance: 100%; opacity: 1; }
        44% { offset-distance: 0%; opacity: 0; }
        100% { offset-distance: 0%; opacity: 0; }
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
        <svg class="shell-loader__map" viewBox="-20 -20 360 210" aria-hidden="true">
          <g class="shell-loader__blocks">
            <rect class="shell-loader__block" x="20" y="20" width="60" height="35" rx="3" />
            <rect class="shell-loader__block--alt" x="100" y="20" width="50" height="35" rx="3" />
            <rect class="shell-loader__block" x="170" y="20" width="55" height="35" rx="3" />
            <rect class="shell-loader__block--alt" x="245" y="20" width="55" height="35" rx="3" />
            <rect class="shell-loader__block--alt" x="20" y="80" width="45" height="40" rx="3" />
            <rect class="shell-loader__block" x="100" y="80" width="60" height="40" rx="3" />
            <rect class="shell-loader__block--alt" x="180" y="80" width="45" height="40" rx="3" />
            <rect class="shell-loader__block" x="245" y="80" width="55" height="40" rx="3" />
            <rect class="shell-loader__block" x="20" y="140" width="55" height="25" rx="3" />
            <rect class="shell-loader__block--alt" x="100" y="140" width="45" height="25" rx="3" />
            <rect class="shell-loader__block" x="170" y="140" width="60" height="25" rx="3" />
            <rect class="shell-loader__block--alt" x="250" y="140" width="50" height="25" rx="3" />
          </g>
          <g class="shell-loader__parks">
            <rect class="shell-loader__park" x="170" y="70" width="50" height="55" rx="4" />
            <rect class="shell-loader__park--alt" x="90" y="130" width="70" height="35" rx="4" />
          </g>
          <g class="shell-loader__roads">
            <path class="shell-loader__roads" d="M 0 70 H 320" />
            <path class="shell-loader__roads" d="M 0 130 H 320" />
            <path class="shell-loader__roads" d="M 90 0 V 170" />
            <path class="shell-loader__roads" d="M 235 0 V 170" />
            <path class="shell-loader__roads--minor" d="M 165 0 V 170" />
            <path class="shell-loader__roads--minor" d="M 0 105 H 320" />
            <path class="shell-loader__roads--minor" d="M 45 0 V 170" />
            <path class="shell-loader__roads--minor" d="M 280 0 V 170" />
          </g>
          <g class="shell-loader__highways">
            <path class="shell-loader__highway" d="M 0 45 H 320" />
            <path class="shell-loader__highway-line" d="M 0 45 H 320" />
            <path class="shell-loader__highway" d="M 160 0 V 170" />
            <path class="shell-loader__highway-line" d="M 160 0 V 170" />
          </g>
          <g class="shell-loader__routes">
            <path class="shell-loader__route shell-loader__route--seg1" d="M 35 70 H 165 V 130 H 280" pathLength="300" />
            <path class="shell-loader__route shell-loader__route--seg2" d="M 280 45 H 160 V 105 H 45" pathLength="300" />
            <path class="shell-loader__route shell-loader__route--seg3" d="M 45 130 V 70 H 90 V 20 H 235" pathLength="300" />
          </g>
          <circle class="shell-loader__dot" r="5" cx="0" cy="0" style="offset-path: path('M 35 70 H 165 V 130 H 280');" />
          <g class="shell-loader__marker shell-loader__marker--seg1-start">
            <path d="M 0 0 C -8 -8, -8 -20, 0 -22 C 8 -20, 8 -8, 0 0 Z" fill="#e74c3c" />
            <circle cx="0" cy="-12" r="3.5" fill="#fff" />
          </g>
          <g class="shell-loader__marker shell-loader__marker--seg1-end">
            <path d="M 0 0 C -8 -8, -8 -20, 0 -22 C 8 -20, 8 -8, 0 0 Z" fill="#e74c3c" />
            <circle cx="0" cy="-12" r="3.5" fill="#fff" />
          </g>
          <g class="shell-loader__marker shell-loader__marker--seg2-start">
            <path d="M 0 0 C -8 -8, -8 -20, 0 -22 C 8 -20, 8 -8, 0 0 Z" fill="#e74c3c" />
            <circle cx="0" cy="-12" r="3.5" fill="#fff" />
          </g>
          <g class="shell-loader__marker shell-loader__marker--seg2-end">
            <path d="M 0 0 C -8 -8, -8 -20, 0 -22 C 8 -20, 8 -8, 0 0 Z" fill="#e74c3c" />
            <circle cx="0" cy="-12" r="3.5" fill="#fff" />
          </g>
          <g class="shell-loader__marker shell-loader__marker--seg3-start">
            <path d="M 0 0 C -8 -8, -8 -20, 0 -22 C 8 -20, 8 -8, 0 0 Z" fill="#e74c3c" />
            <circle cx="0" cy="-12" r="3.5" fill="#fff" />
          </g>
          <g class="shell-loader__marker shell-loader__marker--seg3-end">
            <path d="M 0 0 C -8 -8, -8 -20, 0 -22 C 8 -20, 8 -8, 0 0 Z" fill="#e74c3c" />
            <circle cx="0" cy="-12" r="3.5" fill="#fff" />
          </g>
        </svg>
        <div class="shell-loader__label" id="shell-loader-label">Строим маршрут</div>
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
