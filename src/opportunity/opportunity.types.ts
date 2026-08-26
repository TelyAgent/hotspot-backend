import { JsonObject } from '../common/types/json.type';

export type OpportunityConfidence = 'high' | 'medium' | 'low';

export interface Opportunity {
  id: string;
  title: string;
  type: string;
  summary: string;
  whyNow: string;
  whyItMatters: string;
  productAngles: string[];
  contentWindow?: string | null;
  evidenceRefs: string[];
  missingData: string[];
  riskNotes: string[];
  confidence: OpportunityConfidence;
  status: 'suggested' | 'confirmed' | 'ignored' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

export interface Event {
  id: string;
  title: string;
  eventType: string;
  summary: string;
  occurredAt?: Date | null;
  evidenceRefs: string[];
  missingData: string[];
  riskNotes: string[];
  labels?: EventLabel[] | null;
  confidence: OpportunityConfidence;
  status: 'suggested' | 'confirmed' | 'ignored' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

export interface EventListResult {
  items: Event[];
  total: number;
  page: number;
  pageSize: number;
}

export type EventLabelCategory = 'source' | 'trigger' | 'aggregation';

export interface EventLabel {
  code: string;
  name: string;
  category: EventLabelCategory;
  sourcePath?: string | null;
  evidenceRefs: string[];
  reason: string;
  confidence: OpportunityConfidence;
}

export interface OpportunityRulePackRecord {
  id: string;
  version: number;
  status: 'draft' | 'active' | 'archived';
  basePath: string;
  manifest: JsonObject;
  description?: string | null;
  generatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OpportunityMiningSignalRun {
  id: string;
  signalId: string;
  agentRunId?: string | null;
  rulePackId?: string | null;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
  decision?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  idempotencyKey: string;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OpportunityMiningSignalRunWithSignal
  extends OpportunityMiningSignalRun {
  signal?: {
    id: string;
    title: string;
    signalType: string;
    source: string;
    platform?: string | null;
    observedAt: Date;
  } | null;
}

export interface OpportunityMiningDecision {
  decision:
    | 'create_opportunity'
    | 'create_event'
    | 'update_existing_opportunity'
    | 'create_insight'
    | 'ignore'
    | 'request_human_review';
  title: string;
  opportunityType:
    | 'news_event'
    | 'industry_topic'
    | 'viral_post'
    | 'viral_video'
    | 'meme'
    | 'competitor_signal'
    | 'future_event'
    | 'product_angle'
    | 'unknown';
  summary: string;
  whyNow: string;
  whyItMatters: string;
  productAngles: string[];
  contentWindow: string;
  confidence: OpportunityConfidence;
  evidenceRefs: string[];
  missingData: string[];
  riskNotes: string[];
  metadata?: JsonObject;
}

export interface CreateOpportunityInput {
  title: string;
  type: string;
  summary: string;
  whyNow: string;
  whyItMatters: string;
  productAngles: string[];
  contentWindow?: string | null;
  evidenceRefs: string[];
  missingData: string[];
  riskNotes: string[];
  confidence: OpportunityConfidence;
  status?: Opportunity['status'];
}

export interface CreateEventInput {
  title: string;
  eventType: string;
  summary: string;
  occurredAt?: Date | null;
  evidenceRefs: string[];
  missingData: string[];
  riskNotes: string[];
  labels?: EventLabel[];
  confidence: OpportunityConfidence;
  status?: Event['status'];
}

export interface CreateOpportunityRulePackInput {
  version: number;
  status: OpportunityRulePackRecord['status'];
  basePath: string;
  manifest: JsonObject;
  description?: string | null;
  generatedBy: string;
}

export interface CreateOpportunityMiningSignalRunInput {
  signalId: string;
  agentRunId?: string | null;
  rulePackId?: string | null;
  status: OpportunityMiningSignalRun['status'];
  decision?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  idempotencyKey: string;
  errorMessage?: string | null;
}
