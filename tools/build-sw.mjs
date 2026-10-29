import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
// Keep required third-party copyright/permission notices with the distributable.
const escapeHtml = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const notices = [];
for (const name of ["react", "react-dom", "scheduler", "vite"]) {
  try {
    const pkg = JSON.parse(
      await readFile(`node_modules/${name}/package.json`, "utf8"),
    );
    let license = "";
    try {
      license = await readFile(
        `node_modules/${name}/${name === "vite" ? "LICENSE.md" : "LICENSE"}`,
        "utf8",
      );
    } catch {
      license = "MIT License";
    }
    // Only Vite's emitted runtime helper is shipped, not its build-time dependencies.
    if (name === "vite")
      license = license.split("# Licenses of bundled dependencies")[0];
    notices.push(
      `<section><h2>${escapeHtml(name)} ${escapeHtml(pkg.version || "1.0.0")}${name === "vite" ? " (build-generated helper)" : ""}</h2>${license
        .trim()
        .split(/\n\s*\n/)
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join("\n")}</section>`,
    );
  } catch {
    // Graceful skip if package is pruned
  }
}
await writeFile(
  "dist/LICENSES.html",
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./guide.css"><title>Third-party notices | Fold</title></head><body><header><a class="brand" href="./">合帳 Fold</a></header><main><h1>Third-party notices</h1><p>The following copyright and permission notices accompany bundled libraries and generated helpers. Vite is a build-time tool; no Vite server is required to run Fold.</p>${notices.join("\n")}</main></body></html>`,
);
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "_headers" || e.name === "sw.js")
      continue;
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}
const files = (await walk("dist")).sort();
const hash = createHash("sha256");
for (const f of files) hash.update(await readFile(f));
const version = hash.digest("hex").slice(0, 16);
const source = `/* Fold deterministic static shell. Generated from file contents. */
const CACHE='fold-shell-${version}';
const FILES=${JSON.stringify(files.map((f) => "./" + f.slice(5)))};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    // The HTML and its hashed assets always come from the same installed release.
    if(!url.pathname.startsWith(new URL('./',self.location).pathname))return;
    const scope=new URL('./',self.location).pathname;
    const key=url.pathname===scope||url.pathname===scope+'index.html'?'./index.html':event.request;
    event.respondWith(caches.open(CACHE).then(cache=>cache.match(key,{ignoreSearch:true})).then(hit=>hit||fetch(event.request)));return;
  }
  // Keep older release caches so tabs loaded before activation retain their assets.
  event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request)).then(async hit=>hit||await caches.match(event.request)||fetch(event.request)));
});
`;
await writeFile("dist/sw.js", source);
console.log(`Offline shell ${version}: ${files.length} files`);
