import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Avatar, Button, Dropdown, Flex, Grid, Input, Space, Spin, Typography } from "antd";
import type { MenuProps } from "antd";
import { BellOutlined, DatabaseOutlined } from "@ant-design/icons";
import ArchitectShell from "@/components/layout/ArchitectShell";
import SchemaViewer from "@/components/schema";
import { HistoryService } from "@/services/history";
import type { QueryHistoryItem as ApiHistoryItem } from "@/types/api";
import { headlineFontFamily } from "@/theme/architectTheme";
import { showToast } from "@/lib/notify";

type QueryStatus = "verified" | "error";

interface HistoryQueryItem {
  id: string;
  intent: string;
  status: QueryStatus;
  timing: string;
  date: string;
  time: string;
  tags: string[];
  errorBadge?: string;
}

function formatTimingMs(ms: number | null): string {
  if (ms == null || ms <= 0) return "Completed";
  const s = ms / 1000;
  if (s < 10) return `Executed in ${s.toFixed(1)}s`;
  return `Executed in ${Math.round(s)}s`;
}

function mapApiToRow(h: ApiHistoryItem): HistoryQueryItem {
  const d = new Date(h.executed_at);
  const isErr = h.status === "error";
  return {
    id: h.id,
    intent: h.intent,
    status: isErr ? "error" : "verified",
    timing: isErr ? "Execution failed" : formatTimingMs(h.timing_ms),
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
    tags: h.tags.length > 0 ? h.tags : [h.graph_id],
    errorBadge: h.error_kind ?? undefined,
  };
}

const filterMenuStub = (label: string): MenuProps => ({
  items: [
    { key: "a", label: `${label} (sample)` },
    { key: "b", label: "More filters — coming soon" },
  ],
  onClick: () => {
    showToast({ title: "Filters", description: "Saved filter presets will connect to the history API when available." });
  },
});

const listHeaderLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#64748b",
};

function HistoryQueryRow({ row, compact }: { row: HistoryQueryItem; compact: boolean }) {
  const isError = row.status === "error";

  const iconWrap = (
    <div
      style={{
        marginTop: 4,
        flexShrink: 0,
        width: 32,
        height: 32,
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: isError ? "#fee2e2" : "#f1f5f9",
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 20, color: isError ? "#dc2626" : "#3f51b5" }}
      >
        {isError ? "warning" : "psychology"}
      </span>
    </div>
  );

  const statusLine = (
    <Flex align="center" gap={8} wrap="wrap" style={{ fontSize: 12, color: "#64748b" }}>
      {row.status === "verified" ? (
        <span
          style={{
            background: "#dcfce7",
            padding: "2px 8px",
            borderRadius: 2,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#166534",
            border: "1px solid rgba(22, 101, 52, 0.2)",
          }}
        >
          SQL Verified
        </span>
      ) : (
        <span
          style={{
            background: "#fee2e2",
            padding: "2px 8px",
            borderRadius: 2,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#991b1b",
          }}
        >
          {row.errorBadge ?? "Error"}
        </span>
      )}
      <span>{row.timing}</span>
    </Flex>
  );

  const dateBlock = (
    <div style={{ fontSize: 14, color: "#475569" }}>
      {row.date}
      <br />
      <span style={{ fontSize: 10, opacity: 0.6 }}>{row.time}</span>
    </div>
  );

  const tagsBlock = (
    <Flex gap={4} wrap="wrap">
      {row.tags.map((t) => (
        <span
          key={t}
          style={{
            background: "#f1f5f9",
            padding: "2px 8px",
            borderRadius: 2,
            fontSize: 10,
            fontWeight: 500,
            color: "#475569",
          }}
        >
          {t}
        </span>
      ))}
    </Flex>
  );

  const actionBtn = (
    <Button
      className={isError ? "history-action-btn history-action-btn--err" : "history-action-btn history-action-btn--ok"}
      style={{ fontWeight: 700, borderRadius: 2 }}
      onClick={() =>
        showToast({
          title: isError ? "Details" : "Results",
          description: "Opening saved results will use the history API when it is wired up.",
        })
      }
    >
      {isError ? (
        <>
          View Details
          <span className="material-symbols-outlined" style={{ fontSize: 16, marginLeft: 6, verticalAlign: "middle" }}>
            info
          </span>
        </>
      ) : (
        <>
          View Results
          <span className="material-symbols-outlined" style={{ fontSize: 16, marginLeft: 6, verticalAlign: "middle" }}>
            arrow_forward
          </span>
        </>
      )}
    </Button>
  );

  const cardShellStyle: CSSProperties = {
    padding: 24,
    border: "1px solid #e2e8f0",
    borderRadius: 2,
    background: "#fff",
    transition: "border-color 0.3s, background 0.3s",
    boxShadow: isError ? "inset 4px 0 0 0 #ef4444" : undefined,
  };

  if (compact) {
    return (
      <div data-error={isError ? "true" : undefined} style={cardShellStyle} className="history-query-card">
        <Flex vertical gap={16}>
          <Flex gap={16} align="start">
            {iconWrap}
            <div style={{ minWidth: 0, flex: 1 }}>
              <Typography.Title
                level={5}
                className="history-intent-title"
                style={{ margin: "0 0 8px", fontWeight: 600, color: "#1e293b", fontSize: 16 }}
              >
                &ldquo;{row.intent}&rdquo;
              </Typography.Title>
              {statusLine}
            </div>
          </Flex>
          {dateBlock}
          {tagsBlock}
          <div>{actionBtn}</div>
        </Flex>
      </div>
    );
  }

  return (
    <div
      data-error={isError ? "true" : undefined}
      style={{
        ...cardShellStyle,
        display: "grid",
        gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
        gap: 16,
        alignItems: "center",
      }}
      className="history-query-card"
    >
      <div style={{ gridColumn: "span 6", display: "flex", alignItems: "flex-start", gap: 16, minWidth: 0 }}>
        {iconWrap}
        <div style={{ minWidth: 0 }}>
          <Typography.Title
            level={5}
            className="history-intent-title"
            style={{ margin: "0 0 4px", fontWeight: 500, color: "#1e293b", fontSize: 16 }}
          >
            &ldquo;{row.intent}&rdquo;
          </Typography.Title>
          {statusLine}
        </div>
      </div>
      <div style={{ gridColumn: "span 2" }}>{dateBlock}</div>
      <div style={{ gridColumn: "span 2" }}>{tagsBlock}</div>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end" }}>{actionBtn}</div>
    </div>
  );
}

