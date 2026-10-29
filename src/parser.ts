export interface ParsedLine {
  payer: string;
  title: string;
  amount: string;
  line: number;
}
export function parseText(text: string) {
  if (text.length > 50000) throw new Error("文字過長 / Text too long");
  const entries: ParsedLine[] = [],
    errors: string[] = [];
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const header = line.match(/^\s*([^:：\n]{1,40})[:：](.+)$/);
    if (!header) {
      errors.push(
        `第 ${i + 1} 行：需要「付款人：品項 金額」 / Use payer: item amount`,
      );
      continue;
    }
    const payer = header[1].trim();
    for (const item of header[2].split(/[、,，]/)) {
      // A label ending in a digit is ambiguous without a space. Never guess numeric separators.
      const m =
        item.trim().match(/^(.+?)\s+(\d{1,13}(?:\.\d{1,3})?)$/) ||
        item.trim().match(/^(.+?[^\d.\s\-+])(\d{1,13}(?:\.\d{1,3})?)$/);
      if (!m || !m[1].trim() || /[.\-+]$/.test(m[1].trim()))
        errors.push(
          `第 ${i + 1} 行：「${item.trim()}」格式不明 / Ambiguous item`,
        );
      else
        entries.push({ payer, title: m[1].trim(), amount: m[2], line: i + 1 });
    }
  }
  if (entries.length > 1000)
    errors.push("單次上限 1,000 筆 / Limit 1,000 entries per paste");
  return { entries, errors };
}
