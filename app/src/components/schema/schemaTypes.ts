export interface SchemaColumn {
  name: string;
  type?: string | null;
}

export interface SchemaTable {
  id: string;
  name: string;
  columns: SchemaColumn[];
}

export interface SchemaRelationship {
  id: string;
  sourceTable: string;
  targetTable: string;
}

export interface SchemaGraphData {
  tables: SchemaTable[];
  relationships: SchemaRelationship[];
  tablesById: Map<string, SchemaTable>;
}
