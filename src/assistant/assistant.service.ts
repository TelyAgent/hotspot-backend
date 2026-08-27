import { Inject, Injectable, Optional } from '@nestjs/common';
import { AGENT_WORKFLOW_ENGINE } from '../agent/agent.tokens';
import { AgentWorkflowEngine } from '../agent/workflow-engine/agent-workflow-engine.interface';
import { DomainError } from '../common/errors/domain-error';
import { JsonObject, JsonValue } from '../common/types/json.type';
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
  AssistantToolName,
} from './assistant.types';

@Injectable()
export class AssistantService {
  constructor(
    private readonly projectConfigService: ProjectConfigService,
    private readonly topicWatchRepository: TopicWatchRepository,
    @Optional()
    @Inject(AGENT_WORKFLOW_ENGINE)
    private readonly workflowEngine?: AgentWorkflowEngine,
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

    const agentResponse = await this.runAssistantAgent(input, message);
    if (agentResponse) {
      return agentResponse;
    }

    if (this.isTopicWatchListQuestion(message)) {
      return {
        message: await this.describeTopicWatches(),
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

  private async runAssistantAgent(
    input: AssistantChatInput,
    message: string,
  ): Promise<AssistantChatResponse | null> {
    if (!this.workflowEngine) {
      return null;
    }

    const result = await this.workflowEngine.run({
      agentType: 'assistant',
      goal: {
        message,
        context: this.normalizeChatContext(input),
        intentHint: this.classifyIntentHint(message),
        responseLanguage: 'zh-CN',
      },
      maxSteps: 4,
    });

    if (result.status !== 'succeeded') {
      return null;
    }

    return this.extractAssistantResponse(result.result, message);
  }

  private extractAssistantResponse(
    value: JsonValue | undefined,
    originalMessage: string,
  ): AssistantChatResponse | null {
    if (!isJsonObject(value)) {
      return null;
    }

    const message = value.message;
    if (typeof message !== 'string' || !message.trim()) {
      return null;
    }

    const proposedActions = this.extractAgentProposedActions(
      value.proposedActions,
      originalMessage,
    );

    return {
      message: message.trim(),
      ...(proposedActions.length > 0 ? { proposedActions } : {}),
    };
  }

  private extractAgentProposedActions(
    value: JsonValue | undefined,
    originalMessage: string,
  ) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item, index) =>
        this.parseAgentProposedAction(item, index, originalMessage),
      )
      .filter((item): item is AssistantProposedAction => item !== null);
  }

  private parseAgentProposedAction(
    value: JsonValue,
    index: number,
    originalMessage: string,
  ): AssistantProposedAction | null {
    if (!isJsonObject(value)) {
      return null;
    }

    const tool = value.tool;
    if (!isAssistantToolName(tool) || !isJsonObject(value.arguments)) {
      return null;
    }

    const summary =
      typeof value.summary === 'string' && value.summary.trim()
        ? value.summary.trim()
        : `待确认操作：${value.tool}`;

    const argumentsWithContext = this.enrichActionArguments(
      tool,
      value.arguments,
      originalMessage,
      summary,
    );

    return {
      id:
        typeof value.id === 'string' && value.id.trim()
          ? value.id.trim()
          : `assistant_agent_action_${Date.now()}_${index}`,
      tool,
      summary,
      arguments: argumentsWithContext,
      requiresConfirmation: true,
    };
  }

  private enrichActionArguments(
    tool: AssistantToolName,
    args: JsonObject,
    originalMessage: string,
    summary: string,
  ): JsonObject {
    if (
      tool !== 'add_twitter_topic_account' &&
      tool !== 'remove_twitter_topic_account'
    ) {
      return args;
    }

    const topicRef = this.extractTopicRefFromText(originalMessage) ??
      this.extractTopicRefFromText(summary);
    const handle = getString(args.handle) ??
      this.extractHandleFromText(originalMessage) ??
      this.extractHandleFromText(summary);

    return {
      ...args,
      ...(topicRef && !hasTopicRef(args) ? { topicName: topicRef } : {}),
      ...(handle && !getString(args.handle) ? { handle } : {}),
    };
  }

