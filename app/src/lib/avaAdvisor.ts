import { useMemo } from 'react';
import { Advisor } from '@antv/ava';

export interface Advice {
  type: string;
  spec?: Record<string, any>;
  score?: number;
  [key: string]: any;
}

/**
 * Hook: run AntV AVA Advisor on rows once per data change.
 * Returns the advice array (top suggestion at index 0); empty array on failure.
 */
export function useAdvices(data: Record<string, any>[] | undefined): Advice[] {
  return useMemo(() => {
    if (!data || data.length === 0) return [];
    try {
      const advisor = new Advisor();
      const results = advisor.advise({
        data,
        options: { showLog: false },
      } as any);
      return Array.isArray(results) ? (results as Advice[]) : [];
    } catch (error) {
      console.warn('AVA Advisor failed:', error);
      return [];
    }
  }, [data]);
}

/**
 * Map AVA advice chart type names (e.g. "column_chart", "line_chart")
 * to the simplified set used by the chart builder UI.
 */
export function adviceTypeToBuilderType(adviceType?: string): string | null {
  if (!adviceType) return null;
  const normalized = adviceType.toLowerCase();
  if (normalized.includes('histogram')) return 'histogram';
  if (normalized.includes('scatter')) return 'scatter';
  if (normalized.includes('box')) return 'box';
  if (normalized.includes('pie') || normalized.includes('donut') || normalized.includes('ring')) {
    return 'pie';
  }
  if (normalized.includes('line') || normalized.includes('area')) return 'line';
  if (
    normalized.includes('bar') ||
    normalized.includes('column') ||
    normalized.includes('interval')
  ) {
    return 'bar';
  }
  if (normalized.includes('table')) return 'table';
  return null;
}

/**
 * Pull encode field names from an advice spec when available.
 * AVA emits Vega-Lite-ish specs; encode keys we care about: x, y, color (labels for pie).
 */
export function extractAxesFromAdvice(advice?: Advice): {
  x?: string;
  y?: string;
  labels?: string;
  values?: string;
} {
  const spec = advice?.spec ?? {};
  const encode = (spec as any).encode ?? (spec as any).encoding ?? {};

  const fieldOf = (channel: any): string | undefined => {
    if (!channel) return undefined;
    if (typeof channel === 'string') return channel;
    if (typeof channel === 'object' && channel !== null) {
      return channel.field ?? channel.value ?? undefined;
    }
    return undefined;
  };

  const x = fieldOf(encode.x);
  const y = fieldOf(encode.y);
  const color = fieldOf(encode.color);

  return {
    x,
    y,
    labels: color ?? x,
    values: y,
  };
}
