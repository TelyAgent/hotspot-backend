import { JsonObject } from '../../common/types/json.type';

export interface DataSourceCapability {
  id: string;
  name: string;
  description: string;
  inputSchema?: JsonObject;
  outputSchema?: JsonObject;
  defaultLimit?: number;
}
