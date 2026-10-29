import { emptyWorkspace, type Workspace } from "./model";
import { migrate, validateWorkspace } from "./validate";
export class ConflictError extends Error {
  constructor() {
    super(
      "另一個分頁已更新帳本。請備份未存內容並重新載入 / Another tab saved changes. Reload before saving.",
    );
  }
}
export class Repository {
  constructor(private db: IDBDatabase) {}
  static open(name = "fold-ledger"): Promise<Repository> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("snapshots");
      req.onerror = () => reject(req.error);
      req.onblocked = () =>
        reject(new Error("請關閉其他舊版分頁 / Close older tabs"));
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(new Repository(db));
      };
    });
  }
  async raw(key = "current"): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("snapshots", "readonly"),
        req = tx.objectStore("snapshots").get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async load(): Promise<Workspace> {
    const raw = await this.raw();
    return raw === undefined ? emptyWorkspace() : migrate(raw);
  }
  async save(
    next: Workspace,
    expected: number,
    keepPrevious = false,
  ): Promise<Workspace> {
    const clean = validateWorkspace(next);
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("snapshots", "readwrite"),
        store = tx.objectStore("snapshots");
      let error: unknown;
      const request = store.get("current");
      request.onsuccess = () => {
        try {
          const current =
            request.result === undefined
              ? emptyWorkspace()
              : migrate(request.result);
          if (current.revision !== expected) throw new ConflictError();
          clean.revision = expected + 1;
          if (keepPrevious) store.put(current, "previous");
          store.put(clean, "current");
        } catch (e) {
          error = e;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(clean);
      tx.onabort = () =>
        reject(error || tx.error || new Error("儲存失敗 / Save failed"));
      tx.onerror = () => {
        error ??= tx.error;
      };
    });
  }
  async recover(): Promise<Workspace> {
    // Explicit user-triggered reset preserves the raw invalid snapshot for export.
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("snapshots", "readwrite"),
        s = tx.objectStore("snapshots"),
        r = s.get("current"),
        fresh = emptyWorkspace();
      r.onsuccess = () => {
        if (r.result !== undefined) s.put(r.result, "corrupt");
        s.put(fresh, "current");
      };
      tx.oncomplete = () => resolve(fresh);
      tx.onabort = () => reject(tx.error);
    });
  }
  close() {
    this.db.close();
  }
}
