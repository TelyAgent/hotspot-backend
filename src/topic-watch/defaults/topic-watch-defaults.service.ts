import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  DEFAULT_TOPIC_WATCH_ACCOUNTS,
  DefaultTopicWatchAccountConfig,
} from './default-topic-watch-accounts';
import { DEFAULT_TOPIC_WATCHES } from './default-topic-watches';

@Injectable()
export class TopicWatchDefaultsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaults();
  }

  async seedDefaults(): Promise<void> {
    for (const config of DEFAULT_TOPIC_WATCHES) {
      const accounts = DEFAULT_TOPIC_WATCH_ACCOUNTS[config.id] ?? [];
      await this.prisma.topicWatch.upsert({
        where: {
          id: config.id,
        },
        update: {
          name: config.name,
          description: config.description,
          domains: config.keywords,
          collectionPolicy: createCollectionPolicy(accounts),
          triggerPolicy: createTriggerPolicy(config),
          evidencePolicy: createEvidencePolicy(config),
          status: 'active',
        },
        create: {
          id: config.id,
          name: config.name,
          description: config.description,
          domains: config.keywords,
          watchIntent: `追踪「${config.name}」内可以形成热点机会或事件的讨论。`,
          collectionPolicy: createCollectionPolicy(accounts),
          triggerPolicy: createTriggerPolicy(config),
          evidencePolicy: createEvidencePolicy(config),
          exclusionPolicy: config.negativeExamples.join('；'),
          status: 'active',
        },
      });

      await this.seedAccounts(config.id, accounts);

      await this.prisma.topicMonitoringPlan.upsert({
        where: {
          topicWatchId_version: {
            topicWatchId: config.id,
            version: 1,
          },
        },
        update: {
          status: 'active',
          sources: createSources(accounts),
          triggerRules: createTriggerRules(config),
          evidenceRequirements: createEvidenceRequirements(),
          refreshPolicy: createRefreshPolicy(),
          generatedBy: 'human',
          reason: '沿用旧版重点主题追踪默认配置。',
        },
        create: {
          topicWatchId: config.id,
          version: 1,
          status: 'active',
          sources: createSources(accounts),
          triggerRules: createTriggerRules(config),
          evidenceRequirements: createEvidenceRequirements(),
          refreshPolicy: createRefreshPolicy(),
          generatedBy: 'human',
          reason: '沿用旧版重点主题追踪默认配置。',
        },
      });
    }
  }

  private async seedAccounts(
    topicWatchId: string,
    accounts: DefaultTopicWatchAccountConfig[],
  ) {
    const activeHandles = accounts.map((account) => normalizeHandle(account.handle));

    await this.prisma.topicWatchAccount.updateMany({
      where: {
        topicWatchId,
        handle: {
          notIn: activeHandles,
        },
      },
      data: {
        status: 'archived',
      },
    });

    for (const account of accounts) {
      await this.prisma.topicWatchAccount.upsert({
        where: {
          topicWatchId_handle: {
            topicWatchId,
            handle: normalizeHandle(account.handle),
          },
        },
        update: {
          primaryRole: account.primaryRole,
          singleTriggerPolicy: account.singleTriggerPolicy,
          authorityScope: account.authorityScope,
          sortOrder: account.sortOrder,
          status: 'active',
        },
        create: {
          topicWatchId,
          handle: normalizeHandle(account.handle),
          primaryRole: account.primaryRole,
          singleTriggerPolicy: account.singleTriggerPolicy,
          authorityScope: account.authorityScope,
          sortOrder: account.sortOrder,
          status: 'active',
        },
      });
    }
  }
}

function createSources(accounts: DefaultTopicWatchAccountConfig[]): Prisma.InputJsonValue {
  return accounts.map((account) => ({
    platform: 'x',
    sourceType: 'account',
    handle: normalizeHandle(account.handle),
    primaryRole: account.primaryRole,
    singleTriggerPolicy: account.singleTriggerPolicy,
    authorityScope: account.authorityScope,
    includeReplies: true,
    includeQuotes: true,
    includeReposts: false,
    maxPages: 5,
  })) as Prisma.InputJsonValue;
}

function createTriggerRules(config: { positiveExamples: string[] }): Prisma.InputJsonValue {
  return [
    {
      ruleId: 'topic-watch-agent-judgement',
      description: '由 Agent 根据主题意图、正向示例、排除规则和采集到的 Signal 判断是否形成热点机会或事件。',
      positiveExamples: config.positiveExamples,
    },
  ] as Prisma.InputJsonValue;
}

function createEvidenceRequirements(): Prisma.InputJsonValue {
  return [
    {
      sourceType: 'x_account_post',
      requiredFields: ['url', 'text', 'authorHandle', 'publishedAt', 'metrics'],
    },
  ] as Prisma.InputJsonValue;
}

function createRefreshPolicy(): Prisma.InputJsonValue {
  return {
    intervalMinutes: 180,
    lookbackMinutes: 180,
  } as Prisma.InputJsonValue;
}

function createCollectionPolicy(accounts: DefaultTopicWatchAccountConfig[]) {
  return `每 3 小时增量采集重点账号近期帖子，默认账号：${accounts.map((account) => normalizeHandle(account.handle)).join('、')}。`;
}

function createTriggerPolicy(config: { positiveExamples: string[] }) {
  return `优先关注：${config.positiveExamples.join('；')}。`;
}

function createEvidencePolicy(config: { positiveExamples: string[] }) {
  return `保留代表帖链接、正文、作者、发布时间和互动指标；判断时参考正向示例：${config.positiveExamples.join('；')}。`;
}

function normalizeHandle(handle: string) {
  return handle.trim().replace(/^@/, '');
}