  private normalizeChatContext(input: AssistantChatInput): JsonObject {
    return {
      page: input.context.page,
      ...(input.context.setting ? { setting: input.context.setting } : {}),
      ...(input.context.region ? { region: input.context.region } : {}),
      ...(input.context.event ? { event: input.context.event } : {}),
    };
  }

  private classifyIntentHint(message: string): JsonObject {
    if (
      /(添加|新增|加上|删除|移除|修改|更新|编辑|调整).*(主题圈|重点主题|关注圈层|主题追踪|监控账号|账号|配置|热榜|热搜|采集频率|榜单)/.test(
        message,
      )
    ) {
      return {
        type: 'config_edit',
        guidance:
          '先读取相关配置，找到目标主题或配置项，再输出 proposedActions 等待用户确认；不要查询无关 Signal。',
        preferredTools: ['topicWatch.list', 'topicWatch.get'],
      };
    }

    if (
      /(主题圈|重点主题|关注圈层|主题追踪|监控账号|配置|热榜|热搜|采集频率|榜单).*(哪些|什么|多少|查看|列表|当前|现在|已有|有哪些)|^(我现在|当前).*(主题圈|配置)/.test(
        message,
      )
    ) {
      return {
        type: 'config_read',
        guidance: '优先调用配置类工具，不要把最近 Signal 当作配置答案。',
        preferredTools: ['topicWatch.list', 'topicWatch.get', 'topicWatch.listActive'],
      };
    }

    if (/(为什么|原因|诊断|没有形成|没数据|为空|异常|失败)/.test(message)) {
      return {
        type: 'diagnosis',
        guidance:
          '可以组合读取配置、候选、信号、事件和证据，按数据链路解释原因。',
        preferredTools: [
          'topicWatch.list',
          'topicWatch.getCandidates',
          'signal.getRecent',
          'event.findSimilar',
          'evidence.search',
        ],
      };
    }

    if (/(聚合|分析|总结|对比|归纳|洞察)/.test(message)) {
      return {
        type: 'aggregation_analysis',
        guidance: '按问题目标选择信号、事件、证据或机会工具，做综合分析。',
        preferredTools: [
          'signal.search',
          'signal.getRecent',
          'event.findSimilar',
          'opportunity.findSimilar',
          'evidence.search',
        ],
      };
    }

    return {
      type: 'general',
      guidance: '先判断是否需要查询工具；无法确定时说明需要哪些信息。',
      preferredTools: [],
    };
  }

  private isTopicWatchListQuestion(message: string): boolean {
    const asksTopic =
      /(主题圈|重点主题|关注圈层|主题追踪|topic)/i.test(message);
    const asksList =
      /(哪些|什么|多少|配置|列表|查看|列出|现在|当前|已有|有哪些)/.test(
        message,
      );

    return asksTopic && asksList;
  }

