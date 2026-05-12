import { useEffect, useRef } from 'react';
import { Chart } from '@antv/g2';

interface G2ChartProps {
  spec: Record<string, any> | null;
  height?: number;
  className?: string;
}

const G2Chart = ({ spec, height = 380, className }: G2ChartProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!containerRef.current || !spec) return;

    const chart = new Chart({
      container: containerRef.current,
      autoFit: true,
      height,
      theme: 'classic',
    });

    chart.options(spec as any);
    chart.render();
    chartRef.current = chart;

    return () => {
      try {
        chart.destroy();
      } catch {
      }
      chartRef.current = null;
    };
  }, [spec, height]);

  return (
    <div
      ref={containerRef}
      className={className ?? 'w-full'}
      style={{ height }}
      data-testid="g2-chart"
    />
  );
};

export default G2Chart;
