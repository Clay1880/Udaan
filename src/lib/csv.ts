// Characters that make Excel, Sheets or LibreOffice treat a cell as a formula (OWASP CSV injection).
const FORMULA = /^[=+\-@\t\r＝＋－＠]/;
// C0 controls except tab/LF/CR, plus DEL and C1 controls. Names are free text and may carry these.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

/** One CSV cell: control characters stripped, formulas neutralised with a leading `'`, quoted when needed. */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v).replace(CONTROL, "");
  if (FORMULA.test(s) || FORMULA.test(s.trimStart())) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** RFC 4180 style CSV with CRLF record separators. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
