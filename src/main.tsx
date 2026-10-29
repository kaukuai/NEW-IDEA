import React, {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  currencies,
  categories,
  emptyWorkspace,
  today,
  uid,
  type Workspace,
  type Group,
  type Expense,
  type Payment,
  type Currency,
  type Mode,
  type Member,
} from "./model";
import { money, minor, major, allocate } from "./money";
import {
  calculateExpense,
  duplicateExpense,
  ledger,
  reflowRounding,
} from "./ledger";
import { verifySolution, type Solution, type Transfer } from "./settle";
import { Repository } from "./storage";
import { parseBackup, MAX_BACKUP_BYTES } from "./validate";
import { parseText } from "./parser";
import {
  download,
  exportBackup,
  ledgerCsv,
  settlementText,
  settlementPng,
} from "./exports";
import { exampleGroup } from "./demo";
import "./styles.css";

type Tab =
  | "home"
  | "expenses"
  | "settlement"
  | "members"
  | "charts"
  | "backup"
  | "settings";
type Modal =
  | { kind: "group" }
  | { kind: "expense"; expense?: Expense }
  | { kind: "text" }
  | { kind: "payment"; transfer?: Transfer; payment?: Payment }
  | {
      kind: "confirm";
      title: string;
      body: string;
      action: () => Promise<void>;
    };