  private async describeTopicWatches(): Promise<string> {
    const topics = await this.topicWatchRepository.listTopicWatches();

    if (topics.length === 0) {
      return '当前还没有配置主题圈。';
    }

    const lines = [`当前已配置 ${topics.length} 个主题圈：`];
    topics.forEach((topic, index) => {
      const accounts = topic.accounts ?? [];
      const status = formatTopicWatchStatus(topic.status);
      const domains = topic.domains.length
        ? `；领域：${topic.domains.join('、')}`
        : '';
      const accountPreview = accounts.length
        ? `；账号：${accounts
            .slice(0, 5)
            .map((account) => `@${account.handle.replace(/^@/, '')}`)
            .join('、')}${accounts.length > 5 ? ` 等 ${accounts.length} 个` : ''}`
        : '；暂未配置监控账号';

      lines.push(
        `${index + 1}. ${topic.name}（${status}，${accounts.length} 个监控账号${domains}${accountPreview}）`,
      );
    });

    return lines.join('\n');
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
    const topicWatchId = await this.resolveTopicWatchId(input);
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
    const topicWatchId = await this.resolveTopicWatchId(input);
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

  private async resolveTopicWatchId(input: JsonObject): Promise<string> {
    const directId = getString(input.topicWatchId) ?? getString(input.id);
    if (directId) {
      const directTopic = await this.topicWatchRepository.findTopicWatchById(
        directId,
      );
      if (directTopic) {
        return directTopic.id;
      }
    }

    const name =
      getString(input.topicName) ??
      getString(input.topicWatchName) ??
      getString(input.name) ??
      getString(input.topic) ??
      this.extractTopicRefFromText(getString(input.actionSummary) ?? '') ??
      this.extractTopicRefFromText(getString(input.summary) ?? '');
    if (!name) {
      throw new DomainError(
        'Assistant tool argument is required: topicWatchId or topicName',
        'ASSISTANT_TOPIC_WATCH_REF_REQUIRED',
      );
    }

    const topics = await this.topicWatchRepository.listTopicWatches();
    const normalizedName = normalizeText(name);
    const exact = topics.find(
      (topic) =>
        normalizeText(topic.name) === normalizedName ||
        topic.domains.some((domain) => normalizeText(domain) === normalizedName),
    );
    if (exact) {
      return exact.id;
    }

    const fuzzy = topics.find((topic) => {
      const topicName = normalizeText(topic.name);
      return (
        topicName.includes(normalizedName) ||
        normalizedName.includes(topicName) ||
        topic.domains.some((domain) => {
          const domainName = normalizeText(domain);
          return (
            domainName.includes(normalizedName) ||
            normalizedName.includes(domainName)
          );
        })
      );
    });
    if (fuzzy) {
      return fuzzy.id;
    }

    throw new DomainError('Topic watch not found.', 'TOPIC_WATCH_NOT_FOUND', {
      topicWatchId: directId,
      topicName: name,
    });
  }

  private extractTopicRefFromText(text: string): string | null {
    const normalized = text.trim();
    if (!normalized) {
      return null;
    }

    const quotedMatch = normalized.match(/[“"']([^“"']+)[”"']/);
    if (quotedMatch?.[1]?.trim()) {
      return quotedMatch[1].trim();
    }

    const beforeAccountAction = normalized.match(
      /(.+?)(?:添加|新增|加上|删除|移除|修改|更新|编辑|调整).*?(?:监控账号|账号|@)/,
    );
    if (beforeAccountAction?.[1]?.trim()) {
      return stripTopicDecorations(beforeAccountAction[1]);
    }

    return null;
  }

  private extractHandleFromText(text: string): string | null {
    const match = text.match(/@([A-Za-z0-9_]+)/);
    return match?.[1] ? match[1] : null;
  }
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAssistantToolName(value: unknown): value is AssistantToolName {
  return (
    value === 'get_twitter_config' ||
    value === 'update_twitter_config' ||
    value === 'list_twitter_topics' ||
    value === 'upsert_twitter_topic' ||
    value === 'add_twitter_topic_account' ||
    value === 'remove_twitter_topic_account' ||
    value === 'set_twitter_trend_schedule'
  );
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

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function hasTopicRef(input: JsonObject): boolean {
  return Boolean(
    getString(input.topicWatchId) ??
      getString(input.id) ??
      getString(input.topicName) ??
      getString(input.topicWatchName) ??
      getString(input.name) ??
      getString(input.topic),
  );
}

function stripTopicDecorations(value: string): string {
  return value
    .replace(/^给/, '')
    .replace(/^(主题圈|重点主题|关注圈层|主题追踪)/, '')
    .replace(/(主题圈|重点主题|关注圈层|主题追踪)$/, '')
    .trim();
}

function formatTopicWatchStatus(status: TopicWatchStatus): string {
  switch (status) {
    case 'active':
      return '启用';
    case 'paused':
      return '暂停';
    case 'archived':
      return '已归档';
  }
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
