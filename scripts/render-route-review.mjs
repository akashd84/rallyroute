import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const output = path.resolve(process.env.ROUTE_REVIEW_DIR ?? "docs/route-review/2026-10-07");
const manifest = JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8"));
async function pages(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? pages(path.join(directory, entry.name))
    : entry.name === "page.tsx" ? [path.join(directory, entry.name)] : []));
  return nested.flat();
}
const routes = await Promise.all((await pages("src/app")).sort().map(async source => {
  const segments = path.relative("src/app", path.dirname(source)).split(path.sep).filter(segment => segment && !segment.startsWith("("));
  return { route: "/" + segments.join("/"), source, placeholder: (await readFile(source, "utf8")).includes("PlaceholderPage"),
    appShell: source.includes("/(app)/"), auth: ["/sign-in", "/join", "/group-invitations/open", "/household-invitations/open"].includes("/" + segments.join("/")) ? "public or conditional" : "authenticated" };
}));
const normalize = route => route.replace(/\[[^/]+?\]|:[^/]+/g, ":parameter");
const missing = routes.filter(route => !manifest.captures.some(capture => normalize(capture.pattern) === normalize(route.route)));
if (missing.length) throw new Error("Missing screenshots: " + missing.map(route => route.route).join(", "));
await writeFile(path.join(output, "routes.json"), JSON.stringify(routes, null, 2) + "\n");
const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const tree = (await readFile(path.join(output, "navigation.md"), "utf8")).match(/```text\n([\s\S]*?)```/)?.[1] ?? "";
const cards = manifest.captures.map(capture => {
  const width = capture.viewport?.width ?? 390;
  const overflow = capture.contentWidth > width;
  return `<article data-search="${escape(`${capture.label} ${capture.pattern} ${capture.state}`.toLowerCase())}" data-overflow="${overflow}">
    <h2>${escape(capture.label)}</h2><code>${escape(capture.pattern)}</code><p>${escape(capture.state)}</p>
    <p>${width} × ${capture.viewport?.height ?? 844} · ${capture.shell ? "App shell" : "Standalone"}${overflow ? ` · <strong>Layout expands to ${capture.contentWidth}px</strong>` : ""}</p>
    <a href="${escape(capture.screenshot)}"><img loading="lazy" width="${width}" height="${capture.viewport?.height ?? 844}" src="${escape(capture.screenshot)}" alt="${escape(`${capture.label}: ${capture.state}, ${width}px mobile viewport`)}"></a>
    <p><a href="${escape(capture.screenshot)}">Viewport PNG</a>${capture.fullScreenshot ? ` · <a href="${escape(capture.fullScreenshot)}">Full page PNG</a>` : ""}</p>
    <details><summary>URL and capture details</summary><code>${escape(capture.finalUrl)}</code><p>HTTP ${capture.status ?? "same-page state"}; layout ${capture.width} × ${capture.height}; content ${capture.contentWidth} × ${capture.contentHeight}</p><p>Header household: ${escape(capture.headerHousehold)}</p></details>
  </article>`;
}).join("\n");
await writeFile(path.join(output, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>RallyRoute mobile route review</title>
<style>body{margin:0;background:#f1f5f9;color:#0f172a;font:16px/1.5 system-ui,sans-serif}header,main{max-width:1440px;margin:auto;padding:24px}h1{margin:0}a{color:#00665f}code{overflow-wrap:anywhere;font-size:13px}pre{overflow:auto;background:white;padding:20px;border-radius:12px;font-size:13px}label{display:block;margin:12px 0}input[type=search]{display:block;box-sizing:border-box;width:100%;max-width:600px;padding:12px;font:inherit;border:1px solid #64748b;border-radius:8px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:24px}article{padding:16px;background:white;border:1px solid #cbd5e1;border-radius:12px;min-width:0}article[hidden]{display:none}article h2{font-size:20px;margin:0 0 8px}article img{display:block;width:100%;height:auto;max-height:650px;object-fit:contain;object-position:top;background:#f8fafc;border:1px solid #cbd5e1}article strong{color:#9f1239}details{margin:12px 0}summary{cursor:pointer;min-height:44px}a:focus-visible,input:focus-visible{outline:3px solid #0f766e;outline-offset:3px}.note{padding:16px;background:#fff7ed;border-left:4px solid #c2410c}</style></head>
<body><header><h1>RallyRoute mobile route review</h1><p>${routes.length} routes · ${manifest.captures.length} captured states · ${escape(manifest.generatedAt)}</p>
<p><a href="navigation.md">Navigation tree and findings</a> · <a href="manifest.json">Capture metadata</a> · <a href="routes.json">Source route inventory</a> · <a href="screenshots/">Screenshot folder</a></p>
<p class="note">Synthetic data, not live household records. Household navigation clips at mobile widths; the header selection can differ from the URL household. Four bottom tabs are placeholders. The full review explains these findings.</p>
<details><summary>Expand complete navigation tree</summary><pre>${escape(tree)}</pre></details>
<label for="search">Filter screenshots by route, screen or state<input id="search" type="search" placeholder="Try household, calendar, settings, Member…"></label>
<label><input id="overflow" type="checkbox"> Show mobile overflow captures only</label><p id="count" role="status">${manifest.captures.length} screenshots</p></header>
<main><div class="grid">${cards}</div></main>
<script>const search=document.querySelector('#search'),overflow=document.querySelector('#overflow'),cards=[...document.querySelectorAll('article')];function filter(){const query=search.value.toLowerCase();let count=0;for(const card of cards){card.hidden=!card.dataset.search.includes(query)||(overflow.checked&&card.dataset.overflow!=='true');if(!card.hidden)count++}document.querySelector('#count').textContent=count+' screenshots'}search.addEventListener('input',filter);overflow.addEventListener('change',filter);</script></body></html>\n`);
console.log(`Reviewed ${routes.length} routes; ${manifest.captures.length} captured states; gallery: ${path.join(output, "index.html")}`);
