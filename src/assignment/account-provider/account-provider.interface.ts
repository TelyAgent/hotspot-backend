import { OperatingAccount } from '../assignment.types';

export interface AccountQuery {
  platforms?: string[];
  topics?: string[];
  includePaused?: boolean;
}

export interface AccountProvider {
  id: string;
  name: string;
  source: 'local' | 'external';
  listAccounts(query: AccountQuery): Promise<OperatingAccount[]>;
  getAccount(accountId: string): Promise<OperatingAccount | null>;
}
