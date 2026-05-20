import { useEffect, useState } from "react";
import { Button, Empty, Flex, Spin, Tabs, Tag, Typography } from "antd";
import { ReloadOutlined, TableOutlined, LinkOutlined, ApartmentOutlined } from "@ant-design/icons";
import { useDatabase } from "@/contexts/DatabaseContext";
import { useSchemaData } from "@/hooks/useSchemaData";
import SchemaDiagram from "./SchemaDiagram";
import SchemaTablesPanel from "./SchemaTablesPanel";
import SchemaRelationshipsPanel from "./SchemaRelationshipsPanel";

export interface SchemaExplorerProps {
  /** When false, data is not fetched (e.g. closed drawer). */
  active?: boolean;
  /** compact = inside drawer; page = full main column */
  variant?: "drawer" | "page";
}

const SchemaExplorer = ({ active = true, variant = "page" }: SchemaExplorerProps) => {
  const { selectedGraph } = useDatabase();
  const { data, loading, reload } = useSchemaData(selectedGraph?.id, active && Boolean(selectedGraph));
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute("data-theme") || "light");

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.getAttribute("data-theme") || "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  if (!selectedGraph) {
    return (
      <Empty
        style={{ marginTop: variant === "page" ? 80 : 24 }}
        description="Select a database from the header to view tables and relationships"
      />
    );
  }

  if (loading) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: variant === "page" ? 320 : 200, padding: 48 }}>
        <Spin size="large" tip="Loading schema…" />
      </Flex>
    );
  }

  if (!data || data.tables.length === 0) {
    return (
      <Empty
        style={{ marginTop: variant === "page" ? 48 : 24 }}
        description="No schema data for this database. Connect or refresh the schema from Workspace."
      >
        <Button type="primary" icon={<ReloadOutlined />} onClick={() => void reload()}>
          Retry
        </Button>
      </Empty>
    );
  }

  const summary = (
    <Flex wrap="wrap" gap={8} align="center" style={{ marginBottom: variant === "page" ? 16 : 12 }}>
      <Typography.Text type="secondary">
        Database: <Typography.Text strong>{selectedGraph.name}</Typography.Text>
      </Typography.Text>
      <Tag icon={<TableOutlined />}>{data.tables.length} tables</Tag>
      <Tag icon={<LinkOutlined />}>{data.relationships.length} links</Tag>
      <Button size="small" icon={<ReloadOutlined />} onClick={() => void reload()}>
        Refresh
      </Button>
    </Flex>
  );

  const tabItems = [
    {
      key: "diagram",
      label: (
        <span>
          <ApartmentOutlined /> ER diagram
        </span>
      ),
      children: <SchemaDiagram data={data} theme={theme} />,
    },
    {
      key: "tables",
      label: (
        <span>
          <TableOutlined /> Tables ({data.tables.length})
        </span>
      ),
      children: <SchemaTablesPanel data={data} />,
    },
    {
      key: "relationships",
      label: (
        <span>
          <LinkOutlined /> Links ({data.relationships.length})
        </span>
      ),
      children: <SchemaRelationshipsPanel data={data} />,
    },
  ];

  return (
    <div
      className={variant === "page" ? "page-container" : undefined}
      style={variant === "drawer" ? { padding: "0 4px" } : undefined}
      data-testid="schema-explorer"
    >
      {variant === "page" ? (
        <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 8 }}>
          Data Viewer
        </Typography.Title>
      ) : null}
      {summary}
      <Tabs defaultActiveKey="tables" items={tabItems} />
    </div>
  );
};

export default SchemaExplorer;
