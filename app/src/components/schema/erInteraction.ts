import type { FalkorDBCanvas, GraphNode } from "@falkordb/canvas";
import type { SchemaTable } from "./schemaTypes";
import { saveLayout } from "./erLayout";

export function pinNode(node: GraphNode): void {
  if (node.x != null) node.fx = node.x;
  if (node.y != null) node.fy = node.y;
  node.initialPositionCalculated = true;
}

export function applyPositions(
  canvas: FalkorDBCanvas,
  positions: Map<string, { x: number; y: number }>,
  idToTableName: Map<number, string>,
): void {
  const graphData = canvas.getGraphData();
  for (const node of graphData.nodes) {
    const name = idToTableName.get(node.id);
    if (!name) continue;
    const pos = positions.get(name);
    if (!pos) continue;
    node.x = pos.x;
    node.y = pos.y;
    pinNode(node);
  }
  canvas.setGraphData(graphData);
  canvas.setCooldownTicks(0);
}

function collectPositions(
  nodes: GraphNode[],
  idToTableName: Map<number, string>,
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    const name = idToTableName.get(node.id);
    if (!name || node.x == null || node.y == null) continue;
    out[name] = { x: node.x, y: node.y };
  }
  return out;
}

export function setupErInteraction(
  canvas: FalkorDBCanvas,
  graphId: string,
  idToTableName: Map<number, string>,
): () => void {
  const graph = canvas.getGraph();
  if (!graph) return () => undefined;

  const onDrag = (node: GraphNode) => {
    pinNode(node);
  };

  const onDragEnd = (node: GraphNode) => {
    pinNode(node);
    saveLayout(graphId, collectPositions(canvas.getGraphData().nodes, idToTableName));
  };

  graph.onNodeDrag(onDrag);
  graph.onNodeDragEnd(onDragEnd);

  return () => {
    graph.onNodeDrag(() => undefined);
    graph.onNodeDragEnd(() => undefined);
  };
}
