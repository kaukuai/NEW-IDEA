import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("./dist/", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};
export function createServer() {
  return http.createServer(async (req, res) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    res.setHeader("Cache-Control", "no-cache");
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end();
      return;
    }
    let name;
    try {
      name = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (name === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        req.method === "HEAD"
          ? undefined
          : JSON.stringify({ status: "ok", app: "fold", version: "1.0.0" }),
      );
      return;
    }
    if (name === "/" || name === "/index.html") name = "/index.html";
    const local = path.resolve(root, "." + name);
    if (
      !local.startsWith(root) ||
      name.split("/").some((s) => s.startsWith(".")) ||
      !types[path.extname(local)]
    ) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    try {
      if (!(await stat(local)).isFile()) throw new Error("not a file");
      const file = await readFile(local);
      res.writeHead(200, { "Content-Type": types[path.extname(local)] });
      res.end(req.method === "HEAD" ? undefined : file);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const s = createServer();
  s.listen(
    Number(process.env.PORT || 3000),
    process.env.HOST || "127.0.0.1",
    () => console.log(`Fold static verification server: ${s.address().port}`),
  );
  for (const sig of ["SIGINT", "SIGTERM"])
    process.on(sig, () => s.close(() => process.exit(0)));
}
