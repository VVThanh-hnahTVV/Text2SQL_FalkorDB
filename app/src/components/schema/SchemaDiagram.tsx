import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Data, FalkorDBCanvas, GraphLink, GraphNode } from "@falkordb/canvas";
import { Button, Space, Spin, Typography } from "antd";
import { ZoomInOutlined, ZoomOutOutlined, CompressOutlined, DragOutlined } from "@ant-design/icons";
import type { SchemaGraphData } from "./schemaTypes";
import { buildLinkLaneMap, drawErLink, TABLE_BOX_WIDTH } from "./erLinkDrawing";
import { resolveInitialLayout } from "./erLayout";
import { applyPositions, setupErInteraction } from "./erInteraction";

const NODE_WIDTH = TABLE_BOX_WIDTH;

interface SchemaDiagramProps {
  data: SchemaGraphData;
  theme: string;
  active: boolean;
  graphId: string;
}

function buildCanvasMaps(data: SchemaGraphData) {
  const idToCanvas = new Map<string, number>();
  const canvasToTable = new Map<number, SchemaGraphData["tables"][0]>();
  const idToTableName = new Map<number, string>();
  data.tables.forEach((table, index) => {
    const canvasId = index + 1;
    idToCanvas.set(table.id, canvasId);
    idToCanvas.set(table.name, canvasId);
    canvasToTable.set(canvasId, table);
    idToTableName.set(canvasId, table.name);
  });
  return { idToCanvas, canvasToTable, idToTableName };
}

