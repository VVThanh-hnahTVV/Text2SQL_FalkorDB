import { message } from "antd";

/** Maps legacy shadcn-style toast calls to Ant Design message API. */
export function showToast(opts: {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}): void {
  const text = opts.description ? `${opts.title}: ${opts.description}` : opts.title;
  if (opts.variant === "destructive") {
    void message.error(text);
    return;
  }
  const lower = opts.title.toLowerCase();
  if (
    lower.includes("complete") ||
    lower.includes("success") ||
    lower.includes("saved") ||
    lower.includes("uploaded") ||
    lower.includes("connected") ||
    lower.includes("deleted") ||
    lower.includes("refreshed")
  ) {
    void message.success(text);
    return;
  }
  if (lower.includes("processing") || lower.includes("analyzing") || lower.includes("executing")) {
    void message.info(text);
    return;
  }
  void message.success(text);
}
