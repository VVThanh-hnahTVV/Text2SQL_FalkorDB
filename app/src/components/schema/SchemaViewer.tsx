import { useEffect, useState } from "react";
import { Button, Drawer, Empty, Flex, Spin, Typography } from "antd";
import { CloseOutlined, ReloadOutlined } from "@ant-design/icons";
import { useDatabase } from "@/contexts/DatabaseContext";
import { useSchemaData } from "@/hooks/useSchemaData";
import SchemaDiagram from "./SchemaDiagram";

export interface SchemaViewerProps {
  isOpen: boolean;
  onClose: () => void;
  onWidthChange?: (width: number) => void;
  sidebarWidth?: number;
}

const DRAWER_WIDTH = 560;

const SchemaViewer = ({ isOpen, onClose }: SchemaViewerProps) => {
  const { selectedGraph } = useDatabase();
  const { data, loading, reload } = useSchemaData(selectedGraph?.id, isOpen && Boolean(selectedGraph));
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute("data-theme") || "light");

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.getAttribute("data-theme") || "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const body = !selectedGraph ? (
    <Empty description="Select a database first" style={{ marginTop: 48 }} />
  ) : loading ? (
    <Flex justify="center" align="center" className="schema-viewer-state">
      <Spin size="large" tip="Loading schema…" />
    </Flex>
  ) : !data || data.tables.length === 0 ? (
    <Empty description="No schema data. Refresh schema from Workspace." style={{ marginTop: 48 }}>
      <Button type="primary" icon={<ReloadOutlined />} onClick={() => void reload()}>
        Retry
      </Button>
    </Empty>
  ) : (
          <SchemaDiagram
            key={`${selectedGraph.id}-${isOpen}`}
            graphId={selectedGraph.id}
            data={data}
            theme={theme}
            active={isOpen}
          />
  );

  return (
    <Drawer
      title={
        <Typography.Title level={5} style={{ margin: 0 }}>
          Data Viewer — ER diagram
        </Typography.Title>
      }
      placement="left"
      width={Math.min(DRAWER_WIDTH, typeof window !== "undefined" ? window.innerWidth - 24 : DRAWER_WIDTH)}
      open={isOpen}
      onClose={onClose}
      destroyOnClose
      mask={false}
      styles={{
        body: { padding: 0, overflow: "hidden" },
        wrapper: { boxShadow: "4px 0 24px rgba(15, 23, 42, 0.12)" },
      }}
      extra={<Button type="text" icon={<CloseOutlined />} onClick={onClose} aria-label="Close" />}
      data-testid="schema-panel"
      className="schema-viewer-drawer"
    >
      <div className="schema-viewer-inner">
        {selectedGraph && data && !loading ? (
          <Flex align="center" justify="space-between" className="schema-viewer-meta">
            <Typography.Text type="secondary" ellipsis style={{ flex: 1, minWidth: 0 }}>
              {selectedGraph.name}
            </Typography.Text>
            <Button type="text" size="small" icon={<ReloadOutlined />} onClick={() => void reload()}>
              Refresh
            </Button>
          </Flex>
        ) : null}
        <div className="schema-viewer-content">{body}</div>
      </div>
    </Drawer>
  );
};

export default SchemaViewer;
