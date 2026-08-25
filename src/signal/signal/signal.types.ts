import { JsonValue } from '../../common/types/json.type';
import { RawItem } from '../raw-item/raw-item.types';

export interface Signal {
  id: string;
  rawItemId: string;
  source: string;
  platform?: string | null;
  signalType: string;
  title: string;
  summary?: string | null;
  observedAt: Date;
  rawRefs: JsonValue;
  metrics?: JsonValue | null;
  metadata?: JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSignalFromRawItemInput {
  rawItem: RawItem;
  signalType: string;
  title: string;
  summary?: string | null;
  platform?: string | null;
  metrics?: JsonValue | null;
  metadata?: JsonValue | null;
}
