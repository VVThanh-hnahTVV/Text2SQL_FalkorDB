import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, Search, Code, MessageSquare, AlertTriangle, Copy, Check, User } from 'lucide-react';
import Plot from 'react-plotly.js';
import type { Data, Layout } from 'plotly.js';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
    csv_data: string;
    schema_info: {
      columns: string[];
      numeric_columns: string[];
      categorical_columns: string[];
      datetime_columns: string[];
      row_count: number;
      unique_counts?: Record<string, number>;
      error?: string;
    };
    visualization_dsl: {
      chart_type: string;
      data_columns: string[];
      config: Record<string, any>;
      layout: Record<string, any>;
    };
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

const canRenderDsl = (queryData: any[], chartType: string, config: Record<string, any>) => {
  if (!queryData || queryData.length === 0) return false;
  const ct = chartType.toLowerCase();
  if (!isChartTypeSupported(ct)) return false;
  if (ct === 'line' || ct === 'bar' || ct === 'scatter') {
    return hasColumn(queryData, config.x) && hasColumn(queryData, config.y);
  }
  if (ct === 'pie') {
    return hasColumn(queryData, config.labels) && hasColumn(queryData, config.values);
  }
  if (ct === 'histogram') {
    return hasColumn(queryData, config.x);
  }
  if (ct === 'box') {
    return hasColumn(queryData, config.y);
  }
  return true;
};

const canRenderChart = (queryData?: any[], visualizationData?: VisualizationData) => {
  if (!queryData || queryData.length === 0 || !visualizationData) return false;
  const dsl = visualizationData.visualization_dsl;
  return canRenderDsl(queryData, dsl.chart_type, dsl.config || {});
};

