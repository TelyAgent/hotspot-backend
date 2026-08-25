import { JsonObject } from '../common/types/json.type';

export interface OperatingAccount {
  id: string;
  source: 'local' | 'external';
  sourceSystem?: string;
  displayName: string;
  platform: string;
  handle?: string;
  persona: string;
  contentRules: string;
  generationPrompt?: string;
  preferredTopics: string[];
  forbiddenTopics: string[];
  supportedContentTypes: string[];
  workloadStatus: 'available' | 'busy' | 'paused';
  dailyTaskLimit?: number;
  recentTaskCount?: number;
  metadata?: JsonObject;
}

export interface AssignmentItemDecision {
  accountId: string;
  accountName: string;
  accountSource: 'local' | 'external';
  sourceSystem?: string;
  priority: 'high' | 'medium' | 'low';
  contentType: string;
  contentGoal: string;
  angle: string;
  constraints: string[];
  reason: string;
  evidenceRefs: string[];
  duplicateRisk: 'none' | 'low' | 'medium' | 'high';
}

export interface AssignmentDecision {
  targetType: 'opportunity' | 'event' | 'insight' | 'future_event';
  targetId: string;
  decision: 'assign' | 'skip' | 'request_human_review';
  assignments: AssignmentItemDecision[];
  skippedAccounts: {
    accountId: string;
    accountName: string;
    reason: string;
  }[];
  summary: string;
  riskNotes: string[];
  missingData: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface AssignmentRun {
  id: string;
  targetType: string;
  targetId: string;
  status: 'running' | 'succeeded' | 'failed';
  goal: JsonObject;
  decision?: JsonObject | null;
  confidence?: string | null;
  riskNotes?: string[] | null;
  missingData?: string[] | null;
  startedAt: Date;
  finishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssignmentItem {
  id: string;
  runId: string;
  targetType: string;
  targetId: string;
  accountId: string;
  accountSource: string;
  sourceSystem?: string | null;
  priority: string;
  contentType: string;
  contentGoal: string;
  angle: string;
  constraints: string[];
  reason: string;
  evidenceRefs: string[];
  duplicateRisk: string;
  status: 'suggested' | 'confirmed' | 'ignored';
  createdTaskId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
