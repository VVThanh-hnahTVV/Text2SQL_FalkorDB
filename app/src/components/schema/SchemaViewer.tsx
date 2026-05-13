import { useEffect, useRef, useState, useCallback } from "react";
import type { Data, FalkorDBCanvas, GraphNode } from "@falkordb/canvas";
import { Button, Drawer, Space, Spin, Typography } from "antd";
import { ZoomInOutlined, ZoomOutOutlined, CompressOutlined, CloseOutlined } from "@ant-design/icons";
import { useDatabase } from "@/contexts/DatabaseContext";
import { DatabaseService } from "@/services/database";
import { showToast } from "@/lib/notify";

interface SchemaNode {
  id: number;
  userId: string;
  name: string;
  columns: Array<string | { name: string; type?: string; dataType?: string }>;
}

interface SchemaLink {
  source: number;
  target: number;
}

interface SchemaData {
  nodes: SchemaNode[];
  links: SchemaLink[];
  nodesMap: Map<number, SchemaNode>;
}

export interface SchemaViewerProps {
  isOpen: boolean;
  onClose: () => void;
  /** @deprecated Drawer uses fixed width; kept for API compatibility */
  onWidthChange?: (width: number) => void;
  sidebarWidth?: number;
}

const SchemaViewer = ({ isOpen, onClose }: SchemaViewerProps) => {
  const canvasRef = useRef<FalkorDBCanvas>(null);
  const [schemaData, setSchemaData] = useState<SchemaData | null>(null);
  const [loading, setLoading] = useState(false);
  const { selectedGraph } = useDatabase();

  const [theme, setTheme] = useState<string>(() => {
    return document.documentElement.getAttribute("data-theme") || "light";
  });

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "attributes" && mutation.attributeName === "data-theme") {
          const newTheme = document.documentElement.getAttribute("data-theme") || "light";
          setTheme(newTheme);
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  const NODE_WIDTH = 160;
  const [canvasLoaded, setCanvasLoaded] = useState(false);

  useEffect(() => {
    void import("@falkordb/canvas").then(() => {
      setCanvasLoaded(true);
    });
  }, []);

  const loadSchemaData = useCallback(async () => {
    if (!selectedGraph) return;

    setLoading(true);
    try {
      const data = await DatabaseService.getGraphData(selectedGraph.id);

      const oldIdToNewId = new Map<string, number>();

      data.nodes = data.nodes.map((node, index) => {
        const newId = index + 1;
        oldIdToNewId.set(node.id, newId);
        return {
          ...node,
          userId: node.id,
          id: newId,
        };
      });

      data.links = data.links.map((link) => ({
        ...link,
        source: oldIdToNewId.get(link.source) || link.source,
        target: oldIdToNewId.get(link.target) || link.target,
      }));

      const nodesMap = new Map<number, SchemaNode>(data.nodes.map((node) => [node.id, node]));

      setSchemaData({ ...data, nodesMap });
    } catch (error) {
      console.error("Failed to load schema:", error);
      showToast({
        title: "Failed to Load Schema",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
      setSchemaData({ nodes: [], links: [], nodesMap: new Map() });
    } finally {
      setLoading(false);
    }
  }, [selectedGraph]);

  useEffect(() => {
    if (isOpen && selectedGraph) {
      void loadSchemaData();
    }
  }, [isOpen, selectedGraph, loadSchemaData]);

  const handleZoomIn = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.zoom(canvas.getZoom() * 1.1);
    }
  };

  const handleZoomOut = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.zoom(canvas.getZoom() * 0.9);
    }
  };

  const handleCenter = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.zoomToFit();
    }
  }, []);

  const convertToCanvasData = useCallback(
    (data: SchemaData): Data => {
      const nodes = data.nodes.map((node) => {
        const columns = node.columns || [];
        const lineHeight = 14;
        const padding = 8;
        const headerHeight = 20;
        const nodeHeight = headerHeight + columns.length * lineHeight + padding * 2;
        const size = Math.max(NODE_WIDTH / 2, nodeHeight / 2);

        return {
          id: node.id,
          labels: ["Table"],
          color: theme === "light" ? "#60a5fa" : "#3b82f6",
          visible: true,
          size,
          data: {
            name: node.name,
            columns: node.columns,
          },
        };
      });

      const links = data.links.map((link, index) => {
        return {
          id: index + 1,
          relationship: "REFERENCES",
          color: theme === "light" ? "#9ca3af" : "#4b5563",
          visible: true,
          source: link.source,
          target: link.target,
          data: {},
        };
      });

      return { nodes, links };
    },
    [theme],
  );

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || !canvasLoaded || !schemaData) return;

    const nodeCanvasObject = (node: GraphNode, ctx: CanvasRenderingContext2D) => {
      const lineHeight = 14;
      const padding = 8;
      const headerHeight = 20;
      const fontSize = 12;

      const isLight = theme === "light";
      const textColor = isLight ? "#111" : "#f5f5f5";
      const fillColor = isLight ? "#ffffff" : "#191919";
      const strokeColor = isLight ? "#d1d5db" : "#374151";
      const columnTextColor = isLight ? "#111" : "#e5e7eb";
      const typeTextColor = isLight ? "#6b7280" : "#9ca3af";

      const schemaNode = schemaData.nodesMap.get(node.id);

      if (!schemaNode) return;

      const columns = schemaNode.columns || [];

      const nodeHeight = headerHeight + columns.length * lineHeight + padding * 2;

      ctx.fillStyle = fillColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.fillRect((node.x || 0) - NODE_WIDTH / 2, (node.y || 0) - nodeHeight / 2, NODE_WIDTH, nodeHeight);
      ctx.strokeRect((node.x || 0) - NODE_WIDTH / 2, (node.y || 0) - nodeHeight / 2, NODE_WIDTH, nodeHeight);

      ctx.fillStyle = textColor;
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        node.displayName[1],
        node.x || 0,
        (node.y || 0) - nodeHeight / 2 + headerHeight / 2 + padding / 2,
      );

      ctx.font = `${fontSize - 2}px Arial`;
      ctx.textAlign = "left";
      const startX = (node.x || 0) - NODE_WIDTH / 2 + padding;
      let colY = (node.y || 0) - nodeHeight / 2 + headerHeight + padding;

      columns.forEach((col: unknown) => {
        let name = col as string;
        let type: string | null = null;
        if (typeof col === "object" && col !== null) {
          const o = col as { name?: string; type?: string; dataType?: string };
          name = o.name || "";
          type = o.type || o.dataType || null;
        }

        ctx.textAlign = "left";
        ctx.fillStyle = columnTextColor;
        ctx.fillText(name, startX, colY);

        if (type) {
          ctx.fillStyle = typeTextColor;
          const nameWidth = ctx.measureText(name).width;
          const available = NODE_WIDTH - padding * 2 - nameWidth - 8;
          let typeText = String(type);
          if (available > 0) {
            if (ctx.measureText(typeText).width > available) {
              while (typeText.length > 0 && ctx.measureText(`${typeText}…`).width > available) {
                typeText = typeText.slice(0, -1);
              }
              typeText = `${typeText}…`;
            }
            ctx.textAlign = "right";
            ctx.fillText(typeText, (node.x || 0) + NODE_WIDTH / 2 - padding, colY);
          }
          ctx.fillStyle = columnTextColor;
          ctx.textAlign = "left";
        }

        colY += lineHeight;
      });
    };

    const nodePointerAreaPaint = (node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
      const schemaNode = schemaData.nodesMap.get(node.id);

      if (!schemaNode) return;

      const columns = schemaNode.columns || [];
      const lineHeight = 14;
      const padding = 8;
      const headerHeight = 20;
      const nodeHeight = headerHeight + columns.length * lineHeight + padding * 2;

      ctx.fillStyle = color;
      const areaPadding = 5;
      ctx.fillRect(
        (node.x || 0) - NODE_WIDTH / 2 - areaPadding,
        (node.y || 0) - nodeHeight / 2 - areaPadding,
        NODE_WIDTH + areaPadding * 2,
        nodeHeight + areaPadding * 2,
      );
    };

    const canvasData = convertToCanvasData(schemaData);

    canvas.setConfig({
      autoStopOnSettle: false,
      node: {
        nodeCanvasObject,
        nodePointerAreaPaint,
      },
    });

    canvas.setBackgroundColor(theme === "light" ? "#ffffff" : "#191919");
    canvas.setForegroundColor(theme === "light" ? "#111" : "#f5f5f5");
    canvas.setData(canvasData);
  }, [schemaData, theme, canvasLoaded, convertToCanvasData]);

  return (
    <Drawer
      title={
        <Space>
          <Typography.Title level={5} style={{ margin: 0 }}>
            Database schema
          </Typography.Title>
        </Space>
      }
      placement="left"
      width={Math.min(560, typeof window !== "undefined" ? window.innerWidth - 24 : 560)}
      open={isOpen}
      onClose={onClose}
      destroyOnClose={false}
      styles={{
        body: {
          padding: 0,
          display: "flex",
          flexDirection: "column",
          height: "100%",
        },
      }}
      extra={
        <Button type="text" icon={<CloseOutlined />} onClick={onClose} aria-label="Close" />
      }
      data-testid="schema-panel"
    >
      <Space style={{ padding: 12, borderBottom: "1px solid #e0e3e6", width: "100%" }}>
        <Button icon={<ZoomInOutlined />} onClick={handleZoomIn} title="Zoom in" />
        <Button icon={<ZoomOutOutlined />} onClick={handleZoomOut} title="Zoom out" />
        <Button icon={<CompressOutlined />} onClick={handleCenter} title="Fit view" />
      </Space>

      <div style={{ flex: 1, minHeight: 360, position: "relative", background: theme === "light" ? "#fff" : "#191919" }}>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <Spin tip="Loading schema…" />
          </div>
        )}
        {!loading && canvasLoaded && schemaData && schemaData.nodes.length > 0 && (
          <falkordb-canvas ref={canvasRef} node-mode="replace" style={{ width: "100%", height: "100%", minHeight: 400 }} />
        )}
        {!loading && (!schemaData || schemaData.nodes.length === 0) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              padding: 24,
            }}
          >
            <Typography.Text type="secondary" style={{ textAlign: "center" }}>
              <div>No schema data available</div>
              <div style={{ marginTop: 8, fontSize: 13 }}>
                {!selectedGraph ? "Select a database first" : "This database has no schema data"}
              </div>
            </Typography.Text>
          </div>
        )}
      </div>
    </Drawer>
  );
};

export default SchemaViewer;
