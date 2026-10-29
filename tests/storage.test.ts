import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { Repository, ConflictError } from "../src/storage";
import { emptyWorkspace } from "../src/model";
import { exampleGroup } from "../src/demo";
describe("IndexedDB atomic snapshots", () => {
  it("persists and reopens all values", async () => {
    const name = crypto.randomUUID(),
      r = await Repository.open(name);
    const w = emptyWorkspace();
    w.groups = [exampleGroup()];
    const saved = await r.save(w, 0);
    r.close();
    const next = await Repository.open(name);
    expect(await next.load()).toEqual(saved);
    next.close();
  });
  it("serializes competing writers and refuses stale overwrite", async () => {
    const name = crypto.randomUUID(),
      a = await Repository.open(name),
      b = await Repository.open(name);
    const w = emptyWorkspace();
    w.groups = [exampleGroup()];
    await a.save(w, 0);
    const stale = emptyWorkspace();
    await expect(b.save(stale, 0)).rejects.toBeInstanceOf(ConflictError);
    expect((await b.load()).groups).toHaveLength(1);
    const copy = await a.load();
    const results = await Promise.allSettled([
      a.save(copy, 1),
      b.save(copy, 1),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    a.close();
    b.close();
  });
  it("preserves one previous snapshot before replacement and rejects invalid saves without changing current", async () => {
    const r = await Repository.open(crypto.randomUUID()),
      w = emptyWorkspace();
    w.groups = [exampleGroup()];
    const saved = await r.save(w, 0);
    await r.save(emptyWorkspace(), 1, true);
    expect(await r.raw("previous")).toEqual(saved);
    const bad = { ...emptyWorkspace(), schemaVersion: 9 };
    await expect(r.save(bad as any, 2)).rejects.toThrow();
    expect((await r.load()).revision).toBe(2);
    r.close();
  });
  it("retains corrupted input on explicit recovery", async () => {
    const name = crypto.randomUUID(),
      r = await Repository.open(name);
    const request = indexedDB.open(name);
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("snapshots", "readwrite");
        tx.objectStore("snapshots").put({ broken: true }, "current");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    await expect(r.load()).rejects.toThrow();
    await r.recover();
    expect(await r.raw("corrupt")).toEqual({ broken: true });
    expect((await r.load()).groups).toEqual([]);
    r.close();
  });
});
