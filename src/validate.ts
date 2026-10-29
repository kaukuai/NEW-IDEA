import {
  currencies,
  type Workspace,
  type Group,
  type Expense,
  type Payment,
  type Member,
} from "./model";
import { calculateExpense, ledger } from "./ledger";
import { decimal, minor } from "./money";
import { verifySolution } from "./settle";
const fail = (): never => {
  throw new Error("備份或資料結構無效 / Invalid data structure");
};
const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : fail();
const text = (v: unknown, max = 100, empty = false): string =>
  typeof v === "string" &&
  v.length <= max &&
  (empty || v.trim().length > 0) &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
    ? v
    : fail();
const bool = (v: unknown): boolean => (typeof v === "boolean" ? v : fail());
const list = (v: unknown, max: number): unknown[] =>
  Array.isArray(v) && v.length <= max ? v : fail();
const integer = (v: unknown, min: number, max: number): number =>
  Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max
    ? Number(v)
    : fail();
const unique = (values: string[]) => {
  if (new Set(values).size !== values.length) fail();
};
const date = (v: unknown) => {
  const s = text(v, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    Number.isNaN(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    fail();
  return s;
};
const currency = (v: unknown) =>
  typeof v === "string" && Object.hasOwn(currencies, v)
    ? (v as keyof typeof currencies)
    : fail();
export function validateWorkspace(raw: unknown): Workspace {
  const w = obj(raw);
  if (w.schemaVersion !== 2)
    throw new Error("不支援此資料版本 / Unsupported schema version");
  const settings = obj(w.settings);
  if (
    !["zh", "en"].includes(String(settings.language)) ||
    !["light", "dark", "system"].includes(String(settings.theme))
  )
    fail();
  let count = 0;
  const groups = list(w.groups, 30).map((value) => {
    const g = obj(value);
    const members: Member[] = list(g.members, 100).map((v) => {
      const m = obj(v);
      return { id: text(m.id, 100), name: text(m.name, 40) };
    });
    if (members.length < 2) fail();
    unique(members.map((m) => m.id));
    unique(members.map((m) => m.name.trim()));
    const memberIds = new Set(members.map((m) => m.id));
    const group: Group = {
      id: text(g.id, 100),
      name: text(g.name, 80),
      currency: currency(g.currency),
      members,
      expenses: [],
      payments: [],
      archived: bool(g.archived),
      createdAt: text(g.createdAt, 40),
    };
    if (Number.isNaN(Date.parse(group.createdAt))) fail();
    group.expenses = list(g.expenses, 10000).map((value) => {
      const e = obj(value);
      if (
        !["equal", "amount", "percent", "weight"].includes(String(e.mode)) ||
        !["expense", "refund"].includes(String(e.kind))
      )
        fail();
      const allocations = (v: unknown) =>
        list(v, 100).map((x) => {
          const a = obj(x);
          return { memberId: text(a.memberId, 100), value: text(a.value, 32) };
        });
      const result: Expense = {
        id: text(e.id, 100),
        title: text(e.title, 100),
        kind: e.kind as Expense["kind"],
        amount: text(e.amount, 32),
        discount: text(e.discount, 32),
        tip: text(e.tip, 32),
        currency: currency(e.currency),
        rate: text(e.rate, 32),
        payers: allocations(e.payers),
        mode: e.mode as Expense["mode"],
        shares: allocations(e.shares),
        category: text(e.category, 40),
        date: date(e.date),
        note: text(e.note, 2000, true),
        roundingOffset: integer(e.roundingOffset, 0, 99),
        deleted: bool(e.deleted),
      };
      // Validate even unused equal weights: imports never retain arbitrary strings in numeric fields.
      for (const share of result.shares)
        if (result.mode === "equal") decimal(share.value, 6);
      calculateExpense(result, group);
      return result;
    });
    group.payments = list(g.payments, 10000).map((value) => {
      const p = obj(value);
      const result: Payment = {
        id: text(p.id, 100),
        from: text(p.from, 100),
        to: text(p.to, 100),
        amount: text(p.amount, 32),
        date: date(p.date),
        note: text(p.note, 2000, true),
        confirmed: bool(p.confirmed),
        deleted: bool(p.deleted),
      };
      if (
        !memberIds.has(result.from) ||
        !memberIds.has(result.to) ||
        result.from === result.to ||
        minor(result.amount, group.currency) <= 0n
      )
        fail();
      return result;
    });
    const signed = (v: unknown) => {
      const s = text(v, 32);
      if (!/^-?\d{1,24}$/.test(s)) fail();
      return s;
    };
    group.settlements = list(g.settlements ?? [], 100).map((value) => {
      const s = obj(value),
        balances = list(s.balances, 100).map((value) => {
          const b = obj(value);
          return {
            id: text(b.id, 100),
            name: text(b.name, 40),
            minor: signed(b.minor),
          };
        }),
        transfers = list(s.transfers, 100).map((value) => {
          const tr = obj(value);
          return {
            from: text(tr.from, 100),
            to: text(tr.to, 100),
            minor: signed(tr.minor),
          };
        });
      unique(balances.map((b) => b.id));
      if (
        !["minimum", "hub"].includes(String(s.mode)) ||
        !verifySolution(
          balances.map((b) => ({ id: b.id, balance: BigInt(b.minor) })),
          transfers.map((tr) => ({
            from: tr.from,
            to: tr.to,
            amount: BigInt(tr.minor),
          })),
        )
      )
        fail();
      const createdAt = text(s.createdAt, 40);
      if (Number.isNaN(Date.parse(createdAt))) fail();
      return {
        id: text(s.id, 100),
        createdAt,
        revision: integer(s.revision, 0, Number.MAX_SAFE_INTEGER - 1),
        mode: s.mode as "minimum" | "hub",
        exact: bool(s.exact),
        balances,
        transfers,
        totalMinor: signed(s.totalMinor),
        expenseIds: list(s.expenseIds, 10000).map((v) => text(v, 100)),
        paymentIds: list(s.paymentIds, 10000).map((v) => text(v, 100)),
      };
    });
    unique(group.settlements.map((s) => s.id));
    unique([
      ...group.expenses.map((e) => e.id),
      ...group.payments.map((p) => p.id),
    ]);
    ledger(group);
    count += group.expenses.length + group.payments.length;
    if (count > 30000)
      throw new Error("最多 30,000 筆明細 / Maximum 30,000 records");
    return group;
  });
  unique(groups.map((g) => g.id));
  const result: Workspace = {
    schemaVersion: 2,
    revision: integer(w.revision, 0, Number.MAX_SAFE_INTEGER - 1),
    groups,
    settings: {
      language: settings.language as "zh" | "en",
      theme: settings.theme as "light" | "dark" | "system",
    },
  };
  if (
    new TextEncoder().encode(JSON.stringify(result)).length > MAX_BACKUP_BYTES
  )
    throw new Error(
      "工作區上限 10 MiB，請先備份並拆分帳本 / Workspace limit 10 MiB; back up and split ledgers",
    );
  return result;
}
/** Published backup format v1: same ledger, absent settings/revision and tombstone defaults. */
export function migrate(raw: unknown): Workspace {
  const w = obj(raw);
  if (w.schemaVersion === 1) {
    const migrated = {
      ...w,
      schemaVersion: 2,
      revision: 0,
      settings: { language: "zh", theme: "system" },
      groups: list(w.groups, 30).map((value) => {
        const g = obj(value);
        return {
          ...g,
          archived: g.archived ?? false,
          expenses: list(g.expenses, 10000).map((value, i) => ({
            ...obj(value),
            deleted: obj(value).deleted ?? false,
            roundingOffset: obj(value).roundingOffset ?? i % 100,
          })),
          payments: list(g.payments ?? [], 10000).map((value) => ({
            ...obj(value),
            deleted: obj(value).deleted ?? false,
            confirmed: obj(value).confirmed ?? true,
          })),
        };
      }),
    };
    return validateWorkspace(migrated);
  }
  return validateWorkspace(w);
}
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export function parseBackup(text: string): Workspace {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES)
    throw new Error("備份上限 10 MiB / Backup limit 10 MiB");
  try {
    return migrate(JSON.parse(text));
  } catch (e) {
    if (e instanceof SyntaxError)
      throw new Error("JSON 格式錯誤 / Invalid JSON");
    throw e;
  }
}
