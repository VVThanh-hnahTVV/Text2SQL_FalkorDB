import { useState, useEffect } from "react";
import { Typography } from "antd";
import ArchitectShell from "@/components/layout/ArchitectShell";
import SchemaViewer from "@/components/schema";
import WorkspaceHeaderActions from "@/components/layout/WorkspaceHeaderActions";
import ChatInterface from "@/components/chat/ChatInterface";
import DatabaseModal from "@/components/modals/DatabaseModal";
import DeleteDatabaseModal from "@/components/modals/DeleteDatabaseModal";
import { useDatabase } from "@/contexts/DatabaseContext";
import { useChat } from "@/contexts/ChatContext";
import { DatabaseService } from "@/services/database";
import { showToast } from "@/lib/notify";
import { csrfHeaders } from "@/lib/csrf";
import { headlineFontFamily } from "@/theme/architectTheme";

const Index = () => {
  const { resetChat } = useChat();
  const { selectedGraph, graphs, selectGraph } = useDatabase();
  const [showDatabaseModal, setShowDatabaseModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSchemaViewer, setShowSchemaViewer] = useState(false);
  const [useMemory, setUseMemory] = useState(() => {
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

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("queryweaver_use_memory", String(useMemory));
    }
  }, [useMemory]);

  const handleConnectDatabase = () => {
    if (isRefreshingSchema || isChatProcessing) return;
    setShowDatabaseModal(true);
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

  const headerExtra = (
    <WorkspaceHeaderActions
      selectedGraph={selectedGraph}
      graphs={graphs}
      isRefreshingSchema={isRefreshingSchema}
      isChatProcessing={isChatProcessing}
      onSelectGraph={selectGraph}
      onDeleteGraph={(id, name) => handleDeleteGraph(id, name)}
      onRefreshSchema={() => void handleRefreshSchema()}
      onConnectDatabase={handleConnectDatabase}
      useMemory={useMemory}
      onUseMemoryChange={setUseMemory}
    />
  );

  return (
    <>
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
            <div className="workspace-hero" style={{ textAlign: "center", padding: "var(--page-padding-y) var(--page-padding-x) 16px" }}>
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

            {/* Must be a flex column so ChatInterface flex:1 + minHeight:0 gets a bounded height; otherwise the chat grows with content and internal scroll never activates. */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                padding: "0 var(--page-padding-x) 0",
                maxWidth: 1200,
                width: "100%",
                margin: "0 auto",
                alignSelf: "stretch",
              }}
            >
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
