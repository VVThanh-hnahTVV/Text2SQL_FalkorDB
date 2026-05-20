import { Empty, Table, Typography } from "antd";
import { ArrowRightOutlined } from "@ant-design/icons";
import type { SchemaGraphData } from "./schemaTypes";

interface SchemaRelationshipsPanelProps {
  data: SchemaGraphData;
}

const SchemaRelationshipsPanel = ({ data }: SchemaRelationshipsPanelProps) => {
  if (data.relationships.length === 0) {
    return (
      <Empty
        description={
          data.tables.length > 0
            ? "No foreign-key links found between tables"
            : "Load a database schema to see relationships"
        }
      />
    );
  }

  return (
    <Table
      size="small"
      pagination={{ pageSize: 12, hideOnSinglePage: true }}
      rowKey="id"
      dataSource={data.relationships}
      columns={[
        {
          title: "From table",
          dataIndex: "sourceTable",
          key: "sourceTable",
          render: (name: string) => <Typography.Text strong>{name}</Typography.Text>,
        },
        {
          title: "",
          key: "arrow",
          width: 48,
          align: "center",
          render: () => <ArrowRightOutlined style={{ color: "#64748b" }} />,
        },
        {
          title: "To table",
          dataIndex: "targetTable",
          key: "targetTable",
          render: (name: string) => <Typography.Text strong>{name}</Typography.Text>,
        },
        {
          title: "Relationship",
          key: "rel",
          render: (_, row) => (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.sourceTable} → {row.targetTable} (REFERENCES)
            </Typography.Text>
          ),
        },
      ]}
    />
  );
};

export default SchemaRelationshipsPanel;