function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    home: (
      <>
        <path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-8h6v8" />
      </>
    ),
    expenses: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 7h6M9 12h6M9 17h3" />
      </>
    ),
    settlement: (
      <>
        <path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4" />
      </>
    ),
    members: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 6" />
      </>
    ),
    charts: (
      <>
        <path d="M4 20V10M12 20V4M20 20v-7" />
      </>
    ),
    backup: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
      </>
    ),
    plus: <path d="M12 4v16M4 12h16" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] || paths.expenses}
    </svg>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactElement;
  hint?: string;
}) {
  const id = React.useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {React.cloneElement(
        children as React.ReactElement<Record<string, unknown>>,
        { id, "aria-describedby": hint ? id + "-hint" : undefined },
      )}
      {hint && <small id={id + "-hint"}>{hint}</small>}
    </div>
  );
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = React.useId();
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog ref={ref} aria-labelledby={id} onCancel={onClose}>
      <div className="dialog-head">
        <h2 id={id}>{title}</h2>
        <button
          className="icon-button"
          aria-label="關閉 Close"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function App() {
  const [repo, setRepo] = useState<Repository>(),
    [ws, setWs] = useState<Workspace>(),
    [loadError, setLoadError] = useState(""),
    [tab, setTab] = useState<Tab>("home"),
    [selected, setSelected] = useState(""),
    [modal, setModal] = useState<Modal>(),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [offlineReady, setOfflineReady] = useState(false),
    [update, setUpdate] = useState<ServiceWorker>(),
    [query, setQuery] = useState(""),
    [categoryFilter, setCategoryFilter] = useState(""),
    [showDeleted, setShowDeleted] = useState(false),
    [visibleCount, setVisibleCount] = useState(100),
    [mode, setMode] = useState<"minimum" | "hub">("minimum"),
    [hub, setHub] = useState(""),
    [solution, setSolution] = useState<Solution>(),
    [solveError, setSolveError] = useState("");
  const worker = useRef<Worker>(null),
    solveRequest = useRef(0);
  const group = ws?.groups.find((g) => g.id === selected);
  const en = ws?.settings.language === "en";
  const t = (zh: string, eng: string) => (en ? eng : zh);
  useEffect(() => {
    let live = true;
    Repository.open()
      .then(async (r) => {
        if (!live) {
          r.close();
          return;
        }
        setRepo(r);
        try {
          const state = await r.load();
          if (live) {
            setWs(state);
            setSelected(
              state.groups.find((g) => !g.archived)?.id ||
                state.groups[0]?.id ||
                "",
            );
          }
        } catch (e) {
          if (live) setLoadError(String(e));
        }
      })
      .catch((e) => setLoadError(String(e)));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!ws) return;
    document.documentElement.lang = en ? "en" : "zh-Hant";
    document.documentElement.dataset.theme = ws.settings.theme;
  }, [ws?.settings, en]);
  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", up);
    };
  }, []);
  useEffect(() => {
    if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then(() => setOfflineReady(true));
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        const check = () => {
          if (reg.waiting && navigator.serviceWorker.controller)
            setUpdate(reg.waiting);
        };
        check();
        reg.addEventListener("updatefound", () =>
          reg.installing?.addEventListener("statechange", check),
        );
      })
      .catch(() => {
        /* Existing installed shell remains usable offline. */
      });
  }, []);
  useEffect(() => {
    const w = new Worker(new URL("./solver.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    return () => w.terminate();
  }, []);
  useEffect(() => {
    setSolution(undefined);
    setSolveError("");
    if (!group) return;
    const rows = ledger(group).rows,
      request = ++solveRequest.current,
      w = worker.current;
    if (!w) return;
    w.onmessage = (event) => {
      if (event.data.request !== solveRequest.current) return;
      if (event.data.error) {
        setSolveError(event.data.error);
        return;
      }
      const sol = event.data.solution as Solution;
      if (!verifySolution(rows, sol.transfers)) {
        setSolveError("Verification failed");
        return;
      }
      setSolution(sol);
    };
    w.onerror = () =>
      setSolveError("計算未完成，請重新載入 / Solver unavailable; reload");
    w.postMessage({ rows, mode, hubId: hub, request });
  }, [group, mode, hub]);
  async function save(next: Workspace, keep = false) {
    if (!repo || !ws) throw new Error("Storage unavailable");
    setBusy(true);
    try {
      const saved = await repo.save(next, ws.revision, keep);
      setWs(saved);
      return saved;
    } finally {
      setBusy(false);
    }
  }
  async function mutate(fn: (draft: Workspace) => void) {
    if (!ws) throw new Error("Not ready");
    const next = structuredClone(ws);
    fn(next);
    return save(next);
  }
  async function changeGroup(fn: (g: Group) => void, allowArchived = false) {
    return mutate((next) => {
      const g = next.groups.find((g) => g.id === selected);
      if (!g) throw new Error("Group missing");
      if (g.archived && !allowArchived)
        throw new Error(t("請先解除封存", "Unarchive first"));
      fn(g);
      reflowRounding(g);
    });
  }
  async function act(action: () => Promise<unknown>, message?: string) {
    try {
      await action();
      setNotice(message || t("已儲存至此裝置", "Saved on this device"));
    } catch (e) {
      setNotice(String(e));
    }
  }
  async function addGroup(g: Group) {
    await mutate((d) => {
      d.groups.push(g);
    });
    setSelected(g.id);
    setTab("expenses");
    window.scrollTo(0, 0);
    setModal(undefined);
    setNotice(t("帳本已建立", "Ledger created"));
  }
  function confirm(title: string, body: string, action: () => Promise<void>) {
    setModal({ kind: "confirm", title, body, action });
  }
  function go(next: Tab) {
    setTab(next);
    setNotice("");
    setQuery("");
    setCategoryFilter("");
    setVisibleCount(100);
    window.scrollTo(0, 0);
  }
  async function restoreFile(file: File) {
    if (file.size > MAX_BACKUP_BYTES)
      throw new Error("備份上限 10 MiB / Backup limit 10 MiB");
    const imported = parseBackup(await file.text());
    confirm(
      t("取代目前所有帳本？", "Replace all current ledgers?"),
      t(
        `檔案有 ${imported.groups.length} 本帳本。這不是多人合併或同步。現有資料會保留一份取代前快照，仍建議先下載備份。`,
        `File contains ${imported.groups.length} ledgers. This replaces, rather than merges. One previous snapshot will be retained; download a backup first.`,
      ),
      async () => {
        const saved = await save(imported, true);
        setSelected(saved?.groups[0]?.id || "");
        setTab("home");
      },
    );
  }
  if (loadError)
    return (
      <main className="recovery">
        <div className="brand">
          合帳 <span>Fold</span>
        </div>
        <h1>無法讀取本機帳本</h1>
        <p role="alert">{loadError}</p>
        {notice && <p role="status">{notice}</p>}
        <p>
          資料尚未覆寫。請先下載原始資料，再決定是否重設。Storage unavailable or
          invalid. Export before resetting.
        </p>
        <div className="actions">
          <button
            disabled={!repo}
            onClick={() =>
              act(async () =>
                download(
                  JSON.stringify(await repo?.raw(), null, 2),
                  "fold-recovery.json",
                  "application/json",
                ),
              )
            }
          >
            下載原始資料 Export raw
          </button>
          <button onClick={() => location.reload()}>重新載入 Reload</button>
          {repo && (
            <button
              className="danger"
              onClick={() => {
                if (
                  window.confirm(
                    "保留原始資料後重設？ Reset after preserving raw data?",
                  )
                )
                  act(async () => {
                    const fresh = await repo.recover();
                    setWs(fresh);
                    setLoadError("");
                  });
              }}
            >
              重設此工具 Reset
            </button>
          )}
        </div>
      </main>
    );
  if (!ws)
    return (
      <main className="recovery">
        <h1>合帳 Fold</h1>
        <p role="status">正在開啟你的本機帳本 / Opening local ledgers…</p>
      </main>
    );
  const totals = group ? ledger(group) : undefined,
    active = group?.expenses.filter((e) => !e.deleted) || [];
  const titles: Record<Tab, [string, string]> = {
    home: ["一起花，各自清楚。", "Shared moments. Clear balances."],
    expenses: ["每一筆，都有交代。", "Every expense, accounted for."],
    settlement: ["算清楚，好好散場。", "Settle up, stay close."],
    members: ["一起的人", "The people"],
    charts: ["旅程裡的每一份", "Your spending, in perspective"],
    backup: ["資料在你手上", "Your data, in your hands"],
    settings: ["照你的習慣", "Make it yours"],
  };
  const name = (id: string) =>
    group?.members.find((m) => m.id === id)?.name || id;
  const filteredExpenses =
    group?.expenses.filter(
      (e) =>
        (showDeleted || !e.deleted) &&
        (!categoryFilter || e.category === categoryFilter) &&
        [e.title, e.note, ...e.payers.map((p) => name(p.memberId))]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    ) || [];
  const needsGroup = ["expenses", "settlement", "members", "charts"].includes(
    tab,
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => go("home")}>
          <span className="brand-mark">≋</span>合帳 <span>Fold</span>
        </button>
        <p className="brand-caption">
          {t("一起的花費，剛剛好的分配", "Shared fairly. Kept simply.")}
        </p>
        <nav aria-label={t("主選單", "Main navigation")}>
          {(
            ["home", "expenses", "settlement", "members", "charts"] as Tab[]
          ).map((key) => (
            <button
              key={key}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => go(key)}
            >
              <Icon name={key} />
              {t(
                ...(
                  {
                    home: ["總覽", "Overview"],
                    expenses: ["費用明細", "Expenses"],
                    settlement: ["結算轉帳", "Settle up"],
                    members: ["成員", "Members"],
                    charts: ["支出分析", "Insights"],
                  } as Record<string, [string, string]>
                )[key],
              )}
              {key === "expenses" && active.length > 0 && (
                <span className="nav-count" aria-hidden="true">
                  {active.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-ledgers">
          <div className="section-label">
            {t("我的帳本", "MY LEDGERS")}
            <button
              aria-label={t("建立帳本", "Create ledger")}
              className="icon-button"
              onClick={() => setModal({ kind: "group" })}
            >
              <Icon name="plus" />
            </button>
          </div>
          {ws.groups.length === 0 ? (
            <p className="muted small">
              {t(
                "下一段旅程，從這裡開始",
                "Your next shared adventure starts here.",
              )}
            </p>
          ) : (
            ws.groups.map((g) => (
              <button
                className={
                  "ledger-nav " + (selected === g.id ? "selected" : "")
                }
                key={g.id}
                onClick={() => {
                  setSelected(g.id);
                  go("expenses");
                }}
              >
                <span className="ledger-dot">{g.archived ? "□" : "◌"}</span>
                <span>{g.name}</span>
                <small>{g.currency}</small>
              </button>
            ))
          )}
        </div>
        <nav className="nav-bottom" aria-label={t("工具選單", "Tools")}>
          {(["backup", "settings"] as Tab[]).map((key) => (
            <button
              key={key}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => go(key)}
            >
              <Icon name={key} />
              {key === "backup"
                ? t("備份與匯入", "Backup & import")
                : t("設定與說明", "Settings & help")}
            </button>
          ))}
        </nav>
        <div className="local-note">
          <Icon name="lock" />
          <span>
            {t(
              "不需帳號，資料留在此裝置",
              "No account. Stored on this device.",
            )}
            <small>{t("記得定期匯出備份", "Remember to export backups")}</small>
          </span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            {t("我的空間", "MY SPACE")}
            <span>/</span>
            {group?.name || t("準備開始", "A fresh start")}
          </span>
          <div className="top-actions">
            <button
              className="icon-button"
              aria-label={t("開啟設定與說明", "Open settings and help")}
              onClick={() => go("settings")}
            >
              <Icon name="settings" />
            </button>
            <span className="status-pill">
              <span className={online ? "status-dot" : "status-dot offline"} />
              {offlineReady
                ? t("離線可用", "Offline ready")
                : t("尚未完成離線快取", "Offline cache not ready")}
            </span>
            <button
              className="icon-button"
              aria-label={t("切換深色模式", "Toggle dark mode")}
              onClick={() =>
                act(() =>
                  mutate((d) => {
                    d.settings.theme =
                      d.settings.theme === "dark" ? "light" : "dark";
                  }),
                )
              }
            >
              ◐
            </button>
          </div>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {tab === "home"
                  ? "LESS MATH. MORE MOMENTS."
                  : group?.name || "FOLD / YOUR LOCAL SPACE"}
              </p>
              <h1>{t(...titles[tab])}</h1>
              <p className="subtitle">
                {tab === "home"
                  ? t(
                      "不必註冊、不用心算，把好時光留給彼此。",
                      "No sign-up, no mental math. Make room for the good times.",
                    )
                  : group?.archived
                    ? t(
                        "此帳本已封存，解除後可繼續編輯。",
                        "This ledger is archived. Unarchive to edit.",
                      )
                    : t(
                        "只在你的裝置計算與儲存，分享前由你決定。",
                        "Calculated and stored on your device. You choose what to share.",
                      )}
              </p>
            </div>
            {group &&
              ["expenses", "settlement", "charts"].includes(tab) &&
              !group.archived && (
                <button
                  className="primary"
                  onClick={() => setModal({ kind: "expense" })}
                >
                  <Icon name="plus" />
                  {t("記一筆費用", "Add expense")}
                </button>
              )}
          </div>
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                className="icon-button"
                aria-label="關閉 Close"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          {update && (
            <div className="notice">
              {t(
                "新版本已下載。先儲存編輯內容，再重新載入。",
                "Update ready. Save edits before reloading.",
              )}
              <button
                onClick={() => {
                  navigator.serviceWorker.addEventListener(
                    "controllerchange",
                    () => location.reload(),
                    { once: true },
                  );
                  update.postMessage("ACTIVATE");
                }}
              >
                {t("更新並重載", "Update & reload")}
              </button>
            </div>
          )}
          {tab === "home" && (
            <>
              <section className="welcome-grid">
                <div className="hero-card">
                  <span className="tag">
                    {t(
                      "免登入 · 無每日筆數限制 · 無廣告",
                      "NO LOGIN · NO ADS · NO DAILY LIMIT",
                    )}
                  </span>
                  <h2>
                    {t("好朋友，", "Good friends,")}
                    <br />
                    {t("不必糊塗帳。", "clear accounts.")}
                  </h2>
                  <p>
                    {t(
                      "聚餐、旅行，或日常的小花費。記下誰先付，剩下交給合帳。",
                      "Dinner, a weekend away, or everyday life. Record who paid. Fold takes care of the math.",
                    )}
                  </p>
                  <button
                    className="primary"
                    onClick={() => setModal({ kind: "group" })}
                  >
                    {t("開始一筆分帳", "Start splitting")}
                    <Icon name="arrow" />
                  </button>
                  <div className="hero-foot">
                    <Icon name="check" />
                    {t(
                      "完整核心可離線，資料可隨時帶走",
                      "Core works offline. Your data goes with you.",
                    )}
                  </div>
                </div>
                <div className="receipt-visual" aria-hidden="true">
                  <div className="receipt">
                    <div className="receipt-logo">FOLD / THE GOOD TIMES</div>
                    <div className="receipt-illustration">
                      ◌<span>＋</span>◌
                    </div>
                    <h3>
                      {t("一起的美好，分得剛好", "Good times, shared fairly")}
                    </h3>
                    <div className="receipt-row">
                      <span>{t("一點旅行", "A little adventure")}</span>
                      <span>✓</span>
                    </div>
                    <div className="receipt-row">
                      <span>{t("幾位好朋友", "A few good friends")}</span>
                      <span>✓</span>
                    </div>
                    <div className="receipt-rule" />
                    <div className="receipt-row total">
                      <span>{t("少一點算帳", "Less math")}</span>
                      <span>{t("多一點自在", "More ease")}</span>
                    </div>
                    <div className="barcode">|||| ||| || ||||| ||| || ||||</div>
                    <small>KEEP THE MEMORIES, CLEAR THE BALANCE.</small>
                  </div>
                </div>
              </section>
              <div className="section-heading">
                <h2>
                  {t("我的帳本", "Your ledgers")}
                  <span className="counter">{ws.groups.length}</span>
                </h2>
                <button
                  className="text-button"
                  onClick={() => setModal({ kind: "group" })}
                >
                  ＋ {t("新增帳本", "New ledger")}
                </button>
              </div>
              <div className="group-grid">
                {ws.groups.map((g, i) => {
                  const l = ledger(g);
                  return (
                    <button
                      key={g.id}
                      className="group-card"
                      onClick={() => {
                        setSelected(g.id);
                        go("expenses");
                      }}
                    >
                      <div className="group-card-top">
                        <div className={"group-symbol tone-" + (i % 3)}>
                          {g.archived ? "□" : "↗"}
                        </div>
                        <span className="currency-badge">{g.currency}</span>
                      </div>
                      <span className="group-name">{g.name}</span>
                      <div className="card-avatars" aria-hidden="true">
                        {g.members.slice(0, 3).map((m, mi) => (
                          <span
                            key={m.id}
                            className={"avatar-sm tone-" + (mi % 3)}
                          >
                            {m.name.slice(0, 1)}
                          </span>
                        ))}
                        {g.members.length > 3 && (
                          <span className="avatar-sm more">
                            +{g.members.length - 3}
                          </span>
                        )}
                      </div>
                      <span className="muted">
                        {g.members.length} {t("位成員", "members")} ·{" "}
                        {g.expenses.filter((e) => !e.deleted).length}{" "}
                        {t("筆費用", "expenses")}
                        {g.archived ? " · " + t("已封存", "Archived") : ""}
                      </span>
                      <strong>{money(l.total, g.currency)}</strong>
                      <span className="group-card-bottom">
                        {t("查看帳本", "Open ledger")}
                        <Icon name="arrow" />
                      </span>
                    </button>
                  );
                })}
                {!ws.groups.length && (
                  <div className="empty-card">
                    <Icon name="expenses" />
                    <h3>
                      {t(
                        "還沒有帳本，剛好是個開始。",
                        "A clean slate, ready for your plans.",
                      )}
                    </h3>
                    <p>
                      {t(
                        "新增成員、記下費用，就能看見誰該轉給誰。",
                        "Add people and expenses to see who owes whom.",
                      )}
                    </p>
                    <button onClick={() => setModal({ kind: "group" })}>
                      {t("建立第一本帳本", "Create your first ledger")}
                    </button>
                  </div>
                )}
              </div>
              <section className="try-strip">
                <div>
                  <span className="eyebrow">TRY BEFORE YOU START</span>
                  <h3>{t("想先看看怎麼算？", "Want to see the math?")}</h3>
                  <p>
                    {t(
                      "載入 11 人旅行測試範例，檢查每一筆分攤與最少轉帳證明。",
                      "Load the 11-person test fixture and inspect every share and the minimum-transfer proof.",
                    )}
                  </p>
                </div>
                <button onClick={() => act(() => addGroup(exampleGroup()))}>
                  {t("載入驗算範例", "Load test example")}
                  <Icon name="arrow" />
                </button>
              </section>
            </>
          )}
          {needsGroup && !group && (
            <div className="empty-card">
              <h2>{t("先開一本帳本吧", "Create a ledger first")}</h2>
              <p>
                {t(
                  "不必註冊。新增兩位以上成員，就能開始。",
                  "No sign-up. Add at least two people to start.",
                )}
              </p>
              <button
                className="primary"
                onClick={() => setModal({ kind: "group" })}
              >
                {t("建立帳本", "Create ledger")}
              </button>
            </div>
          )}
          {group && totals && tab === "expenses" && (
            <>
              <div className="stats-grid">
                <Stat
                  label={t("淨費用總額", "Net expenses")}
                  value={money(totals.total, group.currency)}
                  note={`${group.members.length} ${t("人共同分攤", "people sharing")}`}
                />
                <Stat
                  label={t("已記錄費用", "Expenses recorded")}
                  value={String(active.length)}
                  note={t(
                    "含退款，刪除項目不計入",
                    "Includes refunds; excludes deleted",
                  )}
                />
                <Stat
                  label={t("剩餘轉帳", "Remaining transfers")}
                  value={
                    solution
                      ? `${solution.transfers.length} ${t("筆", "")}`
                      : "…"
                  }
                  note={
                    solution?.exact
                      ? t("已驗證最少筆數", "Proven minimum")
                      : t("依目前結算模式", "Current settlement mode")
                  }
                />
              </div>
              <div className="ledger-layout">
                <section className="panel expense-panel">
                  <div className="panel-head">
                    <h2>
                      {t("費用明細", "Expenses")}
                      <span className="counter">{active.length}</span>
                    </h2>
                    <button
                      disabled={group.archived}
                      className="text-button"
                      onClick={() => setModal({ kind: "text" })}
                    >
                      {t("貼上文字記帳", "Paste expenses")}
                    </button>
                  </div>
                  <div className="filter-bar">
                    <label className="search-field">
                      <span className="sr-only">
                        {t("搜尋費用", "Search expenses")}
                      </span>
                      <input
                        type="search"
                        placeholder={t(
                          "搜尋品項、付款人或備註",
                          "Search title, payer or note",
                        )}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={showDeleted}
                        onChange={(e) => setShowDeleted(e.target.checked)}
                      />
                      {t("含已刪除", "Show deleted")}
                    </label>
                  </div>
                  <div
                    className="category-chips-bar"
                    role="group"
                    aria-label={t("類別快選", "Category filter")}
                  >
                    <button
                      type="button"
                      className={
                        "category-chip " + (!categoryFilter ? "active" : "")
                      }
                      onClick={() => setCategoryFilter("")}
                    >
                      {t("全部", "All")}
                      <span className="chip-count">{active.length}</span>
                    </button>
                    {categories.map((c) => {
                      const count = active.filter(
                        (e) => e.category === c,
                      ).length;
                      return (
                        <button
                          key={c}
                          type="button"
                          className={
                            "category-chip " +
                            (categoryFilter === c ? "active" : "")
                          }
                          onClick={() =>
                            setCategoryFilter(categoryFilter === c ? "" : c)
                          }
                        >
                          {c.split(en ? " " : " ")[en ? 1 : 0]}
                          {count > 0 && (
                            <span className="chip-count">{count}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="expense-list">
                    {filteredExpenses
                      .slice(-visibleCount)
                      .reverse()
                      .map((e) => {
                        const c = calculateExpense(e, group);
                        return (
                          <article
                            className={
                              "expense-row " + (e.deleted ? "is-deleted" : "")
                            }
                            key={e.id}
                          >
                            <div className="expense-icon">
                              {e.kind === "refund"
                                ? "↩"
                                : e.category === categories[2]
                                  ? "⌂"
                                  : "◈"}
                            </div>
                            <div className="expense-info">
                              <h3>
                                {e.title}
                                {e.deleted && (
                                  <span className="tag">
                                    {t("已刪除", "Deleted")}
                                  </span>
                                )}
                              </h3>
                              <p>
                                {e.date} ·{" "}
                                {e.payers
                                  .map((a) => name(a.memberId))
                                  .join("、")}{" "}
                                {t(
                                  e.kind === "refund" ? "收到退款" : "先付",
                                  e.kind === "refund"
                                    ? "received refund"
                                    : "paid",
                                )}
                              </p>
                              <p className="muted">
                                {e.shares.length} {t("人分攤", "people")} ·{" "}
                                {e.category.split(en ? " " : " ")[en ? 1 : 0]}
                                {e.currency !== group.currency
                                  ? ` · ${e.currency} ${e.amount} × ${e.rate}`
                                  : ""}
                              </p>
                              {e.note && (
                                <p className="expense-note">{e.note}</p>
                              )}
                            </div>
                            <div className="expense-amount">
                              <strong>{money(c.total, group.currency)}</strong>
                              <div className="row-actions">
                                {!e.deleted && (
                                  <button
                                    disabled={group.archived}
                                    onClick={() =>
                                      setModal({ kind: "expense", expense: e })
                                    }
                                  >
                                    {t("明細／編輯", "Details / edit")}
                                  </button>
                                )}
                                <button
                                  disabled={group.archived}
                                  onClick={() =>
                                    act(() =>
                                      changeGroup((g) => {
                                        g.expenses.find(
                                          (v) => v.id === e.id,
                                        )!.deleted = !e.deleted;
                                      }),
                                    )
                                  }
                                >
                                  {t(
                                    e.deleted ? "復原" : "刪除",
                                    e.deleted ? "Restore" : "Delete",
                                  )}
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    {filteredExpenses.length > visibleCount && (
                      <button
                        className="full"
                        onClick={() => setVisibleCount((n) => n + 100)}
                      >
                        {t("再顯示 100 筆", "Show 100 more")} · {visibleCount}/
                        {filteredExpenses.length}
                      </button>
                    )}
                    {!group.expenses.filter((e) => showDeleted || !e.deleted)
                      .length && (
                      <div className="empty-inline">
                        <h3>
                          {t(
                            "第一筆，從誰先付開始？",
                            "Who picked up the first bill?",
                          )}
                        </h3>
                        <p>
                          {t(
                            "也可以貼上固定格式的文字，一次建立多筆。",
                            "Or paste structured text to add several expenses.",
                          )}
                        </p>
                        <button
                          disabled={group.archived}
                          onClick={() => setModal({ kind: "expense" })}
                        >
                          {t("新增費用", "Add expense")}
                        </button>
                      </div>
                    )}
                  </div>
                </section>
                <section className="panel balance-panel">
                  <div className="panel-head">
                    <h2>{t("目前應收應付", "Current balances")}</h2>
                    <span className="small muted">{group.currency}</span>
                  </div>
                  {totals.rows.map((r, i) => (
                    <div className="balance-row" key={r.id}>
                      <span className={"avatar tone-" + (i % 3)}>
                        {r.name.slice(0, 1)}
                      </span>
                      <span>
                        {r.name}
                        <small>
                          {r.balance > 0n
                            ? t("應收", "To receive")
                            : r.balance < 0n
                              ? t("應付", "To pay")
                              : t("已平衡", "Balanced")}
                        </small>
                      </span>
                      <strong
                        className={
                          r.balance > 0n
                            ? "positive"
                            : r.balance < 0n
                              ? "negative"
                              : "muted"
                        }
                      >
                        {r.balance > 0n ? "+" : ""}
                        {money(r.balance, group.currency).replace(
                          group.currency + " ",
                          "",
                        )}
                      </strong>
                    </div>
                  ))}
                  <div className="balance-footer">
                    <Icon name="check" />
                    {t("全員淨額合計為零", "All balances sum to zero")}
                  </div>
                  <button className="full" onClick={() => go("settlement")}>
                    {t("查看轉帳方式", "View settlement")}
                    <Icon name="arrow" />
                  </button>
                </section>
              </div>
            </>
          )}
          {group && totals && tab === "settlement" && (
            <>
              <section className="panel">
                <div className="panel-head">
                  <h2>{t("選一種結算方式", "Choose how to settle")}</h2>
                  <span className="tag">
                    {t(
                      "所有金額已獨立驗證平衡",
                      "All transfers independently verified",
                    )}
                  </span>
                </div>
                <div className="mode-grid">
                  <button
                    className={
                      "mode-card " + (mode === "minimum" ? "active" : "")
                    }
                    aria-pressed={mode === "minimum"}
                    onClick={() => setMode("minimum")}
                  >
                    <Icon name="settlement" />
                    <strong>{t("最少轉帳次數", "Fewest transfers")}</strong>
                    <span>
                      {t(
                        "18 位以內非零餘額：全域最佳；更大群組提供近似解。",
                        "Up to 18 nonzero balances: globally optimal. Larger groups: approximation.",
                      )}
                    </span>
                  </button>
                  <button
                    className={"mode-card " + (mode === "hub" ? "active" : "")}
                    aria-pressed={mode === "hub"}
                    onClick={() => setMode("hub")}
                  >
                    <Icon name="members" />
                    <strong>
                      {t("集中收付，對象簡單", "One coordinator")}
                    </strong>
                    <span>
                      {t(
                        "其他人只接觸統籌一人；統籌先收後付，可能需更多筆轉帳。",
                        "Everyone deals with one coordinator, who collects then pays out. May require more transfers.",
                      )}
                    </span>
                  </button>
                </div>
                {mode === "hub" && (
                  <Field
                    label={t(
                      "統籌人（須經手款項）",
                      "Coordinator (handles funds)",
                    )}
                  >
                    <select
                      value={hub || solution?.hub || ""}
                      onChange={(e) => setHub(e.target.value)}
                    >
                      <option value="">{t("自動選擇", "Automatic")}</option>
                      {group.members.map((m) => (
                        <option value={m.id} key={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </section>
              <section className="settlement-sheet panel" id="settlement-sheet">
                <div className="sheet-head">
                  <div>
                    <p className="eyebrow">FOLD / SETTLEMENT</p>
                    <h2>{group.name}</h2>
                    <p>
                      {t("淨費用", "Net expenses")}{" "}
                      {money(totals.total, group.currency)} ·{" "}
                      {group.members.length} {t("位成員", "members")}
                    </p>
                  </div>
                  <span className="sheet-badge">
                    {solution?.transfers.length ?? "…"}
                    <small>{t("筆待轉帳", "transfers")}</small>
                  </span>
                </div>
                {solveError && <p role="alert">{solveError}</p>}
                {!solution && !solveError && (
                  <p role="status">
                    {t("正在裝置上精確計算…", "Calculating on your device…")}
                  </p>
                )}
                {solution && (
                  <>
                    <p className="proof-note">
                      {mode === "hub"
                        ? t(
                            "集中收付不是最少筆數保證；請先收齊款項再付出。",
                            "Coordinator mode is not a minimum guarantee. Collect funds before paying out.",
                          )
                        : solution.exact
                          ? t(
                              `精確證明：${solution.nonzero} 位非零成員，最多可拆成 ${solution.components} 個零和組，因此最少 ${solution.nonzero} − ${solution.components} = ${solution.transfers.length} 筆。`,
                              `Exact proof: ${solution.nonzero} nonzero members form at most ${solution.components} zero-sum components. Minimum = ${solution.nonzero} − ${solution.components} = ${solution.transfers.length}.`,
                            )
                          : t(
                              "超過 18 位非零餘額，使用可驗證平衡的貪婪近似解，未證明最少筆數。",
                              "More than 18 nonzero balances: verified greedy approximation, not proven minimum.",
                            )}
                    </p>
                    <div className="transfers">
                      {solution.transfers.map((tr, i) => (
                        <div
                          className="transfer-row"
                          key={`${tr.from}-${tr.to}`}
                        >
                          <span className="transfer-number">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div className="transfer-people">
                            <strong>{name(tr.from)}</strong>
                            <Icon name="arrow" />
                            <strong>{name(tr.to)}</strong>
                          </div>
                          <strong className="transfer-value">
                            {money(tr.amount, group.currency)}
                          </strong>
                          <button
                            disabled={group.archived}
                            onClick={() =>
                              setModal({ kind: "payment", transfer: tr })
                            }
                          >
                            {t("記錄還款", "Record payment")}
                          </button>
                        </div>
                      ))}
                      {!solution.transfers.length && (
                        <div className="settled">
                          <Icon name="check" />
                          <h3>{t("目前帳目已結清", "All settled for now")}</h3>
                          <p>
                            {t(
                              "再記一筆費用時，會重新計算。",
                              "New expenses will recalculate the balances.",
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="small muted">
                      {t(
                        "這是本機結算建議，不會代你轉帳；「已付款」僅代表自行記錄，請另行確認入帳。",
                        "These are local suggestions, not actual payments. Recorded payments must be verified separately.",
                      )}
                    </p>
                  </>
                )}
              </section>
              {solution && (
                <div className="share-actions no-print">
                  <button
                    className="primary"
                    onClick={() =>
                      act(
                        async () => {
                          await navigator.clipboard.writeText(
                            settlementText(group, solution, en),
                          );
                        },
                        t("已複製，可貼到 LINE", "Copied. Paste into LINE."),
                      )
                    }
                  >
                    {t("複製 LINE 文字", "Copy for LINE")}
                  </button>
                  <button
                    onClick={() =>
                      act(async () => {
                        if (navigator.share)
                          await navigator.share({
                            title: group.name,
                            text: settlementText(group, solution, en),
                          });
                        else {
                          await navigator.clipboard.writeText(
                            settlementText(group, solution, en),
                          );
                          setNotice(
                            t(
                              "此瀏覽器不支援分享，已複製文字",
                              "Sharing unavailable; text copied",
                            ),
                          );
                        }
                      })
                    }
                  >
                    {t("系統分享", "Share")}
                  </button>
                  <button
                    onClick={() =>
                      act(
                        () => settlementPng(group, solution, en),
                        t("結算圖片已產生", "Settlement image created"),
                      )
                    }
                  >
                    PNG {t("圖片", "image")}
                  </button>
                  <button
                    disabled={group.archived}
                    onClick={() =>
                      act(
                        () =>
                          changeGroup((g) => {
                            g.settlements ??= [];
                            g.settlements.push({
                              id: uid(),
                              createdAt: new Date().toISOString(),
                              revision: ws.revision,
                              mode: solution.mode,
                              exact: solution.exact,
                              totalMinor: totals.total.toString(),
                              balances: totals.rows.map((r) => ({
                                id: r.id,
                                name: r.name,
                                minor: r.balance.toString(),
                              })),
                              transfers: solution.transfers.map((tr) => ({
                                from: tr.from,
                                to: tr.to,
                                minor: tr.amount.toString(),
                              })),
                              expenseIds: g.expenses
                                .filter((e) => !e.deleted)
                                .map((e) => e.id),
                              paymentIds: g.payments
                                .filter((p) => !p.deleted && p.confirmed)
                                .map((p) => p.id),
                            });
                          }),
                        t(
                          "已保存餘額與轉帳快照",
                          "Balance and transfer snapshot saved",
                        ),
                      )
                    }
                  >
                    {t("保存結算快照", "Save settlement snapshot")}
                  </button>
                  <button onClick={() => window.print()}>
                    PDF / {t("列印", "Print")}
                  </button>
                  <button
                    disabled={group.archived}
                    onClick={() => setModal({ kind: "payment" })}
                  >
                    {t("手動記錄部分還款", "Record partial payment")}
                  </button>
                </div>
              )}
              <details className="panel no-print">
                <summary>
                  {t("查看可複製的結算文字", "View settlement text")}
                </summary>
                <pre className="share-text">
                  {solution ? settlementText(group, solution, en) : "…"}
                </pre>
              </details>
              <section className="panel no-print">
                <h2>
                  {t("結算快照紀錄", "Settlement snapshots")} ·{" "}
                  {group.settlements?.length || 0}
                </h2>
                <p className="small muted">
                  {t(
                    "保留當時餘額、名字與轉帳，供事後查核；不是已付款證明，也不能復原舊費用內容。",
                    "Captures balances, names and transfers for reference. Not proof of payment or a restore point for old expenses.",
                  )}
                </p>
                {group.settlements
                  ?.slice()
                  .reverse()
                  .map((s) => (
                    <details key={s.id}>
                      <summary>
                        {new Date(s.createdAt).toLocaleString(
                          en ? "en" : "zh-TW",
                        )}{" "}
                        · {s.transfers.length} {t("筆", "transfers")} ·{" "}
                        {t("帳目版次", "Ledger revision")} {s.revision}
                      </summary>
                      <ul>
                        {s.transfers.map((tr, i) => (
                          <li key={i}>
                            {s.balances.find((b) => b.id === tr.from)?.name} →{" "}
                            {s.balances.find((b) => b.id === tr.to)?.name}：
                            {money(BigInt(tr.minor), group.currency)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
              </section>
              <PaymentList
                group={group}
                en={!!en}
                onEdit={(payment) => setModal({ kind: "payment", payment })}
                onChange={(id, action) =>
                  act(() =>
                    changeGroup((g) => {
                      const p = g.payments.find((p) => p.id === id)!;
                      if (action === "confirm") p.confirmed = true;
                      else p.deleted = !p.deleted;
                    }),
                  )
                }
              />
            </>
          )}
          {group && tab === "members" && (
            <Members
              key={group.id}
              group={group}
              en={!!en}
              onChange={changeGroup}
              onNotice={setNotice}
              onDuplicate={() =>
                act(async () => {
                  const copy = structuredClone(group);
                  copy.id = uid();
                  copy.name =
                    copy.name.slice(0, 70) + (en ? " (copy)" : "（副本）");
                  copy.archived = false;
                  copy.createdAt = new Date().toISOString();
                  await addGroup(copy);
                })
              }
              onArchive={() =>
                act(() =>
                  changeGroup((g) => {
                    g.archived = !g.archived;
                  }, true),
                )
              }
            />
          )}
          {group && totals && tab === "charts" && (
            <>
              <div className="stats-grid">
                <Stat
                  label={t("淨費用", "Net expenses")}
                  value={money(totals.total, group.currency)}
                  note={t("原支出減去已記退款", "Expenses minus refunds")}
                />
                <Stat
                  label={t("轉帳紀錄", "Confirmed payments")}
                  value={String(
                    group.payments.filter((p) => !p.deleted && p.confirmed)
                      .length,
                  )}
                  note={t("不列入消費總額", "Excluded from expense totals")}
                />
                <Stat
                  label={t("活動狀態", "Ledger status")}
                  value={
                    group.archived
                      ? t("已封存", "Archived")
                      : t("進行中", "Active")
                  }
                  note={t(
                    "所有資料僅存於此裝置",
                    "All data stored on this device",
                  )}
                />
              </div>
              <section className="panel">
                <div className="panel-head">
                  <h2>{t("分類費用", "By category")}</h2>
                  <button
                    onClick={() =>
                      download(
                        ledgerCsv(group),
                        "fold-ledger.csv",
                        "text/csv;charset=utf-8",
                      )
                    }
                  >
                    {t("匯出 Excel 相容 CSV", "Export Excel-compatible CSV")}
                  </button>
                </div>
                {[...totals.categoryTotals].map(([key, v]) => (
                  <div className="chart-row" key={key}>
                    <span>{key}</span>
                    <meter
                      aria-label={key}
                      min="0"
                      max={
                        Number(
                          [...totals.categoryTotals.values()].reduce(
                            (a, b) => a + (b > 0n ? b : 0n),
                            0n,
                          ),
                        ) || 1
                      }
                      value={Number(v > 0n ? v : 0n)}
                    />
                    <strong>{money(v, group.currency)}</strong>
                  </div>
                ))}
                <p className="small muted">
                  {t(
                    "負值退款保留數字，圖條僅顯示正淨額比例。",
                    "Negative refund totals remain visible as numbers; bars show positive net amounts only.",
                  )}
                </p>
              </section>
              <section className="panel">
                <h2>{t("每位成員的收支", "Per-member overview")}</h2>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {[
                          t("成員", "Member"),
                          t("淨墊款", "Net paid"),
                          t("應分攤", "Share"),
                          t("已轉出", "Sent"),
                          t("已收到", "Received"),
                          t("淨餘額", "Balance"),
                        ].map((s) => (
                          <th key={s}>{s}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {totals.rows.map((r) => (
                        <tr key={r.id}>
                          <th>{r.name}</th>
                          {[r.paid, r.owed, r.sent, r.received, r.balance].map(
                            (v, i) => (
                              <td key={i}>{money(v, group.currency)}</td>
                            ),
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {tab === "backup" && (
            <>
              <section className="panel backup-hero">
                <div className="backup-symbol">
                  <Icon name="backup" />
                </div>
                <div>
                  <h2>
                    {t(
                      "帳本屬於你，也請替它留個副本。",
                      "Your ledgers are yours. Keep a spare copy.",
                    )}
                  </h2>
                  <p>
                    {t(
                      "瀏覽器資料可能被清除，裝置也可能遺失。本機儲存不等於永久保存。JSON 包含所有帳本、還款與刪除紀錄，請保存在可信任的位置。",
                      "Browser data can be cleared and devices can be lost. JSON includes all ledgers, payments and deleted records. Keep it somewhere safe.",
                    )}
                  </p>
                  <button className="primary" onClick={() => exportBackup(ws)}>
                    {t("下載完整 JSON 備份", "Download full JSON backup")}
                  </button>
                </div>
              </section>
              <div className="two-col">
                <section className="panel">
                  <h2>{t("從備份還原", "Restore a backup")}</h2>
                  <p>
                    {t(
                      "只接受合帳 JSON，最多 10 MiB。先檢查結構及計算，再一次取代；不會自動合併多人修改。",
                      "Fold JSON only, up to 10 MiB. Validated before atomic replacement. Concurrent edits are not merged.",
                    )}
                  </p>
                  <Field label={t("選擇 JSON 檔", "Choose JSON file")}>
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) act(() => restoreFile(file));
                        e.target.value = "";
                      }}
                    />
                  </Field>
                  <button
                    onClick={() =>
                      act(async () => {
                        const raw = await repo?.raw("previous");
                        if (!raw)
                          throw new Error(
                            t("沒有取代前快照", "No previous snapshot"),
                          );
                        const old = parseBackup(JSON.stringify(raw));
                        confirm(
                          t("還原取代前快照？", "Restore previous snapshot?"),
                          t(
                            "目前資料會另存為下一份取代前快照。",
                            "Current data will become the next previous snapshot.",
                          ),
                          async () => {
                            const next = await save(old, true);
                            setSelected(next?.groups[0]?.id || "");
                          },
                        );
                      })
                    }
                  >
                    {t("還原上次匯入／清空前", "Undo last import / reset")}
                  </button>
                </section>
                <section className="panel">
                  <h2>{t("可讀的帳目報表", "Readable ledger exports")}</h2>
                  <p>
                    {t(
                      "CSV 含原幣、匯率、付款與分攤明細，可用 Excel／LibreOffice 開啟。CSV 是報表，完整還原請用 JSON。",
                      "CSV includes source currency, rates, payers and shares. Open in Excel or LibreOffice. Use JSON for full restoration.",
                    )}
                  </p>
                  <Field label={t("選擇帳本", "Select ledger")}>
                    <select
                      value={selected}
                      onChange={(e) => setSelected(e.target.value)}
                    >
                      <option value="">{t("請選擇", "Choose")}</option>
                      {ws.groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button
                    disabled={!group}
                    onClick={() =>
                      group &&
                      download(
                        ledgerCsv(group),
                        "fold-ledger.csv",
                        "text/csv;charset=utf-8",
                      )
                    }
                  >
                    {t("下載 CSV", "Download CSV")}
                  </button>
                  <button
                    disabled={!group}
                    onClick={() =>
                      group &&
                      exportBackup({
                        ...emptyWorkspace(),
                        groups: [group],
                        settings: ws.settings,
                      })
                    }
                  >
                    {t("下載所選帳本 JSON", "Download selected ledger JSON")}
                  </button>
                </section>
              </div>
              <section className="panel">
                <h2>{t("清空此工具", "Clear this tool")}</h2>
                <p>
                  {t(
                    "不會清除其他網站或舊專案的資料。清空前建議下載備份。",
                    "Other apps and websites are unaffected. Export a backup first.",
                  )}
                </p>
                <button
                  className="danger"
                  onClick={() =>
                    confirm(
                      t("清空全部合帳資料？", "Clear all Fold data?"),
                      t(
                        "這會清空所有帳本。一份取代前快照會保留供復原。",
                        "All ledgers will be cleared. One previous snapshot will remain for undo.",
                      ),
                      async () => {
                        await save(
                          { ...emptyWorkspace(), settings: ws.settings },
                          true,
                        );
                        setSelected("");
                      },
                    )
                  }
                >
                  {t("清空所有帳本", "Clear all ledgers")}
                </button>
              </section>
            </>
          )}
          {tab === "settings" && (
            <>
              <div className="two-col">
                <section className="panel">
                  <h2>{t("顯示偏好", "Appearance")}</h2>
                  <Field label={t("語言", "Language")}>
                    <select
                      value={ws.settings.language}
                      onChange={(e) =>
                        act(() =>
                          mutate((d) => {
                            d.settings.language = e.target.value as "zh" | "en";
                          }),
                        )
                      }
                    >
                      <option value="zh">繁體中文</option>
                      <option value="en">English</option>
                    </select>
                  </Field>
                  <Field label={t("外觀", "Theme")}>
                    <select
                      value={ws.settings.theme}
                      onChange={(e) =>
                        act(() =>
                          mutate((d) => {
                            d.settings.theme = e.target
                              .value as Workspace["settings"]["theme"];
                          }),
                        )
                      }
                    >
                      <option value="system">{t("跟隨系統", "System")}</option>
                      <option value="light">{t("淺色", "Light")}</option>
                      <option value="dark">{t("深色", "Dark")}</option>
                    </select>
                  </Field>
                </section>
                <section className="panel">
                  <h2>{t("安裝與離線", "Install & offline")}</h2>
                  <p>
                    {t(
                      "首次連線載入並完成離線快取後，可在斷網時重新開啟。Chrome 可在選單安裝；iPhone 請以 Safari「分享 → 加入主畫面」。LINE 內建瀏覽器可能不支援安裝、離線或檔案分享，建議改用系統瀏覽器。",
                      "After the first online load and completed cache, reopen offline. Install via Chrome menu or Safari Share → Add to Home Screen. LINE webviews may not support installation, offline mode or file sharing; use a system browser.",
                    )}
                  </p>
                  <p>
                    <strong>
                      {offlineReady
                        ? t("離線快取已準備好", "Offline cache ready")
                        : t("離線快取尚未完成", "Offline cache not ready")}
                    </strong>
                  </p>
                  <button
                    onClick={() =>
                      act(async () => {
                        const persisted = await navigator.storage?.persist?.();
                        setNotice(
                          persisted
                            ? t(
                                "瀏覽器已允許持續儲存，仍需備份",
                                "Persistent storage granted. Backups still required.",
                              )
                            : t(
                                "未取得持續儲存，請定期備份",
                                "Persistence not granted. Export backups regularly.",
                              ),
                        );
                      })
                    }
                  >
                    {t("請求持續儲存", "Request persistent storage")}
                  </button>
                </section>
              </div>
              <section className="panel prose">
                <h2>{t("使用說明與隱私", "Help & privacy")}</h2>
                <p>
                  {t(
                    "1. 建立帳本與成員。2. 新增誰付了多少、哪些人分攤。3. 查看結算並複製到 LINE。4. 實際轉帳後才記錄還款。",
                    "1. Create a ledger and people. 2. Add who paid and who shares. 3. Copy settlement to LINE. 4. Record repayments after actual transfers.",
                  )}
                </p>
                <p>
                  {t(
                    "多幣別使用你逐筆輸入的固定匯率，沒有自動報價。先以原幣分攤，再用最大餘數法分配本位幣；同餘數依成員順序輪替起點，不會多收或少算。",
                    "Each foreign expense uses your manually entered fixed rate. Source allocations are converted with largest remainders; ties rotate by member order. No money is created or lost.",
                  )}
                </p>
                <p>
                  {t(
                    "退款的「付款人」是收到商家退款的人；選擇原本受益的分攤成員，系統反向沖帳。折扣與小費會合併後再分攤，個別餐點請分別建費用以指定不同參與者。",
                    "For refunds, select who received the merchant refund and the beneficiaries. Discounts and tips adjust the total before splitting. Add separate expenses for items shared by different people.",
                  )}
                </p>
                <p>
                  {t(
                    "資料儲存在這個瀏覽器的 IndexedDB，未加密；沒有帳號、追蹤或後端資料上傳。靜態託管仍可能留下 IP／存取紀錄。分享文字、圖片與備份由你選擇交給其他應用；第三方有自己的政策。不要輸入銀行密碼或卡號。",
                    "Ledgers live in this browser’s IndexedDB, unencrypted. No account, trackers or backend upload. Static hosting may log IP/access. You choose when to share text, images or backups with apps governed by their own policies. Never enter bank passwords or card numbers.",
                  )}
                </p>
                <p>
                  {t(
                    "同時編輯多個分頁時，過時儲存會被拒絕，請先保留輸入再重載。分享檔是快照，不會即時同步，也不會合併。",
                    "Stale saves from other tabs are rejected. Preserve unsaved inputs before reloading. Shared files are snapshots, without live sync or merge.",
                  )}
                </p>
                <p>
                  {t(
                    "本工具只計算與記帳，不代收付、不驗證銀行入帳，也不是財務或稅務建議。",
                    "This tool calculates and records. It does not transfer funds, verify bank receipts or provide financial/tax advice.",
                  )}
                </p>
                <p>
                  <a href={`${import.meta.env.BASE_URL}guide.html`}>
                    {t("閱讀完整分帳指南", "Read the splitting guide")} ↗
                  </a>
                </p>
                <p className="muted">
                  Fold 1.0.0 ·{" "}
                  {t(
                    "免費開始 · 無廣告 · 不需帳號",
                    "Start free · No ads · No account",
                  )}
                </p>
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>合帳 Fold</span>
            <span>
              {t(
                "算得清楚，玩得盡興。",
                "Keep the moments. Clear the balance.",
              )}
            </span>
            <button className="text-button" onClick={() => go("backup")}>
              {t("資料備份", "Back up data")} ↗
            </button>
          </footer>
        </main>
      </div>
      {modal && (
        <ModalContent
          key={
            modal.kind === "expense" ? modal.expense?.id || "new" : modal.kind
          }
          modal={modal}
          group={group}
          en={!!en}
          close={() => setModal(undefined)}
          addGroup={addGroup}
          changeGroup={changeGroup}
          busy={busy}
        />
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function ModalContent({
  modal,
  group,
  en,
  close,
  addGroup,
  changeGroup,
  busy,
}: {
  modal: Modal;
  group?: Group;
  en: boolean;
  close: () => void;
  addGroup: (g: Group) => Promise<void>;
  changeGroup: (fn: (g: Group) => void, allow?: boolean) => Promise<unknown>;
  busy: boolean;
}) {
  const t = (z: string, e: string) => (en ? e : z);
  const [error, setError] = useState(""),
    [working, setWorking] = useState(false);
  async function submit(fn: () => Promise<unknown>) {
    setError("");
    setWorking(true);
    try {
      await fn();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  }
  const disabled = busy || working;
  const title =
    modal.kind === "group"
      ? t("開一本新的帳本", "Create a ledger")
      : modal.kind === "expense"
        ? t(
            modal.expense ? "費用明細與編輯" : "記一筆費用",
            modal.expense ? "Expense details & edit" : "Add an expense",
          )
        : modal.kind === "text"
          ? t("貼上文字，快速記帳", "Paste structured expenses")
          : modal.kind === "payment"
            ? t("記錄實際還款", "Record an actual repayment")
            : modal.title;
  return (
    <Dialog title={title} onClose={close}>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {modal.kind === "group" && (
        <GroupForm
          en={en}
          disabled={disabled}
          onSave={(g) => submit(() => addGroup(g))}
        />
      )}{" "}
      {modal.kind === "expense" && group && (
        <ExpenseForm
          group={group}
          initial={modal.expense}
          en={en}
          disabled={disabled}
          onSave={(e) =>
            submit(() =>
              changeGroup((g) => {
                const index = g.expenses.findIndex((v) => v.id === e.id);
                if (index < 0) g.expenses.push(e);
                else g.expenses[index] = e;
              }),
            )
          }
        />
      )}{" "}
      {modal.kind === "text" && group && (
        <TextForm
          group={group}
          en={en}
          disabled={disabled}
          onSave={(entries) =>
            submit(() =>
              changeGroup((g) => {
                g.expenses.push(...entries);
              }),
            )
          }
        />
      )}{" "}
      {modal.kind === "payment" && group && (
        <PaymentForm
          group={group}
          en={en}
          transfer={modal.transfer}
          initial={modal.payment}
          disabled={disabled}
          onSave={(p) =>
            submit(() =>
              changeGroup((g) => {
                const index = g.payments.findIndex((v) => v.id === p.id);
                if (index < 0) g.payments.push(p);
                else g.payments[index] = p;
              }),
            )
          }
        />
      )}{" "}
      {modal.kind === "confirm" && (
        <>
          <p>{modal.body}</p>
          <div className="form-actions">
            <button onClick={close}>{t("取消", "Cancel")}</button>
            <button
              disabled={disabled}
              className="primary"
              onClick={() => submit(modal.action)}
            >
              {disabled ? t("處理中…", "Working…") : t("確認", "Confirm")}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
function GroupForm({
  en,
  disabled,
  onSave,
}: {
  en: boolean;
  disabled: boolean;
  onSave: (g: Group) => Promise<void>;
}) {
  const t = (z: string, e: string) => (en ? e : z);
  const [name, setName] = useState(""),
    [names, setNames] = useState(""),
    [count, setCount] = useState("3"),
    [currency, setCurrency] = useState<Currency>("TWD"),
    [error, setError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      let values = names
        .split(/[\n、,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!values.length) {
        const n = Number(count);
        if (!Number.isInteger(n) || n < 2 || n > 100)
          throw new Error(t("人數須為 2～100", "Enter 2–100 members"));
        values = Array.from({ length: n }, (_, i) =>
          en ? `Member ${i + 1}` : `成員 ${i + 1}`,
        );
      }
      if (
        values.length < 2 ||
        values.length > 100 ||
        new Set(values).size !== values.length ||
        values.some((v) => v.length > 40)
      )
        throw new Error(
          t(
            "需 2～100 位不重複的成員，每個名字最多 40 字",
            "Use 2–100 unique names, at most 40 characters each",
          ),
        );
      void onSave({
        id: uid(),
        name: name.trim(),
        currency,
        members: values.map((name) => ({ id: uid(), name })),
        expenses: [],
        payments: [],
        archived: false,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(String(err));
    }
  }
  return (
    <form onSubmit={submit}>
      <Field label={t("帳本名稱", "Ledger name")}>
        <input
          required
          maxLength={80}
          value={name}
          placeholder={t("例如：宜蘭三天兩夜", "e.g. Weekend in Yilan")}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <div className="two-col">
        <Field
          label={t("結算幣別（建立後固定）", "Settlement currency (fixed)")}
        >
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
          >
            {Object.keys(currencies).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field
          label={t(
            "總人數（未填名字時使用）",
            "Number of people (if no names)",
          )}
        >
          <input
            type="number"
            min="2"
            max="100"
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </Field>
      </div>
      <Field
        label={t("成員名字", "Member names")}
        hint={t(
          "每行一位，或用頓號分隔。留白會產生可更名的成員。",
          "One per line, or comma-separated. Leave blank for names you can change later.",
        )}
      >
        <textarea
          rows={4}
          value={names}
          onChange={(e) => setNames(e.target.value)}
          maxLength={4200}
          placeholder={t("小安、小宇、阿哲", "Alex, Sam, Taylor")}
        />
      </Field>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button disabled={disabled} className="primary" type="submit">
          {t("建立帳本，開始記帳", "Create ledger & start")}
        </button>
      </div>
    </form>
  );
}
function ExpenseForm({
  group,
  initial,
  en,
  disabled,
  onSave,
}: {
  group: Group;
  initial?: Expense;
  en: boolean;
  disabled: boolean;
  onSave: (e: Expense) => Promise<void>;
}) {
  const t = (z: string, e: string) => (en ? e : z);
  const [id] = useState(initial?.id || uid());
  const [title, setTitle] = useState(initial?.title || ""),
    [amount, setAmount] = useState(initial?.amount || ""),
    [kind, setKind] = useState<Expense["kind"]>(initial?.kind || "expense"),
    [discount, setDiscount] = useState(initial?.discount || "0"),
    [tip, setTip] = useState(initial?.tip || "0"),
    [currency, setCurrency] = useState<Currency>(
      initial?.currency || group.currency,
    ),
    [rate, setRate] = useState(initial?.rate || "1"),
    [category, setCategory] = useState(initial?.category || categories[0]),
    [date, setDate] = useState(initial?.date || today()),
    [note, setNote] = useState(initial?.note || ""),
    [mode, setMode] = useState<Mode>(initial?.mode || "equal"),
    [payers, setPayers] = useState<Record<string, string>>(
      Object.fromEntries(
        initial?.payers.map((a) => [a.memberId, a.value]) || [
          [group.members[0].id, ""],
        ],
      ),
    ),
    [shares, setShares] = useState<Record<string, string>>(
      Object.fromEntries(
        initial?.shares.map((a) => [a.memberId, a.value]) ||
          group.members.map((m) => [m.id, "1"]),
      ),
    ),
    [error, setError] = useState(""),
    [allowDuplicate, setAllowDuplicate] = useState(false);
  let final = 0n;
  try {
    final =
      minor(amount, currency) -
      minor(discount, currency) +
      minor(tip, currency);
  } catch {
    /* incomplete input */
  }
  const sole = Object.keys(payers).length === 1;
  useEffect(() => {
    if (sole && final > 0n)
      setPayers((p) => ({ [Object.keys(p)[0]]: major(final, currency) }));
  }, [final, currency, sole]);
  function changeMode(v: Mode) {
    setMode(v);
    const ids = Object.keys(shares);
    const values =
      v === "percent"
        ? allocate(
            10000n,
            ids.map(() => 1n),
          )
        : ids.map(() => 1n);
    setShares(
      Object.fromEntries(
        ids.map((id, i) => [
          id,
          v === "percent"
            ? `${values[i] / 100n}.${String(values[i] % 100n).padStart(2, "0")}`
            : v === "amount"
              ? "0"
              : "1",
        ]),
      ),
    );
  }
  const draft: Expense = {
    id,
    title: title.trim(),
    kind,
    amount,
    discount,
    tip,
    currency,
    rate,
    payers: group.members
      .filter((m) => Object.hasOwn(payers, m.id))
      .map((m) => ({ memberId: m.id, value: payers[m.id] })),
    mode,
    shares: group.members
      .filter((m) => Object.hasOwn(shares, m.id))
      .map((m) => ({ memberId: m.id, value: shares[m.id] })),
    category,
    date,
    note,
    roundingOffset:
      initial?.roundingOffset ?? group.expenses.length % group.members.length,
    deleted: false,
  };
  let preview: ReturnType<typeof calculateExpense> | undefined,
    previewError = "";
  try {
    const copy = structuredClone(group),
      index = copy.expenses.findIndex((e) => e.id === draft.id);
    if (index < 0) copy.expenses.push(draft);
    else copy.expenses[index] = draft;
    reflowRounding(copy);
    preview = calculateExpense(draft, group);
  } catch (e) {
    previewError = e instanceof Error ? e.message : String(e);
  }
  let duplicate = false;
  try {
    duplicate = !!preview && duplicateExpense(draft, group);
  } catch {
    /* incomplete */
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!preview) {
      setError(previewError);
      return;
    }
    if (duplicate && !allowDuplicate) {
      setError(
        t(
          "偵測到相似費用，請確認重複新增",
          "Similar expense found. Confirm duplicate entry.",
        ),
      );
      return;
    }
    setError("");
    void onSave(draft);
  }
  return (
    <form onSubmit={submit}>
      <div className="two-col">
        <Field label={t("費用名稱", "Description")}>
          <input
            required
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("例如：晚餐", "e.g. Dinner")}
          />
        </Field>
        <Field label={t("類型", "Type")}>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Expense["kind"])}
          >
            <option value="expense">{t("一般支出", "Expense")}</option>
            <option value="refund">
              {t("商家退款（反向沖帳）", "Merchant refund (reversal)")}
            </option>
          </select>
        </Field>
      </div>
      <div className="two-col">
        <Field label={t("原始金額", "Original amount")}>
          <input
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label={t("支出幣別", "Expense currency")}>
          <select
            value={currency}
            onChange={(e) => {
              const c = e.target.value as Currency;
              setCurrency(c);
              setRate(c === group.currency ? "1" : "");
            }}
          >
            {Object.keys(currencies).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      {currency !== group.currency && (
        <Field
          label={`1 ${currency} = ? ${group.currency}`}
          hint={t(
            "手動固定匯率，最多 8 位小數；本工具不取得即時匯率。",
            "Manual fixed rate, up to 8 decimals. No live exchange API.",
          )}
        >
          <input
            required
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </Field>
      )}
      <details className="adjustments" open={discount !== "0" || tip !== "0"}>
        <summary>{t("折扣與小費", "Discount & tip")}</summary>
        <div className="two-col">
          <Field
            label={t("折扣金額（同支出幣別）", "Discount (source currency)")}
          >
            <input
              inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </Field>
          <Field label={t("小費金額（同支出幣別）", "Tip (source currency)")}>
            <input
              inputMode="decimal"
              value={tip}
              onChange={(e) => setTip(e.target.value)}
            />
          </Field>
        </div>
      </details>
      <p className="total-preview">
        {t("調整後總額", "Adjusted total")}{" "}
        <strong>{final > 0n ? money(final, currency) : "—"}</strong>
      </p>
      <fieldset>
        <legend>
          {t(
            kind === "refund" ? "誰收到商家退款？" : "誰先付？可多人共同付款",
            kind === "refund"
              ? "Who received the refund?"
              : "Who paid? Multiple payers allowed",
          )}
        </legend>
        {group.members.map((m) => (
          <div className="allocation-row" key={m.id}>
            <label>
              <input
                type="checkbox"
                checked={Object.hasOwn(payers, m.id)}
                onChange={(e) =>
                  setPayers((p) => {
                    const n = { ...p };
                    if (e.target.checked) n[m.id] = "0";
                    else delete n[m.id];
                    return n;
                  })
                }
              />
              {m.name}
            </label>
            {Object.hasOwn(payers, m.id) && (
              <input
                aria-label={`${m.name} ${t("付款金額", "paid amount")}`}
                inputMode="decimal"
                value={payers[m.id]}
                onChange={(e) =>
                  setPayers((p) => ({ ...p, [m.id]: e.target.value }))
                }
              />
            )}
          </div>
        ))}
      </fieldset>
      <Field label={t("分攤方式", "Split method")}>
        <select
          value={mode}
          onChange={(e) => changeMode(e.target.value as Mode)}
        >
          <option value="equal">
            {t("指定成員平均", "Equal among selected people")}
          </option>
          <option value="amount">{t("指定金額", "Exact amounts")}</option>
          <option value="percent">{t("百分比", "Percentages")}</option>
          <option value="weight">{t("權重／份數", "Weights / shares")}</option>
        </select>
      </Field>
      <fieldset>
        <legend>
          {t("誰分攤？取消勾選表示不參與", "Who shares? Uncheck to exclude")}
        </legend>
        {group.members.map((m) => (
          <div className="allocation-row" key={m.id}>
            <label>
              <input
                type="checkbox"
                checked={Object.hasOwn(shares, m.id)}
                onChange={(e) =>
                  setShares((s) => {
                    const n = { ...s };
                    if (e.target.checked)
                      n[m.id] =
                        mode === "equal" || mode === "weight" ? "1" : "0";
                    else delete n[m.id];
                    return n;
                  })
                }
              />
              {m.name}
            </label>
            {Object.hasOwn(shares, m.id) && mode !== "equal" && (
              <input
                inputMode="decimal"
                aria-label={`${m.name} ${t("分攤值", "split value")}`}
                value={shares[m.id]}
                onChange={(e) =>
                  setShares((s) => ({ ...s, [m.id]: e.target.value }))
                }
              />
            )}
            <span className="allocation-preview">
              {preview
                ? money(
                    preview.shared.find((a) => a.id === m.id)?.value || 0n,
                    group.currency,
                  )
                : "—"}
            </span>
          </div>
        ))}
      </fieldset>
      <p className="small muted">
        {t(
          "不可整除時，以最大餘數法分配最小貨幣單位；同餘數按成員順序輪替起點。",
          "Largest remainders allocate indivisible minor units, with rotating tie breaks.",
        )}
      </p>
      <div className="two-col">
        <Field label={t("日期", "Date")}>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label={t("分類", "Category")}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
            {!categories.includes(category) && <option>{category}</option>}
          </select>
        </Field>
      </div>
      <Field label={t("備註（選填）", "Note (optional)")}>
        <textarea
          value={note}
          maxLength={2000}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {duplicate && (
        <label className="duplicate-warning">
          <input
            type="checkbox"
            checked={allowDuplicate}
            onChange={(e) => setAllowDuplicate(e.target.checked)}
          />
          {t(
            "與現有費用相似，我確認仍要儲存",
            "Similar to an existing expense; save anyway",
          )}
        </label>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <span>
          {preview
            ? t("本位幣合計 ", "Base total ") +
              money(preview.total, group.currency)
            : t("請完成付款與分攤資料", "Complete payers and shares")}
        </span>
        <button disabled={disabled} type="submit" className="primary">
          {t("儲存費用", "Save expense")}
        </button>
      </div>
    </form>
  );
}
function TextForm({
  group,
  en,
  disabled,
  onSave,
}: {
  group: Group;
  en: boolean;
  disabled: boolean;
  onSave: (entries: Expense[]) => Promise<void>;
}) {
  const [text, setText] = useState(""),
    [error, setError] = useState(""),
    [ack, setAck] = useState(false);
  const t = (z: string, e: string) => (en ? e : z);
  const parsed = parseText(text),
    unknown = [...new Set(parsed.entries.map((e) => e.payer))].filter(
      (n) => !group.members.some((m) => m.name === n),
    );
  const entries: Expense[] = parsed.entries.map((e, i) => ({
    id: `preview-${i}`,
    title: e.title,
    kind: "expense",
    amount: e.amount,
    discount: "0",
    tip: "0",
    currency: group.currency,
    rate: "1",
    payers: [
      {
        memberId: group.members.find((m) => m.name === e.payer)?.id || "",
        value: e.amount,
      },
    ],
    mode: "equal",
    shares: group.members.map((m) => ({ memberId: m.id, value: "1" })),
    category: categories[0],
    date: today(),
    note: "",
    roundingOffset: (group.expenses.length + i) % group.members.length,
    deleted: false,
  }));
  let validity = "";
  try {
    entries.forEach((e) => calculateExpense(e, group));
  } catch (e) {
    validity = String(e);
  }
  const duplicates = entries.some((e, i) => {
    try {
      return (
        duplicateExpense(e, group) ||
        entries
          .slice(0, i)
          .some(
            (p) =>
              p.title === e.title &&
              p.amount === e.amount &&
              p.payers[0].memberId === e.payers[0].memberId,
          )
      );
    } catch {
      return false;
    }
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (
          parsed.errors.length ||
          unknown.length ||
          validity ||
          !entries.length
        ) {
          setError(
            t(
              "請先修正所有格式、名字與金額",
              "Fix all format, name and amount errors",
            ),
          );
          return;
        }
        if (duplicates && !ack) {
          setError(t("請確認重複項目", "Confirm duplicates"));
          return;
        }
        void onSave(entries.map((e) => ({ ...e, id: uid() })));
      }}
    >
      <p>
        {t(
          "每行「付款人：品項 金額、品項 金額」。付款人必須與成員同名；所有成員平均分攤。此解析器不猜測自由文字。",
          "Each line: payer: item amount, item amount. Names must match members. Split equally among everyone. This parser does not guess free text.",
        )}
      </p>
      <Field
        label={t("貼上固定格式文字", "Paste structured text")}
        hint={t(
          `範例：${group.members[0].name}：晚餐1000、交通200。金額不可含千分位逗號；品項以數字結尾時請留空格。`,
          `Example: ${group.members[0].name}: Dinner 1000, Taxi 200. No thousands separators. Separate digit-ending labels with a space.`,
        )}
      >
        <textarea
          maxLength={50000}
          rows={5}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setAck(false);
          }}
          placeholder={`${group.members[0].name}：晚餐1000、交通200`}
        />
      </Field>
      {[
        ...parsed.errors,
        ...unknown.map((n) => t(`找不到成員：${n}`, `Unknown member: ${n}`)),
        ...(validity ? [validity] : []),
      ].map((s, i) => (
        <p className="form-error" key={i}>
          {s}
        </p>
      ))}
      <h3>
        {t("匯入前預覽", "Preview before saving")} · {entries.length}
      </h3>
      <div className="preview-list">
        {parsed.entries.map((e, i) => (
          <div key={i}>
            <span>
              {e.payer} · {e.title}
            </span>
            <strong>
              {group.currency} {e.amount}
            </strong>
          </div>
        ))}
      </div>
      {duplicates && (
        <label className="duplicate-warning">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />
          {t(
            "發現相似／重複項目，我確認仍要新增",
            "Similar or repeated items found; add anyway",
          )}
        </label>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button
          className="primary"
          disabled={
            disabled ||
            !entries.length ||
            !!parsed.errors.length ||
            !!unknown.length ||
            !!validity
          }
        >
          {t("全部新增到帳本", "Add all to ledger")}
        </button>
      </div>
    </form>
  );
}
function PaymentForm({
  group,
  en,
  transfer,
  initial,
  disabled,
  onSave,
}: {
  group: Group;
  en: boolean;
  transfer?: Transfer;
  initial?: Payment;
  disabled: boolean;
  onSave: (p: Group["payments"][number]) => Promise<void>;
}) {
  const t = (z: string, e: string) => (en ? e : z),
    [from, setFrom] = useState(
      initial?.from || transfer?.from || group.members[0].id,
    ),
    [to, setTo] = useState(initial?.to || transfer?.to || group.members[1].id),
    [amount, setAmount] = useState(
      initial?.amount ||
        (transfer ? major(transfer.amount, group.currency) : ""),
    ),
    [confirmed, setConfirmed] = useState(initial?.confirmed ?? true),
    [date, setDate] = useState(initial?.date || today()),
    [note, setNote] = useState(initial?.note || ""),
    [error, setError] = useState(""),
    [ack, setAck] = useState(false);
  const duplicate = group.payments.some((p) => {
    try {
      return (
        !p.deleted &&
        p.id !== initial?.id &&
        p.from === from &&
        p.to === to &&
        p.date === date &&
        minor(p.amount, group.currency) === minor(amount, group.currency)
      );
    } catch {
      return false;
    }
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          if (from === to || minor(amount, group.currency) <= 0n)
            throw new Error(
              t(
                "成員須不同且金額大於零",
                "Choose different people and a positive amount",
              ),
            );
          if (duplicate && !ack)
            throw new Error(
              t(
                "發現相似還款，請確認是否為另一筆真實轉帳",
                "Similar payment found. Confirm this is a separate real transfer.",
              ),
            );
          void onSave({
            id: initial?.id || uid(),
            from,
            to,
            amount,
            date,
            note,
            confirmed,
            deleted: false,
          });
        } catch (e) {
          setError(String(e));
        }
      }}
    >
      <p>
        {t(
          "可以只記一部分還款。金額使用帳本幣別；確認後會即時重新結算，不會真的發送款項。",
          "Partial repayments are supported in the ledger currency. Confirmed records recalculate balances; no money is sent.",
        )}
      </p>
      <div className="two-col">
        {[
          { label: t("轉出人", "From"), value: from, set: setFrom },
          { label: t("收款人", "To"), value: to, set: setTo },
        ].map((f) => (
          <Field key={f.label} label={f.label}>
            <select value={f.value} onChange={(e) => f.set(e.target.value)}>
              {group.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>
      <div className="two-col">
        <Field label={t("還款金額", "Payment amount") + ` (${group.currency})`}>
          <input
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label={t("轉帳日期", "Payment date")}>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
      </div>
      <Field label={t("備註", "Note")}>
        <input
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <label className="check-label">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        {t(
          "已實際轉帳並自行確認（取消則只記待確認）",
          "Transferred and confirmed locally (uncheck to record as pending)",
        )}
      </label>
      {duplicate && (
        <label className="duplicate-warning">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />
          {t(
            "相同日期、對象與金額已有紀錄；這是另一筆真實轉帳",
            "Same date, people and amount already recorded; this is a separate real transfer",
          )}
        </label>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="primary" disabled={disabled}>
          {t("儲存還款紀錄", "Save repayment")}
        </button>
      </div>
    </form>
  );
}
function PaymentList({
  group,
  en,
  onEdit,
  onChange,
}: {
  group: Group;
  en: boolean;
  onEdit: (p: Payment) => void;
  onChange: (id: string, action: string) => void;
}) {
  const t = (z: string, e: string) => (en ? e : z);
  const name = (id: string) => group.members.find((m) => m.id === id)?.name;
  return (
    <section className="panel no-print">
      <h2>{t("還款紀錄", "Payment history")}</h2>
      {!group.payments.length && (
        <p className="muted">
          {t(
            "還沒有還款紀錄，實際轉帳後再新增。",
            "No payments recorded. Add them after transferring.",
          )}
        </p>
      )}
      {group.payments
        .slice()
        .reverse()
        .map((p) => (
          <div
            key={p.id}
            className={"payment-row " + (p.deleted ? "is-deleted" : "")}
          >
            <div>
              <strong>
                {name(p.from)} → {name(p.to)}
              </strong>
              <small>
                {p.date} ·{" "}
                {p.deleted
                  ? t("已刪除", "Deleted")
                  : p.confirmed
                    ? t("自行確認已付款", "Locally confirmed")
                    : t(
                        "待確認，不計入餘額",
                        "Pending, excluded from balances",
                      )}
                {p.note ? " · " + p.note : ""}
              </small>
            </div>
            <strong>
              {group.currency} {p.amount}
            </strong>
            <div className="row-actions">
              {!p.deleted && (
                <button disabled={group.archived} onClick={() => onEdit(p)}>
                  {t("編輯還款", "Edit payment")}
                </button>
              )}
              {!p.deleted && !p.confirmed && (
                <button
                  disabled={group.archived}
                  onClick={() => onChange(p.id, "confirm")}
                >
                  {t("確認已付款", "Confirm payment")}
                </button>
              )}
              <button
                disabled={group.archived}
                onClick={() => onChange(p.id, "delete")}
              >
                {p.deleted ? t("復原", "Restore") : t("刪除", "Delete")}
              </button>
            </div>
          </div>
        ))}
    </section>
  );
}
function Members({
  group,
  en,
  onChange,
  onNotice,
  onDuplicate,
  onArchive,
}: {
  group: Group;
  en: boolean;
  onChange: (fn: (g: Group) => void, allow?: boolean) => Promise<unknown>;
  onNotice: (s: string) => void;
  onDuplicate: () => void;
  onArchive: () => void;
}) {
  const t = (z: string, e: string) => (en ? e : z);
  const [newName, setNewName] = useState(""),
    [ledgerName, setLedgerName] = useState(group.name);
  async function saveName(member: Member | undefined, name: string) {
    try {
      const clean = name.trim();
      if (
        !clean ||
        clean.length > 40 ||
        group.members.some((m) => m.id !== member?.id && m.name === clean)
      )
        throw new Error(
          t(
            "名字不可空白或重複，最多 40 字",
            "Use a unique name, up to 40 characters",
          ),
        );
      await onChange((g) => {
        if (member) g.members.find((m) => m.id === member.id)!.name = clean;
        else g.members.push({ id: uid(), name: clean });
      });
      setNewName("");
      onNotice(t("成員已更新", "Members updated"));
    } catch (e) {
      onNotice(String(e));
    }
  }
  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>
            {t("成員管理", "Manage people")} · {group.members.length}
          </h2>
          <span className="muted small">
            {t(
              "有帳目紀錄的成員保留追溯",
              "Members with records remain traceable",
            )}
          </span>
        </div>
        {group.members.map((m, i) => (
          <MemberRow
            key={m.id}
            member={m}
            index={i}
            en={en}
            archived={group.archived}
            onSave={(name) => saveName(m, name)}
            onDelete={async () => {
              try {
                if (group.members.length <= 2)
                  throw new Error(
                    t("至少保留兩位成員", "Keep at least two members"),
                  );
                if (
                  group.expenses.some((e) =>
                    [...e.payers, ...e.shares].some((a) => a.memberId === m.id),
                  ) ||
                  group.payments.some((p) => p.from === m.id || p.to === m.id)
                )
                  throw new Error(
                    t(
                      "此成員已有紀錄（含已刪除），可更名但不可移除",
                      "Member has records (including deleted); rename instead",
                    ),
                  );
                await onChange((g) => {
                  g.members = g.members.filter((x) => x.id !== m.id);
                });
              } catch (e) {
                onNotice(String(e));
              }
            }}
          />
        ))}
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void saveName(undefined, newName);
          }}
        >
          <label className="sr-only" htmlFor="new-member">
            {t("新成員名稱", "New member name")}
          </label>
          <input
            id="new-member"
            required
            maxLength={40}
            value={newName}
            placeholder={t("新成員名稱", "New member name")}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button disabled={group.archived || group.members.length >= 100}>
            {t("加入成員", "Add member")}
          </button>
        </form>
        <p className="small muted">
          {t(
            "新成員不會自動加入既有費用分攤。",
            "New members do not change existing expense shares.",
          )}
        </p>
      </section>
      <section className="panel">
        <h2>{t("帳本管理", "Ledger management")}</h2>
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await onChange((g) => {
                g.name = ledgerName.trim();
              });
              onNotice(t("帳本名稱已更新", "Ledger renamed"));
            } catch (e) {
              onNotice(String(e));
            }
          }}
        >
          <label className="sr-only" htmlFor="ledger-rename">
            {t("帳本名稱", "Ledger name")}
          </label>
          <input
            id="ledger-rename"
            required
            maxLength={80}
            value={ledgerName}
            onChange={(e) => setLedgerName(e.target.value)}
          />
          <button disabled={group.archived}>
            {t("更名帳本", "Rename ledger")}
          </button>
        </form>
        <div className="actions">
          <button onClick={onArchive}>
            {group.archived
              ? t("解除封存", "Unarchive")
              : t("封存活動", "Archive ledger")}
          </button>
          <button onClick={onDuplicate}>
            {t("複製完整帳本", "Duplicate full ledger")}
          </button>
        </div>
        <p className="small muted">
          {t(
            "複製會保留所有費用、還款與成員，是獨立快照；封存後停止編輯。",
            "Duplicate keeps expenses, payments and members as an independent snapshot. Archived ledgers cannot be edited.",
          )}
        </p>
      </section>
    </>
  );
}
function MemberRow({
  member,
  index,
  en,
  archived,
  onSave,
  onDelete,
}: {
  member: Member;
  index: number;
  en: boolean;
  archived: boolean;
  onSave: (name: string) => void;
  onDelete: () => void;
}) {
  const [value, setValue] = useState(member.name);
  return (
    <form
      className="member-row"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value);
      }}
    >
      <span className={"avatar tone-" + (index % 3)}>{member.name[0]}</span>
      <input
        aria-label={`${member.name} ${en ? "name" : "名稱"}`}
        maxLength={40}
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button disabled={archived || value === member.name}>
        {en ? "Save" : "儲存"}
      </button>
      <button type="button" disabled={archived} onClick={onDelete}>
        {en ? "Remove" : "移除"}
      </button>
    </form>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
