import { Injectable } from '@nestjs/common';
import {
  AccountProvider,
  AccountQuery,
} from './account-provider.interface';
import { OperatingAccount } from '../assignment.types';

@Injectable()
export class LocalAccountProviderService implements AccountProvider {
  readonly id = 'local';
  readonly name = 'Local Account Provider';
  readonly source = 'local';

  constructor(private readonly accounts: OperatingAccount[] = []) {}

  async listAccounts(query: AccountQuery): Promise<OperatingAccount[]> {
    return this.accounts.filter((account) => {
      if (!query.includePaused && account.workloadStatus === 'paused') {
        return false;
      }

      if (
        query.platforms?.length &&
        !query.platforms.includes(account.platform)
      ) {
        return false;
      }

      if (query.topics?.length) {
        return query.topics.some((topic) =>
          account.preferredTopics.includes(topic),
        );
      }

      return true;
    });
  }

  async getAccount(accountId: string): Promise<OperatingAccount | null> {
    return this.accounts.find((account) => account.id === accountId) ?? null;
  }
}
