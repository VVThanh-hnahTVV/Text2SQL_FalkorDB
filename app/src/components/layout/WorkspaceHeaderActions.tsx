import { Button, Dropdown, Space, Spin, Grid, Switch, Tooltip, Typography, Flex } from "antd";
import type { MenuProps } from "antd";
import {
  DatabaseOutlined,
  ReloadOutlined,
  DeleteOutlined,
  BellOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import type { Graph } from "@/types/api";

export interface WorkspaceHeaderActionsProps {
  selectedGraph: Graph | null;
  graphs: Graph[];
  isRefreshingSchema: boolean;
  isChatProcessing: boolean;
  onSelectGraph: (graphId: string) => void;
  onDeleteGraph: (graphId: string, graphName: string) => void;
  onRefreshSchema: () => void;
  onConnectDatabase: () => void;
  useMemory: boolean;
  onUseMemoryChange: (enabled: boolean) => void;
}

const WorkspaceHeaderActions = ({
  selectedGraph,
  graphs,
  isRefreshingSchema,
  isChatProcessing,
  onSelectGraph,
  onDeleteGraph,
  onRefreshSchema,
  onConnectDatabase,
  useMemory,
  onUseMemoryChange,
}: WorkspaceHeaderActionsProps) => {
  const screens = Grid.useBreakpoint();
  const isCompact = !screens.lg;
  const disabled = isRefreshingSchema || isChatProcessing;

  const graphMenuItems: MenuProps["items"] =
    graphs.length === 0
      ? [{ key: "empty", label: "No databases available", disabled: true }]
      : graphs.map((graph) => {
          const isDemo = graph.id.startsWith("general_");
          return {
            key: graph.id,
            label: (
              <Space style={{ width: "100%", justifyContent: "space-between" }}>
                <span data-testid={`database-option-${graph.id}`}>{graph.name}</span>
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  data-testid={`delete-graph-btn-${graph.id}`}
                  disabled={isDemo || disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isDemo && !disabled) {
                      onDeleteGraph(graph.id, graph.name);
                    }
                  }}
                />
              </Space>
            ),
            onClick: () => {
              if (!disabled) onSelectGraph(graph.id);
            },
          };
        });

  const databaseDropdown = (
    <Dropdown menu={{ items: graphMenuItems }} trigger={["click"]} disabled={disabled}>
      <Button icon={<DatabaseOutlined />} data-testid="database-selector-trigger">
        {isCompact ? null : selectedGraph?.name || "Select database"}
        {isCompact && !selectedGraph ? "DB" : null}
        {isCompact && selectedGraph ? selectedGraph.name.slice(0, 12) + (selectedGraph.name.length > 12 ? "…" : "") : null}
      </Button>
    </Dropdown>
  );

  const refreshBtn = (
    <Button
      icon={isRefreshingSchema ? <Spin size="small" /> : <ReloadOutlined />}
      onClick={onRefreshSchema}
      disabled={!selectedGraph || disabled}
      data-testid="refresh-schema-btn"
      aria-label="Refresh schema"
    />
  );

  const connectBtn = (
    <Button
      type="primary"
      className="sql-gradient"
      style={{ border: "none" }}
      onClick={onConnectDatabase}
      disabled={disabled}
      data-testid="connect-database-btn"
    >
      {isCompact ? "Connect" : "Connect database"}
    </Button>
  );

  const notifyBtn = (
    <Button type="text" icon={<BellOutlined />} aria-label="Notifications" disabled title="Coming soon" />
  );

  const memoryToggle = (
    <Tooltip title="Use memory context from prior turns">
      <Flex align="center" gap={8} style={{ margin: 0 }}>
        <Typography.Text type="secondary" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
          Memory
        </Typography.Text>
        <Switch
          checked={useMemory}
          onChange={onUseMemoryChange}
          disabled={disabled}
          data-testid="use-memory-toggle"
        />
      </Flex>
    </Tooltip>
  );

  if (isCompact) {
    const moreMenu: MenuProps = {
      items: [
        {
          key: "connect",
          label: "Connect database",
          onClick: () => {
            if (!disabled) onConnectDatabase();
          },
          disabled,
        },
        {
          key: "refresh",
          label: "Refresh schema",
          onClick: () => {
            if (!disabled && selectedGraph) onRefreshSchema();
          },
          disabled: !selectedGraph || disabled,
        },
      ],
    };

    return (
      <Space size="small" wrap>
        {databaseDropdown}
        {refreshBtn}
        {memoryToggle}
        <Dropdown menu={moreMenu} trigger={["click"]}>
          <Button icon={<MoreOutlined />} aria-label="More actions" />
        </Dropdown>
      </Space>
    );
  }

  return (
    <Space wrap size="middle">
      {databaseDropdown}
      {refreshBtn}
      {connectBtn}
      {memoryToggle}
      {notifyBtn}
    </Space>
  );
};

export default WorkspaceHeaderActions;
