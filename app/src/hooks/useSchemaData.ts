import { useCallback, useEffect, useState } from "react";
import { DatabaseService } from "@/services/database";
import { showToast } from "@/lib/notify";
import type { SchemaGraphData, SchemaColumn, SchemaTable, SchemaRelationship } from "@/components/schema/schemaTypes";

function normalizeColumn(col: unknown): SchemaColumn | null {
  if (!col) return null;
  if (typeof col === "string") return { name: col };
  if (typeof col === "object" && col !== null) {
    const o = col as { name?: string; columnName?: string; type?: string; dataType?: string };
    const name = o.name || o.columnName;
    if (!name) return null;
    return { name, type: o.type ?? o.dataType ?? null };
  }
  return null;
}

function parseApiSchema(raw: { nodes?: unknown[]; links?: unknown[] }): SchemaGraphData {
  const tables: SchemaTable[] = (raw.nodes ?? []).map((node) => {
    const n = node as { id?: string; name?: string; columns?: unknown[] };
    const id = String(n.id ?? n.name ?? "");
    const name = String(n.name ?? n.id ?? "");
    const columns = (n.columns ?? [])
      .map(normalizeColumn)
      .filter((c): c is SchemaColumn => c !== null);
    return { id, name, columns };
  });

  const tablesById = new Map(tables.map((t) => [t.id, t]));
  const resolveTableName = (key: string) => tablesById.get(key)?.name ?? key;

  const relationships: SchemaRelationship[] = [];
  const seen = new Set<string>();

  for (const link of raw.links ?? []) {
    const l = link as { source?: string | number; target?: string | number };
    const sourceTable = resolveTableName(String(l.source ?? ""));
    const targetTable = resolveTableName(String(l.target ?? ""));
    if (!sourceTable || !targetTable) continue;
    const dedupe = `${sourceTable}->${targetTable}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    relationships.push({ id: dedupe, sourceTable, targetTable });
  }

  return { tables, relationships, tablesById };
}

export function useSchemaData(graphId: string | undefined, enabled: boolean) {
  const [data, setData] = useState<SchemaGraphData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!graphId) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const raw = await DatabaseService.getGraphData(graphId);
      setData(parseApiSchema(raw));
    } catch (error) {
      console.error("Failed to load schema:", error);
      showToast({
        title: "Failed to load schema",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      setData({ tables: [], relationships: [], tablesById: new Map() });
    } finally {
      setLoading(false);
    }
  }, [graphId]);

  useEffect(() => {
    if (enabled && graphId) {
      void load();
    }
  }, [enabled, graphId, load]);

  return { data, loading, reload: load };
}
