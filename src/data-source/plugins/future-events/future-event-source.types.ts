import { JsonObject } from '../../../common/types/json.type';

export type FutureSourceType = 'bls' | 'bea' | 'opm' | 'fomc';

export interface ParsedFutureSourceItem {
  sourceType: FutureSourceType;
  sourceItemId: string;
  sourceUrl: string;
  retrievedAt: string;
  title: string;
  description: string | null;
  startTime: string | null;
  endTime: string | null;
  timezone: string;
  raw: JsonObject;
}

export interface FutureSourceConfig {
  sourceType: FutureSourceType;
  displayName?: string;
  enabled?: boolean;
  variables: JsonObject;
}
