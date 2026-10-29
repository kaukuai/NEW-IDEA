import { type Group, type Workspace } from "./model";
import { ledger, calculateExpense } from "./ledger";
import { major, money } from "./money";
import { type Solution } from "./settle";
export function settlementText(
  group: Group,
  solution: Solution,
  english = false,
): string {
  const names = new Map(group.members.map((m) => [m.id, m.name]));
  const l = ledger(group);
  return [
    `【${group.name}】${english ? "Settlement" : "分帳結算"}`,
    `${english ? "Net expenses" : "淨費用"}：${money(l.total, group.currency)}`,
    `${group.members.length} ${english ? "members" : "人"} · ${solution.transfers.length} ${english ? "remaining transfers" : "筆待轉帳"}`,
    solution.mode === "hub"
      ? english
        ? "Coordinator mode: fewer contacts per member, coordinator handles more transfers."
        : "集中收付：其他人僅接觸一位統籌；統籌須經手較多款項。"
      : solution.exact
        ? english
          ? "Proven minimum transaction count (unrestricted transfers)."
          : "已證明最少筆數（允許成員任意互轉）。"
        : english
          ? "Approximate solution; not proven minimum."
          : "大群組近似解，未證明最少。",
    "",
    ...solution.transfers.map(
      (t, i) =>
        `${i + 1}. ${names.get(t.from)} → ${names.get(t.to)}：${money(t.amount, group.currency)}`,
    ),
    ...(!solution.transfers.length
      ? [english ? "All balanced." : "目前已結清。"]
      : []),
    "",
    english
      ? "Recorded locally; verify receipt separately. Not a payment service."
      : "僅為本機記帳，請另外確認入帳；本工具不執行付款。",
    `${english ? "Snapshot" : "結算快照"}：${new Date().toISOString()}`,
  ].join("\n");
}
export function csvCell(value: string) {
  return (
    '"' +
    (/^[\s]*[=+\-@\t\r]/.test(value) ? "'" + value : value).replaceAll(
      '"',
      '""',
    ) +
    '"'
  );
}
export function ledgerCsv(group: Group) {
  const names = new Map(group.members.map((m) => [m.id, m.name]));
  const rows: string[][] = [
    [
      "type",
      "id",
      "date",
      "title",
      "original_currency",
      "original_final",
      "rate",
      "base_currency",
      "base_amount",
      "payer_allocations",
      "share_allocations",
      "category",
      "note",
      "status",
    ],
  ];
  for (const e of group.expenses) {
    const c = calculateExpense(e, group);
    rows.push([
      e.kind,
      e.id,
      e.date,
      e.title,
      e.currency,
      major(c.source, e.currency),
      e.rate,
      group.currency,
      major(c.total, group.currency),
      c.paid
        .map((a) => `${names.get(a.id)}:${major(a.value, group.currency)}`)
        .join("; "),
      c.shared
        .map((a) => `${names.get(a.id)}:${major(a.value, group.currency)}`)
        .join("; "),
      e.category,
      e.note,
      e.deleted ? "deleted" : "active",
    ]);
  }
  for (const p of group.payments)
    rows.push([
      "payment",
      p.id,
      p.date,
      `${names.get(p.from)} → ${names.get(p.to)}`,
      group.currency,
      p.amount,
      "1",
      group.currency,
      p.amount,
      names.get(p.from) || "",
      names.get(p.to) || "",
      "",
      p.note,
      p.deleted ? "deleted" : p.confirmed ? "confirmed" : "pending",
    ]);
  return "\ufeff" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
export function download(
  data: BlobPart | Blob,
  filename: string,
  type: string,
) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export const exportBackup = (workspace: Workspace) =>
  download(
    JSON.stringify(workspace, null, 2),
    `fold-backup-${new Date().toISOString().slice(0, 10)}.json`,
    "application/json",
  );
export async function settlementPng(
  group: Group,
  solution: Solution,
  english = false,
) {
  const lines = settlementText(group, solution, english).split("\n");
  const wrapped = lines.flatMap((line) => {
    const chars = Array.from(line);
    return Array.from(
      { length: Math.max(1, Math.ceil(chars.length / 27)) },
      (_, i) => chars.slice(i * 27, (i + 1) * 27).join(""),
    );
  });
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 220 + wrapped.length * 52;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.fillStyle = "#f5f6f0";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#215b4b";
  ctx.fillRect(0, 0, 960, 100);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px sans-serif";
  ctx.fillText("合帳 Fold", 50, 64);
  ctx.fillStyle = "#172c25";
  ctx.font = "28px sans-serif";
  wrapped.forEach((l, i) => ctx.fillText(l, 50, 160 + i * 52));
  await new Promise<void>((resolve, reject) =>
    canvas.toBlob((blob) => {
      if (blob) {
        download(blob, "fold-settlement.png", "image/png");
        resolve();
      } else reject(new Error("PNG export failed"));
    }, "image/png"),
  );
}
