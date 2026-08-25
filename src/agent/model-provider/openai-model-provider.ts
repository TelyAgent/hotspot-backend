import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError } from '../../common/errors/domain-error';
import { JsonObject, JsonValue } from '../../common/types/json.type';
import {
  ModelProvider,
  ModelProviderInput,
} from './model-provider.interface';
import { AgentStepOutput } from '../workflow-engine/agent-workflow-engine.interface';

interface OpenAiResponse {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
}

@Injectable()
export class OpenAiModelProvider implements ModelProvider {
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.model =
      this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-5';
    this.baseUrl =
      this.configService.get<string>('OPENAI_BASE_URL') ??
      'https://api.openai.com/v1';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async completeStructured(input: ModelProviderInput): Promise<AgentStepOutput> {
    if (!this.apiKey) {
      throw new DomainError(
        `Model provider is not configured for agent: ${input.agentType}`,
        'MODEL_PROVIDER_NOT_CONFIGURED',
        {
          agentType: input.agentType,
        },
      );
    }

    const response = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: this.createPrompt(input),
        text: {
          format: {
            type: 'json_object',
          },
        },
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | OpenAiResponse
      | null;

    if (!response.ok) {
      throw new DomainError(
        payload?.error?.message ?? 'OpenAI Responses API request failed.',
        'OPENAI_MODEL_REQUEST_FAILED',
        {
          status: response.status,
          agentType: input.agentType,
        },
      );
    }

    const text = this.extractOutputText(payload);
    return this.parseStepOutput(text);
  }

  private createPrompt(input: ModelProviderInput) {
    return [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: [
              '你是 Hotspot Monitor V2 的受控 Agent 决策模型。',
              '你必须只输出 JSON，不要输出 Markdown。',
              '你可以输出两类动作：',
              '{"type":"tool_call","toolName":"工具名","reason":"调用原因","arguments":{},"requestedFields":["字段"]}',
              '{"type":"final_decision","decision":{...}}',
              '所有事实必须来自 goal、evidence 或 toolResults。',
              '如果缺少必要数据，应在 final_decision.decision.missingData 中如实说明。',
              '只能调用 availableTools 中列出的工具。',
              this.createAgentContract(input.agentType),
            ].join('\n'),
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify({
              agentType: input.agentType,
              stepIndex: input.stepIndex,
              goal: input.goal,
              evidence: input.evidence,
              toolResults: input.toolResults,
              availableTools: (input.availableTools ?? []).map((tool) => ({
                name: tool.name,
                description: tool.description,
                permission: tool.permission,
                inputSchema: tool.inputSchema ?? null,
                outputSchema: tool.outputSchema ?? null,
                fieldSelection: tool.fieldSelection ?? null,
                limits: tool.limits ?? null,
              })),
            }),
          },
        ],
      },
    ];
  }

  private createAgentContract(agentType: string): string {
    const contracts: Record<string, string> = {
      opportunity_mining: [
        '当前 agentType=opportunity_mining。',
        '最终输出必须严格为：',
        '{"type":"final_decision","decision":{"decision":"create_opportunity|create_event|update_existing_opportunity|create_insight|ignore|request_human_review","title":"中文标题","opportunityType":"news_event|industry_topic|viral_post|viral_video|meme|competitor_signal|future_event|product_angle|unknown","summary":"中文摘要","whyNow":"为什么现在值得做","whyItMatters":"为什么重要","productAngles":["产品承接角度"],"contentWindow":"内容窗口","confidence":"high|medium|low","evidenceRefs":["证据ID"],"missingData":["缺失数据"],"riskNotes":["风险说明"]}}',
      ].join('\n'),
      assignment: [
        '当前 agentType=assignment。',
        '最终输出必须严格为：',
        '{"type":"final_decision","decision":{"targetType":"opportunity|event|insight|future_event","targetId":"目标ID","decision":"assign|skip|request_human_review","assignments":[{"accountId":"账号ID","accountName":"账号名称","accountSource":"local|external","sourceSystem":"来源系统，可省略","priority":"high|medium|low","contentType":"内容类型","contentGoal":"内容目标","angle":"唯一内容角度","constraints":["约束"],"reason":"分配原因","evidenceRefs":["证据ID"],"duplicateRisk":"none|low|medium|high"}],"skippedAccounts":[{"accountId":"账号ID","accountName":"账号名称","reason":"跳过原因"}],"summary":"中文摘要","riskNotes":["风险"],"missingData":["缺失数据"],"confidence":"high|medium|low"}}',
      ].join('\n'),
      content_generation: [
        '当前 agentType=content_generation。',
        '最终输出必须严格为：',
        '{"type":"final_decision","decision":{"body":"中文内容正文","evidenceRefs":["证据ID"],"riskNotes":["风险说明"]}}',
      ].join('\n'),
    };

    return contracts[agentType] ?? '';
  }

  private extractOutputText(payload: OpenAiResponse | null): string {
    if (payload?.output_text) {
      return payload.output_text;
    }

    const text = payload?.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .find((value): value is string => typeof value === 'string');

    if (!text) {
      throw new DomainError(
        'OpenAI model response did not contain text output.',
        'OPENAI_MODEL_OUTPUT_MISSING',
      );
    }

    return text;
  }

  private parseStepOutput(text: string): AgentStepOutput {
    let parsed: JsonValue;

    try {
      parsed = JSON.parse(text) as JsonValue;
    } catch (error) {
      throw new DomainError(
        'OpenAI model returned invalid JSON.',
        'OPENAI_MODEL_OUTPUT_INVALID_JSON',
        {
          text,
        },
      );
    }

    if (!this.isJsonObject(parsed)) {
      throw new DomainError(
        'OpenAI model output must be a JSON object.',
        'OPENAI_MODEL_OUTPUT_INVALID_SHAPE',
      );
    }

    if (parsed.type === 'tool_call') {
      return this.parseToolCall(parsed);
    }

    if (parsed.type === 'final_decision') {
      return this.parseFinalDecision(parsed);
    }

    throw new DomainError(
      'OpenAI model output has an unknown step type.',
      'OPENAI_MODEL_OUTPUT_UNKNOWN_TYPE',
      {
        type: parsed.type,
      },
    );
  }

  private parseToolCall(value: JsonObject): AgentStepOutput {
    if (typeof value.toolName !== 'string') {
      throw new DomainError(
        'Tool call output missing toolName.',
        'OPENAI_TOOL_CALL_INVALID',
      );
    }

    return {
      type: 'tool_call',
      toolName: value.toolName,
      reason: typeof value.reason === 'string' ? value.reason : '',
      arguments: this.isJsonObject(value.arguments) ? value.arguments : {},
      requestedFields: Array.isArray(value.requestedFields)
        ? value.requestedFields.filter(
            (field): field is string => typeof field === 'string',
          )
        : undefined,
    };
  }

  private parseFinalDecision(value: JsonObject): AgentStepOutput {
    if (!this.isJsonObject(value.decision)) {
      throw new DomainError(
        'Final decision output missing decision object.',
        'OPENAI_FINAL_DECISION_INVALID',
      );
    }

    return {
      type: 'final_decision',
      decision: value.decision,
    };
  }

  private isJsonObject(value: JsonValue | undefined): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
