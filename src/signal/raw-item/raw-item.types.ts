import { JsonValue } from '../../common/types/json.type';

export interface RawItem {
  id: string;
  source: string;
  sourceType: string;
  sourceItemId?: string | null;
  observedAt: Date;
  observedAtBucket: Date;
  payload: JsonValue;
  metadata?: JsonValue | null;
  dedupeKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRawItemInput {
  source: string;
  sourceType: string;
  sourceItemId?: string | null;
  observedAt: Date;
  payload: JsonValue;
  metadata?: JsonValue | null;
}
