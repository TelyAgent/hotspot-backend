import { JsonObject, JsonValue } from '../common/types/json.type';

export interface ProjectConfig {
  key: string;
  value: JsonValue;
  description?: string | null;
  updatedBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface KolRadarAccountConfig extends JsonObject {
  handle: string;
  groupTag: string | null;
  joinedAt: string;
  enabled: boolean;
}

export interface XTrendCollectionConfig {
  regions: string[];
  limit: number;
  collectionIntervalMs: number;
  trendCollectionEnabled: boolean;
  kolRadarEnabled: boolean;
  kolRadarCollectionIntervalMs: number;
  kolRadarMinViews: number;
  kolRadarAccounts: KolRadarAccountConfig[];
}
