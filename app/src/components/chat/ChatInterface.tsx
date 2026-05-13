import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { Flex, Grid, Select, Skeleton, Spin, Typography } from "antd";
import { useDatabase } from "@/contexts/DatabaseContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useChat, type ChatMessageData } from "@/contexts/ChatContext";
import ChatMessage from "./ChatMessage";
import QueryInput from "./QueryInput";
import SuggestionCards from "../SuggestionCards";
import { ChatService } from "@/services/chat";
import { HistoryService } from "@/services/history";
import type { ConfirmRequest } from "@/types/api";
import { getVendorPrefix } from "@/utils/vendorConfig";
import { getOrInitDemoRole, setDemoRole, type DemoRole } from "@/lib/demoRole";
import { showToast } from "@/lib/notify";

/** Match `ArchitectShell` so fixed footer clears sider / right rail. */
const SHELL_NAV_WIDTH = 256;
const SHELL_RAIL_WIDTH = 280;

export interface ChatInterfaceProps {
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  onProcessingChange?: (isProcessing: boolean) => void;
  useMemory?: boolean;
  useRulesFromDatabase?: boolean;
}

const ChatInterface = ({
  className,
  style,
  disabled = false,
  onProcessingChange,
  useMemory = true,
  useRulesFromDatabase = true,
}: ChatInterfaceProps) => {
  const { selectedGraph } = useDatabase();
  const { vendor, apiKey, modelName, isApiKeyValid } = useSettings();
  const { messages, setMessages, conversationHistory, isProcessing, setIsProcessing } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputFooterRef = useRef<HTMLDivElement>(null);
  const [footerHeight, setFooterHeight] = useState(200);
  const screens = Grid.useBreakpoint();
  const [demoRole, setDemoRoleState] = useState<DemoRole>(() => getOrInitDemoRole());

  const footerInsetLeft = screens.md ? SHELL_NAV_WIDTH : 0;
  const footerInsetRight = screens.xl ? SHELL_RAIL_WIDTH : 0;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  const LoadingMessage = () => (
    <div style={{ padding: "0 24px" }}>
      <Flex gap={12} align="start" style={{ marginBottom: 24 }}>
        <div
          className="sql-gradient"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          QW
        </div>
        <Flex vertical gap={8} style={{ flex: 1, minWidth: 0 }}>
          <Skeleton active title={{ width: "60%" }} paragraph={{ rows: 2 }} />
        </Flex>
      </Flex>
    </div>
  );

  const suggestions = [
    "Show me five customers",
    "Show me the top customers by revenue",
    "What are the pending orders?",
  ];

  // Scroll to bottom whenever messages list or processing state changes
  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  useEffect(() => {
    onProcessingChange?.(isProcessing);
  }, [isProcessing, onProcessingChange]);

  // Measure the fixed footer height so paddingBottom keeps content above it
  useEffect(() => {
    const el = inputFooterRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setFooterHeight(Math.ceil(el.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleSendMessage = async (query: string) => {
    if (isProcessing || disabled) return;

    if (!selectedGraph) {
      showToast({
        title: "No Database Available",
        description: "Please upload a database schema first, or start the QueryWeaver backend to use real databases.",
        variant: "destructive",
      });
      return;
    }

    const historySnapshot = [...conversationHistory.current];
    const started = Date.now();

    const userMessage: ChatMessageData = {
      id: Date.now().toString(),
      type: "user",
      content: query,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsProcessing(true);
    conversationHistory.current.push({ role: "user", content: query });

    showToast({
      title: "Processing Query",
      description: "Analyzing your question and generating response...",
    });

    try {
      let finalContent = "";
      let sqlQuery = "";
      let queryResults: any[] | null = null;
      let visualizationData: ChatMessageData["visualizationData"] | undefined;
      let sawConfirmation = false;
      let streamHadError = false;
      let analysisInfo: {
        confidence?: number;
        missing?: string;
        ambiguities?: string;
        explanation?: string;
        isValid?: boolean;
      } = {};

      for await (const message of ChatService.streamQuery({
        query,
        database: selectedGraph.id,
        history: historySnapshot,
        customApiKey: isApiKeyValid ? (apiKey ?? undefined) : undefined,
        customModel: isApiKeyValid ? modelName : undefined,
        customVendor: isApiKeyValid ? (vendor ?? undefined) : undefined,
        use_user_rules: useRulesFromDatabase,
        use_memory: useMemory,
        role: demoRole,
      })) {
        if (message.type === "status" || message.type === "reasoning" || message.type === "reasoning_step") {
          const stepText = message.content || message.message || "";

          const stepMessage: ChatMessageData = {
            id: `step-${Date.now()}-${Math.random()}`,
            type: "ai",
            content: stepText,
            timestamp: new Date(),
          };

          setMessages((prev) => [...prev, stepMessage]);
        } else if (message.type === "sql_query") {
          sqlQuery = message.data || message.content || message.message || "";
          analysisInfo = {
            confidence: message.conf,
            missing: message.miss,
            ambiguities: message.amb,
            explanation: message.exp,
            isValid: message.is_valid,
          };
        } else if (message.type === "query_result") {
          queryResults = message.data || [];
          visualizationData = { should_visualize: Boolean(message.should_visualize) };
        } else if (message.type === "ai_response") {
          const responseContent = (message.message || message.content || "").trim();
          finalContent = responseContent;
        } else if (message.type === "followup_questions") {
          const followupContent = (message.message || message.content || "").trim();
          finalContent = followupContent;
        } else if (message.type === "error") {
          streamHadError = true;
          const errText = (message.message || message.content || "").trim() || "Unknown error";
          showToast({
            title: "Query Failed",
            description: errText,
            variant: "destructive",
          });
          finalContent = `Error: ${errText}`;
        } else if (message.type === "confirmation" || message.type === "destructive_confirmation") {
          sawConfirmation = true;
          const confirmationMessage: ChatMessageData = {
            id: `confirm-${Date.now()}`,
            type: "confirmation",
            content: message.message || message.content || "",
            confirmationData: {
              sqlQuery: message.sql_query || "",
              operationType: message.operation_type || "UNKNOWN",
              message: message.message || message.content || "",
              chatHistory: conversationHistory.current.map((m) => m.content),
            },
            timestamp: new Date(),
          };

          setMessages((prev) => [...prev, confirmationMessage]);

          finalContent = "";
        } else {
          console.warn("Unknown message type received:", message.type, message);
        }
      }

      if (sqlQuery !== undefined || Object.keys(analysisInfo).length > 0) {
        const sqlMessage: ChatMessageData = {
          id: (Date.now() + 2).toString(),
          type: "sql-query",
          content: sqlQuery,
          analysisInfo: analysisInfo,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, sqlMessage]);
      }

      if (queryResults && queryResults.length > 0) {
        const resultsMessage: ChatMessageData = {
          id: (Date.now() + 3).toString(),
          type: "query-result",
          content: "Query Results",
          queryData: queryResults,
          visualizationData,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, resultsMessage]);
      }

      if (finalContent) {
        const finalResponse: ChatMessageData = {
          id: (Date.now() + 4).toString(),
          type: "ai",
          content: finalContent,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, finalResponse]);
        conversationHistory.current.push({ role: "assistant", content: finalContent });
      }

      if (!sawConfirmation) {
        const ms = Date.now() - started;
        const isErr = streamHadError || (typeof finalContent === "string" && finalContent.startsWith("Error:"));
        void HistoryService.record({
          graph_id: selectedGraph.id,
          intent: query,
          status: isErr ? "error" : "verified",
          timing_ms: ms,
          tags: [selectedGraph.name || selectedGraph.id],
          error_kind: isErr ? "Query error" : undefined,
        });
      }

      if (!sawConfirmation && !streamHadError && !(typeof finalContent === "string" && finalContent.startsWith("Error:"))) {
        showToast({
          title: "Query Complete",
          description: "Successfully processed your database query!",
        });
      }
    } catch (error) {
      console.error("Query failed:", error);

      void HistoryService.record({
        graph_id: selectedGraph.id,
        intent: query,
        status: "error",
        timing_ms: Date.now() - started,
        tags: [selectedGraph.name || selectedGraph.id],
        error_kind: "Request failed",
      });

      const errorMessage: ChatMessageData = {
        id: (Date.now() + 2).toString(),
        type: "ai",
        content: `Failed to process query: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);

      showToast({
        title: "Query Failed",
        description: error instanceof Error ? error.message : "Failed to process query",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDestructive = async (messageId: string) => {
    if (!selectedGraph) return;

    const confirmMessage = messages.find((m) => m.id === messageId && m.type === "confirmation");
    if (!confirmMessage?.confirmationData) return;

    setIsProcessing(true);

    setMessages((prev) => prev.filter((m) => m.id !== messageId));

    const executingMessage: ChatMessageData = {
      id: `executing-${Date.now()}`,
      type: "ai",
      content: "Executing confirmed operation...",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, executingMessage]);

    showToast({
      title: "Executing Operation",
      description: "Processing your confirmed operation...",
    });

    try {
      let finalContent = "";
      let queryResults: any[] | null = null;
      let visualizationData: ChatMessageData["visualizationData"] | undefined;

      const confirmRequest: ConfirmRequest = {
        sql_query: confirmMessage.confirmationData.sqlQuery,
        confirmation: "CONFIRM",
        chat: confirmMessage.confirmationData.chatHistory,
        use_user_rules: useRulesFromDatabase,
      };
      if (isApiKeyValid && apiKey) {
        confirmRequest.custom_api_key = apiKey;
        if (modelName && vendor) {
          const vendorPrefix = getVendorPrefix(vendor);
          confirmRequest.custom_model = modelName.startsWith(`${vendorPrefix}/`)
            ? modelName
            : `${vendorPrefix}/${modelName}`;
        }
      }
      confirmRequest.role = demoRole;

      for await (const message of ChatService.streamConfirmOperation(selectedGraph.id, confirmRequest)) {
        if (message.type === "status" || message.type === "reasoning" || message.type === "reasoning_step") {
          const stepText = message.content || message.message || "";
          const stepMessage: ChatMessageData = {
            id: `step-${Date.now()}-${Math.random()}`,
            type: "ai",
            content: stepText,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, stepMessage]);
        } else if (message.type === "query_result") {
          queryResults = message.data || [];
          visualizationData = { should_visualize: Boolean(message.should_visualize) };
        } else if (message.type === "ai_response") {
          const responseContent = (message.message || message.content || "").trim();
          finalContent = responseContent;
        } else if (message.type === "error") {
          let errorMsg = message.message || message.content || "Unknown error occurred";

          if (errorMsg.includes("duplicate key value violates unique constraint")) {
            const match = errorMsg.match(/Key \((\w+)\)=\(([^)]+)\)/);
            if (match) {
              const [, field, value] = match;
              errorMsg = `A record with ${field} "${value}" already exists.`;
            } else {
              errorMsg = "This record already exists in the database.";
            }
          } else if (errorMsg.includes("violates foreign key constraint")) {
            errorMsg = "Cannot perform this operation due to related records in other tables.";
          } else if (errorMsg.includes("violates not-null constraint")) {
            const match = errorMsg.match(/column "(\w+)"/);
            if (match) {
              errorMsg = `The field "${match[1]}" cannot be empty.`;
            } else {
              errorMsg = "Required field cannot be empty.";
            }
          } else if (errorMsg.includes("PostgreSQL query execution error:") || errorMsg.includes("MySQL query execution error:")) {
            errorMsg = errorMsg.replace(/^(PostgreSQL|MySQL) query execution error:\s*/i, "");
            errorMsg = errorMsg.split("\n")[0];
          }

          showToast({
            title: "Operation Failed",
            description: errorMsg,
            variant: "destructive",
          });
          finalContent = `${errorMsg}`;
        } else if (message.type === "schema_refresh") {
          const refreshContent = message.message || message.content || "";
          const refreshMessage: ChatMessageData = {
            id: `refresh-${Date.now()}`,
            type: "ai",
            content: refreshContent,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, refreshMessage]);
        }
      }

      if (queryResults && queryResults.length > 0) {
        const resultsMessage: ChatMessageData = {
          id: (Date.now() + 3).toString(),
          type: "query-result",
          content: "Query Results",
          queryData: queryResults,
          visualizationData,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, resultsMessage]);
      }

      if (finalContent) {
        const finalResponse: ChatMessageData = {
          id: (Date.now() + 4).toString(),
          type: "ai",
          content: finalContent,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, finalResponse]);
        conversationHistory.current.push({ role: "assistant", content: finalContent });
      }

      showToast({
        title: "Operation Complete",
        description: "Successfully executed the operation!",
      });
    } catch (error) {
      console.error("Confirmation error:", error);

      const errorMessage: ChatMessageData = {
        id: (Date.now() + 2).toString(),
        type: "ai",
        content: `Failed to execute operation: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);

      showToast({
        title: "Operation Failed",
        description: error instanceof Error ? error.message : "Failed to execute operation",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelDestructive = (messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));

    setMessages((prev) => [
      ...prev,
      {
        id: `cancel-${Date.now()}`,
        type: "ai",
        content: "Operation cancelled. The destructive SQL query was not executed.",
        timestamp: new Date(),
      },
    ]);

    showToast({
      title: "Operation Cancelled",
      description: "The destructive operation was not executed.",
    });
  };

  const handleSuggestionSelect = (suggestion: string) => {
    void handleSendMessage(suggestion);
  };

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        flex: 1,
        overflow: "hidden",
        background: "#fff",
        position: "relative",
        ...style,
      }}
      data-testid="chat-interface"
    >
      <div
        ref={chatContainerRef}
        className="custom-scrollbar"
        style={{
          minHeight: 0,
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          overscrollBehaviorY: "contain",
          paddingBottom: footerHeight,
        }}
        data-testid="chat-messages-container"
      >
        <div style={{ maxWidth: "100%", padding: "24px 0", display: "flex", flexDirection: "column", gap: 24 }}>
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              type={msg.type}
              content={msg.content}
              steps={msg.steps}
              queryData={msg.queryData}
              visualizationData={msg.visualizationData}
              analysisInfo={msg.analysisInfo}
              confirmationData={msg.confirmationData}
              onConfirm={msg.type === "confirmation" ? () => void handleConfirmDestructive(msg.id) : undefined}
              onCancel={msg.type === "confirmation" ? () => handleCancelDestructive(msg.id) : undefined}
            />
          ))}
          {isProcessing && <LoadingMessage />}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div
        ref={inputFooterRef}
        style={{
          position: "fixed",
          bottom: 0,
          left: footerInsetLeft,
          right: footerInsetRight,
          zIndex: 45,
          borderTop: "1px solid #e0e3e6",
          background: "#fff",
          padding: "16px 16px 24px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <Flex align="center" gap={12} wrap="wrap" style={{ marginBottom: 16 }}>
            <Typography.Text type="secondary">Demo role</Typography.Text>
            <Select
              style={{ width: 220 }}
              value={demoRole}
              onChange={(v: DemoRole) => {
                setDemoRole(v);
                setDemoRoleState(v);
              }}
              options={[
                { value: "admin", label: "Admin (destructive allowed)" },
                { value: "viewer", label: "Viewer (read-only destructive)" },
              ]}
              data-testid="demo-role-select"
            />
          </Flex>

          {(selectedGraph?.id === "DEMO_CRM" || selectedGraph?.name === "DEMO_CRM") && (
            <SuggestionCards
              suggestions={suggestions}
              onSelect={handleSuggestionSelect}
              disabled={isProcessing || disabled}
            />
          )}

          <QueryInput
            onSubmit={(q) => void handleSendMessage(q)}
            placeholder="Describe the data you need..."
            disabled={isProcessing || disabled}
            schemaLabel={selectedGraph?.name}
          />

          {isProcessing && (
            <Flex align="center" justify="center" gap={8} style={{ marginTop: 8 }} data-testid="processing-query-indicator">
              <Spin size="small" />
              <Typography.Text type="secondary">Processing your query…</Typography.Text>
            </Flex>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
