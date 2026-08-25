import { CreateRawItemInput } from '../../signal/raw-item/raw-item.types';
import { RawItem } from '../../signal/raw-item/raw-item.types';
import { CreateEvidenceFromSignalInput } from '../../signal/evidence/evidence.types';
import { CreateSignalFromRawItemInput } from '../../signal/signal/signal.types';
import { JsonObject } from '../../common/types/json.type';
import { DataSourceCapability } from './data-source-capability.interface';

export interface DataSourcePluginContext {
  jobId: string;
  capabilityId: string;
  observedAt: Date;
}

export interface DataSourceCollectInput {
  capabilityId: string;
  params: JsonObject;
  context: DataSourcePluginContext;
}

export interface DataSourceCollectResult {
  rawItems: CreateRawItemInput[];
  summary?: JsonObject;
}

export interface DataSourceNormalizeInput {
  rawItem: RawItem;
  context: DataSourcePluginContext;
}

export interface DataSourceNormalizeResult {
  signal?: Omit<CreateSignalFromRawItemInput, 'rawItem'>;
  evidence?: Array<Omit<CreateEvidenceFromSignalInput, 'signal'>>;
}

export interface DataSourcePlugin {
  id: string;
  name: string;
  platform: string;
  capabilities: DataSourceCapability[];
  collect(input: DataSourceCollectInput): Promise<DataSourceCollectResult>;
  normalize?(
    input: DataSourceNormalizeInput,
  ): Promise<DataSourceNormalizeResult | null>;
}
