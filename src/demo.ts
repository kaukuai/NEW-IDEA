import { categories, today, uid, type Group } from "./model";
import { reflowRounding } from "./ledger";
export function exampleGroup(): Group {
  const members = [
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
  ].map((name) => ({ id: uid(), name }));
  const entries: [number, string, string][] = [
    [0, "聚餐一", "1000"],
    [0, "聚餐二", "2000"],
    [0, "晚餐", "6070"],
    [1, "採買", "7205"],
    [2, "午餐", "3370"],
    [2, "住宿", "23200"],
    [3, "雜支", "534"],
    [4, "雜支", "434"],
  ];
  const group: Group = {
    id: uid(),
    name: "11 人旅行・驗算範例",
    currency: "TWD",
    members,
    archived: false,
    createdAt: new Date().toISOString(),
    payments: [],
    expenses: entries.map(([payer, title, amount], i) => ({
      id: uid(),
      title,
      kind: "expense",
      amount,
      discount: "0",
      tip: "0",
      currency: "TWD",
      rate: "1",
      payers: [{ memberId: members[payer].id, value: amount }],
      mode: "equal",
      shares: members.map((m) => ({ memberId: m.id, value: "1" })),
      category: title === "住宿" ? categories[2] : categories[0],
      date: today(),
      note: "固定驗算範例（化名） / Verification fixture (aliases)",
      roundingOffset: i % 11,
      deleted: false,
    })),
  };
  group.settlements = [];
  reflowRounding(group);
  return group;
}
