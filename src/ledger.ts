import { type Group, type Expense } from "./model";
import { minor, decimal, allocate, convert } from "./money";
export function calculateExpense(e: Expense, group: Group) {
  const source =
    minor(e.amount, e.currency) -
    minor(e.discount, e.currency) +
    minor(e.tip, e.currency);
  if (source <= 0n)
    throw new Error("折扣後含小費金額須大於零 / Final amount must be positive");
  const memberIds = new Set(group.members.map((m) => m.id));
  for (const list of [e.payers, e.shares]) {
    if (
      !list.length ||
      new Set(list.map((a) => a.memberId)).size !== list.length ||
      list.some((a) => !memberIds.has(a.memberId))
    )
      throw new Error("付款／分攤成員無效 / Invalid participants");
  }
  const paid = e.payers.map((a) => minor(a.value, e.currency));
  if (paid.reduce((a, b) => a + b, 0n) !== source)
    throw new Error(
      "共同付款合計須等於折扣後含小費總額 / Payers must sum to final amount",
    );
  let shared: bigint[];
  if (e.mode === "amount") {
    shared = e.shares.map((a) => minor(a.value, e.currency));
    if (shared.reduce((a, b) => a + b, 0n) !== source)
      throw new Error("指定分攤合計不符 / Shares must sum to final amount");
  } else {
    const weights = e.shares.map((a) =>
      e.mode === "equal" ? 1n : decimal(a.value, e.mode === "percent" ? 2 : 6),
    );
    if (e.mode === "percent" && weights.reduce((a, b) => a + b, 0n) !== 10000n)
      throw new Error("百分比合計須為 100 / Percentages must sum to 100");
    shared = allocate(source, weights, e.roundingOffset);
  }
  const total = convert(source, e.currency, group.currency, e.rate);
  if (!total)
    throw new Error(
      "換算結果不足最小貨幣單位 / Converted amount rounds to zero",
    );
  const sign = e.kind === "refund" ? -1n : 1n;
  const shareWeights =
    e.mode === "equal"
      ? e.shares.map(() => 1n)
      : e.mode === "percent" || e.mode === "weight"
        ? e.shares.map((a) => decimal(a.value, e.mode === "percent" ? 2 : 6))
        : shared;
  const payerAmounts = allocate(total, paid, e.roundingOffset),
    shareAmounts = allocate(total, shareWeights, e.roundingOffset);
  return {
    source,
    total: total * sign,
    paid: e.payers.map((a, i) => ({
      id: a.memberId,
      value: payerAmounts[i] * sign,
    })),
    shared: e.shares.map((a, i) => ({
      id: a.memberId,
      value: shareAmounts[i] * sign,
    })),
  };
}
/** Cumulative remainder rotation for equal cohorts. Recomputed after edits/deletions. */
export function reflowRounding(group: Group) {
  const carries = new Map<string, bigint>();
  for (const e of group.expenses) {
    if (e.deleted || e.mode !== "equal" || !e.shares.length) continue;
    const key = e.shares
        .map((s) => s.memberId)
        .sort()
        .join("\u0000"),
      n = BigInt(e.shares.length);
    const source =
      minor(e.amount, e.currency) -
      minor(e.discount, e.currency) +
      minor(e.tip, e.currency);
    const total = convert(source, e.currency, group.currency, e.rate),
      carry = carries.get(key) || 0n;
    const start = e.kind === "refund" ? carry - total : carry;
    e.roundingOffset = Number(((start % n) + n) % n);
    carries.set(key, carry + (e.kind === "refund" ? -total : total));
  }
}
export function ledger(group: Group) {
  const rows = group.members.map((m) => ({
    ...m,
    paid: 0n,
    owed: 0n,
    sent: 0n,
    received: 0n,
    balance: 0n,
  }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  let total = 0n;
  const categoryTotals = new Map<string, bigint>();
  for (const e of group.expenses.filter((e) => !e.deleted)) {
    const c = calculateExpense(e, group);
    total += c.total;
    categoryTotals.set(
      e.category,
      (categoryTotals.get(e.category) || 0n) + c.total,
    );
    for (const a of c.paid) byId.get(a.id)!.paid += a.value;
    for (const a of c.shared) byId.get(a.id)!.owed += a.value;
  }
  for (const p of group.payments.filter((p) => !p.deleted && p.confirmed)) {
    const value = minor(p.amount, group.currency);
    if (!byId.has(p.from) || !byId.has(p.to) || p.from === p.to || value <= 0n)
      throw new Error("還款資料無效 / Invalid repayment");
    byId.get(p.from)!.sent += value;
    byId.get(p.to)!.received += value;
  }
  for (const row of rows)
    row.balance = row.paid - row.owed + row.sent - row.received;
  if (rows.reduce((s, r) => s + r.balance, 0n) !== 0n)
    throw new Error("帳目不平衡 / Ledger is not balanced");
  return { rows, total, categoryTotals };
}
export function duplicateExpense(e: Expense, group: Group) {
  const key = (v: Expense) =>
    JSON.stringify({
      title: v.title.trim(),
      date: v.date,
      kind: v.kind,
      amount: minor(v.amount, v.currency).toString(),
      currency: v.currency,
      rate: v.rate,
      discount: minor(v.discount, v.currency).toString(),
      tip: minor(v.tip, v.currency).toString(),
      payers: v.payers
        .map((a) => [a.memberId, minor(a.value, v.currency).toString()])
        .sort(),
      mode: v.mode,
      shares: v.shares.map((a) => [a.memberId, a.value]).sort(),
    });
  return group.expenses.some(
    (x) => !x.deleted && x.id !== e.id && key(x) === key(e),
  );
}