const SchemaDiagram = ({ data, theme, active, graphId }: SchemaDiagramProps) => {
  const canvasRef = useRef<FalkorDBCanvas>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const hoveredNodeIdRef = useRef<number | null>(null);
  const [canvasLoaded, setCanvasLoaded] = useState(false);
  const [hostReady, setHostReady] = useState(false);

  useEffect(() => {
    void import("@falkordb/canvas").then(() => setCanvasLoaded(true));
  }, []);

  useLayoutEffect(() => {
    if (!active) {
      setHostReady(false);
      return;
    }
    const el = hostRef.current;
    if (!el) return;

    const check = () => {
      const { width, height } = el.getBoundingClientRect();
      setHostReady(width > 0 && height > 0);
    };

    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  const handleZoomIn = () => canvasRef.current?.zoom((canvasRef.current?.getZoom() ?? 1) * 1.1);
  const handleZoomOut = () => canvasRef.current?.zoom((canvasRef.current?.getZoom() ?? 1) * 0.9);
  const handleCenter = useCallback(() => canvasRef.current?.zoomToFit(), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvasLoaded || !hostReady || !active || data.tables.length === 0) return;

    const { idToCanvas, canvasToTable, idToTableName } = buildCanvasMaps(data);
    const linkLanes = buildLinkLaneMap(data.relationships);
    const linkStroke = theme === "light" ? "#6366f1" : "#818cf8";
    const layoutPositions = resolveInitialLayout(graphId, data.tables, data.relationships);

    const canvasData: Data = {
      nodes: data.tables.map((table, index) => {
        const canvasId = index + 1;
        const lineHeight = 14;
        const padding = 8;
        const headerHeight = 20;
        const nodeHeight = headerHeight + table.columns.length * lineHeight + padding * 2;
        return {
          id: canvasId,
          labels: ["Table", table.name],
          color: theme === "light" ? "#60a5fa" : "#3b82f6",
          visible: true,
          size: Math.max(NODE_WIDTH / 2, nodeHeight / 2),
          data: { name: table.name, columns: table.columns },
        };
      }),
      links: data.relationships
        .map((rel, index) => {
          const source = idToCanvas.get(rel.sourceTable);
          const target = idToCanvas.get(rel.targetTable);
          if (!source || !target) return null;
          return {
            id: index + 1,
            relationship: "REFERENCES",
            color: linkStroke,
            visible: true,
            source,
            target,
            data: { lane: linkLanes.get(index) ?? 0 },
          };
        })
        .filter(Boolean) as Data["links"],
    };

    const nodeCanvasObject = (node: GraphNode, ctx: CanvasRenderingContext2D) => {
      const lineHeight = 14;
      const padding = 8;
      const headerHeight = 20;
      const fontSize = 12;
      const isLight = theme === "light";
      const textColor = isLight ? "#111" : "#f5f5f5";
      const fillColor = isLight ? "#ffffff" : "#191919";
      const strokeColor = hoveredNodeIdRef.current === node.id ? "#4f46e5" : isLight ? "#d1d5db" : "#374151";
      const columnTextColor = isLight ? "#111" : "#e5e7eb";
      const typeTextColor = isLight ? "#6b7280" : "#9ca3af";
      const isHovered = hoveredNodeIdRef.current === node.id;

      const table = canvasToTable.get(node.id);
      if (!table) return;

      const nodeHeight = headerHeight + table.columns.length * lineHeight + padding * 2;
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      if (isHovered) {
        ctx.shadowColor = "rgba(79, 70, 229, 0.35)";
        ctx.shadowBlur = 14;
      }

      ctx.fillStyle = fillColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isHovered ? 2 : 1;
      ctx.fillRect(x - NODE_WIDTH / 2, y - nodeHeight / 2, NODE_WIDTH, nodeHeight);
      ctx.strokeRect(x - NODE_WIDTH / 2, y - nodeHeight / 2, NODE_WIDTH, nodeHeight);
      ctx.shadowBlur = 0;

      ctx.fillStyle = textColor;
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(table.name, x, y - nodeHeight / 2 + headerHeight / 2 + padding / 2);

      ctx.font = `${fontSize - 2}px Arial`;
      ctx.textAlign = "left";
      const startX = x - NODE_WIDTH / 2 + padding;
      let colY = y - nodeHeight / 2 + headerHeight + padding;

      for (const col of table.columns) {
        ctx.fillStyle = columnTextColor;
        ctx.fillText(col.name, startX, colY);
        if (col.type) {
          ctx.fillStyle = typeTextColor;
          const nameWidth = ctx.measureText(col.name).width;
          const available = NODE_WIDTH - padding * 2 - nameWidth - 8;
          let typeText = col.type;
          if (available > 0 && ctx.measureText(typeText).width > available) {
            while (typeText.length > 0 && ctx.measureText(`${typeText}…`).width > available) {
              typeText = typeText.slice(0, -1);
            }
            typeText = `${typeText}…`;
          }
          ctx.textAlign = "right";
          ctx.fillText(typeText, x + NODE_WIDTH / 2 - padding, colY);
          ctx.textAlign = "left";
        }
        colY += lineHeight;
      }
    };

    const nodePointerAreaPaint = (node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
      const table = canvasToTable.get(node.id);
      if (!table) return;
      const lineHeight = 14;
      const padding = 8;
      const headerHeight = 20;
      const nodeHeight = headerHeight + table.columns.length * lineHeight + padding * 2;
      const areaPadding = 5;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      ctx.fillStyle = color;
      ctx.fillRect(
        x - NODE_WIDTH / 2 - areaPadding,
        y - nodeHeight / 2 - areaPadding,
        NODE_WIDTH + areaPadding * 2,
        nodeHeight + areaPadding * 2,
      );
    };

    const linkCanvasObject = (link: GraphLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const lane = (link.data?.lane as number | undefined) ?? 0;
      drawErLink(ctx, link, globalScale, canvasToTable, lane * 10, linkStroke);
    };

    canvas.setConfig({
      autoStopOnSettle: true,
      cooldownTicks: 80,
      onNodeHover: (node) => {
        hoveredNodeIdRef.current = node?.id ?? null;
      },
      node: { nodeCanvasObject, nodePointerAreaPaint },
      link: { linkCanvasObject },
    });
    canvas.setBackgroundColor(theme === "light" ? "#ffffff" : "#191919");
    canvas.setForegroundColor(theme === "light" ? "#111" : "#f5f5f5");
    canvas.setData(canvasData);

    let teardownInteraction: (() => void) | undefined;
    const layoutTimer = window.setTimeout(() => {
      applyPositions(canvas, layoutPositions, idToTableName);
      teardownInteraction = setupErInteraction(canvas, graphId, idToTableName);
      canvas.zoomToFit();
    }, 50);

    return () => {
      window.clearTimeout(layoutTimer);
      teardownInteraction?.();
    };
  }, [data, theme, canvasLoaded, hostReady, active, graphId]);

  return (
    <div ref={hostRef} className="schema-diagram-host">
      <Space className="schema-diagram-toolbar" size="small" wrap>
        <Button icon={<ZoomInOutlined />} onClick={handleZoomIn} title="Zoom in" disabled={!hostReady} />
        <Button icon={<ZoomOutOutlined />} onClick={handleZoomOut} title="Zoom out" disabled={!hostReady} />
        <Button icon={<CompressOutlined />} onClick={handleCenter} title="Fit view" disabled={!hostReady} />
        <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
          <DragOutlined /> Drag tables · scroll to zoom · drag background to pan
        </Typography.Text>
      </Space>
      <div className="schema-diagram-canvas-wrap schema-diagram-canvas-wrap--interactive">
        {!canvasLoaded || !hostReady ? (
          <div className="schema-diagram-loading">
            <Spin tip="Loading diagram…" />
          </div>
        ) : (
          <falkordb-canvas ref={canvasRef} node-mode="replace" link-mode="replace" />
        )}
      </div>
    </div>
  );
};

export default SchemaDiagram;
