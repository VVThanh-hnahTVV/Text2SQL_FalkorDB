import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, Search, Code, MessageSquare, AlertTriangle, Copy, Check, User } from 'lucide-react';
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
import G2Chart from './G2Chart';
import {
  adviceTypeToBuilderType,
  extractAxesFromAdvice,
  useAdvices,
  type Advice,
} from '@/lib/avaAdvisor';
import { buildG2Spec } from '@/lib/g2Spec';
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
  <div className="space-y-1.5 min-w-0 flex-1">
    <Label htmlFor={id} className="text-xs text-muted-foreground">
      {label}
    </Label>
    <Select
      value={value ? value : OPTIONAL_NONE_VALUE}
      onValueChange={(v) => onChange(v === OPTIONAL_NONE_VALUE ? '' : v)}
      disabled={disabled || columns.length === 0}
    >
      <SelectTrigger id={id} className="h-9 text-sm">
        <SelectValue placeholder="Không" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={OPTIONAL_NONE_VALUE}>Không</SelectItem>
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

  useEffect(() => {
    if (!shouldVisualize || columns.length === 0) return;
    setDraft(deriveInitialDraft(queryData, topAdvice));
    setApplied(null);
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
  }, [applied, queryData]);

  const headerChartBadge = applied?.chartType ?? draft.chartType;

  return (
    <>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Database className="w-4 h-4 text-success" />
        <span className="text-base font-semibold text-success">Query Results</span>
        {shouldVisualize && headerChartBadge ? (
          <Badge variant="secondary" className="text-xs uppercase" data-testid="query-results-chart-type-badge">
            {headerChartBadge}
            {!applied && <span className="sr-only"> (mặc định)</span>}
          </Badge>
        ) : null}
        <Badge variant="outline" className="ml-auto text-sm">
          {queryData?.length || 0} rows
        </Badge>
      </div>

      {shouldVisualize && columns.length > 0 ? (
        <div className="mb-4 space-y-3 rounded-md border border-border bg-muted/30 p-3" data-testid="query-results-chart-builder">
          <p className="text-xs text-muted-foreground">
            Giá trị mặc định gợi ý bởi AntV AVA. Chỉnh trục và loại biểu đồ, rồi bấm <span className="font-medium text-foreground">Tạo biểu đồ</span>.
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
                <OptionalColumnSelect
                  id="chart-color"
                  label="Màu / nhóm (color)"
                  value={draft.color}
                  columns={columns}
                  onChange={(color) => setDraft((d) => ({ ...d, color }))}
                />
              </>
            ) : null}

            {draft.chartType === 'bar' && draft.color ? (
              <div className="space-y-1.5 w-full sm:w-40 sm:flex-none">
                <Label className="text-xs text-muted-foreground">Kiểu cột</Label>
                <Select
                  value={draft.barLayout}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, barLayout: v as 'grouped' | 'stacked' }))
                  }
                >
                  <SelectTrigger className="h-9 text-sm" data-testid="chart-bar-layout-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grouped">Nhóm cột</SelectItem>
                    <SelectItem value="stacked">Chồng</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {draft.chartType === 'scatter' ? (
              <OptionalColumnSelect
                id="chart-size"
                label="Kích thước (size)"
                value={draft.size}
                columns={columns}
                onChange={(size) => setDraft((d) => ({ ...d, size }))}
              />
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

      {chartSpec ? (
        <div className="mb-4 max-w-full -mx-4 px-4">
          <div
            className="overflow-hidden rounded border border-border bg-card p-2"
            data-testid="query-results-plot"
          >
            <G2Chart spec={chartSpec} height={380} />
          </div>
        </div>
      ) : shouldVisualize ? (
        <p className="text-sm text-muted-foreground mb-4" data-testid="query-results-chart-placeholder">
          Chưa có biểu đồ. Chọn cấu hình và bấm &quot;Tạo biểu đồ&quot;.
        </p>
      ) : null}

      <div className={chartSpec ? '' : 'mt-0'}>
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
