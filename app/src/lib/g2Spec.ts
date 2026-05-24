export type BarLayoutMode = 'single' | 'grouped' | 'stacked';

export interface SpecOptions {
  x?: string;
  y?: string;
  labels?: string;
  values?: string;
  title?: string;
  /** Series / group channel (bar, line). Omit or empty for single-series. */
  color?: string;
  /** Used only when chartType is bar and color is set. */
  barLayout?: BarLayoutMode;
}

function channelsDistinct(
  channels: Array<string | undefined>,
): boolean {
  const seen = new Set<string>();
  for (const ch of channels) {
    if (!ch) continue;
    if (seen.has(ch)) return false;
    seen.add(ch);
  }
  return true;
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

  const color = opts.color?.trim();

  switch (ct) {
    case 'bar': {
      if (!opts.x || !opts.y) return null;
      if (color && !channelsDistinct([opts.x, opts.y, color])) return null;
      const layout = opts.barLayout ?? 'grouped';
      const encode: Record<string, string> = { x: opts.x, y: opts.y };
      if (color) encode.color = color;

      const transform: Array<Record<string, any>> = [];
      if (color) {
        if (layout === 'stacked') transform.push({ type: 'stackY' });
        else transform.push({ type: 'dodgeX' });
      }

      return {
        type: 'interval',
        data,
        encode,
        ...(transform.length ? { transform } : {}),
        axis: { x: { title: opts.x }, y: { title: opts.y } },
        legend: Boolean(color),
        ...commonAxis,
      };
    }
    case 'line': {
      if (!opts.x || !opts.y) return null;
      if (color && !channelsDistinct([opts.x, opts.y, color])) return null;
      const encode: Record<string, string | undefined> = {
        x: opts.x,
        y: opts.y,
        shape: 'smooth',
      };
      if (color) encode.color = color;

      return {
        type: 'line',
        data,
        encode,
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
    default:
      return null;
  }
}
