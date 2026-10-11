/*
 * Раннер e2e-тестов (см. docs/DEVELOPMENT.md §11).
 *
 * Поднимает PHP-сервер (с фиксированным режимом мок-площадок на сценарий) и
 * headless Chrome с CDP, прогоняет юнит-тесты shell-загрузчика и браузерные
 * сценарии. Секреты на прогон берутся из tests/secrets/base.php.
 *
 * Использование:
 *   node tests/run.mjs             # все сценарии
 *   node tests/run.mjs base slow   # только указанные
 *   node tests/run.mjs --list      # список сценариев
 */
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const tmpDir = path.join(__dirname, ".tmp");
const secretsPath = path.join(root, "private", "secrets.php");
const chromeProfile = path.join(tmpDir, "chrome-profile");
const cacheDir = path.join(root, "private", "cache");

const PHP_PORT = 8090;
const CDP_PORT = 9222;

const SUITES = [
  { name: "shell", file: "test-shell.cjs", browser: false },
  { name: "base", file: "cdp-test.cjs", browser: true, mode: "normal" },
  { name: "empty", file: "cdp-test.cjs", browser: true, mode: "empty" },
  { name: "error", file: "cdp-test.cjs", browser: true, mode: "error" },
  { name: "slow", file: "cdp-test.cjs", browser: true, mode: "slow" },
  { name: "mobile", file: "cdp-test.cjs", browser: true, mode: "normal" },
];

const args = process.argv.slice(2);
if (args.includes("--list")) {
  console.log(SUITES.map((s) => s.name).join("\n"));
  process.exit(0);
}
const selected = args.length ? SUITES.filter((s) => args.includes(s.name)) : SUITES;
if (selected.length === 0) {
  console.error("Нет сценариев по фильтру:", args.join(", "));
  process.exit(1);
}

let phpChild = null;
let phpMode = null;
let secretsBackup = null;
let hadSecrets = false;

const log = (msg) => console.log(`\n[tests] ${msg}`);

function killPort(port) {
  spawnSync("fuser", ["-k", `${port}/tcp`], { stdio: "ignore" });
}

function findChrome() {
  const candidates = [process.env.CHROME_BIN, "google-chrome-stable", "google-chrome", "chromium", "chromium-browser"].filter(Boolean);
  for (const bin of candidates) {
    const res = spawnSync(bin, ["--version"], { stdio: "ignore" });
    if (!res.error) return bin;
  }
  return null;
}

function startPhp(mode) {
  if (phpChild) {
    try { phpChild.kill("SIGTERM"); } catch {}
    phpChild = null;
  }
  killPort(PHP_PORT);
  const child = spawn("php", ["-S", `127.0.0.1:${PHP_PORT}`, "-t", root], {
    cwd: root,
    stdio: "ignore",
    env: { ...process.env, LOGUS_MOCK_MODE: mode || "normal" },
  });
  phpChild = child;
  return child;
}

function startChrome(bin) {
  const child = spawn(
    bin,
    [
      "--headless=new",
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${chromeProfile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  return child;
}

function stopChrome(child) {
  if (child) {
    try { child.kill("SIGTERM"); } catch {}
  }
  killPort(CDP_PORT);
  rmSync(chromeProfile, { recursive: true, force: true });
}

async function waitFor(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return;
    } catch {
      // ещё поднимается
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Не дождались ${label} (${url})`);
}

function clearCache() {
  let entries;
  try {
    entries = readdirSync(cacheDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    try { rmSync(path.join(cacheDir, entry), { recursive: true, force: true }); } catch {}
  }
}

const results = [];

async function main() {
  mkdirSync(tmpDir, { recursive: true });

  if (existsSync(secretsPath)) {
    secretsBackup = readFileSync(secretsPath);
    hadSecrets = true;
  }
  mkdirSync(path.dirname(secretsPath), { recursive: true });
  copyFileSync(path.join(__dirname, "secrets", "base.php"), secretsPath);

  const bin = findChrome();
  const browserSuites = SUITES.filter((s) => s.browser);
  if (!bin && SUITES.some((s) => s.browser && selected.includes(s))) {
    console.warn("[tests] Chrome/Chromium не найден — браузерные сценарии пропущены");
  }

  console.log("[tests] Гашу порты");
  killPort(PHP_PORT);
  killPort(CDP_PORT);

  for (const suite of selected) {
    if (!suite.browser) {
      console.log(`\n[tests] Сценарий: ${suite.name}`);
      const res = spawnSync(process.execPath, [path.join(__dirname, "e2e", suite.file)], { cwd: root, stdio: "inherit" });
      results.push({ name: suite.name, ok: res.status === 0 });
      continue;
    }

    if (!bin) {
      results.push({ name: suite.name, ok: true, skipped: true });
      continue;
    }

    console.log(`\n[tests] Сценарий: ${suite.name} (mock=${suite.mode})`);
    startPhp(suite.mode);
    await waitFor(`http://127.0.0.1:${PHP_PORT}/api.php?action=session`, 15000, "PHP");
    clearCache();

    stopChrome(chrome);
    chrome = startChrome(bin);
    await waitFor(`http://127.0.0.1:${CDP_PORT}/json/version`, 20000, "CDP");

    const res = spawnSync(process.execPath, [path.join(__dirname, "e2e", suite.file)], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, SCENARIO: suite.name },
    });
    results.push({ name: suite.name, ok: res.status === 0 });
  }

  console.log("\n[tests] Итог");
  for (const r of results) console.log(`  ${r.skipped ? "SKIP" : r.ok ? "OK  " : "FAIL"}  ${r.name}`);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n[tests] ${results.length - failed.length}/${results.length} сценариев пройдено`);
  return failed.length === 0 ? 0 : 1;
}

let chrome = null;
let exitCode = 1;
try {
  exitCode = await main();
} catch (error) {
  console.error("[tests] Ошибка раннера:", error.message);
  exitCode = 1;
} finally {
  if (chrome) stopChrome(chrome);
  if (phpChild) {
    try { phpChild.kill("SIGTERM"); } catch {}
  }
  killPort(PHP_PORT);
  killPort(CDP_PORT);
  if (hadSecrets && secretsBackup !== null) writeFileSync(secretsPath, secretsBackup);
  else if (!hadSecrets) {
    try { rmSync(secretsPath, { force: true }); } catch {}
  }
}
process.exit(exitCode);
