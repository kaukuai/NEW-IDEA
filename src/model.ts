export const currencies = {
  TWD: 2,
  USD: 2,
  EUR: 2,
  JPY: 0,
  THB: 2,
  HKD: 2,
  SGD: 2,
  CNY: 2,
  GBP: 2,
  KRW: 0,
  KWD: 3,
} as const;
export type Currency = keyof typeof currencies;
export type Mode = "equal" | "amount" | "percent" | "weight";
export interface Member {
  id: string;
  name: string;
}
export interface Allocation {
  memberId: string;
  value: string;
}
export interface Expense {
  id: string;
  title: string;
  kind: "expense" | "refund";
  amount: string;
  discount: string;
  tip: string;
  currency: Currency;
  rate: string;
  payers: Allocation[];
  mode: Mode;
  shares: Allocation[];
  category: string;
  date: string;
  note: string;
  roundingOffset: number;
  deleted: boolean;
}
export interface Payment {
  id: string;
  from: string;
  to: string;
  amount: string;
  date: string;
  note: string;
  confirmed: boolean;
  deleted: boolean;
}
export interface SettlementRecord {
  id: string;
  createdAt: string;
  revision: number;
  mode: "minimum" | "hub";
  exact: boolean;
  balances: { id: string; name: string; minor: string }[];
  transfers: { from: string; to: string; minor: string }[];
  totalMinor: string;
  expenseIds: string[];
  paymentIds: string[];
}
export interface Group {
  id: string;
  name: string;
  currency: Currency;
  members: Member[];
  expenses: Expense[];
  payments: Payment[];
  settlements?: SettlementRecord[];
  archived: boolean;
  createdAt: string;
}
export interface Workspace {
  schemaVersion: 2;
  revision: number;
  groups: Group[];
  settings: { language: "zh" | "en"; theme: "light" | "dark" | "system" };
}
export const emptyWorkspace = (): Workspace => ({
  schemaVersion: 2,
  revision: 0,
  groups: [],
  settings: { language: "zh", theme: "system" },
});
export const uid = () => crypto.randomUUID();
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const categories = [
  "餐飲 Food",
  "交通 Transport",
  "住宿 Stay",
  "購物 Shopping",
  "娛樂 Fun",
  "其他 Other",
];
