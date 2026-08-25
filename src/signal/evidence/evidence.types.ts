import { JsonValue } from '../../common/types/json.type';
import { Signal } from '../signal/signal.types';

export type EvidenceConfidence = 'high' | 'medium' | 'low';

export interface EvidenceItem {
  id: string;
  signalId?: string | null;
  sourceTool?: string | null;
  sourceType: string;
  sourceItemId?: string | null;
  claim: string;
  text?: string | null;
  url?: string | null;
  author?: string | null;
  publishedAt?: Date | null;
  observedAt: Date;
  metrics?: JsonValue | null;
  confidence: EvidenceConfidence;
  rawRef?: string | null;
  metadata?: JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEvidenceFromSignalInput {
  signal: Signal;
  claim: string;
  sourceType: string;
  sourceItemId?: string | null;
  text?: string | null;
  url?: string | null;
  author?: string | null;
  publishedAt?: Date | null;
  metrics?: JsonValue | null;
  confidence: EvidenceConfidence;
  metadata?: JsonValue | null;
}
