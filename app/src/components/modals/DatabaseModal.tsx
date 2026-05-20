import { useState } from "react";
import {
  Modal,
  Button,
  Input,
  Select,
  Space,
  Typography,
  Flex,
  Spin,
  Grid,
} from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import { useDatabase } from "@/contexts/DatabaseContext";
import { showToast } from "@/lib/notify";
import { buildApiUrl, API_CONFIG } from "@/config/api";
import { csrfHeaders } from "@/lib/csrf";

interface DatabaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ConnectionStep {
  message: string;
  status: "pending" | "success" | "error";
}

const DatabaseModal = ({ open, onOpenChange }: DatabaseModalProps) => {
  const screens = Grid.useBreakpoint();
  const [connectionMode, setConnectionMode] = useState<"url" | "manual">("url");
  const [selectedDatabase, setSelectedDatabase] = useState("");
  const [connectionUrl, setConnectionUrl] = useState("");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("");
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [schema, setSchema] = useState("");
  const [schemaError, setSchemaError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionSteps, setConnectionSteps] = useState<ConnectionStep[]>([]);
  const { refreshGraphs } = useDatabase();

  const addStep = (message: string, status: "pending" | "success" | "error" = "pending") => {
    setConnectionSteps((prev) => {
      if (status === "pending" && prev.length > 0) {
        const lastStep = prev[prev.length - 1];
        if (lastStep.status === "pending") {
          const updated = [...prev];
          updated[updated.length - 1] = { ...lastStep, status: "success" };
          return [...updated, { message, status }];
        }
      }

      if (status !== "pending" && prev.length > 0) {
        const lastStep = prev[prev.length - 1];
        if (lastStep.status === "pending") {
          const updated = [...prev];
          updated[updated.length - 1] = { ...lastStep, status };
          return updated;
        }
      }

      return [...prev, { message, status }];
    });
  };

  const handleConnect = async () => {
    if (connectionMode === "url") {
      if (!connectionUrl || !selectedDatabase) {
        showToast({
          title: "Missing Information",
          description: "Please select database type and enter connection URL",
          variant: "destructive",
        });
        return;
      }
    } else {
      if (!selectedDatabase || !host || !port || !database || !username) {
        showToast({
          title: "Missing Information",
          description: "Please fill in all required fields",
          variant: "destructive",
        });
        return;
      }
    }

    setIsConnecting(true);
    setConnectionSteps([]);

    try {
      let dbUrl = connectionUrl;
      if (connectionMode === "manual") {
        const protocol = selectedDatabase === "mysql" ? "mysql" : "postgresql";
        const builtUrl = new URL(`${protocol}://${host}:${port}/${database}`);
        builtUrl.username = username;
        builtUrl.password = password;

        if (selectedDatabase === "postgresql" && schema.trim()) {
          if (/[^a-zA-Z0-9_]/.test(schema.trim())) {
            throw new Error("Schema name can only contain letters, digits, and underscores");
          }
          builtUrl.searchParams.set("options", `-csearch_path=${schema.trim()}`);
        }

        dbUrl = builtUrl.toString();
      }

      const response = await fetch(buildApiUrl("/database"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({ url: dbUrl }),
        credentials: "include",
      });

      if (!response.ok) {
        try {
          const errorData = await response.json();
          if (errorData.error) {
            throw new Error(errorData.error);
          }
        } catch {
          /* fall through */
        }

        const errorMessages: Record<number, string> = {
          400: "Invalid database connection URL.",
          401: "Not authenticated. Please sign in to connect databases.",
          403: "Access denied. You do not have permission to connect databases.",
          409: "Conflict with existing database connection.",
          422: "Invalid database connection parameters.",
          500: "Server error. Please try again later.",
        };

        throw new Error(errorMessages[response.status] || `Failed to connect to database (${response.status})`);
      }

      if (!response.body) {
        throw new Error("Streaming response has no body");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const delimiter = API_CONFIG.STREAM_BOUNDARY;

      const processChunk = (text: string) => {
        if (!text || !text.trim()) return;

        let obj: Record<string, unknown> | null = null;
        try {
          obj = JSON.parse(text) as Record<string, unknown>;
        } catch (e) {
          console.error("Failed to parse chunk as JSON", e, text);
          return;
        }

        if (obj.type === "reasoning_step") {
          addStep(String(obj.message || "Working..."), "pending");
        } else if (obj.type === "final_result") {
          addStep(String(obj.message || "Completed"), obj.success ? "success" : "error");
          setIsConnecting(false);

          if (obj.success) {
            showToast({
              title: "Connected Successfully",
              description: "Database connection established!",
            });
            setTimeout(async () => {
              await refreshGraphs();
              onOpenChange(false);
              setConnectionMode("url");
              setSelectedDatabase("");
              setConnectionUrl("");
              setHost("localhost");
              setPort("");
              setDatabase("");
              setUsername("");
              setPassword("");
              setSchema("");
              setSchemaError("");
              setConnectionSteps([]);
            }, 1000);
          } else {
            showToast({
              title: "Connection Failed",
              description: String(obj.message || "Unknown error"),
              variant: "destructive",
            });
          }
        } else if (obj.type === "error") {
          addStep(String(obj.message || "Error"), "error");
          setIsConnecting(false);
          showToast({
            title: "Connection Error",
            description: String(obj.message || "Unknown error"),
            variant: "destructive",
          });
        }
      };

      const pump = async (): Promise<void> => {
        const { done, value } = await reader.read();

        if (done) {
          if (buffer.length > 0) {
            processChunk(buffer);
          }
          setIsConnecting(false);
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(delimiter);
        buffer = parts.pop() || "";
        for (const part of parts) {
          processChunk(part);
        }

        return pump();
      };

      await pump();
    } catch (error) {
      setIsConnecting(false);
      showToast({
        title: "Connection Failed",
        description: error instanceof Error ? error.message : "Failed to connect to database",
        variant: "destructive",
      });
    }
  };

  return (
    <Modal
      title="Connect to database"
      open={open}
      onCancel={() => onOpenChange(false)}
      footer={null}
      width={screens.md ? 520 : "calc(100vw - 32px)"}
      style={{ maxWidth: 520, top: screens.md ? undefined : 16 }}
      destroyOnClose={false}
      data-testid="database-modal"
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        Connect to PostgreSQL or MySQL using a connection URL or manual entry.{" "}
        <a href="https://www.falkordb.com/privacy-policy/" target="_blank" rel="noopener noreferrer">
          Privacy policy
        </a>
      </Typography.Paragraph>

      <Space direction="vertical" size="middle" style={{ width: "100%" }} data-testid="database-modal-content">
        <div>
          <Typography.Text strong>Database type</Typography.Text>
          <Select
            style={{ width: "100%", marginTop: 8 }}
            placeholder="— Select database —"
            value={selectedDatabase || undefined}
            onChange={setSelectedDatabase}
            options={[
              { value: "postgresql", label: "PostgreSQL" },
              { value: "mysql", label: "MySQL" },
            ]}
            data-testid="database-type-select"
          />
        </div>

        {selectedDatabase && (
          <Flex gap={8}>
            <Button
              type={connectionMode === "url" ? "primary" : "default"}
              block
              onClick={() => setConnectionMode("url")}
              data-testid="connection-mode-url"
            >
              Connection URL
            </Button>
            <Button
              type={connectionMode === "manual" ? "primary" : "default"}
              block
              onClick={() => setConnectionMode("manual")}
              data-testid="connection-mode-manual"
            >
              Manual entry
            </Button>
          </Flex>
        )}

        {selectedDatabase && connectionMode === "url" && (
          <div>
            <Typography.Text strong>Connection URL</Typography.Text>
            <Input.TextArea
              data-testid="connection-url-input"
              style={{ marginTop: 8, fontFamily: "monospace" }}
              placeholder={
                selectedDatabase === "postgresql"
                  ? "postgresql://username:password@host:5432/database"
                  : "mysql://username:password@host:3306/database"
              }
              value={connectionUrl}
              onChange={(e) => setConnectionUrl(e.target.value)}
              rows={3}
            />
          </div>
        )}

        {selectedDatabase && connectionMode === "manual" && (
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            <Input placeholder="Host" value={host} onChange={(e) => setHost(e.target.value)} />
            <Input
              placeholder={selectedDatabase === "postgresql" ? "5432" : "3306"}
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
            <Input placeholder="Database name" value={database} onChange={(e) => setDatabase(e.target.value)} />
            <Input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <Input.Password placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {selectedDatabase === "postgresql" && (
              <>
                <Input
                  data-testid="schema-input"
                  placeholder="Schema (optional, default public)"
                  value={schema}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSchema(val);
                    if (val && /[^a-zA-Z0-9_]/.test(val)) {
                      setSchemaError("Schema name can only contain letters, digits, and underscores");
                    } else {
                      setSchemaError("");
                    }
                  }}
                  status={schemaError ? "error" : undefined}
                />
                {schemaError ? (
                  <Typography.Text type="danger" style={{ fontSize: 12 }}>
                    {schemaError}
                  </Typography.Text>
                ) : null}
              </>
            )}
          </Space>
        )}

        {connectionSteps.length > 0 && (
          <div
            style={{
              maxHeight: 220,
              overflowY: "auto",
              border: "1px solid #e0e3e6",
              borderRadius: 8,
              padding: 12,
              background: "#f8fafc",
            }}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              {connectionSteps.map((step, index) => (
                <Flex key={index} align="start" gap={8}>
                  {step.status === "pending" && <Spin indicator={<LoadingOutlined spin />} size="small" />}
                  {step.status === "success" && <CheckCircleOutlined style={{ color: "#006e1c" }} />}
                  {step.status === "error" && <CloseCircleOutlined style={{ color: "#ba1a1a" }} />}
                  <Typography.Text type={step.status === "error" ? "danger" : undefined} style={{ flex: 1 }}>
                    {step.message}
                  </Typography.Text>
                </Flex>
              ))}
            </Space>
          </div>
        )}

        <Flex justify="flex-end" gap={8}>
          <Button onClick={() => onOpenChange(false)} disabled={isConnecting} data-testid="cancel-database-button">
            Cancel
          </Button>
          <Button
            type="primary"
            className="sql-gradient"
            style={{ border: "none" }}
            onClick={() => void handleConnect()}
            disabled={!selectedDatabase || isConnecting}
            data-testid="connect-database-button"
          >
            {isConnecting ? "Connecting…" : "Connect"}
          </Button>
        </Flex>
      </Space>
    </Modal>
  );
};

export default DatabaseModal;
