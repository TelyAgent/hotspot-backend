import { Inject, Injectable, Optional } from '@nestjs/common';
import { AGENT_WORKFLOW_ENGINE } from '../agent/agent.tokens';
import { AgentWorkflowEngine } from '../agent/workflow-engine/agent-workflow-engine.interface';
import { DomainError } from '../common/errors/domain-error';
import { JsonObject, JsonValue } from '../common/types/json.type';
import { ProjectConfigService } from '../project-config/project-config.service';
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
    @Optional()
    @Inject(AGENT_WORKFLOW_ENGINE)
    private readonly workflowEngine?: AgentWorkflowEngine,
  ) {}

  async chat(input: AssistantChatInput): Promise<AssistantChatResponse> {
    const message = input.message.trim();
    const proposedActions = this.buildProposedActions(message);

    if (proposedActions.length > 0) {
      return {
        message: '我理解你的修改意图了。下面是我准备执行的配置变更，请确认后再应用。',
        proposedActions,
      };
    }

    const deterministicResponse = await this.tryAnswerDeterministic(input);
    if (deterministicResponse) {
      return deterministicResponse;
    }

    const agentResponse = await this.runAssistantAgent(input, message);
    if (agentResponse) {
      return agentResponse;
    }

    return {
      message: this.defaultReply(input),
    };
  }

  async tryAnswerDeterministic(
    input: AssistantChatInput,
  ): Promise<AssistantChatResponse | null> {
    const message = input.message.trim();

    if (this.isXTrendConfigQuestion(message)) {
      const config = await this.projectConfigService.getXTrendCollectionConfig();
      return {
        message: [
          `当前 X 热榜采集地区共 ${config.regions.length} 个：${config.regions.join('、')}。`,
          `每个地区采集 ${config.limit} 条，自动采集间隔为 ${formatDuration(config.collectionIntervalMs)}。`,
        ].join('\n'),
      };
    }

    return null;
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

    return this.extractAssistantResponse(result.result);
  }

  private extractAssistantResponse(
    value: JsonValue | undefined,
  ): AssistantChatResponse | null {
    if (!isJsonObject(value)) {
      return null;
    }

    const message = value.message;
    if (typeof message !== 'string' || !message.trim()) {
      return null;
    }

    const proposedActions = this.extractAgentProposedActions(value.proposedActions);

    return {
      message: message.trim(),
      ...(proposedActions.length > 0 ? { proposedActions } : {}),
    };
  }

  private extractAgentProposedActions(value: JsonValue | undefined) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item, index) => this.parseAgentProposedAction(item, index))
      .filter((item): item is AssistantProposedAction => item !== null);
  }

  private parseAgentProposedAction(
    value: JsonValue,
    index: number,
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

    return {
      id:
        typeof value.id === 'string' && value.id.trim()
          ? value.id.trim()
          : `assistant_agent_action_${Date.now()}_${index}`,
      tool,
      summary,
      arguments: value.arguments,
      requiresConfirmation: true,
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
      /(修改|更新|调整|设置|配置).*(X|Twitter|推特|热榜|热搜|榜单|采集|频率|间隔|条数)/.test(
        message,
      )
    ) {
      return {
        type: 'config_edit',
        guidance:
          '先读取相关配置，再输出 proposedActions 等待用户确认；不要查询无关 Signal。',
        preferredTools: ['projectConfig.getXTrendConfig'],
      };
    }

    if (
      /(X|Twitter|推特|热榜|热搜|榜单).*(哪些|什么|多少|查看|列表|当前|现在|已有|有哪些)|^(我现在|当前).*(配置)/.test(
        message,
      )
    ) {
      return {
        type: 'config_read',
        guidance: '优先调用配置类工具，不要把最近 Signal 当作配置答案。',
        preferredTools: ['projectConfig.getXTrendConfig'],
      };
    }

    if (/(为什么|原因|诊断|没有形成|没数据|为空|异常|失败)/.test(message)) {
      return {
        type: 'diagnosis',
        guidance:
          '可以组合读取配置、信号、事件和证据，按数据链路解释原因。',
        preferredTools: ['signal.getRecent', 'event.findSimilar', 'evidence.search'],
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

  private isXTrendConfigQuestion(message: string): boolean {
    const asksXTrend = /(X|Twitter|推特|热榜|热搜|榜单)/i.test(message);
    const asksConfig =
      /(采集|抓取|同步|配置|设置|地区|区域|范围|条数|数量|频率|间隔)/.test(
        message,
      );
    const asksRead = /(哪些|什么|多少|查看|当前|现在|已有|有哪些|几)/.test(
      message,
    );

    return asksXTrend && asksConfig && asksRead;
  }

  private defaultReply(input: AssistantChatInput): string {
    const page = input.context.page || '当前页面';
    return `我在 ${page} 页面。你可以让我查看 Twitter 配置，或调整热榜条数/采集频率。涉及修改时我会先给出待确认操作。`;
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
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAssistantToolName(value: unknown): value is AssistantToolName {
  return (
    value === 'get_twitter_config' ||
    value === 'update_twitter_config' ||
    value === 'set_twitter_trend_schedule'
  );
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
