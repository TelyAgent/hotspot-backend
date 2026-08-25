import { JsonObject } from '../common/types/json.type';
import { EvidenceItem } from '../signal/evidence/evidence.types';

export interface ContentTask {
  id: string;
  targetType: string;
  targetId: string;
  accountId: string;
  contentType: string;
  contentGoal: string;
  angle: string;
  constraints: string[];
  evidenceRefs: string[];
  status: 'suggested' | 'confirmed' | 'drafting' | 'drafted' | 'published';
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentGenerationInput {
  contentTask: ContentTask;
  accountPersona: string;
  contentRules: string;
  generationPrompt?: string;
  evidence: EvidenceItem[];
  userInstruction?: string;
}

export interface ContentDraft {
  id: string;
  contentTaskId: string;
  version: number;
  body: string;
  evidenceRefs: string[];
  generationInput: JsonObject;
  userInstruction?: string | null;
  status: 'draft' | 'approved' | 'rejected' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateContentDraftInput {
  contentTaskId: string;
  version: number;
  body: string;
  evidenceRefs: string[];
  generationInput: JsonObject;
  userInstruction?: string | null;
  status?: ContentDraft['status'];
}

export interface ContentGenerationDecision {
  body: string;
  evidenceRefs: string[];
  riskNotes: string[];
}
