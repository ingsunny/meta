// Minimal CSV parser tuned for the conversion-analytics export format we
// receive daily. State-machine handles quoted fields, embedded commas,
// CRLF line endings, and doubled-quote escapes. No external deps.

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const len = text.length;
  let i = 0;

  while (i < len) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        // Doubled quote inside a quoted field → literal quote
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      // Always swallow CR — handles CRLF and lone-CR cases identically.
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }

  // Trailing field / row without final newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function csvToObjects(text) {
  const rows = parseCSV(text);
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0].map((h) => h.trim());
  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    // Skip blank trailing lines
    if (r.length === 1 && r[0] === "") continue;
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = r[j] !== undefined ? r[j] : "";
    }
    records.push(obj);
  }
  return { headers, records };
}
