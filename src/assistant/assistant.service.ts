import { Injectable } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import { JsonObject } from '../common/types/json.type';
import { ProjectConfigService } from '../project-config/project-config.service';
import {
  TopicWatchSingleTriggerPolicy,
  TopicWatchStatus,
} from '../topic-watch/topic-watch.types';
import { TopicWatchRepository } from '../topic-watch/topic-watch.repository';
import {
  AssistantChatInput,
  AssistantChatResponse,
  AssistantProposedAction,
  AssistantToolExecutionInput,
  AssistantToolExecutionResponse,
} from './assistant.types';

@Injectable()
export class AssistantService {
  constructor(
    private readonly projectConfigService: ProjectConfigService,
    private readonly topicWatchRepository: TopicWatchRepository,
  ) {}

  async chat(input: AssistantChatInput): Promise<AssistantChatResponse> {
    const message = input.message.trim();
    const proposedActions = this.buildProposedActions(message);

    if (proposedActions.length > 0) {
      return {
        message:
          '我理解你的修改意图了。下面是我准备执行的配置变更，请确认后再应用。',
        proposedActions,
      };
    }

    return {
      message: this.defaultReply(input),
    };
  }

  async executeTool(
    input: AssistantToolExecutionInput,
  ): Promise<AssistantToolExecutionResponse> {
    switch (input.tool) {
      case 'get_twitter_config':
        return {
          message: '已读取 X/Twitter 配置。',
          result: await this.projectConfigService.getXTrendCollectionConfig(),
        };
      case 'update_twitter_config':
      case 'set_twitter_trend_schedule':
        return {
          message: '已更新 X/Twitter 热榜配置。',
          result: await this.projectConfigService.updateXTrendCollectionConfig(
            this.normalizeTwitterConfigPatch(input.arguments),
            'assistant',
          ),
        };
      case 'list_twitter_topics':
        return {
          message: '已读取重点主题配置。',
          result: await this.topicWatchRepository.listTopicWatches(),
        };
      case 'upsert_twitter_topic':
        return this.upsertTwitterTopic(input.arguments);
      case 'add_twitter_topic_account':
        return this.addTwitterTopicAccount(input.arguments);
      case 'remove_twitter_topic_account':
        return this.removeTwitterTopicAccount(input.arguments);
      default:
        throw new DomainError(
          `Unsupported assistant tool: ${input.tool}`,
          'ASSISTANT_TOOL_UNSUPPORTED',
        );
    }
  }

  private buildProposedActions(message: string): AssistantProposedAction[] {
    const actions: AssistantProposedAction[] = [];
    const limit = this.extractTrendLimit(message);

    if (limit) {
      actions.push({
        id: `assistant_action_${Date.now()}_limit`,
        tool: 'update_twitter_config',
        summary: `将 X 热榜条数调整为 ${limit}`,
        arguments: {
          limit,
        },
        requiresConfirmation: true,
      });
    }

    const intervalMs = this.extractIntervalMs(message);
    if (intervalMs) {
      actions.push({
        id: `assistant_action_${Date.now()}_interval`,
        tool: 'set_twitter_trend_schedule',
        summary: `将 X 热榜采集间隔调整为 ${formatDuration(intervalMs)}`,
        arguments: {
          collectionIntervalMs: intervalMs,
        },
        requiresConfirmation: true,
      });
    }

    return actions;
  }

  private defaultReply(input: AssistantChatInput): string {
    const page = input.context.page || '当前页面';
    return `我在 ${page} 页面。你可以让我查看 Twitter 配置、调整热榜条数/采集频率，或管理重点主题追踪配置。涉及修改时我会先给出待确认操作。`;
  }

  private extractTrendLimit(message: string): number | null {
    if (!/(热搜|热榜|榜单).*(条数|数量|limit|上限)|(?:改成|调整为|设置为)\s*\d+\s*条/.test(message)) {
      return null;
    }

    const match = message.match(/(\d+)\s*条?/);
    if (!match) {
      return null;
    }

    const value = Number(match[1]);
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
  }

  private extractIntervalMs(message: string): number | null {
    if (!/(采集|抓取|同步).*(频率|间隔|周期)|(?:每|间隔)\s*\d+\s*(分钟|小时)/.test(message)) {
      return null;
    }

    const hourMatch = message.match(/(\d+)\s*(小时|h)/i);
    if (hourMatch) {
      return Number(hourMatch[1]) * 60 * 60 * 1000;
    }

    const minuteMatch = message.match(/(\d+)\s*(分钟|min)/i);
    if (minuteMatch) {
      return Number(minuteMatch[1]) * 60 * 1000;
    }

    return null;
  }

