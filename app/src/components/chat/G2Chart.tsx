import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Chart } from "@antv/g2";

interface G2ChartProps {
  spec: Record<string, any> | null;
  height?: number;
}

const JPEG_QUALITY = 0.92;

export type G2ChartRef = {
  /** Save first (largest) canvas under the chart container as JPEG. */
  downloadJpeg: (filename?: string) => boolean;
};

function pickMainCanvas(root: HTMLElement): HTMLCanvasElement | null {
  const list = Array.from(root.querySelectorAll("canvas")) as HTMLCanvasElement[];
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  return [...list].sort((a, b) => b.width * b.height - a.width * a.height)[0];
}

function compositeOnWhiteBackground(source: HTMLCanvasElement): string | null {
  const w = source.width;
  const h = source.height;
  if (w <= 0 || h <= 0) return null;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  try {
    ctx.drawImage(source, 0, 0);
  } catch {
    return null;
  }
  return out.toDataURL("image/jpeg", JPEG_QUALITY);
}

const G2Chart = forwardRef<G2ChartRef, G2ChartProps>(({ spec, height = 380 }, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useImperativeHandle(ref, () => ({
    downloadJpeg: (filename = `queryweaver-chart-${Date.now()}.jpg`) => {
      const root = containerRef.current;
      if (!root) return false;
      const canvas = pickMainCanvas(root);
      if (!canvas || typeof canvas.toDataURL !== "function") return false;
      try {
        const url = compositeOnWhiteBackground(canvas);
        if (!url) return false;
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.rel = "noopener";
        a.click();
        return true;
      } catch {
        return false;
      }
    },
  }));

  useEffect(() => {
    if (!containerRef.current || !spec) return;

    const chart = new Chart({
      container: containerRef.current,
      autoFit: true,
      height,
      theme: "classic",
    });

    chart.options(spec as any);
    chart.render();
    chartRef.current = chart;

    return () => {
      try {
        chart.destroy();
      } catch {
        /* ignore */
      }
      chartRef.current = null;
    };
  }, [spec, height]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: "100%", backgroundColor: "#ffffff" }}
      data-testid="g2-chart"
    />
  );
});

G2Chart.displayName = "G2Chart";

export default G2Chart;
