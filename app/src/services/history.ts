import { buildApiUrl } from "@/config/api";
import { csrfHeaders } from "@/lib/csrf";
import { userIdHeaders } from "@/lib/anonymousUser";
import type {
  QueryHistoryListResponse,
  QueryHistoryRecordCreate,
  QueryHistoryReplayResponse,
} from "@/types/api";

export class HistoryService {
  static async list(params: {
    limit?: number;
    offset?: number;
    graph_id?: string;
    q?: string;
  } = {}): Promise<QueryHistoryListResponse> {
    const sp = new URLSearchParams();
    if (params.limit != null) sp.set("limit", String(params.limit));
    if (params.offset != null) sp.set("offset", String(params.offset));
    if (params.graph_id) sp.set("graph_id", params.graph_id);
    if (params.q) sp.set("q", params.q);
    const qs = sp.toString();
    const url = `${buildApiUrl("/history")}${qs ? `?${qs}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        ...userIdHeaders(),
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `History request failed (${response.status})`);
    }

    return (await response.json()) as QueryHistoryListResponse;
  }

  static async replay(entryId: string): Promise<QueryHistoryReplayResponse> {
    const url = buildApiUrl(`/history/${encodeURIComponent(entryId)}/replay`);
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        ...userIdHeaders(),
      },
    });

    if (!response.ok) {
      let detail = `Replay failed (${response.status})`;
      try {
        const body = (await response.json()) as { detail?: string };
        if (body.detail) detail = body.detail;
      } catch {
        const text = await response.text();
        if (text) detail = text;
      }
      throw new Error(detail);
    }

    return (await response.json()) as QueryHistoryReplayResponse;
  }

  static async record(entry: QueryHistoryRecordCreate): Promise<void> {
    try {
      const response = await fetch(buildApiUrl("/history"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
          ...userIdHeaders(),
        },
        body: JSON.stringify(entry),
      });
      if (!response.ok) {
        const text = await response.text();
        console.warn("History record failed:", response.status, text);
      }
    } catch (e) {
      console.warn("History record request error:", e);
    }
  }
}
