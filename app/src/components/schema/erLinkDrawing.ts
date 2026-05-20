import type { GraphLink, GraphNode } from "@falkordb/canvas";
import type { SchemaTable } from "./schemaTypes";

export const TABLE_BOX_WIDTH = 160;

const LINE_HEIGHT = 14;
const PADDING = 8;
const HEADER_HEIGHT = 20;

export interface TableBounds {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
}

export function getTableBounds(node: GraphNode, canvasToTable: Map<number, SchemaTable>): TableBounds {
  const table = canvasToTable.get(node.id);
  const colCount = table?.columns.length ?? 1;
  const height = HEADER_HEIGHT + colCount * LINE_HEIGHT + PADDING * 2;
  const cx = node.x ?? 0;
  const cy = node.y ?? 0;
  return { cx, cy, halfW: TABLE_BOX_WIDTH / 2, halfH: height / 2 };
}

/** Point on rectangle border toward another point. */
export function rectEdgeToward(bounds: TableBounds, towardX: number, towardY: number): { x: number; y: number } {
  const dx = towardX - bounds.cx;
  const dy = towardY - bounds.cy;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
    return { x: bounds.cx + bounds.halfW, y: bounds.cy };
  }
  const scale = Math.min(bounds.halfW / Math.abs(dx), bounds.halfH / Math.abs(dy));
  return { x: bounds.cx + dx * scale, y: bounds.cy + dy * scale };
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  size: number,
  fill: string,
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - size * Math.cos(angle - Math.PI / 6), toY - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - size * Math.cos(angle + Math.PI / 6), toY - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function drawSelfLoop(
  ctx: CanvasRenderingContext2D,
  bounds: TableBounds,
  color: string,
  lineWidth: number,
  lane: number,
) {
  const loopW = 28 + lane * 6;
  const loopH = 36 + lane * 4;
  const x0 = bounds.cx + bounds.halfW;
  const y0 = bounds.cy - bounds.halfH * 0.25;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.bezierCurveTo(x0 + loopW, y0 - loopH * 0.35, x0 + loopW, y0 + loopH * 0.65, x0, y0 + loopH * 0.45);
  ctx.stroke();
  drawArrowhead(ctx, x0 + loopW * 0.55, y0 + loopH * 0.42, x0, y0 + loopH * 0.45, 6 / lineWidth, color);
}

/**
 * Orthogonal ER connector with rounded corners and arrow at target.
 */
export function drawErLink(
  ctx: CanvasRenderingContext2D,
  link: GraphLink,
  globalScale: number,
  canvasToTable: Map<number, SchemaTable>,
  laneOffset: number,
  strokeColor: string,
) {
  const source = link.source;
  const target = link.target;
  if (source.x == null || source.y == null || target.x == null || target.y == null) return;

  const srcBounds = getTableBounds(source, canvasToTable);
  const tgtBounds = getTableBounds(target, canvasToTable);
  const lineWidth = Math.max(1.2, 1.8 / globalScale);

  if (source.id === target.id) {
    drawSelfLoop(ctx, srcBounds, strokeColor, lineWidth, laneOffset);
    return;
  }

  const start = rectEdgeToward(srcBounds, target.x, target.y);
  const end = rectEdgeToward(tgtBounds, source.x, source.y);

  const dx = end.x - start.x;
  const dy = end.y - start.y;

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);

  let arrowFromX = start.x;
  let arrowFromY = start.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const midX = start.x + dx / 2 + laneOffset;
    ctx.lineTo(midX, start.y);
    ctx.lineTo(midX, end.y);
    ctx.lineTo(end.x, end.y);
    arrowFromX = midX;
    arrowFromY = end.y;
  } else {
    const midY = start.y + dy / 2 + laneOffset;
    ctx.lineTo(start.x, midY);
    ctx.lineTo(end.x, midY);
    ctx.lineTo(end.x, end.y);
    arrowFromX = end.x;
    arrowFromY = midY;
  }

  ctx.stroke();
  drawArrowhead(ctx, arrowFromX, arrowFromY, end.x, end.y, 7 / globalScale, strokeColor);
}

/** Assign lane index for parallel links between the same table pair. */
export function buildLinkLaneMap(relationships: { sourceTable: string; targetTable: string }[]): Map<number, number> {
  const pairCounts = new Map<string, number>();
  const pairIndex = new Map<string, number>();
  const lanes = new Map<number, number>();

  relationships.forEach((rel, index) => {
    const key = [rel.sourceTable, rel.targetTable].sort().join("\0");
    const total = (pairCounts.get(key) ?? 0) + 1;
    pairCounts.set(key, total);
  });

  relationships.forEach((rel, index) => {
    const key = [rel.sourceTable, rel.targetTable].sort().join("\0");
    const i = pairIndex.get(key) ?? 0;
    pairIndex.set(key, i + 1);
    const total = pairCounts.get(key) ?? 1;
    lanes.set(index, total <= 1 ? 0 : i - (total - 1) / 2);
  });

  return lanes;
}
