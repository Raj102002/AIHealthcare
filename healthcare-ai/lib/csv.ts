// Minimal RFC4180-ish CSV parser. The two datasets this app reads have no embedded
// commas in unquoted fields, but quoted fields (with escaped "") are still handled
// so this stays correct if the source export ever changes.
export function parseCsv(raw: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const text = raw.replace(/\r\n/g, "\n");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...dataRows] = rows.filter((r) => r.length > 1 || r[0] !== "");
  return dataRows.map((r) => {
    const record: Record<string, string> = {};
    header.forEach((key, idx) => {
      record[key] = r[idx] ?? "";
    });
    return record;
  });
}
