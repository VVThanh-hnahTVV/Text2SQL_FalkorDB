/** Escape one CSV field (RFC-style, Excel-friendly). */
function escapeCell(val: unknown): string {
  const s = val === null || val === undefined ? "" : String(val);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Download query rows as UTF-8 CSV (with BOM for Excel).
 * @returns false if there is no row to export
 */
export function downloadQueryResultsCsv(rows: Record<string, unknown>[], filename?: string): boolean {
  if (!rows.length) return false;
  const keys = Object.keys(rows[0]);
  if (!keys.length) return false;

  const header = keys.map(escapeCell).join(",");
  const lines = rows.map((row) => keys.map((k) => escapeCell(row[k])).join(","));
  const csv = `\uFEFF${header}\r\n${lines.join("\r\n")}`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `queryweaver-results-${Date.now()}.csv`;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
