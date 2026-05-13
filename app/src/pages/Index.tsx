import { useState, useRef } from "react";
import { Button, Dropdown, Space, Tag, Typography, Spin } from "antd";
import type { MenuProps } from "antd";
import {
  DatabaseOutlined,
  ReloadOutlined,
  DeleteOutlined,
  BellOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import ArchitectShell from "@/components/layout/ArchitectShell";
import ChatInterface from "@/components/chat/ChatInterface";
import DatabaseModal from "@/components/modals/DatabaseModal";
import DeleteDatabaseModal from "@/components/modals/DeleteDatabaseModal";
import SchemaViewer from "@/components/schema";
import { useDatabase } from "@/contexts/DatabaseContext";
import { useChat } from "@/contexts/ChatContext";
import { DatabaseService } from "@/services/database";
import { showToast } from "@/lib/notify";
import { csrfHeaders } from "@/lib/csrf";
import { headlineFontFamily } from "@/theme/architectTheme";

const Index = () => {
  const { resetChat } = useChat();
  const { selectedGraph, graphs, selectGraph, uploadSchema } = useDatabase();
  const [showDatabaseModal, setShowDatabaseModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSchemaViewer, setShowSchemaViewer] = useState(false);
  const [useMemory] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("queryweaver_use_memory");
      return saved === null ? true : saved === "true";
    }
    return true;
  });
  const [useRulesFromDatabase] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("queryweaver_use_rules_from_database");
      return saved === null ? false : saved === "true";
    }
    return false;
  });
  const [isRefreshingSchema, setIsRefreshingSchema] = useState(false);
  const [isChatProcessing, setIsChatProcessing] = useState(false);
  const [databaseToDelete, setDatabaseToDelete] = useState<{ id: string; name: string; isDemo: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleConnectDatabase = () => {
    if (isRefreshingSchema || isChatProcessing) return;
    setShowDatabaseModal(true);
  };

  const handleUploadSchema = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await uploadSchema(file, file.name.replace(/\.[^/.]+$/, ""));
      showToast({
        title: "Schema Uploaded",
        description: "Database schema uploaded successfully!",
      });
    } catch (error) {
      showToast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload schema",
        variant: "destructive",
      });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDeleteGraph = (graphId: string, graphName: string, _e?: React.MouseEvent) => {
    const isDemo = graphId.startsWith("general_");
    if (isRefreshingSchema) return;
    setDatabaseToDelete({ id: graphId, name: graphName, isDemo });
    setShowDeleteModal(true);
  };

  const confirmDeleteGraph = async () => {
    if (!databaseToDelete) return;

    try {
      await DatabaseService.deleteGraph(databaseToDelete.id);
      showToast({
        title: "Database Deleted",
        description: `Successfully deleted "${databaseToDelete.name}"`,
      });
      setShowDeleteModal(false);
      setDatabaseToDelete(null);
      window.location.reload();
    } catch (error) {
      showToast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete database",
        variant: "destructive",
      });
    }
  };

  const handleRefreshSchema = async () => {
    if (!selectedGraph) {
      showToast({
        title: "No Database Selected",
        description: "Please select a database first",
        variant: "destructive",
      });
      return;
    }

    if (isChatProcessing) {
      showToast({
        title: "Chat is Processing",
        description: "Please wait for the current query to complete",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsRefreshingSchema(true);
      const response = await fetch(`/graphs/${selectedGraph.id}/refresh`, {
        method: "POST",
        headers: {
          ...csrfHeaders(),
        },
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to refresh schema" }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let hasError = false;
      const delimiter = "|||FALKORDB_MESSAGE_BOUNDARY|||";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const parts = buffer.split(delimiter);
        buffer = parts.pop() || "";

        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;

          try {
            const msg = JSON.parse(trimmed);
            if (msg.type === "error") {
              hasError = true;
              throw new Error(msg.message || "Schema refresh failed");
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              console.error("Failed to parse message:", trimmed);
            } else {
              throw e;
            }
          }
        }
      }

      if (hasError) {
        return;
      }

      showToast({
        title: "Schema Refreshed",
        description: "Database schema refreshed successfully!",
      });
      window.location.reload();
    } catch (error) {
      console.error("Refresh error:", error);
      showToast({
        title: "Refresh Failed",
        description: error instanceof Error ? error.message : "Failed to refresh schema",
        variant: "destructive",
      });
    } finally {
      setIsRefreshingSchema(false);
    }
  };

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
                  disabled={isDemo || isRefreshingSchema || isChatProcessing}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isDemo && !isRefreshingSchema && !isChatProcessing) {
                      handleDeleteGraph(graph.id, graph.name, e);
                    }
                  }}
                />
              </Space>
            ),
            onClick: () => {
              if (!isRefreshingSchema && !isChatProcessing) {
                selectGraph(graph.id);
              }
            },
          };
        });

  const headerExtra = (
    <Space wrap size="middle">
      {selectedGraph ? (
        <Tag color="success" style={{ margin: 0 }} data-testid="database-status-badge">
          Connected: {selectedGraph.name}
        </Tag>
      ) : (
        <Tag color="warning" style={{ margin: 0 }} data-testid="database-status-badge">
          No database selected
        </Tag>
      )}
      <Dropdown menu={{ items: graphMenuItems }} trigger={["click"]} disabled={isRefreshingSchema || isChatProcessing}>
        <Button icon={<DatabaseOutlined />} data-testid="database-selector-trigger">
          {selectedGraph?.name || "Select database"}
        </Button>
      </Dropdown>
      <Button
        icon={isRefreshingSchema ? <Spin size="small" /> : <ReloadOutlined />}
        onClick={handleRefreshSchema}
        disabled={!selectedGraph || isRefreshingSchema || isChatProcessing}
        data-testid="refresh-schema-btn"
      />
      <Button type="primary" className="sql-gradient" style={{ border: "none" }} onClick={handleConnectDatabase} disabled={isRefreshingSchema || isChatProcessing} data-testid="connect-database-btn">
        Connect database
      </Button>
      <Button icon={<UploadOutlined />} onClick={handleUploadSchema} data-testid="upload-schema-btn">
        Upload
      </Button>
      <Button type="text" icon={<BellOutlined />} aria-label="Notifications" disabled title="Coming soon" />
    </Space>
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".sql,.csv,.json"
        onChange={handleFileSelect}
        style={{ display: "none" }}
        data-testid="schema-upload-input"
      />

      <ArchitectShell
        activeNav="workspace"
        showRightRail
        headerExtra={headerExtra}
        onNewAnalysis={resetChat}
        onOpenDataViewer={() => {
          if (!isRefreshingSchema) setShowSchemaViewer(true);
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: "#fff" }}>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ textAlign: "center", padding: "40px 24px 16px" }}>
              <Typography.Title
                level={2}
                style={{
                  fontFamily: headlineFontFamily,
                  fontWeight: 700,
                  marginBottom: 24,
                  color: "#1a1c1e",
                  fontSize: "clamp(1.35rem, 3vw, 2rem)",
                }}
              >
                How can I assist your data architecture today?
              </Typography.Title>
            </div>

            <div style={{ flex: 1, minHeight: 0, padding: "0 16px 0", maxWidth: 1200, width: "100%", margin: "0 auto", alignSelf: "stretch" }}>
              <ChatInterface
                style={{ minHeight: 0, flex: 1 }}
                disabled={isRefreshingSchema}
                onProcessingChange={setIsChatProcessing}
                useMemory={useMemory}
                useRulesFromDatabase={useRulesFromDatabase}
              />
            </div>
          </div>
        </div>
      </ArchitectShell>

      <SchemaViewer isOpen={showSchemaViewer} onClose={() => setShowSchemaViewer(false)} />

      <DatabaseModal open={showDatabaseModal} onOpenChange={setShowDatabaseModal} />
      <DeleteDatabaseModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        databaseName={databaseToDelete?.name || ""}
        onConfirm={confirmDeleteGraph}
        isDemo={databaseToDelete?.isDemo || false}
      />
    </>
  );
};

export default Index;
