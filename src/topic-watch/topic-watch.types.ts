import { JsonObject } from '../common/types/json.type';
import { Signal } from '../signal/signal/signal.types';

export type TopicWatchStatus = 'active' | 'paused' | 'archived';
export type TopicWatchSingleTriggerPolicy = 'S1' | 'S2' | 'C';
export type TopicCandidateStatus =
  | 'new'
  | 'watching'
  | 'sent_to_agent'
  | 'converted_to_opportunity'
  | 'converted_to_event'
  | 'ignored';

export interface TopicWatch {
  id: string;
  name: string;
  description: string;
  domains: string[];
  watchIntent: string;
  collectionPolicy: string;
  triggerPolicy: string;
  evidencePolicy: string;
  exclusionPolicy?: string | null;
  status: TopicWatchStatus;
  ownerId?: string | null;
  accounts?: TopicWatchAccount[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TopicWatchAccount {
  id: string;
  topicWatchId: string;
  handle: string;
  primaryRole: string;
  singleTriggerPolicy: TopicWatchSingleTriggerPolicy;
  authorityScope: string;
  status: TopicWatchStatus;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateTopicWatchAccountInput {
  handle: string;
  primaryRole: string;
  singleTriggerPolicy: TopicWatchSingleTriggerPolicy;
  authorityScope: string;
  status?: TopicWatchStatus;
  sortOrder: number;
}

export interface CreateTopicWatchInput {
  name: string;
  description: string;
  domains: string[];
  watchIntent: string;
  collectionPolicy: string;
  triggerPolicy: string;
  evidencePolicy: string;
  exclusionPolicy?: string | null;
  status?: TopicWatchStatus;
  ownerId?: string | null;
}

export interface TopicMonitoringPlan {
  id: string;
  topicWatchId: string;
  version: number;
  status: 'draft' | 'active' | 'paused' | 'archived';
  sources: JsonObject[];
  triggerRules: JsonObject[];
  evidenceRequirements: JsonObject[];
  refreshPolicy: JsonObject;
  generatedBy: 'agent' | 'human';
  reason: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TopicCandidate {
  id: string;
  topicWatchId: string;
  title: string;
  summary: string;
  keywords: string[];
  entities: string[];
  firstSeenAt: Date;
  lastSeenAt: Date;
  signalCount: number;
  postCount?: number | null;
  accountCount?: number | null;
  sourceTypes: string[];
  representativeSignalIds: string[];
  evidenceRefs: string[];
  metrics: JsonObject;
  clustering: JsonObject;
  status: TopicCandidateStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface TopicAggregationInput {
  topicWatchId: string;
  windowStartAt: Date;
  windowEndAt: Date;
  signals: Signal[];
}

export interface TopicWatchDecision {
  id: string;
  topicWatchId: string;
  decision:
    | 'continue_monitoring'
    | 'create_opportunity'
    | 'create_event'
    | 'request_human_review'
    | 'adjust_monitoring_plan'
    | 'ignore';
  title?: string | null;
  summary: string;
  matchedRules: string[];
  evidenceRefs: string[];
  missingData: string[];
  riskNotes: string[];
  suggestedPlanChanges?: JsonObject[] | null;
  confidence: 'high' | 'medium' | 'low';
  createdAt: Date;
}

export interface CreateTopicCandidateInput extends Omit<
  TopicCandidate,
  'id' | 'createdAt' | 'updatedAt'
> {}

export interface CreateTopicWatchDecisionInput extends Omit<
  TopicWatchDecision,
  'id' | 'createdAt'
> {}
