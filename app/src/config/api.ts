/** Strip trailing slashes; treat "/" as empty (same-origin). */
export function normalizeApiBaseUrl(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") {
    return "";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function resolveApiBaseUrl(): string {
  const fromEnv = normalizeApiBaseUrl(import.meta.env.VITE_API_URL);
  if (fromEnv) {
    return fromEnv;
  }
  // Vite dev server (port 8080): proxy strips one /api prefix before forwarding.
  return window.location.port === "8080" ? "/api" : "";
}

// API Configuration
export const API_CONFIG = {
  // Base URL for the QueryWeaver backend API
  // When served from backend (port 5000): use empty string (same origin)
  // When using Vite dev server (port 8080): use /api prefix for proxy
  // For production: use environment variable or empty string
  BASE_URL: resolveApiBaseUrl(),
  
  // Streaming boundary marker used by QueryWeaver backend
  STREAM_BOUNDARY: '|||FALKORDB_MESSAGE_BOUNDARY|||',
  
  // Endpoints
  ENDPOINTS: {
    // Graph/Database management
    GRAPHS: '/graphs',
    GRAPH_BY_ID: (id: string) => `/graphs/${id}`,
    UPLOAD_SCHEMA: '/upload',
    DELETE_GRAPH: (id: string) => `/graphs/${id}`,
    CONNECT_DATABASE: '/database',

    // Chat/Query
    CHAT: '/chat',
    CONFIRM: '/confirm',
  },
};

// Helper to build full API URL (backend paths like /graphs, /database)
export const buildApiUrl = (endpoint: string): string => {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${API_CONFIG.BASE_URL}${path}`;
};

/**
 * Backend routes that already live under /api/... (e.g. /api/history).
 * With Vite proxy (BASE_URL=/api), the client must request /api/api/history so the
 * proxy forwards /api/history to the backend.
 */
export const buildBackendApiUrl = (apiPath: string): string => {
  const path = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  return `${API_CONFIG.BASE_URL}${path}`;
};


