import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  allocate,
  convert,
  decimal,
  major,
  minor,
  MAX_MINOR,
} from "../src/money";
import {
  calculateExpense,
  duplicateExpense,
  ledger,
  reflowRounding,
} from "../src/ledger";
import { settle, verifySolution, type Balance } from "../src/settle";
import { exampleGroup } from "../src/demo";
import { emptyWorkspace, type Expense, type Group } from "../src/model";
import { parseText } from "../src/parser";
import { parseBackup, validateWorkspace, migrate } from "../src/validate";
import { csvCell, ledgerCsv, settlementText } from "../src/exports";

const fixture = () => {
  const group = exampleGroup();
  [
    "旅伴一",
    "旅伴二",
    "旅伴三",
    "旅伴四",
    "旅伴五",
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
  ].forEach((name, i) => {
    group.members[i].name = name;
  });
  ["聚餐一", "聚餐二", "晚餐", "採買", "午餐", "民宿", "雜支", "雜支"].forEach(
    (title, i) => {
      group.expenses[i].title = title;
    },
  );
  return group;
};
function expense(g: Group, overrides: Partial<Expense> = {}): Expense {
  return {
    ...g.expenses[0],
    id: crypto.randomUUID(),
    amount: "100",
    payers: [{ memberId: g.members[0].id, value: "100" }],
    shares: g.members.slice(0, 3).map((m) => ({ memberId: m.id, value: "1" })),
    ...overrides,
  };
}
// Independent exhaustive pair-cancellation search. Does not use subset DP.
function brute(values: bigint[]): number {
  const a = values.filter((v) => v !== 0n);
  if (!a.length) return 0;
  let best = Infinity;
  for (let j = 1; j < a.length; j++)
    if (a[0] * a[j] < 0n) {
      const next = a.slice(1);
      next[j - 1] += a[0];
      best = Math.min(best, 1 + brute(next));
    }
  return best;
}
describe("integer money and conservative allocation", () => {
  it("handles decimal precision without floating point", () => {
    expect(minor("0.29", "USD")).toBe(29n);
    expect(minor("1.001", "KWD")).toBe(1001n);
    expect(minor("43813", "TWD")).toBe(4381300n);
    expect(major(-123n, "USD")).toBe("-1.23");
    expect(() => minor("1.1", "JPY")).toThrow();
    expect(() => minor("1.005", "USD")).toThrow();
  });
  it("rejects malformed, extreme, signed, exponent and nonfinite inputs", () => {
    for (const value of [
      "-1",
      "+1",
      "1e3",
      "NaN",
      "Infinity",
      "1,000",
      " 1",
      "1.",
      "1.001",
      "9000000000000000",
    ])
      expect(() => minor(value, "USD")).toThrow();
    expect(() => decimal("9".repeat(100), 2)).toThrow();
    expect(minor("10000000000000", "USD")).toBe(MAX_MINOR);
  });
  it("conserves every unit, bounds errors and rotates ties", () => {
    expect(allocate(100n, [1n, 1n, 1n], 0)).toEqual([34n, 33n, 33n]);
    expect(allocate(100n, [1n, 1n, 1n], 1)).toEqual([33n, 34n, 33n]);
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 20n }),
        fc
          .array(fc.integer({ min: 0, max: 100000 }), {
            minLength: 1,
            maxLength: 100,
          })
          .filter((w) => w.some((x) => x > 0)),
        (total, weights) => {
          const ws = weights.map(BigInt),
            sum = ws.reduce((a, b) => a + b),
            parts = allocate(total, ws);
          expect(parts.reduce((a, b) => a + b)).toBe(total);
          parts.forEach((p, i) => {
            expect(p >= 0n).toBe(true);
            expect(
              p === (total * ws[i]) / sum || p === (total * ws[i]) / sum + 1n,
            ).toBe(true);
            if (!ws[i]) expect(p).toBe(0n);
          });
        },
      ),
      { seed: 20261029, numRuns: 500 },
    );
  });
  it("manual rates round exactly once using half-up then allocate", () => {
    expect(convert(100n, "JPY", "TWD", "0.215")).toBe(2150n);
    expect(convert(1n, "USD", "JPY", "150.5")).toBe(2n);
    expect(convert(100n, "USD", "TWD", "32.12345678")).toBe(3212n);
    expect(() => convert(100n, "TWD", "TWD", "2")).toThrow();
    expect(() => convert(100n, "USD", "TWD", "0")).toThrow();
    expect(() => convert(MAX_MINOR + 1n, "USD", "TWD", "0.01")).toThrow();
    expect(() => convert(-1n, "USD", "TWD", "1")).toThrow();
  });
});
describe("ledger and splits", () => {
  it("matches every value in the provided 11-person case", () => {
    const g = fixture(),
      l = ledger(g);
    expect(l.total).toBe(4381300n);
    expect(l.rows.map((r) => r.owed)).toEqual(Array(11).fill(398300n));
    expect(l.rows.map((r) => r.balance)).toEqual([
      508700n,
      322200n,
      2258700n,
      -344900n,
      -354900n,
      ...Array(6).fill(-398300n),
    ]);
    const sol = settle(l.rows);
    expect(sol.exact).toBe(true);
    expect(sol.components).toBe(1);
    expect(sol.transfers).toHaveLength(10);
    expect(verifySolution(l.rows, sol.transfers)).toBe(true);
    const properZeroSubsets = [];
    for (let mask = 1; mask < (1 << 11) - 1; mask++) {
      let sum = 0n;
      for (let i = 0; i < 11; i++)
        if ((mask >> i) & 1) sum += l.rows[i].balance;
      if (!sum) properZeroSubsets.push(mask);
    }
    expect(properZeroSubsets).toEqual([]);
  });
  it("supports multiple payers and all four split modes", () => {
    const g = fixture(),
      ids = g.members.map((m) => m.id);
    for (const mode of ["equal", "amount", "percent", "weight"] as const) {
      const values =
        mode === "amount"
          ? ["20", "30", "50"]
          : mode === "percent"
            ? ["20", "30", "50"]
            : ["1", "2", "2"];
      const e = expense(g, {
        mode,
        payers: [
          { memberId: ids[0], value: "60" },
          { memberId: ids[1], value: "40" },
        ],
        shares: ids
          .slice(0, 3)
          .map((id, i) => ({ memberId: id, value: values[i] })),
      });
      const c = calculateExpense(e, g);
      expect(c.paid.map((p) => p.value)).toEqual([6000n, 4000n]);
      expect(c.shared.reduce((a, b) => a + b.value, 0n)).toBe(10000n);
      if (mode === "amount" || mode === "percent")
        expect(c.shared.map((s) => s.value)).toEqual([2000n, 3000n, 5000n]);
    }
  });
  it("checks invalid sum, participants, rate and zero weights", () => {
    const g = fixture();
    for (const e of [
      expense(g, { payers: [{ memberId: g.members[0].id, value: "99" }] }),
      expense(g, { shares: [] }),
      expense(g, { shares: [{ memberId: "unknown", value: "1" }] }),
      expense(g, {
        mode: "percent",
        shares: [{ memberId: g.members[0].id, value: "99" }],
      }),
      expense(g, {
        mode: "weight",
        shares: [{ memberId: g.members[0].id, value: "0" }],
      }),
    ])
      expect(() => calculateExpense(e, g)).toThrow();
  });
  it("applies discount and tip, then reverses merchant refunds", () => {
    const g = fixture(),
      e = expense(g, {
        amount: "100",
        discount: "20",
        tip: "5",
        payers: [{ memberId: g.members[0].id, value: "85" }],
      });
    g.expenses = [e, { ...e, id: crypto.randomUUID(), kind: "refund" }];
    expect(ledger(g).total).toBe(0n);
    expect(ledger(g).rows.every((r) => r.balance === 0n)).toBe(true);
  });
  it("fixed foreign rate splits the converted total without leakage", () => {
    const g = fixture(),
      e = expense(g, {
        amount: "1",
        currency: "USD",
        rate: "32.12345678",
        payers: [{ memberId: g.members[0].id, value: "1" }],
      });
    const c = calculateExpense(e, g);
    expect(c.total).toBe(3212n);
    expect(c.shared.reduce((s, a) => s + a.value, 0n)).toBe(3212n);
    expect(c.paid.reduce((s, a) => s + a.value, 0n)).toBe(3212n);
  });
  it("handles confirmed/pending/partial repayments once, editing, deletion and restoration", () => {
    const g = fixture();
    g.expenses = [
      expense(g, {
        shares: g.members
          .slice(0, 2)
          .map((m) => ({ memberId: m.id, value: "1" })),
      }),
    ];
    g.payments = [
      {
        id: "p",
        from: g.members[1].id,
        to: g.members[0].id,
        amount: "10",
        date: "2026-10-29",
        note: "",
        confirmed: false,
        deleted: false,
      },
    ];
    expect(ledger(g).rows[0].balance).toBe(5000n);
    g.payments[0].confirmed = true;
    expect(ledger(g).rows[0].balance).toBe(4000n);
    expect(ledger(g).rows[1].balance).toBe(-4000n);
    g.payments[0].deleted = true;
    expect(ledger(g).rows[0].balance).toBe(5000n);
    g.expenses[0].deleted = true;
    expect(ledger(g).total).toBe(0n);
    g.expenses[0].deleted = false;
    expect(ledger(g).total).toBe(10000n);
  });
  it("detects repeated financial records independent of payer order", () => {
    const g = fixture();
    const e = { ...g.expenses[0], id: "another" };
    expect(duplicateExpense(e, g)).toBe(true);
    expect(duplicateExpense({ ...e, date: "2026-10-28" }, g)).toBe(false);
  });
  it("cumulative equal rounding remains fair after edits and full refund", () => {
    const g = fixture();
    g.expenses = Array.from({ length: 9 }, (_, i) =>
      expense(g, {
        id: String(i),
        amount: "0.01",
        payers: [{ memberId: g.members[0].id, value: "0.01" }],
      }),
    );
    reflowRounding(g);
    expect(
      ledger(g)
        .rows.slice(0, 3)
        .map((r) => r.owed),
    ).toEqual([3n, 3n, 3n]);
    g.expenses[0].deleted = true;
    reflowRounding(g);
    const shares = ledger(g)
      .rows.slice(0, 3)
      .map((r) => r.owed);
    expect(shares.reduce((a, b) => a + b)).toBe(8n);
    expect(
      shares.reduce((a, b) => (a > b ? a : b)) -
        shares.reduce((a, b) => (a < b ? a : b)),
    ).toBeLessThanOrEqual(1n);
    const first = expense(g),
      refund = { ...first, id: "refund", kind: "refund" as const };
    g.expenses = [first, refund];
    reflowRounding(g);
    expect(ledger(g).rows.every((r) => r.balance === 0n)).toBe(true);
  });
  it("handles 10,000 traceable expenses without losing integer precision", () => {
    const g = fixture();
    g.expenses = Array.from({ length: 10000 }, (_, i) =>
      expense(g, {
        id: String(i),
        amount: "9999999999.99",
        payers: [{ memberId: g.members[0].id, value: "9999999999.99" }],
      }),
    );
    reflowRounding(g);
    const l = ledger(g);
    expect(l.total).toBe(9999999999990000n);
    expect(l.rows.reduce((s, r) => s + r.balance, 0n)).toBe(0n);
  });
  it("conserves balances across random groups of 2–100 with many entries", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 100 }),
        fc.array(
          fc.record({
            total: fc.integer({ min: 1, max: 1000000000 }),
            payer: fc.nat(99),
            refund: fc.boolean(),
          }),
          { minLength: 1, maxLength: 100 },
        ),
        (n, items) => {
          const g = fixture();
          g.members = Array.from({ length: n }, (_, i) => ({
            id: String(i),
            name: `M${i}`,
          }));
          g.expenses = items.map((x, i) =>
            expense(g, {
              amount: major(BigInt(x.total), "TWD"),
              payers: [
                {
                  memberId: g.members[x.payer % n].id,
                  value: major(BigInt(x.total), "TWD"),
                },
              ],
              shares: g.members
                .filter((_, k) => (i + k) % 3 !== 0 || k === 0)
                .map((m) => ({ memberId: m.id, value: "1" })),
              roundingOffset: i % n,
              kind: x.refund ? "refund" : "expense",
            }),
          );
          const l = ledger(g);
          expect(l.rows.reduce((s, r) => s + r.balance, 0n)).toBe(0n);
          expect(l.rows.reduce((s, r) => s + r.owed, 0n)).toBe(l.total);
        },
      ),
      { seed: 1323, numRuns: 120 },
    );
  });
});
describe("minimum transfer proof and approximations", () => {
  it("is better than naive greedy for a counterexample", () => {
    const values = [-5n, -4n, -3n, 7n, 5n];
    const rows = values.map((balance, i) => ({ id: String(i), balance }));
    const s = settle(rows);
    expect(s.transfers).toHaveLength(3);
    expect(s.components).toBe(2);
  });
  it("agrees with independent exhaustive cancellation on random small vectors", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -15, max: 15 }), {
          minLength: 1,
          maxLength: 7,
        }),
        (values) => {
          const b = values.map(BigInt);
          b.push(-b.reduce((s, x) => s + x, 0n));
          const rows = b.map((balance, i) => ({ id: String(i), balance }));
          const sol = settle(rows);
          expect(verifySolution(rows, sol.transfers)).toBe(true);
          expect(sol.transfers.length).toBe(brute(b));
          expect(sol.exact).toBe(true);
        },
      ),
      { seed: 7712026, numRuns: 160 },
    );
  });
  it("covers every group size 2–100 and labels the threshold honestly", () => {
    for (let n = 2; n <= 100; n++) {
      const rows: Balance[] = Array.from({ length: n }, (_, i) => ({
        id: String(i),
        balance: i === n - 1 ? BigInt(n - 1) : -1n,
      }));
      const sol = settle(rows);
      expect(verifySolution(rows, sol.transfers)).toBe(true);
      expect(sol.transfers.length).toBe(n - 1);
      expect(sol.exact).toBe(n <= 18);
    }
  });
  it("coordinator mode reduces each other person to one contact and orders collections first", () => {
    const rows = [-5n, -4n, -3n, 7n, 5n].map((balance, i) => ({
      id: String(i),
      balance,
    }));
    const s = settle(rows, "hub", "4");
    expect(verifySolution(rows, s.transfers)).toBe(true);
    expect(s.exact).toBe(false);
    expect(s.transfers.every((t) => t.from === "4" || t.to === "4")).toBe(true);
    expect(s.transfers).toHaveLength(4);
    expect(s.transfers.slice(0, 3).every((t) => t.to === "4")).toBe(true);
  });
  it("rejects broken vectors, handles all-zero and empty", () => {
    expect(() => settle([{ id: "a", balance: 1n }])).toThrow();
    expect(settle([]).transfers).toEqual([]);
    expect(
      settle([
        { id: "a", balance: 0n },
        { id: "b", balance: 0n },
      ]).exact,
    ).toBe(true);
    expect(
      verifySolution(
        [{ id: "a", balance: 0n }],
        [{ from: "a", to: "a", amount: 1n }],
      ),
    ).toBe(false);
  });
});
describe("defined parser and export safety", () => {
  it("parses the exact user example without model calls", () => {
    const result = parseText(
      "旅伴一：聚餐一1000、聚餐二2000、晚餐6070\n旅伴二：採買7205\n旅伴三：午餐3370、民宿23200",
    );
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(6);
    expect(
      result.entries.map((e) => BigInt(e.amount)).reduce((a, b) => a + b),
    ).toBe(42845n);
  });
  it("rejects ambiguous, negative, thousands-separated, arithmetic and missing amounts", () => {
    for (const s of [
      "A: meal -100",
      "A: meal 1,000",
      "A: meal 100+200",
      "A: meal",
      "A: meal 1.2.3",
      "100",
    ])
      expect(parseText(s).errors.length).toBeGreaterThan(0);
    expect(parseText("A: Room2 100").entries[0].amount).toBe("100");
  });
  it("neutralizes spreadsheet formulas and retains traceability", () => {
    for (const s of ['=HYPERLINK("x")', "+1", "-1", "@SUM(A1)", " \t=1"])
      expect(csvCell(s)).toMatch(/^"'/);
    const g = fixture();
    expect(ledgerCsv(g)).toContain("payer_allocations");
    expect(settlementText(g, settle(ledger(g).rows))).toContain("已證明最少");
  });
});
describe("backup validation and migration", () => {
  it("round trips, strips unknown prototype keys and migrates known v1", () => {
    const w = emptyWorkspace();
    w.groups = [fixture()];
    expect(parseBackup(JSON.stringify(w))).toEqual(w);
    const old = { ...w, schemaVersion: 1 };
    expect(migrate(old).schemaVersion).toBe(2);
    const polluted = JSON.parse(JSON.stringify(w));
    polluted.__proto__ = { poison: true };
    expect(Object.hasOwn(validateWorkspace(polluted), "__proto__")).toBe(false);
  });
  it("rejects future schema, duplicate IDs, malformed money, unknown members, unbalanced shares and invalid dates", () => {
    const base = emptyWorkspace();
    base.groups = [fixture()];
    const edits = [
      (w: any) => (w.schemaVersion = 999),
      (w: any) => w.groups.push(w.groups[0]),
      (w: any) => (w.groups[0].expenses[0].amount = "1e10"),
      (w: any) => (w.groups[0].expenses[0].shares[0].memberId = "x"),
      (w: any) => (w.groups[0].expenses[0].payers[0].value = "1"),
      (w: any) => (w.groups[0].expenses[0].date = "2026-02-31"),
      (w: any) =>
        w.groups[0].payments.push({
          id: "x",
          from: w.groups[0].members[0].id,
          to: "missing",
          amount: "1",
          date: "2026-10-29",
          note: "",
          confirmed: false,
          deleted: false,
        }),
    ];
    for (const edit of edits) {
      const w = structuredClone(base);
      edit(w);
      expect(() => parseBackup(JSON.stringify(w))).toThrow();
    }
    expect(() => parseBackup("{")).toThrow();
    expect(() => parseBackup(" ".repeat(10 * 1024 * 1024 + 1))).toThrow();
  });
});
