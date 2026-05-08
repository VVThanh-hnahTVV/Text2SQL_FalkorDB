export interface SpecOptions {
  x?: string;
  y?: string;
  labels?: string;
  values?: string;
  title?: string;
}

/**
 * Build a G2 v5 spec from a chart-type + axis selection.
 * Returns null when the selection is incompatible (caller should fall back to a message).
 */
export function buildG2Spec(
  data: Record<string, any>[],
  chartType: string,
  opts: SpecOptions,
): Record<string, any> | null {
  if (!data || data.length === 0) return null;
  const ct = chartType.toLowerCase();

  const baseTitle = opts.title || 'Query Results';
  const commonAxis = {
    title: { title: baseTitle },
  };

  switch (ct) {
    case 'bar': {
      if (!opts.x || !opts.y) return null;
      return {
        type: 'interval',
        data,
        encode: { x: opts.x, y: opts.y, color: opts.x },
        axis: { x: { title: opts.x }, y: { title: opts.y } },
        legend: false,
        ...commonAxis,
      };
    }
    case 'line': {
      if (!opts.x || !opts.y) return null;
      return {
        type: 'line',
        data,
        encode: { x: opts.x, y: opts.y, shape: 'smooth' },
        axis: { x: { title: opts.x }, y: { title: opts.y } },
        ...commonAxis,
      };
    }
    case 'scatter': {
      if (!opts.x || !opts.y) return null;
      return {
        type: 'point',
        data,
        encode: { x: opts.x, y: opts.y },
        axis: { x: { title: opts.x }, y: { title: opts.y } },
        ...commonAxis,
      };
    }
    case 'pie': {
      const labels = opts.labels || opts.x;
      const values = opts.values || opts.y;
      if (!labels || !values) return null;
      return {
        type: 'interval',
        data,
        encode: { y: values, color: labels },
        transform: [{ type: 'stackY' }],
        coordinate: { type: 'theta' },
        ...commonAxis,
      };
    }
    case 'histogram': {
      if (!opts.x) return null;
      return {
        type: 'rect',
        data,
        encode: { x: opts.x },
        transform: [{ type: 'binX', y: 'count' }],
        axis: { x: { title: opts.x }, y: { title: 'count' } },
        ...commonAxis,
      };
    }
    case 'box': {
      if (!opts.y) return null;
      return {
        type: 'boxplot',
        data,
        encode: { y: opts.y },
        axis: { y: { title: opts.y } },
        ...commonAxis,
      };
    }
    default:
      return null;
  }
}
