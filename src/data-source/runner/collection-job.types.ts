import { JsonObject, JsonValue } from '../../common/types/json.type';

export type CollectionRunStatus = 'running' | 'succeeded' | 'failed';

export interface CollectionJobConfig {
  id: string;
  pluginId: string;
  capabilityId: string;
  params: JsonObject;
  observedAt?: Date;
}

export interface CollectionRun {
  id: string;
  jobId: string;
  pluginId: string;
  capabilityId: string;
  status: CollectionRunStatus;
  startedAt: Date;
  finishedAt?: Date | null;
  rawItemCount: number;
  errorMessage?: string | null;
  input?: JsonValue | null;
  outputSummary?: JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}
