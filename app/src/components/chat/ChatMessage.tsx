import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Flex,
  Input,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  UserOutlined,
  DatabaseOutlined,
  CodeOutlined,
  MessageOutlined,
  SearchOutlined,
  ExclamationCircleOutlined,
  CopyOutlined,
  CheckOutlined,
  DownloadOutlined,
  FileImageOutlined,
} from '@ant-design/icons';
import G2Chart, { type G2ChartRef } from './G2Chart';
import { AiMarkdownContent } from './AiMarkdownContent';
import {
  adviceTypeToBuilderType,
  extractAxesFromAdvice,
  useAdvices,
  type Advice,
} from '@/lib/avaAdvisor';
import { buildG2Spec } from '@/lib/g2Spec';
import { downloadQueryResultsCsv } from '@/lib/exportCsv';
import { APP_LOGO_URL } from '@/lib/appLogo';
import { showToast } from '@/lib/notify';
interface Step {
  icon: 'search' | 'database' | 'code' | 'message';
  text: string;
}

interface ChatMessageProps {
  type: 'user' | 'ai' | 'ai-steps' | 'sql-query' | 'query-result' | 'confirmation';
  content: string;
  steps?: Step[];
  queryData?: any[]; // For table data
  visualizationData?: {
    should_visualize: boolean;
  };
  analysisInfo?: {
    confidence?: number;
    missing?: string;
    ambiguities?: string;
    explanation?: string;
    isValid?: boolean;
  };
  confirmationData?: {
    sqlQuery: string;
    operationType: string;
    message: string;
  };
  progress?: number; // Progress percentage for AI steps
  onConfirm?: () => void;
  onCancel?: () => void;
}

type VisualizationData = NonNullable<ChatMessageProps['visualizationData']>;

/** Assistant / system messages: app logo (plain img so a failed load never shows text fallback). */
function AppAssistantAvatar() {
  return (
    <img
      src={APP_LOGO_URL}
      alt="QueryMind"
      width={32}
      height={32}
      decoding="async"
      style={{
        flexShrink: 0,
        width: 32,
        height: 32,
        borderRadius: '50%',
        objectFit: 'contain',
        display: 'block',
        background: '#fff',
      }}
    />
  );
}

const OPTIONAL_NONE_VALUE = '__none__';

const isChartTypeSupported = (chartType: string) =>
  ['line', 'bar', 'pie', 'scatter', 'histogram', 'box', 'table'].includes(chartType);

const CHART_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'bar', label: 'Cột (bar)' },
  { value: 'line', label: 'Đường (line)' },
  { value: 'scatter', label: 'Phân tán (scatter)' },
  { value: 'pie', label: 'Tròn (pie)' },
  { value: 'histogram', label: 'Histogram' },
  { value: 'box', label: 'Box plot' },
  { value: 'table', label: 'Bảng (table)' },
];

const hasColumn = (queryData: any[], column?: string) =>
  Boolean(column && queryData.length > 0 && Object.prototype.hasOwnProperty.call(queryData[0], column));

const channelsUniqueInDraft = (draft: ChartDraft, keys: Array<'x' | 'y' | 'color' | 'size'>) => {
  const vals = keys.map((k) => draft[k]).filter(Boolean) as string[];
  return new Set(vals).size === vals.length;
};

const canRenderDraftConfig = (queryData: any[], chartType: string, draft: ChartDraft) => {
  if (!queryData || queryData.length === 0) return false;
  const ct = chartType.toLowerCase();
  if (!isChartTypeSupported(ct)) return false;
  if (ct === 'line' || ct === 'bar' || ct === 'scatter') {
    if (!hasColumn(queryData, draft.x) || !hasColumn(queryData, draft.y)) return false;
    if (draft.color) {
      if (!hasColumn(queryData, draft.color)) return false;
      if (!channelsUniqueInDraft(draft, ['x', 'y', 'color'])) return false;
    }
    if (ct === 'scatter' && draft.size) {
      if (!hasColumn(queryData, draft.size)) return false;
      if (!channelsUniqueInDraft(draft, ['x', 'y', 'color', 'size'])) return false;
    }
    if (ct === 'bar' && draft.color && draft.barLayout !== 'grouped' && draft.barLayout !== 'stacked') {
      return false;
    }
    return true;
  }
  if (ct === 'pie') {
    return hasColumn(queryData, draft.labels) && hasColumn(queryData, draft.values);
  }
  if (ct === 'histogram') {
    return hasColumn(queryData, draft.x);
  }
  if (ct === 'box') {
    if (!hasColumn(queryData, draft.y)) return false;
    if (draft.x) {
      if (!hasColumn(queryData, draft.x) || draft.x === draft.y) return false;
    }
    return true;
  }
  // 'table' is rendered via the data table below; no chart needed.
  return true;
};

