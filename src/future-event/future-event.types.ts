import { JsonObject } from '../common/types/json.type';

export type FutureEventStatus = 'candidate' | 'confirmed' | 'archived';
export type FutureEventConfidence = 'high' | 'medium' | 'low';
export type FutureEventMonitoringPlanStatus = 'draft' | 'active' | 'paused' | 'archived';

export interface FutureEvent {
  id: string;
  title: string;
  eventType: string;
  scheduledAt?: Date | null;
  startAt?: Date | null;
  endAt?: Date | null;
  domains: string[];
  summary?: string | null;
  whyItMatters?: string | null;
  status: FutureEventStatus;
  createdFrom: string;
  confidence: FutureEventConfidence;
  metadata?: JsonObject | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFutureEventInput {
  title: string;
  eventType: string;
  scheduledAt?: Date | null;
  startAt?: Date | null;
  endAt?: Date | null;
  domains: string[];
  summary?: string | null;
  whyItMatters?: string | null;
  status?: FutureEventStatus;
  createdFrom: string;
  confidence?: FutureEventConfidence;
  metadata?: JsonObject | null;
}

export interface FutureEventCandidate {
  id: string;
  title: string;
  eventType: string;
  scheduledAt?: Date | null;
  domains: string[];
  summary: string;
  whyItMatters: string;
  suggestedKeywords: string[];
  suggestedAccounts: string[];
  suggestedPlatforms: string[];
  evidenceRefs: string[];
  confidence: FutureEventConfidence;
  status: 'new' | 'confirmed' | 'ignored';
  missingData: string[];
  riskNotes: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFutureEventCandidateInput {
  title: string;
  eventType: string;
  scheduledAt?: Date | null;
  timeRange?: JsonObject | null;
  domains: string[];
  summary: string;
  whyItMatters: string;
  recommendedMonitoringStartAt?: Date | null;
  recommendedMonitoringEndAt?: Date | null;
  suggestedKeywords: string[];
  suggestedAccounts: string[];
  suggestedPlatforms: string[];
  evidenceRefs: string[];
  confidence: FutureEventConfidence;
  status?: 'new' | 'confirmed' | 'ignored';
  missingData?: string[];
  riskNotes?: string[];
}

export type FutureEventSourcePlanStatus = 'draft' | 'active' | 'paused' | 'archived';

export interface FutureEventSourcePlanSource {
  id?: string;
  pluginId: string;
  capabilityId: string;
  params: JsonObject;
  reason: string;
}

export interface FutureEventSourcePlanMissingSource {
  name: string;
  reason: string;
}

export interface FutureEventSourcePlan {
  id: string;
  version: number;
  status: FutureEventSourcePlanStatus;
  strategyMarkdown: string;
  sources: FutureEventSourcePlanSource[];
  missingSources: FutureEventSourcePlanMissingSource[];
  refreshPolicy: JsonObject;
  reason: string;
  generatedBy: 'agent' | 'human';
  agentRunId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFutureEventSourcePlanInput {
  version: number;
  status?: FutureEventSourcePlanStatus;
  strategyMarkdown: string;
  sources: FutureEventSourcePlanSource[];
  missingSources?: FutureEventSourcePlanMissingSource[];
  refreshPolicy: JsonObject;
  reason: string;
  generatedBy: 'agent' | 'human';
  agentRunId?: string | null;
}

export interface FutureEventMonitoringSource {
  sourceType: string;
  platform: string;
  query?: string;
  accounts?: string[];
  urls?: string[];
  frequency: string;
  fields: string[];
  reason: string;
}

export interface FutureEventMonitoringPhase {
  name: 'preheat' | 'near_event' | 'live_window' | 'post_event';
  startAt: string;
  endAt: string;
  sources: FutureEventMonitoringSource[];
}

export interface FutureEventTriggerRule {
  id: string;
  name: string;
  description: string;
  action:
    | 'create_opportunity'
    | 'create_event'
    | 'request_human_review'
    | 'increase_monitoring_frequency'
    | 'generate_content_brief';
  conditionText: string;
  requiredSignals: string[];
}

export interface FutureEventMonitoringPlan {
  id: string;
  futureEventId: string;
  monitoringStartAt: Date;
  monitoringEndAt: Date;
  phases: FutureEventMonitoringPhase[];
  triggerRules: FutureEventTriggerRule[];
  expectedContentAngles: string[];
  evidenceRefs: string[];
  confidence: FutureEventConfidence;
  missingData: string[];
  riskNotes: string[];
  status: FutureEventMonitoringPlanStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface FutureEventMonitoringRun {
  id: string;
  futureEventId: string;
  planId: string;
  phase: string;
  status: 'running' | 'succeeded' | 'failed' | 'skipped';
  startedAt: Date;
  finishedAt?: Date | null;
  rawItemCount: number;
  signalCount: number;
  errorMessage?: string | null;
  input?: JsonObject | null;
  outputSummary?: JsonObject | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFutureEventMonitoringPlanInput {
  futureEventId: string;
  monitoringStartAt: Date;
  monitoringEndAt: Date;
  phases: FutureEventMonitoringPhase[];
  triggerRules: FutureEventTriggerRule[];
  expectedContentAngles: string[];
  evidenceRefs: string[];
  confidence: FutureEventConfidence;
  missingData?: string[];
  riskNotes?: string[];
  status?: FutureEventMonitoringPlanStatus;
}

export interface FutureEventMonitoringDecision {
  monitoringStartAt: string;
  monitoringEndAt: string;
  phases: FutureEventMonitoringPhase[];
  triggerRules: FutureEventTriggerRule[];
  expectedContentAngles: string[];
  evidenceRefs: string[];
  confidence: FutureEventConfidence;
  missingData: string[];
  riskNotes: string[];
}
