import { JsonValue } from '../common/types/json.type';

export interface ProjectConfig {
  key: string;
  value: JsonValue;
  description?: string | null;
  updatedBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface XTrendCollectionConfig {
  regions: string[];
  limit: number;
  collectionIntervalMs: number;
}
