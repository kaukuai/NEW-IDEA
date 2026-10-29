import { it, expect } from "vitest";
// Server has no dependency on the application domain or a database.
it("serves only static built assets with security headers; rejects writes and source requests", async () => {
  // @ts-expect-error plain Node static server
  const { createServer } = await import("../server.mjs");
  const s = createServer();
  await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${s.address().port}`;
  try {
    const h = await fetch(base + "/health");
    expect(await h.json()).toEqual({
      status: "ok",
      app: "fold",
      version: "1.0.0",
    });
    const root = await fetch(base);
    expect(root.headers.get("content-security-policy")).toContain(
      "script-src 'self'",
    );
    expect(root.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await root.text()).includes("合帳 Fold")).toBe(true);
    for (const route of [
      "/src/model.ts",
      "/.git/config",
      "/package.json",
      "/offcut/",
      "/relay/",
    ])
      expect((await fetch(base + route)).status).toBe(404);
    expect(
      (await fetch(base, { method: "POST", body: "private" })).status,
    ).toBe(405);
    const head = await fetch(base + "/index.html", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  } finally {
    await new Promise<void>((resolve) => s.close(resolve));
  }
});
