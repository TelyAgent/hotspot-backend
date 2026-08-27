import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AGENT_WORKFLOW_ENGINE } from '../agent/agent.tokens';
import { AgentWorkflowEngine } from '../agent/workflow-engine/agent-workflow-engine.interface';
import { AssistantService } from '../assistant/assistant.service';
import { AssistantToolName } from '../assistant/assistant.types';
import { DomainError } from '../common/errors/domain-error';
import { JsonObject, JsonValue } from '../common/types/json.type';
import { PrismaService } from '../database/prisma.service';
import {
  CopilotActionExecutionResponse,
  CopilotChatInput,
  CopilotChatResponse,
  CopilotConfirmActionInput,
} from './copilot.types';

@Injectable()
export class CopilotService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AGENT_WORKFLOW_ENGINE)
    private readonly workflowEngine: AgentWorkflowEngine,
    private readonly assistantService: AssistantService,
  ) {}

  async chat(input: CopilotChatInput): Promise<CopilotChatResponse> {
    const session = await this.findOrCreateSession(input);

    await this.prisma.copilotMessage.create({
      data: {
        sessionId: session.id,
        role: 'user',
        content: input.message,
        metadata: input.context as Prisma.InputJsonValue,
      },
    });

    const agentResult = await this.workflowEngine.run({
      agentType: 'assistant',
      goal: {
        message: input.message,
        context: input.context,
        intentHint: this.classifyIntentHint(input.message),
        responseLanguage: 'zh-CN',
        client: input.client,
        tenantId: input.tenantId,
        userId: input.userId,
      },
      maxSteps: 5,
    });

    if (agentResult.status !== 'succeeded') {
      throw new DomainError(
        agentResult.errorMessage ?? 'Copilot agent run failed.',
        'COPILOT_AGENT_RUN_FAILED',
        { runId: agentResult.runId },
      );
    }

    const decision = isJsonObject(agentResult.result) ? agentResult.result : {};
    const proposedActions = await this.persistProposedActions({
      sessionId: session.id,
      agentRunId: agentResult.runId,
      tenantId: input.tenantId,
      userId: input.userId,
      decision,
    });
    const response: CopilotChatResponse = {
      sessionId: session.id,
      runId: agentResult.runId,
      message: getString(decision.message) ?? '我已经完成本次处理。',
      proposedActions,
      usedTools: getJsonArray(decision.usedTools),
      missingData: getJsonArray(decision.missingData),
      suggestedNextSteps: getJsonArray(decision.suggestedNextSteps),
    };

    await this.prisma.copilotMessage.create({
      data: {
        sessionId: session.id,
        role: 'assistant',
        content: response.message,
        metadata: toInputJson({
          runId: response.runId,
          proposedActions: response.proposedActions,
          usedTools: response.usedTools,
          missingData: response.missingData,
          suggestedNextSteps: response.suggestedNextSteps,
        }),
      },
    });

    return response;
  }

  async confirmAction(
    actionId: string,
    input: CopilotConfirmActionInput,
  ): Promise<CopilotActionExecutionResponse> {
    const action = await this.prisma.copilotProposedAction.findUnique({
      where: { id: actionId },
    });
    if (!action) {
      throw new DomainError('Copilot action not found.', 'COPILOT_ACTION_NOT_FOUND', {
        actionId,
      });
    }
    if (action.status !== 'pending') {
      throw new DomainError('Copilot action is not pending.', 'COPILOT_ACTION_NOT_PENDING', {
        actionId,
        status: action.status,
      });
    }

    const result = await this.assistantService.executeTool({
      tool: this.toAssistantToolName(action.tool),
      arguments: action.arguments as JsonObject,
    });

    await this.prisma.copilotProposedAction.update({
      where: { id: actionId },
      data: {
        status: 'succeeded',
        confirmedBy: input.confirmedBy,
        confirmedAt: new Date(),
        executedAt: new Date(),
        result: toInputJson(result.result ?? null),
      },
    });
    await this.prisma.copilotAuditLog.create({
      data: {
        tenantId: action.tenantId,
        userId: input.confirmedBy,
        actionId,
        tool: action.tool,
        operation: 'confirm_action',
        after: toInputJson(result.result ?? null),
        metadata: {
          message: result.message,
        },
      },
    });

    return {
      status: 'succeeded',
      message: result.message,
      result: result.result,
    };
  }

  async rejectAction(input: {
    actionId: string;
    rejectedBy: string;
    reason?: string;
  }): Promise<CopilotActionExecutionResponse> {
    const action = await this.prisma.copilotProposedAction.findUnique({
      where: { id: input.actionId },
    });
    if (!action) {
      throw new DomainError('Copilot action not found.', 'COPILOT_ACTION_NOT_FOUND', {
        actionId: input.actionId,
      });
    }
    if (action.status !== 'pending') {
      throw new DomainError('Copilot action is not pending.', 'COPILOT_ACTION_NOT_PENDING', {
        actionId: input.actionId,
        status: action.status,
      });
    }

    await this.prisma.copilotProposedAction.update({
      where: { id: input.actionId },
      data: {
        status: 'rejected',
        confirmedBy: input.rejectedBy,
        confirmedAt: new Date(),
        errorMessage: input.reason,
      },
    });

    return {
      status: 'rejected',
      message: `已拒绝：${action.summary}`,
    };
  }

  private async findOrCreateSession(input: CopilotChatInput) {
    if (input.sessionId) {
      const session = await this.prisma.copilotSession.findUnique({
        where: { id: input.sessionId },
      });
      if (session) {
        return session;
      }
    }

    return this.prisma.copilotSession.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        client: input.client,
        title: input.message.slice(0, 80),
        metadata: input.context as Prisma.InputJsonValue,
      },
    });
  }

  private async persistProposedActions(input: {
    sessionId: string;
    agentRunId: string;
    tenantId: string;
    userId: string;
    decision: JsonObject;
  }) {
    const proposedActions = Array.isArray(input.decision.proposedActions)
      ? input.decision.proposedActions
      : [];
    const records = [];

    for (const item of proposedActions) {
      if (!isJsonObject(item)) {
        continue;
      }
      const tool = getString(item.tool);
      const summary = getString(item.summary);
      if (!tool || !summary) {
        continue;
      }

      const record = await this.prisma.copilotProposedAction.create({
        data: {
          sessionId: input.sessionId,
          agentRunId: input.agentRunId,
          tenantId: input.tenantId,
          userId: input.userId,
          tool,
          summary,
          arguments: toInputJson(
            isJsonObject(item.arguments) ? item.arguments : {},
          ),
          status: 'pending',
          requiresConfirmation: true,
        },
      });
      records.push({
        id: record.id,
        tool: record.tool,
        summary: record.summary,
        arguments: record.arguments as JsonValue,
        requiresConfirmation: record.requiresConfirmation,
        status: record.status,
      });
    }

    return records;
  }

  private classifyIntentHint(message: string): JsonObject {
    if (/(添加|新增|删除|移除|修改|更新|调整|设置)/.test(message)) {
      return {
        type: 'config_edit',
        guidance:
          '先读取配置和规则，再生成 proposedActions 等待确认；不要直接执行写操作。',
      };
    }
    if (/(为什么|原因|诊断|失败|没数据|没有形成)/.test(message)) {
      return {
        type: 'diagnosis',
        guidance: '组合读取配置、信号、事件、证据和运行日志，给出链路诊断。',
      };
    }
    if (/(分析|聚合|总结|对比|洞察)/.test(message)) {
      return {
        type: 'aggregation_analysis',
        guidance: '根据目标选择数据工具并做综合分析。',
      };
    }
    if (/(配置|哪些|查看|当前|列表)/.test(message)) {
      return {
        type: 'config_read',
        guidance: '优先调用配置类工具回答。',
      };
    }
    return {
      type: 'unknown',
      guidance: '先判断是否需要工具；缺少信息时明确说明。',
    };
  }

  private toAssistantToolName(tool: string): AssistantToolName {
    if (
      tool === 'get_twitter_config' ||
      tool === 'update_twitter_config' ||
      tool === 'list_twitter_topics' ||
      tool === 'upsert_twitter_topic' ||
      tool === 'add_twitter_topic_account' ||
      tool === 'remove_twitter_topic_account' ||
      tool === 'set_twitter_trend_schedule'
    ) {
      return tool;
    }

    throw new DomainError(
      `Unsupported copilot action tool: ${tool}`,
      'COPILOT_ACTION_TOOL_UNSUPPORTED',
      { tool },
    );
  }
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: JsonValue | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getJsonArray(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function toInputJson(value: unknown) {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
}
