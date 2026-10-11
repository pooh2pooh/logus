/*
 * Сборка презентации (reveal.js) в самодостаточную папку presentation/.
 *
 * Исходники: web/src/presentation/{index.html, theme.css}.
 * reveal.js берётся из node_modules — никакого CDN, презентация работает офлайн.
 * PDF для жюри: открыть presentation/index.html и напечатать (?print-pdf).
 */
import { copyFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "web", "src", "presentation");
const outDir = path.join(root, "presentation");
const assetsDir = path.join(outDir, "assets");
const revealDist = path.join(root, "node_modules", "reveal.js", "dist");

if (!existsSync(path.join(revealDist, "reveal.js"))) {
  console.error("build-presentation: не найден reveal.js. Запустите: npm install");
  process.exit(1);
}

rmSync(assetsDir, { recursive: true, force: true });
mkdirSync(assetsDir, { recursive: true });

copyFileSync(path.join(srcDir, "index.html"), path.join(outDir, "index.html"));
copyFileSync(path.join(srcDir, "theme.css"), path.join(assetsDir, "theme.css"));
copyFileSync(path.join(revealDist, "reveal.js"), path.join(assetsDir, "reveal.js"));
copyFileSync(path.join(revealDist, "reveal.css"), path.join(assetsDir, "reveal.css"));

const iconPath = path.join(root, "icon.svg");
if (existsSync(iconPath)) copyFileSync(iconPath, path.join(assetsDir, "icon.svg"));

console.log("build-presentation: собран presentation/index.html (reveal.js, офлайн)");
