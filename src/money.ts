import { currencies, type Currency } from "./model";
export const MAX_MINOR = 10n ** 15n;
export function decimal(
  value: string,
  places: number,
  max = MAX_MINOR,
): bigint {
  if (
    typeof value !== "string" ||
    value.length > 32 ||
    !new RegExp(`^\\d{1,16}(?:\\.\\d{1,${Math.max(1, places)}})?$`).test(
      value,
    ) ||
    (places === 0 && value.includes("."))
  )
    throw new Error("請輸入有效數字 / Invalid number");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > places)
    throw new Error(`最多 ${places} 位小數 / Too many decimals`);
  const result =
    BigInt(whole) * 10n ** BigInt(places) +
    BigInt(fraction.padEnd(places, "0") || "0");
  if (result > max) throw new Error("金額超過安全上限 / Amount limit exceeded");
  return result;
}
export const minor = (value: string, currency: Currency) =>
  decimal(value, currencies[currency]);
export function major(value: bigint, currency: Currency): string {
  const p = currencies[currency],
    a = value < 0n ? -value : value;
  const text = a.toString().padStart(p + 1, "0");
  return `${value < 0n ? "-" : ""}${p ? text.slice(0, -p) + "." + text.slice(-p) : text}`;
}
export function money(value: bigint, currency: Currency) {
  const [w, f] = major(value, currency).split(".");
  return `${currency} ${w.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${f && /[1-9]/.test(f) ? "." + f : ""}`;
}
export function allocate(
  total: bigint,
  weights: bigint[],
  offset = 0,
): bigint[] {
  if (total < 0n || !weights.length || weights.some((w) => w < 0n))
    throw new Error("無效分攤 / Invalid allocation");
  const sum = weights.reduce((s, w) => s + w, 0n);
  if (!sum) throw new Error("分攤權重不可全為零 / Weights cannot all be zero");
  const parts = weights.map((w) => (total * w) / sum);
  const ranked = weights
    .map((w, i) => ({
      i,
      remainder: (total * w) % sum,
      tie: (i - (offset % weights.length) + weights.length) % weights.length,
    }))
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.tie - b.tie
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  let left = total - parts.reduce((s, p) => s + p, 0n);
  for (let i = 0; left > 0n; i++, left--) parts[ranked[i].i]++;
  return parts;
}
export function convert(
  value: bigint,
  from: Currency,
  to: Currency,
  rate: string,
) {
  if (value < 0n || value > MAX_MINOR)
    throw new Error("來源金額超過上限 / Source amount exceeds limit");
  const r = decimal(rate, 8, 10n ** 20n);
  if (!r) throw new Error("匯率須大於零 / Rate must be positive");
  if (from === to && r !== 100000000n)
    throw new Error("同幣別匯率須為 1 / Same currency rate must be 1");
  const numerator = value * r * 10n ** BigInt(currencies[to]);
  const denominator = 10n ** BigInt(currencies[from] + 8);
  const result = (numerator + denominator / 2n) / denominator;
  if (result > MAX_MINOR)
    throw new Error("換算金額超過上限 / Converted amount too large");
  return result;
}