const buildPlotlyConfigFromDsl = (
  queryData: any[],
  chartType: string,
  config: Record<string, any>,
  layoutIn: Record<string, any>,
): { data: Data[]; layout: Partial<Layout> } => {
  const ct = chartType.toLowerCase();
  const layout: Partial<Layout> = {
    title: layoutIn?.title || 'Query Results',
    xaxis: { title: layoutIn?.xaxis_title || '' },
    yaxis: { title: layoutIn?.yaxis_title || '' },
    margin: { l: 40, r: 20, t: 48, b: 40 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
  };

  if (ct === 'line') {
    return {
      data: [{ type: 'scatter', mode: 'lines+markers', x: queryData.map((row) => row[config.x]), y: queryData.map((row) => row[config.y]) }],
      layout,
    };
  }
  if (ct === 'bar') {
    return {
      data: [{ type: 'bar', x: queryData.map((row) => row[config.x]), y: queryData.map((row) => row[config.y]) }],
      layout,
    };
  }
  if (ct === 'pie') {
    return {
      data: [{ type: 'pie', labels: queryData.map((row) => row[config.labels]), values: queryData.map((row) => row[config.values]) }],
      layout,
    };
  }
  if (ct === 'scatter') {
    return {
      data: [{ type: 'scatter', mode: 'markers', x: queryData.map((row) => row[config.x]), y: queryData.map((row) => row[config.y]) }],
      layout,
    };
  }
  if (ct === 'histogram') {
    return {
      data: [{ type: 'histogram', x: queryData.map((row) => row[config.x]) }],
      layout,
    };
  }
  if (ct === 'box') {
    return {
      data: [{ type: 'box', y: queryData.map((row) => row[config.y]) }],
      layout,
    };
  }

  return {
    data: [{ type: 'table', header: { values: Object.keys(queryData[0] || {}) }, cells: { values: Object.keys(queryData[0] || {}).map((key) => queryData.map((row) => row[key])) } }],
    layout,
  };
};

const buildPlotlyConfig = (queryData: any[], visualizationData: VisualizationData): { data: Data[]; layout: Partial<Layout> } => {
  const dsl = visualizationData.visualization_dsl;
  return buildPlotlyConfigFromDsl(queryData, dsl.chart_type, dsl.config || {}, dsl.layout || {});
};

/** Plotly + flex/scroll often mis-measure parents; strip explicit sizes so we control height via a fixed wrapper. */
const layoutWithoutPlotDimensions = (layout: Partial<Layout>): Partial<Layout> => {
  const { height: _h, width: _w, ...rest } = layout as Partial<Layout> & { height?: unknown; width?: unknown };
  return rest;
};

const TABLE_PLOT_MAX_HEIGHT_PX = 480;
const TABLE_ROW_PX = 26;
const TABLE_PLOT_HEADER_PX = 100;

const QueryResultPlot = ({
  plotConfig,
  rowCount,
}: {
  plotConfig: { data: Data[]; layout: Partial<Layout> };
  rowCount: number;
}) => {
  const firstType = (plotConfig.data[0] as { type?: string } | undefined)?.type;
  const isTable = firstType === 'table';

  const tableHeightPx = Math.min(
    TABLE_PLOT_MAX_HEIGHT_PX,
    TABLE_PLOT_HEADER_PX + Math.min(Math.max(rowCount, 1), 40) * TABLE_ROW_PX,
  );

  const layoutBase = useMemo(
    () => ({
      ...layoutWithoutPlotDimensions(plotConfig.layout),
      autosize: true as const,
    }),
    [plotConfig],
  );

  if (isTable) {
    return (
      <div className="mb-4 max-w-full -mx-4 px-4">
        <div
          className="max-h-[min(55vh,520px)] overflow-auto rounded border border-border bg-card p-2"
          data-testid="query-results-plot"
        >
          <div className="relative min-h-[200px] w-full min-w-0" style={{ height: tableHeightPx }}>
            <Plot
              data={plotConfig.data}
              layout={{ ...layoutBase, autosize: false, height: tableHeightPx }}
              style={{ width: '100%', height: tableHeightPx }}
              useResizeHandler={false}
              config={{ responsive: true, displaylogo: false }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 max-w-full -mx-4 px-4">
      <div
        className="overflow-hidden rounded border border-border bg-card p-2"
        data-testid="query-results-plot"
      >
        <div className="relative h-[380px] w-full max-w-full shrink-0">
          <Plot
            data={plotConfig.data}
            layout={layoutBase}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler
            config={{ responsive: true, displaylogo: false }}
          />
        </div>
      </div>
    </div>
  );
};

type ChartDraft = {
  chartType: string;
  x: string;
  y: string;
  labels: string;
  values: string;
};

const pickColumn = (columns: string[], preferred: string | undefined, fallbackIndex: number) => {
  if (preferred && columns.includes(preferred)) return preferred;
  return columns[fallbackIndex] ?? '';
};

const deriveInitialDraft = (queryData: any[], visualizationData: VisualizationData): ChartDraft => {
  const columns = Object.keys(queryData[0] || {});
  const config = visualizationData.visualization_dsl?.config || {};
  let chartType = (visualizationData.visualization_dsl?.chart_type || 'bar').toLowerCase();
  if (!isChartTypeSupported(chartType)) chartType = 'bar';

  return {
    chartType,
    x: pickColumn(columns, config.x, 0),
    y: pickColumn(columns, config.y, columns.length > 1 ? 1 : 0),
    labels: pickColumn(columns, config.labels, 0),
    values: pickColumn(columns, config.values, columns.length > 1 ? 1 : 0),
  };
};

const draftToConfig = (draft: ChartDraft): Record<string, any> => {
  const ct = draft.chartType.toLowerCase();
  if (ct === 'pie') return { labels: draft.labels, values: draft.values };
  if (ct === 'histogram') return { x: draft.x };
  if (ct === 'box') return { y: draft.y };
  if (ct === 'table') return {};
  return { x: draft.x, y: draft.y };
};

const buildLayoutForDraft = (baseLayout: Record<string, any>, draft: ChartDraft): Record<string, any> => {
  const title = baseLayout?.title || 'Query Results';
  const ct = draft.chartType.toLowerCase();
  if (ct === 'line' || ct === 'bar' || ct === 'scatter') {
    return { ...baseLayout, title, xaxis_title: draft.x, yaxis_title: draft.y };
  }
  if (ct === 'histogram') {
    return { ...baseLayout, title, xaxis_title: draft.x, yaxis_title: baseLayout?.yaxis_title ?? '' };
  }
  if (ct === 'box') {
    return { ...baseLayout, title, yaxis_title: draft.y, xaxis_title: baseLayout?.xaxis_title ?? '' };
  }
  if (ct === 'pie') {
    return { ...baseLayout, title };
  }
  return { ...baseLayout, title };
};

const visualizationFromDraft = (base: VisualizationData, draft: ChartDraft): VisualizationData => ({
  ...base,
  visualization_dsl: {
    ...base.visualization_dsl,
    chart_type: draft.chartType,
    config: draftToConfig(draft),
    layout: buildLayoutForDraft(base.visualization_dsl.layout || {}, draft),
  },
});

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
  <div className="space-y-1.5 min-w-0 flex-1">
    <Label htmlFor={id} className="text-xs text-muted-foreground">
      {label}
    </Label>
    <Select value={value || columns[0]} onValueChange={onChange} disabled={disabled || columns.length === 0}>
      <SelectTrigger id={id} className="h-9 text-sm">
        <SelectValue placeholder="Chọn cột" />
      </SelectTrigger>
      <SelectContent>
        {columns.map((col) => (
          <SelectItem key={col} value={col}>
            {col}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

const QueryResultBody = ({ queryData, visualizationData }: QueryResultBodyProps) => {
  const columns = useMemo(() => Object.keys(queryData[0] || {}), [queryData]);

  const dslSignature = useMemo(() => {
    if (!visualizationData) return '';
    return JSON.stringify(visualizationData.visualization_dsl);
  }, [visualizationData]);

  const columnsKey = columns.join('\0');

  const [draft, setDraft] = useState<ChartDraft>(() =>
    visualizationData ? deriveInitialDraft(queryData, visualizationData) : ({} as ChartDraft),
  );
  const [applied, setApplied] = useState<ChartDraft | null>(null);

  useEffect(() => {
    if (!visualizationData || columns.length === 0) return;
    setDraft(deriveInitialDraft(queryData, visualizationData));
    setApplied(null);
  }, [dslSignature, columnsKey, visualizationData]);

  const handleCreateChart = useCallback(() => {
    setApplied({ ...draft });
  }, [draft]);

  const appliedViz = useMemo(() => {
    if (!applied || !visualizationData) return null;
    return visualizationFromDraft(visualizationData, applied);
  }, [applied, visualizationData]);

  const canApply = visualizationData && canRenderDsl(queryData, draft.chartType, draftToConfig(draft));
  const plotConfig = useMemo(() => {
    if (!appliedViz || !canRenderChart(queryData, appliedViz)) return null;
    return buildPlotlyConfig(queryData, appliedViz);
  }, [appliedViz, queryData]);

  const headerChartBadge = applied?.chartType ?? draft.chartType;

  return (
    <>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Database className="w-4 h-4 text-success" />
        <span className="text-base font-semibold text-success">Query Results</span>
        {visualizationData && headerChartBadge ? (
          <Badge variant="secondary" className="text-xs uppercase" data-testid="query-results-chart-type-badge">
            {headerChartBadge}
            {!applied && <span className="sr-only"> (mặc định)</span>}
          </Badge>
        ) : null}
        <Badge variant="outline" className="ml-auto text-sm">
          {queryData?.length || 0} rows
        </Badge>
      </div>

      {visualizationData && columns.length > 0 ? (
        <div className="mb-4 space-y-3 rounded-md border border-border bg-muted/30 p-3" data-testid="query-results-chart-builder">
          <p className="text-xs text-muted-foreground">
            Giá trị mặc định theo gợi ý từ hệ thống. Chỉnh trục và loại biểu đồ, rồi bấm <span className="font-medium text-foreground">Tạo biểu đồ</span>.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1.5 w-full sm:w-44 sm:flex-none">
              <Label className="text-xs text-muted-foreground">Loại biểu đồ</Label>
              <Select
                value={draft.chartType}
                onValueChange={(v) => setDraft((d) => ({ ...d, chartType: v }))}
              >
                <SelectTrigger className="h-9 text-sm" data-testid="chart-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHART_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {['line', 'bar', 'scatter'].includes(draft.chartType) ? (
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
              </>
            ) : null}

            {draft.chartType === 'pie' ? (
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

            {draft.chartType === 'histogram' ? (
              <ColumnSelect
                id="chart-hist-x"
                label="Cột (trục X)"
                value={draft.x}
                columns={columns}
                onChange={(x) => setDraft((d) => ({ ...d, x }))}
              />
            ) : null}

            {draft.chartType === 'box' ? (
              <ColumnSelect
                id="chart-box-y"
                label="Cột (trục Y)"
                value={draft.y}
                columns={columns}
                onChange={(y) => setDraft((d) => ({ ...d, y }))}
              />
            ) : null}

            <Button
              type="button"
              size="sm"
              className="sm:self-end shrink-0"
              onClick={handleCreateChart}
              disabled={!canApply}
              data-testid="query-results-create-chart"
            >
              Tạo biểu đồ
            </Button>
          </div>
          {!canApply && draft.chartType !== 'table' ? (
            <p className="text-xs text-destructive">Chọn đủ cột hợp lệ cho loại biểu đồ này.</p>
          ) : null}
        </div>
      ) : null}

      {plotConfig ? (
        <QueryResultPlot plotConfig={plotConfig} rowCount={queryData.length} />
      ) : visualizationData ? (
        <p className="text-sm text-muted-foreground mb-4" data-testid="query-results-chart-placeholder">
          Chưa có biểu đồ. Chọn cấu hình và bấm &quot;Tạo biểu đồ&quot;.
        </p>
      ) : null}

      <div className={plotConfig ? '' : 'mt-0'}>
        <QueryResultsTable queryData={queryData} />
      </div>
    </>
  );
};

const QueryResultsTable = ({ queryData }: { queryData: any[] }) => (
  <div className="max-w-full overflow-hidden -mx-4 px-4">
    <div className="overflow-x-auto overflow-y-auto max-h-96 border border-border rounded scrollbar-visible" style={{ maxWidth: '100%' }}>
      <table className="text-sm border-collapse" data-testid="results-table" style={{ width: '100%', maxWidth: '100%', tableLayout: 'auto', display: 'table' }}>
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b border-border">
            {Object.keys(queryData[0]).map((column) => (
              <th key={column} className="text-left px-3 py-2 text-muted-foreground font-semibold bg-card break-words" style={{ maxWidth: '300px', minWidth: '100px' }}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {queryData.map((row, index) => (
            <tr key={index} className="border-b border-border hover:bg-muted">
              {Object.values(row).map((value: any, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2 text-foreground break-words" style={{ maxWidth: '300px', minWidth: '100px' }}>
                  {String(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

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

  if (type === 'confirmation') {
    const operationType = (confirmationData?.operationType ?? 'UNKNOWN').toUpperCase();
    const isHighRisk = ['DELETE', 'DROP', 'TRUNCATE'].includes(operationType);

    return (
      <div className="px-6" data-testid="confirmation-message">
        <div className="flex gap-3 mb-6 items-start">
          <Avatar className="w-8 h-8 flex-shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
              QW
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <Card className={`${isHighRisk ? 'border-error/50 bg-error/5' : 'border-warning/50 bg-warning/5'}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className={`w-5 h-5 ${isHighRisk ? 'text-error' : 'text-warning'}`} />
                  <span className={`text-base font-semibold ${isHighRisk ? 'text-error' : 'text-warning'}`}>
                    Destructive Operation Detected
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-foreground text-sm mb-2">
                      This operation will perform a <span className={`font-semibold ${isHighRisk ? 'text-error' : 'text-warning'}`}>{operationType}</span> query:
                    </p>
                    {confirmationData?.sqlQuery && (
                      <div className="bg-background border border-border rounded p-3 overflow-x-auto">
                        <pre className="text-sm font-mono text-foreground whitespace-pre-wrap break-words overflow-wrap-anywhere">
                          <code className="language-sql">{confirmationData.sqlQuery}</code>
                        </pre>
                      </div>
                    )}
                  </div>

                  <div className={`${isHighRisk ? 'bg-error/10 border-error/50' : 'bg-warning/10 border-warning/50'} border rounded p-3`}>
                    <p className="text-sm text-foreground">
                      {isHighRisk ? (
                        <>
                          <span className="font-semibold text-error">⚠️ WARNING:</span> This operation may be irreversible and will permanently modify your database.
                        </>
                      ) : (
                        <>This operation will make changes to your database. Please review carefully before confirming.</>
                      )}
                    </p>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={onCancel}
                      className="flex-1 bg-card border-border text-muted-foreground hover:bg-muted"
                      data-testid="confirmation-cancel-button"
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={onConfirm}
                      className={`flex-1 ${isHighRisk ? 'bg-error hover:bg-error/90' : 'bg-warning hover:bg-warning/90'} text-white font-semibold`}
                      data-testid="confirmation-confirm-button"
                    >
                      Confirm {operationType}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'user') {
    return (
      <div className="px-6" data-testid="user-message">
        <div className="flex justify-end gap-3 mb-6 items-start">
          <div className="max-w-xl">
            <Card className="bg-muted border-border inline-block">
              <CardContent className="p-3">
                <p className="text-foreground text-base leading-relaxed">{content}</p>
              </CardContent>
            </Card>
          </div>
          <Avatar className="w-8 h-8 flex-shrink-0">
            <AvatarFallback className="bg-muted text-muted-foreground">
              <User className="w-4 h-4" />
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    );
  }

  if (type === 'sql-query') {
    const hasSQL = content && content.trim().length > 0;
    const isValid = analysisInfo?.isValid !== false; // Default to true if not specified

    return (
      <div className="px-6" data-testid="sql-query-message">
        <div className="flex gap-3 mb-6 items-start">
          <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                QW
              </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
          <Card className={`bg-card ${isValid ? 'border-primary/30' : 'border-warning/30'}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Code className={`w-4 h-4 ${isValid ? 'text-primary' : 'text-warning'}`} />
                <span className={`text-base font-semibold ${isValid ? 'text-primary' : 'text-warning'}`}>
                  {hasSQL ? 'Generated SQL Query' : 'Query Analysis'}
                </span>
              </div>

              {hasSQL && (
                <div className="overflow-x-auto -mx-2 px-2">
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyQuery}
                      className="absolute top-2 right-2 z-10 h-8 w-8 p-0 hover:bg-muted"
                      title={copied ? "Copied!" : "Copy query"}
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-success" />
                      ) : (
                        <Copy className="w-4 h-4 text-muted-foreground" />
                      )}
                    </Button>
                    <pre className="bg-background text-foreground p-3 rounded text-sm mb-3 w-fit min-w-full font-mono whitespace-pre-wrap break-words overflow-wrap-anywhere">
                      <code className="language-sql">{content}</code>
                    </pre>
                  </div>
                </div>
              )}

              {!isValid && (
                <div className="space-y-2 text-sm">
                  {analysisInfo?.explanation && (
                    <div className="bg-background/50 p-2 rounded">
                      <span className="font-semibold text-warning">Explanation:</span>
                      <p className="text-foreground mt-1">{analysisInfo.explanation}</p>
                    </div>
                  )}
                  {analysisInfo?.missing && (
                    <div className="bg-background/50 p-2 rounded">
                      <span className="font-semibold text-warning">Missing Information:</span>
                      <p className="text-foreground mt-1">{analysisInfo.missing}</p>
                    </div>
                  )}
                  {analysisInfo?.ambiguities && (
                    <div className="bg-background/50 p-2 rounded">
                      <span className="font-semibold text-warning">Ambiguities:</span>
                      <p className="text-foreground mt-1">{analysisInfo.ambiguities}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      </div>
    );
  }

  if (type === 'query-result') {
    return (
      <div className="px-6" data-testid="query-results-message">
        <div className="flex gap-3 mb-6 items-start">
          <Avatar className="w-8 h-8 flex-shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
              QW
            </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 max-w-full overflow-hidden">
          <Card className="bg-card border-success/30 max-w-full">
            <CardContent className="p-4 max-w-full overflow-hidden">
              {queryData && queryData.length > 0 ? (
                <QueryResultBody queryData={queryData} visualizationData={visualizationData} />
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <Database className="w-4 h-4 text-success" />
                    <span className="text-base font-semibold text-success">Query Results</span>
                    <Badge variant="outline" className="ml-auto text-sm">
                      0 rows
                    </Badge>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
        </div>
      </div>
    );
  }

  if (type === 'ai') {
    return (
      <div className="px-6" data-testid="ai-message">
        <div className="flex gap-3 mb-6 items-start">
          <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                QW
              </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-foreground text-base leading-relaxed whitespace-pre-line">
              {content}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'ai-steps') {
    return (
      <div className="px-6">
      <div className="flex gap-3 mb-6 items-start">
        <Avatar className="w-8 h-8 flex-shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
            QW
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <Card className="bg-card border-primary/30 max-w-md">
            <CardContent className="p-4">
              <div className="space-y-3">
                {steps?.map((step, index) => (
                  <div key={index} className="flex items-center gap-3 text-sm text-foreground">
                    <Badge variant="outline" className="p-1 w-6 h-6 flex items-center justify-center border-primary">
                      {step.icon === 'search' && <Search className="w-3 h-3 text-primary" />}
                      {step.icon === 'database' && <Database className="w-3 h-3 text-primary" />}
                      {step.icon === 'code' && <Code className="w-3 h-3 text-primary" />}
                      {step.icon === 'message' && <MessageSquare className="w-3 h-3 text-primary" />}
                    </Badge>
                    <span>{step.text}</span>
                  </div>
                ))}
                {progress !== undefined && (
                  <div className="mt-4">
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">{progress}% complete</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      </div>
    );
  }

  return null;
};

export default ChatMessage;