  private normalizeTwitterConfigPatch(input: JsonObject) {
    return {
      regions: Array.isArray(input.regions)
        ? input.regions.map(String).filter(Boolean)
        : undefined,
      limit:
        typeof input.limit === 'number' && Number.isFinite(input.limit)
          ? Math.trunc(input.limit)
          : undefined,
      collectionIntervalMs:
        typeof input.collectionIntervalMs === 'number' &&
        Number.isFinite(input.collectionIntervalMs)
          ? Math.trunc(input.collectionIntervalMs)
          : undefined,
    };
  }

  private async upsertTwitterTopic(
    input: JsonObject,
  ): Promise<AssistantToolExecutionResponse> {
    const topicWatchId = getString(input.id) ?? getString(input.topicWatchId);
    const status: TopicWatchStatus =
      getString(input.status) === 'paused' ? 'paused' : 'active';
    const payload = {
      name: getString(input.name) ?? '未命名主题',
      description: getString(input.description) ?? '',
      domains: getStringArray(input.domains),
      watchIntent: getString(input.watchIntent) ?? '',
      collectionPolicy: getString(input.collectionPolicy) ?? '',
      triggerPolicy: getString(input.triggerPolicy) ?? '',
      evidencePolicy: getString(input.evidencePolicy) ?? '',
      exclusionPolicy: getString(input.exclusionPolicy),
      status,
    };

    const result = topicWatchId
      ? await this.topicWatchRepository.updateTopicWatch(topicWatchId, payload)
      : await this.topicWatchRepository.createTopicWatch(payload);

    return {
      message: topicWatchId ? '已更新重点主题。' : '已创建重点主题。',
      result,
    };
  }

  private async addTwitterTopicAccount(
    input: JsonObject,
  ): Promise<AssistantToolExecutionResponse> {
    const topicWatchId = getRequiredString(input.topicWatchId, 'topicWatchId');
    const handle = getRequiredString(input.handle, 'handle');
    const topic = await this.topicWatchRepository.findTopicWatchById(topicWatchId);

    if (!topic) {
      throw new DomainError('Topic watch not found.', 'TOPIC_WATCH_NOT_FOUND');
    }

    const accounts = [
      ...(topic.accounts ?? []).map((account, index) => ({
        handle: account.handle,
        primaryRole: account.primaryRole,
        singleTriggerPolicy: account.singleTriggerPolicy,
        authorityScope: account.authorityScope,
        status: account.status,
        sortOrder: account.sortOrder ?? index + 1,
      })),
      {
        handle,
        primaryRole: getString(input.primaryRole) ?? '重点主题监控账号',
        singleTriggerPolicy: normalizePolicy(input.singleTriggerPolicy),
        authorityScope: getString(input.authorityScope) ?? '按账号公开信息与帖子内容判断',
        status: 'active' as const,
        sortOrder: (topic.accounts?.length ?? 0) + 1,
      },
    ];

    return {
      message: '已添加重点主题监控账号。',
      result: await this.topicWatchRepository.updateTopicWatchAccounts(
        topicWatchId,
        accounts,
      ),
    };
  }

  private async removeTwitterTopicAccount(
    input: JsonObject,
  ): Promise<AssistantToolExecutionResponse> {
    const topicWatchId = getRequiredString(input.topicWatchId, 'topicWatchId');
    const handle = normalizeHandle(getRequiredString(input.handle, 'handle'));
    const topic = await this.topicWatchRepository.findTopicWatchById(topicWatchId);

    if (!topic) {
      throw new DomainError('Topic watch not found.', 'TOPIC_WATCH_NOT_FOUND');
    }

    return {
      message: '已移除重点主题监控账号。',
      result: await this.topicWatchRepository.updateTopicWatchAccounts(
        topicWatchId,
        (topic.accounts ?? [])
          .filter((account) => normalizeHandle(account.handle) !== handle)
          .map((account, index) => ({
            handle: account.handle,
            primaryRole: account.primaryRole,
            singleTriggerPolicy: account.singleTriggerPolicy,
            authorityScope: account.authorityScope,
            status: account.status,
            sortOrder: index + 1,
          })),
      ),
    };
  }
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getRequiredString(value: unknown, field: string): string {
  const result = getString(value);
  if (!result) {
    throw new DomainError(
      `Assistant tool argument is required: ${field}`,
      'ASSISTANT_TOOL_ARGUMENT_REQUIRED',
      { field },
    );
  }
  return result;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function normalizePolicy(value: unknown): TopicWatchSingleTriggerPolicy {
  return value === 'S1' || value === 'S2' || value === 'C' ? value : 'C';
}

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

function formatDuration(ms: number): string {
  if (ms % (60 * 60 * 1000) === 0) {
    return `${ms / (60 * 60 * 1000)} 小时`;
  }
  if (ms % (60 * 1000) === 0) {
    return `${ms / (60 * 1000)} 分钟`;
  }
  return `${ms}ms`;
}
