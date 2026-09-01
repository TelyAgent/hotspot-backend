import { JsonValue } from '../common/types/json.type';

export const MCP_MAX_LIMIT = 50;
export const MCP_DEFAULT_LIMIT = 20;

export interface McpJsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: {
    protocolVersion?: string;
    capabilities?: Record<string, unknown>;
    clientInfo?: {
      name?: string;
      title?: string;
      version?: string;
    };
    name?: string;
    arguments?: Record<string, unknown>;
  };
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpTool {
  definition: McpToolDefinition;
  call(args: Record<string, unknown>): Promise<unknown> | unknown;
}

export interface McpErrorResponseBody {
  code: number;
  message: string;
  data?: {
    code: string;
    retryable: boolean;
    suggestion?: string;
    details?: Record<string, unknown>;
  };
}

export interface McpSearchHotEventsInput {
  query?: string;
  domains?: string[];
  sources?: string[];
  labels?: string[];
  since?: string;
  limit?: number;
}

export interface McpGetHotEventDetailInput {
  eventId: string;
  includeRawSignals?: boolean;
}

export interface McpSearchSignalsInput {
  query?: string;
  signalType?: string;
  platform?: string;
  since?: string;
  limit?: number;
}

export interface McpHotEventListItem {
  eventId: string;
  title: string;
  summary: string;
  domains: string[];
  sourceLabels: string[];
  heatLabels: string[];
  triggerReason?: string;
  confidence: string;
  status: string;
  evidenceCount: number;
  occurredAt?: string | null;
  observedAt: string;
  updatedAt: string;
}

export interface McpEvidenceItem {
  evidenceId: string;
  source: string;
  sourceName: string;
  authorName?: string | null;
  authorHandle?: string | null;
  title?: string | null;
  text?: string | null;
  summary: string;
  url?: string | null;
  publishedAt?: string | null;
  observedAt: string;
  metrics?: JsonValue | null;
  verificationStatus: string;
}

export interface McpSignalListItem {
  signalId: string;
  signalType: string;
  platform: string;
  sourceName: string;
  title: string;
  summary?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  observedAt: string;
  metrics?: JsonValue | null;
  linkedEventIds: string[];
}

export function clampMcpLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return MCP_DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.floor(value), 1), MCP_MAX_LIMIT);
}

export function parseOptionalDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return items.length ? items : undefined;
}