type ChartDraft = {
  chartType: string;
  x: string;
  y: string;
  labels: string;
  values: string;
  /** Series / group (bar, line, scatter). Empty = single series. */
  color: string;
  /** Bubble size (scatter). Empty = off. */
  size: string;
  /** bar + color only: dodge vs stack */
  barLayout: 'grouped' | 'stacked';
};

const pickColumn = (columns: string[], preferred: string | undefined, fallbackIndex: number) => {
  if (preferred && columns.includes(preferred)) return preferred;
  return columns[fallbackIndex] ?? '';
};

const deriveInitialDraft = (queryData: any[], topAdvice?: Advice): ChartDraft => {
  const columns = Object.keys(queryData[0] || {});
  const adviceAxes = extractAxesFromAdvice(topAdvice);
  const adviceChartType = adviceTypeToBuilderType(topAdvice?.type);
  const chartType = adviceChartType && isChartTypeSupported(adviceChartType) ? adviceChartType : 'bar';

  const x = pickColumn(columns, adviceAxes.x, 0);
  const y = pickColumn(columns, adviceAxes.y, columns.length > 1 ? 1 : 0);

  const emptyCartesianDraft = (): Omit<ChartDraft, 'chartType' | 'labels' | 'values'> => ({
    x,
    y,
    color: '',
    size: '',
    barLayout: 'grouped',
  });

  if (chartType === 'pie') {
    return {
      chartType,
      x,
      y,
      labels: pickColumn(columns, adviceAxes.labels, 0),
      values: pickColumn(columns, adviceAxes.values, columns.length > 1 ? 1 : 0),
      color: '',
      size: '',
      barLayout: 'grouped',
    };
  }

  if (chartType === 'box') {
    const boxY = pickColumn(columns, adviceAxes.y, columns.length > 1 ? 1 : 0);
    const boxX =
      adviceAxes.x && columns.includes(adviceAxes.x) && adviceAxes.x !== boxY ? adviceAxes.x : '';
    return {
      chartType,
      x: boxX,
      y: boxY,
      labels: pickColumn(columns, adviceAxes.labels ?? x, 0),
      values: pickColumn(columns, adviceAxes.values ?? y, columns.length > 1 ? 1 : 0),
      color: '',
      size: '',
      barLayout: 'grouped',
    };
  }

  let color = '';
  if (
    adviceAxes.color &&
    columns.includes(adviceAxes.color) &&
    adviceAxes.color !== x &&
    adviceAxes.color !== y
  ) {
    color = adviceAxes.color;
  } else {
    const third = columns.find((c) => c !== x && c !== y);
    color = third ?? '';
  }

  return {
    chartType,
    ...emptyCartesianDraft(),
    color,
    barLayout: 'grouped',
    labels: pickColumn(columns, adviceAxes.labels ?? x, 0),
    values: pickColumn(columns, adviceAxes.values ?? y, columns.length > 1 ? 1 : 0),
  };
};

interface QueryResultBodyProps {
  queryData: any[];
  visualizationData?: VisualizationData;
}

