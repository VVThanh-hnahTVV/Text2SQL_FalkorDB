// API Types and Interfaces

// Graph/Database types
export interface Graph {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  table_count?: number;
  schema?: any;
}

export interface GraphUploadResponse {
  graph_id: string;
  message: string;
  tables?: string[];
}

// Chat message types
export interface ChatRequest {
  query: string;
  database: string;
  history?: ConversationMessage[];
  customApiKey?: string;
  customModel?: string;
  customVendor?: 'openai' | 'google' | 'anthropic';
  use_user_rules?: boolean; // If true, backend fetches rules from database
  use_memory?: boolean;
  /** Demo only: "viewer" blocks destructive SQL; "admin" allows confirmation flow */
  role?: 'admin' | 'viewer';
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Last generated SQL for this assistant turn (refinement context). */
  sql?: string;
}

// Streaming response types
export type StreamMessageType = 
  | 'reasoning'
  | 'reasoning_step'  // Backend sends this for step updates
  | 'sql'
  | 'sql_query'       // Backend sends this for SQL queries
  | 'result'
  | 'query_result'    // Backend sends this for query results
  | 'ai_response'     // Backend sends this for AI-generated responses
  | 'error'
  | 'followup'
  | 'followup_questions' // Backend sends this when query needs clarification
  | 'confirmation'
  | 'destructive_confirmation' // Backend sends this for destructive operations
  | 'schema_refresh'  // Backend sends this after schema modifications
  | 'status';

export interface StreamMessage {
  type: StreamMessageType;
  content?: string;
  message?: string;    // Some backend messages use 'message' instead of 'content'
  data?: any;
  should_visualize?: boolean;
  step?: string;
  require_confirmation?: boolean;
  confirmation_id?: string;
  final_response?: boolean;
  conf?: number;       // Confidence score
  miss?: string;       // Missing information
  amb?: string;        // Ambiguities
  exp?: string;        // Explanation
  is_valid?: boolean;
  missing_information?: string; // For followup_questions
  ambiguities?: string;         // For followup_questions
  sql_query?: string;           // For destructive_confirmation
  operation_type?: string;      // For destructive_confirmation
  refresh_status?: string;      // For schema_refresh
}

// Confirmation types
export interface ConfirmRequest {
  sql_query: string;      // The SQL query to execute
  confirmation: string;   // "CONFIRM" or "" (empty for cancel)
  chat: string[];         // Conversation history
  use_user_rules?: boolean; // If true, backend fetches rules from database
  custom_api_key?: string;
  custom_model?: string;
  /** Demo only: must be admin to execute confirmed destructive SQL */
  role?: 'admin' | 'viewer';
}

// Upload types
export interface SchemaUploadRequest {
  file: File;
  database_name?: string;
  description?: string;
}

// API Error
export interface ApiError {
  error: string;
  detail?: string;
  status?: number;
}

/** Query history (GET /history, POST /history) */
export type QueryHistoryStatus = "verified" | "error";

export interface QueryHistoryItem {
  id: string;
  graph_id: string;
  intent: string;
  status: QueryHistoryStatus;
  timing_ms: number | null;
  executed_at: string;
  tags: string[];
  error_kind: string | null;
}

export interface QueryHistoryListResponse {
  items: QueryHistoryItem[];
  total: number;
}

export interface QueryHistoryRecordCreate {
  graph_id: string;
  intent: string;
  status: QueryHistoryStatus;
  timing_ms?: number | null;
  tags?: string[];
  error_kind?: string | null;
}

/** GET /history/{id}/replay — re-execute SQL from FalkorDB memory (no LLM). */
export interface QueryHistoryReplayResponse {
  graph_id: string;
  intent: string;
  sql_query: string;
  data: Record<string, unknown>[];
  should_visualize: boolean;
  db_description?: string;
}

