import { sizeGuide } from "@/data/content";

/**
 * The published table stores flat garment measurements ("53 cm" laid on a table).
 * A chest *circumference* is exactly twice that, so it is derived here instead of
 * being typed into a second table that could disagree with the first.
 */
const CM = /^(\d+(?:\.\d+)?)\s*cm$/;

export function parseCm(cell: string): number | null {
  const match = CM.exec(cell.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function columnIndex(header: string) {
  return sizeGuide.headers.findIndex((h) => h.trim().toLowerCase() === header.toLowerCase());
}

export type ParsedSizeRow = {
  size: string;
  chestFlatCm: number;
  chestAroundCm: number;
  cells: string[];
};

/** Rows whose chest measure cannot be parsed are dropped rather than shown with a wrong number. */
export function parsedSizeRows(): ParsedSizeRow[] {
  const chest = columnIndex("Chest");
  if (chest < 0) return [];
  const rows: ParsedSizeRow[] = [];
  for (const row of sizeGuide.rows) {
    const chestFlatCm = parseCm(row[chest] ?? "");
    if (!chestFlatCm) continue;
    rows.push({
      size: row[0],
      chestFlatCm,
      chestAroundCm: chestFlatCm * 2,
      cells: row.map((cell) => cell.trim()),
    });
  }
  return rows;
}

const chestColumn = columnIndex("Chest");

/** Extra columns keep their published order and labels; only Chest is split into flat + around. */
const otherHeaders = sizeGuide.headers.filter((_, i) => i !== 0 && i !== chestColumn);
const otherIndexes = sizeGuide.rows[0]
  ? sizeGuide.rows[0].map((_, i) => i).filter((i) => i !== 0 && i !== chestColumn)
  : [];

export const sizeTableHeaders = ["Size", "Chest (flat)", "Chest (around)", ...otherHeaders];

export function sizeTableRows(): string[][] {
  return parsedSizeRows().map((row) => [
    row.size,
    `${row.chestFlatCm} cm`,
    `${row.chestAroundCm} cm`,
    ...otherIndexes.map((i) => row.cells[i]),
  ]);
}