const History = () => {
  const [showSchemaViewer, setShowSchemaViewer] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [rows, setRows] = useState<HistoryQueryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const screens = Grid.useBreakpoint();
  const compact = !screens.md;

  useEffect(() => {
    const t = window.setTimeout(() => setSearchApplied(searchInput), 400);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await HistoryService.list({
          q: searchApplied.trim() || undefined,
          limit: 100,
          offset: 0,
        });
        if (cancelled) return;
        setRows(r.items.map(mapApiToRow));
        setTotal(r.total);
      } catch (e) {
        if (!cancelled) {
          setRows([]);
          setTotal(0);
          showToast({
            title: "Could not load history",
            description: e instanceof Error ? e.message : "Unknown error",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchApplied]);

  const headerExtra = (
    <Space size="large" align="center">
      <Space size="middle">
        <Button
          type="text"
          icon={<DatabaseOutlined style={{ fontSize: 20, color: "#64748b" }} />}
          onClick={() => setShowSchemaViewer(true)}
          aria-label="Open data viewer"
          style={{ color: "#64748b" }}
        />
        <Button type="text" icon={<BellOutlined style={{ fontSize: 20 }} />} disabled aria-label="Notifications" />
      </Space>
      <Avatar size={32} style={{ background: "#e2e8f0", color: "#475569", fontWeight: 700 }}>
        AC
      </Avatar>
    </Space>
  );

  return (
    <>
      <ArchitectShell
        activeNav="history"
        showRightRail={false}
        showVersionBadge={false}
        headerContext="Query History"
        headerExtra={headerExtra}
        onOpenDataViewer={() => setShowSchemaViewer(true)}
      >
        <div style={{ maxWidth: 1152, margin: "0 auto", padding: "40px 24px 48px", width: "100%" }}>
          <section style={{ marginBottom: 40 }}>
            <Flex vertical gap={24}>
              <Flex justify="space-between" align="flex-end" gap={24} wrap="wrap">
                <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                  <Typography.Title
                    level={2}
                    style={{
                      margin: "0 0 16px",
                      fontFamily: headlineFontFamily,
                      fontWeight: 700,
                      color: "#1e293b",
                      fontSize: "clamp(1.5rem, 4vw, 2rem)",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Analysis Archive
                  </Typography.Title>
                  <Typography.Paragraph style={{ margin: "0 0 16px", color: "#64748b", maxWidth: 512, fontSize: 15 }}>
                    Retrieve and inspect historical queries across your distributed data infrastructure.
                  </Typography.Paragraph>
                  <Input
                    allowClear
                    size="large"
                    variant="filled"
                    placeholder="Search natural language queries..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    prefix={
                      <span className="material-symbols-outlined" style={{ color: "#94a3b8", fontSize: 22 }}>
                        search
                      </span>
                    }
                    style={{
                      maxWidth: 448,
                      borderRadius: 2,
                      background: "#f1f5f9",
                    }}
                  />
                </div>
                <Flex gap={12} wrap="wrap">
                  <Dropdown menu={filterMenuStub("Last 30 Days")} trigger={["click"]}>
                    <Flex
                      align="center"
                      gap={8}
                      style={{
                        cursor: "pointer",
                        background: "#f8fafc",
                        padding: "10px 16px",
                        borderRadius: 2,
                        border: "1px solid #e2e8f0",
                        fontSize: 14,
                        fontWeight: 500,
                        color: "#1e293b",
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#3f51b5" }}>
                        calendar_today
                      </span>
                      <span>Last 30 Days</span>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        expand_more
                      </span>
                    </Flex>
                  </Dropdown>
                  <Dropdown menu={filterMenuStub("All Tables")} trigger={["click"]}>
                    <Flex
                      align="center"
                      gap={8}
                      style={{
                        cursor: "pointer",
                        background: "#f8fafc",
                        padding: "10px 16px",
                        borderRadius: 2,
                        border: "1px solid #e2e8f0",
                        fontSize: 14,
                        fontWeight: 500,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#3f51b5" }}>
                        storage
                      </span>
                      <span>All Tables</span>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        expand_more
                      </span>
                    </Flex>
                  </Dropdown>
                  <Dropdown menu={filterMenuStub("Users")} trigger={["click"]}>
                    <Flex
                      align="center"
                      gap={8}
                      style={{
                        cursor: "pointer",
                        background: "#f8fafc",
                        padding: "10px 16px",
                        borderRadius: 2,
                        border: "1px solid #e2e8f0",
                        fontSize: 14,
                        fontWeight: 500,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#3f51b5" }}>
                        person
                      </span>
                      <span>Users</span>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        expand_more
                      </span>
                    </Flex>
                  </Dropdown>
                </Flex>
              </Flex>
            </Flex>
          </section>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {loading ? (
              <Flex justify="center" style={{ padding: 48 }}>
                <Spin size="large" />
              </Flex>
            ) : null}
            {!loading && !compact ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
                  gap: 16,
                  padding: "8px 24px",
                }}
              >
                <div style={{ gridColumn: "span 6", ...listHeaderLabelStyle }}>Query Intent</div>
                <div style={{ gridColumn: "span 2", ...listHeaderLabelStyle }}>Execution Date</div>
                <div style={{ gridColumn: "span 2", ...listHeaderLabelStyle }}>Context</div>
                <div style={{ gridColumn: "span 2" }} />
              </div>
            ) : null}

            {!loading && rows.length === 0 ? (
              <Typography.Paragraph type="secondary" style={{ textAlign: "center", margin: "24px 0" }}>
                {searchApplied.trim()
                  ? "No queries match your search."
                  : "No queries yet. Run an analysis from Workspace to build your archive."}
              </Typography.Paragraph>
            ) : null}

            <Flex vertical gap={16}>
              {!loading
                ? rows.map((row) => <HistoryQueryRow key={row.id} row={row} compact={compact} />)
                : null}
            </Flex>
          </div>

          <Flex vertical align="center" gap={24} style={{ marginTop: 48 }}>
            <Flex align="center" gap={16} style={{ color: "#94a3b8", fontSize: 14, fontWeight: 500 }}>
              <div style={{ height: 1, width: 96, background: "#e2e8f0" }} />
              <span>
                Showing {rows.length === 0 ? "0" : `1–${rows.length}`} of {total} queries
              </span>
              <div style={{ height: 1, width: 96, background: "#e2e8f0" }} />
            </Flex>
            <Button
              size="large"
              style={{
                borderRadius: 2,
                border: "1px solid #e2e8f0",
                color: "#475569",
                fontWeight: 700,
                paddingInline: 32,
                height: 48,
              }}
              onClick={() =>
                showToast({ title: "Pagination", description: "Older analytics will load from the API when available." })
              }
            >
              Load Older Analytics
            </Button>
          </Flex>
        </div>
      </ArchitectShell>

      <SchemaViewer isOpen={showSchemaViewer} onClose={() => setShowSchemaViewer(false)} />

      <style>{`
        .history-query-card:hover {
          border-color: rgba(63, 81, 181, 0.5);
          background: #f8fafc;
        }
        .history-query-card:hover .history-intent-title {
          color: #24389c !important;
        }
        .history-query-card[data-error="true"]:hover {
          border-color: rgba(239, 68, 68, 0.5) !important;
          background: #fef2f2 !important;
        }
        .history-query-card[data-error="true"]:hover .history-intent-title {
          color: #dc2626 !important;
        }
        .history-action-btn--ok {
          background: #f1f5f9 !important;
          color: #3f51b5 !important;
          border: none !important;
        }
        .history-action-btn--ok:hover {
          background: #3f51b5 !important;
          color: #fff !important;
        }
        .history-action-btn--err {
          background: #f1f5f9 !important;
          color: #475569 !important;
          border: none !important;
        }
        .history-action-btn--err:hover {
          background: #e2e8f0 !important;
          color: #475569 !important;
        }
      `}</style>
    </>
  );
};

export default History;
