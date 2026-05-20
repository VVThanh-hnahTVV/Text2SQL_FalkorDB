import type { SchemaRelationship, SchemaTable } from "./schemaTypes";

const LINE_HEIGHT = 14;
const PADDING = 8;
const HEADER_HEIGHT = 20;
const LAYER_GAP_X = 300;
const ROW_GAP_Y = 36;

export function tableBoxHeight(columnCount: number): number {
  return HEADER_HEIGHT + columnCount * LINE_HEIGHT + PADDING * 2;
}

/** Layered left→right layout (similar to dbdiagram). */
export function computeLayeredLayout(
  tables: SchemaTable[],
  relationships: SchemaRelationship[],
): Map<string, { x: number; y: number }> {
  const names = tables.map((t) => t.name);
  const tableByName = new Map(tables.map((t) => [t.name, t]));
  const outAdj = new Map<string, Set<string>>();
  const inDeg = new Map<string, number>();

  for (const n of names) {
    outAdj.set(n, new Set());
    inDeg.set(n, 0);
  }

  for (const rel of relationships) {
    if (!outAdj.has(rel.sourceTable)) outAdj.set(rel.sourceTable, new Set());
    outAdj.get(rel.sourceTable)!.add(rel.targetTable);
    inDeg.set(rel.targetTable, (inDeg.get(rel.targetTable) ?? 0) + 1);
  }

  const layer = new Map<string, number>();
  const roots = names.filter((n) => (inDeg.get(n) ?? 0) === 0);
  const seeds = roots.length > 0 ? roots : names;

  for (const r of seeds) layer.set(r, 0);

  const queue = [...seeds];
  const indegWork = new Map(inDeg);
  while (queue.length > 0) {
    const u = queue.shift()!;
    const lu = layer.get(u) ?? 0;
    for (const v of outAdj.get(u) ?? []) {
      layer.set(v, Math.max(layer.get(v) ?? 0, lu + 1));
      indegWork.set(v, (indegWork.get(v) ?? 1) - 1);
      if ((indegWork.get(v) ?? 0) <= 0) queue.push(v);
    }
  }

  for (const n of names) {
    if (!layer.has(n)) layer.set(n, 0);
  }

  const byLayer = new Map<number, string[]>();
  for (const n of names) {
    const l = layer.get(n) ?? 0;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(n);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const sortedLayers = [...byLayer.keys()].sort((a, b) => a - b);

  for (const l of sortedLayers) {
    const nodes = (byLayer.get(l) ?? []).sort((a, b) => a.localeCompare(b));
    let yCursor = 0;
    for (const name of nodes) {
      const t = tableByName.get(name);
      const h = tableBoxHeight(t?.columns.length ?? 1);
      positions.set(name, {
        x: l * LAYER_GAP_X,
        y: yCursor + h / 2,
      });
      yCursor += h + ROW_GAP_Y;
    }
  }

  return centerPositions(positions);
}

function centerPositions(positions: Map<string, { x: number; y: number }>) {
  if (positions.size === 0) return positions;
  let sx = 0;
  let sy = 0;
  for (const p of positions.values()) {
    sx += p.x;
    sy += p.y;
  }
  const cx = sx / positions.size;
  const cy = sy / positions.size;
  const centered = new Map<string, { x: number; y: number }>();
  for (const [name, p] of positions) {
    centered.set(name, { x: p.x - cx, y: p.y - cy });
  }
  return centered;
}

const layoutStorageKey = (graphId: string) => `querymind-erd-layout:${graphId}`;

export type SavedLayout = Record<string, { x: number; y: number }>;

export function loadSavedLayout(graphId: string): SavedLayout | null {
  try {
    const raw = sessionStorage.getItem(layoutStorageKey(graphId));
    if (!raw) return null;
    return JSON.parse(raw) as SavedLayout;
  } catch {
    return null;
  }
}

export function saveLayout(graphId: string, positions: SavedLayout): void {
  try {
    sessionStorage.setItem(layoutStorageKey(graphId), JSON.stringify(positions));
  } catch {
    /* quota / private mode */
  }
}

export function resolveInitialLayout(
  graphId: string,
  tables: SchemaTable[],
  relationships: SchemaRelationship[],
): Map<string, { x: number; y: number }> {
  const saved = loadSavedLayout(graphId);
  if (saved) {
    const map = new Map<string, { x: number; y: number }>();
    for (const t of tables) {
      const p = saved[t.name] ?? saved[t.id];
      if (p) map.set(t.name, p);
    }
    if (map.size === tables.length) return map;
  }
  return computeLayeredLayout(tables, relationships);
}
