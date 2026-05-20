import { Collapse, Empty, Table, Tag, Typography } from "antd";
import type { SchemaGraphData } from "./schemaTypes";

interface SchemaTablesPanelProps {
  data: SchemaGraphData;
}

const SchemaTablesPanel = ({ data }: SchemaTablesPanelProps) => {
  if (data.tables.length === 0) {
    return <Empty description="No tables in this database" />;
  }

  return (
    <Collapse
      accordion={false}
      items={data.tables.map((table) => ({
        key: table.id,
        label: (
          <span>
            <Typography.Text strong>{table.name}</Typography.Text>
            <Tag style={{ marginLeft: 8 }}>{table.columns.length} columns</Tag>
          </span>
        ),
        children: (
          <Table
            size="small"
            pagination={false}
            rowKey="name"
            dataSource={table.columns}
            columns={[
              { title: "Column", dataIndex: "name", key: "name", ellipsis: true },
              {
                title: "Type",
                dataIndex: "type",
                key: "type",
                ellipsis: true,
                render: (type: string | null | undefined) =>
                  type ? <Tag color="blue">{type}</Tag> : <Typography.Text type="secondary">—</Typography.Text>,
              },
            ]}
          />
        ),
      }))}
    />
  );
};

export default SchemaTablesPanel;
