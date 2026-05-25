import React, { useState } from "react";
import { Button, Input, Flex, Typography } from "antd";
import { SendOutlined } from "@ant-design/icons";
import { useIsMobile } from "@/hooks/use-mobile";

const { TextArea } = Input;

interface QueryInputProps {
  onSubmit: (query: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Shown as SCHEMA: name in the footer row */
  schemaLabel?: string;
}

const QueryInput = ({
  onSubmit,
  placeholder = "Describe the data you need...",
  disabled = false,
  schemaLabel,
}: QueryInputProps) => {
  const [query, setQuery] = useState("");
  const isMobile = useIsMobile();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !disabled) {
      onSubmit(query.trim());
      setQuery("");
    }
  };

  return (
    <form onSubmit={handleSubmit} data-testid="query-input-form">
      <div
        style={{
          background: "#f7f9fc",
          borderRadius: 16,
          padding: 4,
          border: "1px solid #e0e3e6",
          boxShadow: "0 12px 40px rgba(15, 23, 42, 0.08)",
        }}
      >
        <Flex align="flex-end" gap={8} style={{ padding: "12px 16px" }}>
          <Flex vertical gap={8} style={{ flex: 1, minWidth: 0 }}>
            <TextArea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              autoSize={isMobile ? { minRows: 1, maxRows: 3 } : { minRows: 1, maxRows: 6 }}
              variant="borderless"
              style={{
                fontWeight: 500,
                color: "#1a1c1e",
                ...(isMobile ? { maxHeight: 96, overflowY: "auto" } : undefined),
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !disabled) {
                  e.preventDefault();
                  handleSubmit(e as unknown as React.FormEvent);
                }
              }}
              data-testid="query-textarea"
            />
            <Flex align="center" gap={16} wrap="wrap">
              <Button type="text" icon={<span className="material-symbols-outlined">attach_file</span>} disabled style={{ color: "#94a3b8" }} />
              <Button type="text" icon={<span className="material-symbols-outlined">dataset</span>} disabled style={{ color: "#94a3b8" }} />
              <div style={{ width: 1, height: 16, background: "#e2e8f0" }} />
              <Typography.Text type="secondary" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em" }}>
                SCHEMA: {(schemaLabel || "none").toLowerCase().replace(/\s+/g, "_")}
              </Typography.Text>
            </Flex>
          </Flex>
          <Button
            type="primary"
            shape="round"
            size="large"
            htmlType="submit"
            className="sql-gradient"
            style={{ width: 48, height: 48, border: "none", flexShrink: 0 }}
            disabled={!query.trim() || disabled}
            icon={<SendOutlined />}
            aria-label="Send query"
            data-testid="send-query-btn"
          />
        </Flex>
      </div>
    </form>
  );
};

export default QueryInput;