const ColumnSelect = ({
  id,
  label,
  value,
  columns,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  columns: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) => (
  <Flex vertical gap={6} style={{ minWidth: 0, flex: 1 }}>
    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
      {label}
    </Typography.Text>
    <Select
      id={id}
      value={value || columns[0]}
      onChange={onChange}
      disabled={disabled || columns.length === 0}
      size="small"
      options={columns.map((col) => ({ value: col, label: col }))}
      style={{ width: '100%' }}
    />
  </Flex>
);

/** Column picker with explicit &quot;Không&quot; for optional channels (color, size, box X). */
const OptionalColumnSelect = ({
  id,
  label,
  value,
  columns,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  columns: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) => (
  <Flex vertical gap={6} style={{ minWidth: 0, flex: 1 }}>
    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
      {label}
    </Typography.Text>
    <Select
      id={id}
      value={value ? value : OPTIONAL_NONE_VALUE}
      onChange={(v) => onChange(v === OPTIONAL_NONE_VALUE ? '' : v)}
      disabled={disabled || columns.length === 0}
      size="small"
      options={[
        { value: OPTIONAL_NONE_VALUE, label: 'Không' },
        ...columns.map((col) => ({ value: col, label: col })),
      ]}
      style={{ width: '100%' }}
    />
  </Flex>
);

const QueryResultBody = ({ queryData, visualizationData }: QueryResultBodyProps) => {
  const chartExportRef = useRef<G2ChartRef>(null);
  const columns = useMemo(() => Object.keys(queryData[0] || {}), [queryData]);
  const columnsKey = columns.join('\0');

  const shouldVisualize = Boolean(visualizationData?.should_visualize);
  const advices = useAdvices(shouldVisualize ? queryData : undefined);
  const topAdvice = advices[0];
  const adviceSignature = useMemo(
    () => (topAdvice ? `${topAdvice.type}|${JSON.stringify(topAdvice.spec ?? {})}` : ''),
    [topAdvice],
  );

  const [draft, setDraft] = useState<ChartDraft>(() =>
    shouldVisualize ? deriveInitialDraft(queryData, topAdvice) : ({} as ChartDraft),
  );
  const [applied, setApplied] = useState<ChartDraft | null>(null);
  const [chartPlotTitle, setChartPlotTitle] = useState("Query Results");

  useEffect(() => {
    if (!shouldVisualize || columns.length === 0) return;
    setDraft(deriveInitialDraft(queryData, topAdvice));
    setApplied(null);
    setChartPlotTitle("Query Results");
  }, [adviceSignature, columnsKey, shouldVisualize]);

  const handleCreateChart = useCallback(() => {
    setApplied({ ...draft });
  }, [draft]);

  const canApply = shouldVisualize && canRenderDraftConfig(queryData, draft.chartType, draft);

  const chartSpec = useMemo(() => {
    if (!applied) return null;
    if (applied.chartType.toLowerCase() === 'table') return null;
    if (!canRenderDraftConfig(queryData, applied.chartType, applied)) return null;
    return buildG2Spec(queryData, applied.chartType, {
      title: chartPlotTitle.trim() || "Query Results",
      x:
        applied.chartType === 'box'
          ? applied.x || undefined
          : applied.x,
      y: applied.y,
      labels: applied.labels,
      values: applied.values,
      color: applied.color || undefined,
      size: applied.size || undefined,
      barLayout:
        applied.chartType === 'bar' && applied.color ? applied.barLayout : undefined,
    });
  }, [applied, queryData, chartPlotTitle]);

  const headerChartBadge = applied?.chartType ?? draft.chartType;

  const handleDownloadCsv = useCallback(() => {
    const ok = downloadQueryResultsCsv(queryData as Record<string, unknown>[]);
    if (ok) {
      showToast({ title: 'CSV downloaded', description: 'Result rows saved as a CSV file.' });
    } else {
      showToast({
        title: 'Nothing to export',
        description: 'There are no rows to save.',
        variant: 'destructive',
      });
    }
  }, [queryData]);

  const handleDownloadChartPng = useCallback(() => {
    const ok = chartExportRef.current?.downloadJpeg() ?? false;
    if (ok) {
      showToast({ title: 'Chart saved', description: 'JPEG image downloaded.' });
    } else {
      showToast({
        title: 'Could not save chart',
        description: 'Create a chart first, or try again after it finishes rendering.',
        variant: 'destructive',
      });
    }
  }, []);

  return (
    <>
      <Flex align="center" gap={8} wrap="wrap" style={{ marginBottom: 12 }}>
        <DatabaseOutlined style={{ color: "#006e1c", fontSize: 16 }} />
        <Typography.Text strong style={{ color: "#006e1c" }}>
          Query Results
        </Typography.Text>
        {shouldVisualize && headerChartBadge ? (
          <Tag data-testid="query-results-chart-type-badge">{headerChartBadge}</Tag>
        ) : null}
        <Space style={{ marginLeft: 'auto' }} wrap size={8} align="center">
          <Tag>{queryData?.length || 0} rows</Tag>
          <Button
            type="default"
            size="small"
            icon={<DownloadOutlined />}
            onClick={handleDownloadCsv}
            disabled={!queryData?.length}
            data-testid="query-results-download-csv"
          >
            CSV
          </Button>
          <Button
            type="default"
            size="small"
            icon={<FileImageOutlined />}
            onClick={handleDownloadChartPng}
            disabled={!chartSpec}
            data-testid="query-results-download-chart-jpeg"
          >
            Chart JPEG
          </Button>
        </Space>
      </Flex>

      {shouldVisualize && columns.length > 0 ? (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            border: "1px solid #e0e3e6",
            background: "rgba(63, 81, 181, 0.04)",
          }}
          data-testid="query-results-chart-builder"
        >
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
            Giá trị mặc định gợi ý bởi AntV AVA. Chỉnh trục và loại biểu đồ, rồi bấm{" "}
            <Typography.Text strong>Tạo biểu đồ</Typography.Text>.
          </Typography.Paragraph>
          <Flex vertical gap={12} style={{ width: "100%" }}>
            <Flex vertical gap={6} style={{ width: "100%", maxWidth: 480 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Tiêu đề biểu đồ
              </Typography.Text>
              <Input
                value={chartPlotTitle}
                onChange={(e) => setChartPlotTitle(e.target.value)}
                placeholder="Ví dụ: Doanh thu theo tháng"
                maxLength={120}
                allowClear
                data-testid="chart-plot-title-input"
              />
            </Flex>
            <Flex gap={12} wrap="wrap" align="flex-end">
              <Flex vertical gap={6} style={{ width: "100%", maxWidth: 200 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Loại biểu đồ
                </Typography.Text>
                <Select
                  value={draft.chartType}
                  onChange={(v) => setDraft((d) => ({ ...d, chartType: v }))}
                  size="small"
                  data-testid="chart-type-select"
                  options={CHART_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  style={{ width: "100%" }}
                />
              </Flex>

              {["line", "bar", "scatter"].includes(draft.chartType) ? (
                <>
                  <ColumnSelect
                    id="chart-x"
                    label="Trục X"
                    value={draft.x}
                    columns={columns}
                    onChange={(x) => setDraft((d) => ({ ...d, x }))}
                  />
                  <ColumnSelect
                    id="chart-y"
                    label="Trục Y"
                    value={draft.y}
                    columns={columns}
                    onChange={(y) => setDraft((d) => ({ ...d, y }))}
                  />
                  <OptionalColumnSelect
                    id="chart-color"
                    label="Màu / nhóm (color)"
                    value={draft.color}
                    columns={columns}
                    onChange={(color) => setDraft((d) => ({ ...d, color }))}
                  />
                </>
              ) : null}

              {draft.chartType === "bar" && draft.color ? (
                <Flex vertical gap={6} style={{ width: "100%", maxWidth: 160 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Kiểu cột
                  </Typography.Text>
                  <Select
                    value={draft.barLayout}
                    onChange={(v) => setDraft((d) => ({ ...d, barLayout: v as "grouped" | "stacked" }))}
                    size="small"
                    data-testid="chart-bar-layout-select"
                    options={[
                      { value: "grouped", label: "Nhóm cột" },
                      { value: "stacked", label: "Chồng" },
                    ]}
                    style={{ width: "100%" }}
                  />
                </Flex>
              ) : null}

              {draft.chartType === "scatter" ? (
                <OptionalColumnSelect
                  id="chart-size"
                  label="Kích thước (size)"
                  value={draft.size}
                  columns={columns}
                  onChange={(size) => setDraft((d) => ({ ...d, size }))}
                />
              ) : null}

              {draft.chartType === "pie" ? (
                <>
                  <ColumnSelect
                    id="chart-labels"
                    label="Nhãn (labels)"
                    value={draft.labels}
                    columns={columns}
                    onChange={(labels) => setDraft((d) => ({ ...d, labels }))}
                  />
                  <ColumnSelect
                    id="chart-values"
                    label="Giá trị (values)"
                    value={draft.values}
                    columns={columns}
                    onChange={(values) => setDraft((d) => ({ ...d, values }))}
                  />
                </>
              ) : null}

              {draft.chartType === "histogram" ? (
                <ColumnSelect
                  id="chart-hist-x"
                  label="Cột (trục X)"
                  value={draft.x}
                  columns={columns}
                  onChange={(x) => setDraft((d) => ({ ...d, x }))}
                />
              ) : null}

              {draft.chartType === "box" ? (
                <>
                  <OptionalColumnSelect
                    id="chart-box-x"
                    label="Phân loại (X, tuỳ chọn)"
                    value={draft.x}
                    columns={columns}
                    onChange={(x) => setDraft((d) => ({ ...d, x }))}
                  />
                  <ColumnSelect
                    id="chart-box-y"
                    label="Giá trị (Y)"
                    value={draft.y}
                    columns={columns}
                    onChange={(y) => setDraft((d) => ({ ...d, y }))}
                  />
                </>
              ) : null}

              <Button
                type="primary"
                size="small"
                style={{ alignSelf: "flex-end" }}
                onClick={handleCreateChart}
                disabled={!canApply}
                data-testid="query-results-create-chart"
              >
                Tạo biểu đồ
              </Button>
            </Flex>
          </Flex>
          {!canApply && draft.chartType !== "table" ? (
            <Typography.Text type="danger" style={{ fontSize: 12 }}>
              Chọn đủ cột hợp lệ cho loại biểu đồ này.
            </Typography.Text>
          ) : null}
        </div>
      ) : null}

      {chartSpec ? (
        <div style={{ marginBottom: 16, maxWidth: "100%" }}>
          <div
            style={{
              overflow: "hidden",
              borderRadius: 8,
              border: "1px solid #e0e3e6",
              background: "#fff",
              padding: 8,
            }}
            data-testid="query-results-plot"
          >
            <G2Chart ref={chartExportRef} spec={chartSpec} height={380} />
          </div>
        </div>
      ) : shouldVisualize ? (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }} data-testid="query-results-chart-placeholder">
          Chưa có biểu đồ. Chọn cấu hình và bấm &quot;Tạo biểu đồ&quot;.
        </Typography.Paragraph>
      ) : null}

      <div>
        <QueryResultsTable queryData={queryData} />
      </div>
    </>
  );
};

const QueryResultsTable = ({ queryData }: { queryData: any[] }) => {
  const keys = Object.keys(queryData[0] || {});
  const columns = keys.map((k) => ({
    title: k,
    dataIndex: k,
    key: k,
    ellipsis: true,
  }));
  return (
    <div style={{ maxWidth: "100%", overflow: "hidden" }}>
      <Table
        size="small"
        data-testid="results-table"
        dataSource={queryData.map((row, i) => ({ ...row, key: i }))}
        columns={columns}
        pagination={false}
        scroll={{ x: "max-content", y: 360 }}
        style={{ border: "1px solid #e0e3e6", borderRadius: 8 }}
      />
    </div>
  );
};

const ChatMessage = ({
  type, content, steps, queryData, visualizationData, analysisInfo, confirmationData, progress, onConfirm, onCancel,
}: ChatMessageProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopyQuery = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  if (type === "confirmation") {
    const operationType = (confirmationData?.operationType ?? "UNKNOWN").toUpperCase();
    const isHighRisk = ["DELETE", "DROP", "TRUNCATE"].includes(operationType);

    return (
      <div className="chat-message-wrap" data-testid="confirmation-message">
        <Flex gap={12} align="start" style={{ marginBottom: 24 }}>
          <AppAssistantAvatar />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Card
              style={{
                borderColor: isHighRisk ? "#fecaca" : "#fde68a",
                background: isHighRisk ? "#fff1f2" : "#fffbeb",
              }}
              styles={{ body: { padding: 16 } }}
            >
              <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
                <ExclamationCircleOutlined style={{ color: isHighRisk ? "#ba1a1a" : "#b45309", fontSize: 20 }} />
                <Typography.Text strong style={{ color: isHighRisk ? "#ba1a1a" : "#b45309" }}>
                  Destructive operation detected
                </Typography.Text>
              </Flex>

              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <div>
                  <Typography.Paragraph style={{ marginBottom: 8 }}>
                    This operation will perform a{" "}
                    <Typography.Text strong type={isHighRisk ? "danger" : "warning"}>
                      {operationType}
                    </Typography.Text>{" "}
                    query:
                  </Typography.Paragraph>
                  {confirmationData?.sqlQuery && (
                    <div
                      style={{
                        background: "#f8fafc",
                        border: "1px solid #e0e3e6",
                        borderRadius: 8,
                        padding: 12,
                        overflowX: "auto",
                      }}
                    >
                      <pre style={{ margin: 0, fontFamily: "monospace", fontSize: 13, whiteSpace: "pre-wrap" }}>
                        <code>{confirmationData.sqlQuery}</code>
                      </pre>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    border: `1px solid ${isHighRisk ? "#fecaca" : "#fde68a"}`,
                    borderRadius: 8,
                    padding: 12,
                    background: isHighRisk ? "#fff1f2" : "#fffbeb",
                  }}
                >
                  <Typography.Text style={{ fontSize: 13 }}>
                    {isHighRisk ? (
                      <>
                        <Typography.Text strong type="danger">
                          Warning:
                        </Typography.Text>{" "}
                        This operation may be irreversible and will permanently modify your database.
                      </>
                    ) : (
                      <>This operation will make changes to your database. Please review carefully before confirming.</>
                    )}
                  </Typography.Text>
                </div>

                <Flex gap={8} style={{ paddingTop: 8 }}>
                  <Button block onClick={onCancel} data-testid="confirmation-cancel-button">
                    Cancel
                  </Button>
                  <Button
                    block
                    danger={isHighRisk}
                    type="primary"
                    onClick={onConfirm}
                    data-testid="confirmation-confirm-button"
                    style={!isHighRisk ? { background: "#b45309", borderColor: "#b45309" } : undefined}
                  >
                    Confirm {operationType}
                  </Button>
                </Flex>
              </Space>
            </Card>
          </div>
        </Flex>
      </div>
    );
  }

  if (type === "user") {
    return (
      <div className="chat-message-wrap" data-testid="user-message">
        <Flex justify="flex-end" gap={12} align="start" style={{ marginBottom: 24 }}>
          <Card
            className="user-message-bubble"
            style={{
              background: "rgba(222, 224, 255, 0.45)",
              borderColor: "rgba(63, 81, 181, 0.15)",
              borderRadius: 16,
            }}
            styles={{ body: { padding: "12px 16px" } }}
          >
            <Typography.Paragraph style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "#1a1c1e" }}>
              {content}
            </Typography.Paragraph>
          </Card>
          <Avatar style={{ background: "#e8eaed", color: "#475569", flexShrink: 0 }} icon={<UserOutlined />} />
        </Flex>
      </div>
    );
  }

  if (type === "sql-query") {
    const hasSQL = content && content.trim().length > 0;
    const isValid = analysisInfo?.isValid !== false;

    return (
      <div className="chat-message-wrap" data-testid="sql-query-message">
        <Flex gap={12} align="start" style={{ marginBottom: 24 }}>
          <AppAssistantAvatar />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Card
              styles={{ body: { padding: 0 } }}
              style={{
                borderColor: isValid ? "rgba(63, 81, 181, 0.25)" : "#fde68a",
                overflow: "hidden",
              }}
            >
              <Flex align="center" gap={8} style={{ padding: "12px 16px", borderBottom: "1px solid #e0e3e6" }}>
                <CodeOutlined style={{ color: isValid ? "#3f51b5" : "#b45309" }} />
                <Typography.Text strong style={{ color: isValid ? "#24389c" : "#b45309" }}>
                  {hasSQL ? "Generated SQL" : "Query analysis"}
                </Typography.Text>
              </Flex>

              {hasSQL && (
                <div style={{ position: "relative", background: "#1a1c1e", color: "#e5e7eb" }}>
                  <Flex
                    justify="space-between"
                    align="center"
                    style={{ padding: "8px 16px", background: "#1e293b", borderBottom: "1px solid #334155" }}
                  >
                    <Typography.Text style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#94a3b8" }}>
                      SQL
                    </Typography.Text>
                    <Button
                      type="text"
                      size="small"
                      icon={copied ? <CheckOutlined style={{ color: "#94f990" }} /> : <CopyOutlined />}
                      onClick={() => void handleCopyQuery()}
                      style={{ color: "#bac3ff", fontSize: 11, fontWeight: 700 }}
                    >
                      COPY
                    </Button>
                  </Flex>
                  <pre
                    style={{
                      margin: 0,
                      padding: 20,
                      fontSize: 12,
                      fontFamily: "JetBrains Mono, Consolas, monospace",
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    <code style={{ color: "#e5e7eb" }}>{content}</code>
                  </pre>
                </div>
              )}

              {!isValid && (
                <div style={{ padding: 16 }}>
                  <Space direction="vertical" size={8} style={{ width: "100%" }}>
                    {analysisInfo?.explanation && (
                      <Typography.Paragraph type="warning" style={{ margin: 0 }}>
                        <strong>Explanation:</strong> {analysisInfo.explanation}
                      </Typography.Paragraph>
                    )}
                    {analysisInfo?.missing && (
                      <Typography.Paragraph type="warning" style={{ margin: 0 }}>
                        <strong>Missing:</strong> {analysisInfo.missing}
                      </Typography.Paragraph>
                    )}
                    {analysisInfo?.ambiguities && (
                      <Typography.Paragraph type="warning" style={{ margin: 0 }}>
                        <strong>Ambiguities:</strong> {analysisInfo.ambiguities}
                      </Typography.Paragraph>
                    )}
                  </Space>
                </div>
              )}
            </Card>
          </div>
        </Flex>
      </div>
    );
  }

  if (type === "query-result") {
    return (
      <div className="chat-message-wrap" data-testid="query-results-message">
        <Flex gap={12} align="start" style={{ marginBottom: 24 }}>
          <AppAssistantAvatar />
          <div style={{ flex: 1, minWidth: 0, maxWidth: "100%", overflow: "hidden" }}>
            <Card styles={{ body: { padding: 16 } }} style={{ borderColor: "rgba(0, 110, 28, 0.25)", maxWidth: "100%" }}>
              {queryData && queryData.length > 0 ? (
                <QueryResultBody queryData={queryData} visualizationData={visualizationData} />
              ) : (
                <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
                  <DatabaseOutlined style={{ color: "#006e1c", fontSize: 16 }} />
                  <Typography.Text strong style={{ color: "#006e1c" }}>
                    Query Results
                  </Typography.Text>
                  <Tag style={{ marginLeft: "auto" }}>0 rows</Tag>
                </Flex>
              )}
            </Card>
          </div>
        </Flex>
      </div>
    );
  }

  if (type === "ai") {
    return (
      <div className="chat-message-wrap" data-testid="ai-message">
        <Flex gap={12} align="start" style={{ marginBottom: 24 }}>
          <AppAssistantAvatar />
          <div style={{ flex: 1, minWidth: 0, borderLeft: "4px solid #3f51b5", paddingLeft: 16 }}>
            <AiMarkdownContent content={content} />
          </div>
        </Flex>
      </div>
    );
  }

  if (type === "ai-steps") {
    return (
      <div className="chat-message-wrap">
        <Flex gap={12} align="start" style={{ marginBottom: 24 }}>
          <AppAssistantAvatar />
          <div style={{ flex: 1, minWidth: 0, maxWidth: 480 }}>
            <Card styles={{ body: { padding: 16 } }} style={{ borderColor: "rgba(63, 81, 181, 0.25)" }}>
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                {steps?.map((step, index) => (
                  <Flex key={index} align="center" gap={12}>
                    <Tag
                      style={{
                        width: 28,
                        height: 28,
                        margin: 0,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 6,
                      }}
                    >
                      {step.icon === "search" && <SearchOutlined />}
                      {step.icon === "database" && <DatabaseOutlined />}
                      {step.icon === "code" && <CodeOutlined />}
                      {step.icon === "message" && <MessageOutlined />}
                    </Tag>
                    <Typography.Text style={{ fontSize: 13 }}>{step.text}</Typography.Text>
                  </Flex>
                ))}
                {progress !== undefined && (
                  <div style={{ marginTop: 8 }}>
                    <Progress percent={progress} size="small" />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {progress}% complete
                    </Typography.Text>
                  </div>
                )}
              </Space>
            </Card>
          </div>
        </Flex>
      </div>
    );
  }

  return null;
};

export default ChatMessage;
