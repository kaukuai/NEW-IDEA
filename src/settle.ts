export interface Balance {
  id: string;
  balance: bigint;
}
export interface Transfer {
  from: string;
  to: string;
  amount: bigint;
}
export interface Solution {
  transfers: Transfer[];
  exact: boolean;
  nonzero: number;
  components?: number;
  mode: "minimum" | "hub";
  hub?: string;
}
function greedy(rows: Balance[]): Transfer[] {
  const debts = rows.filter((r) => r.balance < 0n).map((r) => ({ ...r })),
    credits = rows.filter((r) => r.balance > 0n).map((r) => ({ ...r }));
  const result: Transfer[] = [];
  while (debts.length && credits.length) {
    debts.sort((a, b) =>
      a.balance === b.balance
        ? a.id.localeCompare(b.id)
        : a.balance < b.balance
          ? -1
          : 1,
    );
    credits.sort((a, b) =>
      a.balance === b.balance
        ? a.id.localeCompare(b.id)
        : a.balance > b.balance
          ? -1
          : 1,
    );
    const d = debts[0],
      c = credits[0],
      amount = -d.balance < c.balance ? -d.balance : c.balance;
    result.push({ from: d.id, to: c.id, amount });
    d.balance += amount;
    c.balance -= amount;
    if (!d.balance) debts.shift();
    if (!c.balance) credits.shift();
  }
  return result;
}
/** Exact zero-sum partition DP: O(n * 2^n) time, O(2^n) memory. See docs/ALGORITHM.md. */
export function settle(
  input: Balance[],
  mode: "minimum" | "hub" = "minimum",
  hubId?: string,
): Solution {
  if (
    input.length > 100 ||
    new Set(input.map((r) => r.id)).size !== input.length ||
    input.reduce((s, r) => s + r.balance, 0n) !== 0n
  )
    throw new Error("Invalid balance vector");
  const rows = input.filter((r) => r.balance !== 0n),
    n = rows.length;
  if (mode === "hub") {
    const hub =
      input.find((r) => r.id === hubId) ||
      rows.find((r) => r.balance > 0n) ||
      input[0];
    const transfers: Transfer[] = rows
      .filter((r) => r.id !== hub?.id)
      .map((r) =>
        r.balance < 0n
          ? { from: r.id, to: hub.id, amount: -r.balance }
          : { from: hub.id, to: r.id, amount: r.balance },
      );
    transfers.sort(
      (a, b) => (a.to === hub.id ? 0 : 1) - (b.to === hub.id ? 0 : 1),
    );
    return { transfers, exact: false, nonzero: n, mode, hub: hub?.id };
  }
  if (n > 18)
    return { transfers: greedy(rows), exact: false, nonzero: n, mode };
  if (!n)
    return { transfers: [], exact: true, nonzero: 0, components: 0, mode };
  const size = 1 << n,
    sums: bigint[] = Array(size).fill(0n),
    dp = new Uint8Array(size),
    parent = new Uint8Array(size);
  for (let mask = 1; mask < size; mask++) {
    const bit = mask & -mask,
      i = 31 - Math.clz32(bit);
    sums[mask] = sums[mask ^ bit] + rows[i].balance;
    let best = -1,
      pick = 0;
    for (let rest = mask; rest; rest &= rest - 1) {
      const b = rest & -rest,
        score = dp[mask ^ b];
      if (score > best) {
        best = score;
        pick = 31 - Math.clz32(b);
      }
    }
    dp[mask] = best + (sums[mask] === 0n ? 1 : 0);
    parent[mask] = pick;
  }
  const ordered: number[] = [];
  let mask = size - 1;
  while (mask) {
    const i = parent[mask];
    ordered.push(i);
    mask ^= 1 << i;
  }
  ordered.reverse();
  const transfers: Transfer[] = [];
  let group: Balance[] = [],
    sum = 0n;
  for (const i of ordered) {
    group.push(rows[i]);
    sum += rows[i].balance;
    if (sum === 0n) {
      transfers.push(...greedy(group));
      group = [];
    }
  }
  if (transfers.length !== n - dp[size - 1])
    throw new Error("Exact solver invariant failed");
  return { transfers, exact: true, nonzero: n, components: dp[size - 1], mode };
}
export function verifySolution(rows: Balance[], transfers: Transfer[]) {
  const map = new Map(rows.map((r) => [r.id, r.balance]));
  for (const t of transfers) {
    if (t.amount <= 0n || t.from === t.to || !map.has(t.from) || !map.has(t.to))
      return false;
    map.set(t.from, map.get(t.from)! + t.amount);
    map.set(t.to, map.get(t.to)! - t.amount);
  }
  return [...map.values()].every((b) => b === 0n);
}
