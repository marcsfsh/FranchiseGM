/**
 * A small CSV reader for build tools and imports. Handles quoted cells, doubled quotes, CRLF, and
 * leading `#` comment lines (used for source notes in data-raw files).
 */

export type CsvRow = Record<string, string>;

export interface CsvTable {
  headers: string[];
  rows: CsvRow[];
  /** 1-based line number in the source for each row, for error reports. */
  lines: number[];
}

export function parseCsv(text: string): CsvTable {
  const records: { cells: string[]; line: number }[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  let atRecordStart = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (atRecordStart && !quoted && ch === '#') {
      // Comment line: skip to the end of the line.
      while (i < text.length && text[i] !== '\n') i++;
      line++;
      recordLine = line;
      continue;
    }
    atRecordStart = false;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else {
        if (ch === '\n') line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      cells.push(cell);
      if (cells.length > 1 || cells[0] !== '') records.push({ cells, line: recordLine });
      cells = [];
      cell = '';
      line++;
      recordLine = line;
      atRecordStart = true;
    } else cell += ch;
  }
  if (cell.length > 0 || cells.length > 0) {
    cells.push(cell);
    records.push({ cells, line: recordLine });
  }
  const [head, ...body] = records;
  if (!head) return { headers: [], rows: [], lines: [] };
  const headers = head.cells.map(h => h.trim());
  return {
    headers,
    rows: body.map(r => Object.fromEntries(headers.map((h, i) => [h, r.cells[i] ?? '']))),
    lines: body.map(r => r.line)
  };
}
