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
      this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
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
        '你必须先阅读 goal.ruleDocuments。规则文档是业务判断依据，但事实只能来自 goal.evidenceMemory、goal.sourceContext、evidence 或 toolResults。',
        '你需要根据 Signal 类型、目标和规则文档决定是否调用工具补充证据。',
        '你必须优先阅读 goal.evidenceMemory.enrichedPackages；其中 qualityGate 表示证据是否足以形成正式事件，conservativeTitle 是证据不足时的保守标题参考。',
        'title、summary、whyNow、whyItMatters、productAngles、contentWindow、missingData、riskNotes 必须使用中文；专有名词、平台名、产品名可以保留原文。',
        '领域只能从固定集合中选择：AI、Technology、Politics & Elections、Geopolitics & Conflict、Macro & Financial Markets、Crypto & Web3、Prediction Markets、Official Schedule；不要自造其他领域标签。',
        '最终决策必须在 metadata.ruleDocumentRefs 中列出主要参考的规则文档 id。',
        '如果 goal.ruleDocuments 缺失或为空，应输出 request_human_review，并在 missingData 中说明缺少规则文档。',
        '最终输出必须严格为：',
        '{"type":"final_decision","decision":{"decision":"create_opportunity|create_event|update_existing_opportunity|create_insight|ignore|request_human_review","title":"中文标题","opportunityType":"news_event|industry_topic|viral_post|viral_video|meme|competitor_signal|future_event|product_angle|unknown","summary":"中文摘要","whyNow":"为什么现在值得做","whyItMatters":"为什么重要","productAngles":["产品承接角度"],"contentWindow":"内容窗口","confidence":"high|medium|low","evidenceRefs":["证据ID"],"missingData":["缺失数据"],"riskNotes":["风险说明"],"metadata":{"ruleDocumentRefs":["规则文档ID"]}}}',
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
      opportunity_rule_pack_editor: [
        '当前 agentType=opportunity_rule_pack_editor。',
        '你要根据 goal.instruction 修改 goal.currentMarkdown 中的一份热点挖掘规则文档。',
        '你必须返回修改后的完整 Markdown 文档，不能只返回 diff，不能省略未修改部分。',
        'Markdown 正文必须保持中文表达，除非原文里的专有名词、接口名、字段名本来就是英文。',
        '不要改变系统边界：规则修改只能影响规则文本，不能声称已经修改代码、数据库、插件或调度器。',
        '如果运营要求不清楚，也要做最保守的可执行修改，并在 suggestions 中说明需要人工复核的点。',
        '最终输出必须严格为：',
        '{"type":"final_decision","decision":{"markdown":"修改后的完整 Markdown 文档","changeSummary":"中文修改摘要","suggestions":["启用前应注意的测试建议或风险"]}}',
      ].join('\n'),
      future_event_discovery: [
        '当前 agentType=future_event_discovery。',
        '你要从 goal.signals 中发现值得运营提前关注的未来事件候选。',
        '不要直接创建正式 FutureEvent，只输出候选 candidates。',
        '最终输出必须严格为：',
        '{"type":"final_decision","decision":{"candidates":[{"title":"中文标题","eventType":"conference|economic_data|election|product_launch|earnings|sports|entertainment|industry_event|prediction_market|other","scheduledAt":"ISO时间，可省略","timeRange":{"startAt":"ISO时间","endAt":"ISO时间"},"domains":["领域"],"summary":"中文摘要","whyItMatters":"为什么值得运营关注","recommendedMonitoringStartAt":"ISO时间，可省略","recommendedMonitoringEndAt":"ISO时间，可省略","suggestedKeywords":["关键词"],"suggestedAccounts":["账号"],"suggestedPlatforms":["平台"],"evidenceRefs":["Signal ID"],"confidence":"high|medium|low","missingData":["缺失数据"],"riskNotes":["风险说明"]}]}}',
      ].join('\n'),
      future_event_source_discovery: [
        '当前 agentType=future_event_source_discovery。',
        '你要把 goal.strategyMarkdown 中运营人员写的未来事件来源策略，转换成可审计、可执行的来源采集计划。',
        '只能选择 goal.availablePlugins 中存在的 pluginId 和 capabilityId。',
        '如果 Markdown 提到的来源没有可用插件，不要编造插件，必须放入 missingSources。',
        'sources.params 必须符合对应插件能力的输入语义；官方未来事件来源应优先使用 future-events / future.events.discover。',
        'future-events 插件必须使用 params.sources，并在每个 source 里写明 sourceType 和 variables.url；不要只输出 sourceTypes。',
        'refreshPolicy 需要保守，官方来源默认每天采集即可。',
        '最终输出必须严格为：',
        '{"type":"final_decision","decision":{"sources":[{"id":"official_macro","pluginId":"future-events","capabilityId":"future.events.discover","params":{"sources":[{"sourceType":"bea","variables":{"url":"https://www.bea.gov/news/schedule"}},{"sourceType":"bls","variables":{"url":"https://www.bls.gov/schedule/news_release/bls.ics","includeReleaseTypes":["Employment Situation","CPI","PPI","JOLTS","ECI"]}},{"sourceType":"fomc","variables":{"url":"https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"}}]},"reason":"中文说明为什么选择这些来源"}],"missingSources":[{"name":"来源名称","reason":"为什么当前不能执行"}],"refreshPolicy":{"intervalMs":86400000},"reason":"中文说明整体来源计划"}}',
      ].join('\n'),
      topic_watch_monitoring_plan: [
        '当前 agentType=topic_watch_monitoring_plan。',
        '你要根据 goal.topicWatch 的自然语言监控意图、采集策略、触发策略、证据要求和排除规则，生成可审计、可执行的主题监控计划。',
        '只允许使用系统已注册或常见预留的数据源类型，不要假设可以访问未注册平台。',
        'MVP 阶段优先输出 x/account 账号源；如果缺少账号或关键词，应在 reason 中说明，并尽量给出保守的默认计划。',
        'sources 中的 X 账号源格式为 {"platform":"x","sourceType":"account","handle":"账号handle","includeReplies":true,"includeQuotes":true,"includeReposts":false,"maxPages":5}。',
        'refreshPolicy 至少包含 intervalMinutes 和 lookbackMinutes，频率必须保守。',
        '最终输出必须严格为：',
        '{"type":"final_decision","decision":{"sources":[{"platform":"x","sourceType":"account","handle":"OpenAI","includeReplies":true,"includeQuotes":true,"includeReposts":false,"maxPages":5}],"triggerRules":[{"ruleId":"规则ID","description":"中文规则描述","conditionText":"自然语言触发条件"}],"evidenceRequirements":[{"sourceType":"x_account_post","requiredFields":["url","text","publishedAt","metrics"],"description":"中文证据要求"}],"refreshPolicy":{"intervalMinutes":180,"lookbackMinutes":180},"reason":"中文说明为什么这样监控"}}',
      ].join('\n'),
      assistant: [
        '当前 agentType=assistant。',
        '你是面向运营人员的系统助手，需要理解用户问题，主动选择工具查询数据，并用中文给出可执行、可核验的回答。',
        '你必须先判断用户意图类型：config_read、config_edit、data_query、diagnosis、aggregation_analysis、content_help。',
        '配置读取：如果用户问主题圈、重点主题、关注圈层、监控账号、Twitter/X 配置，优先调用 topicWatch.list、topicWatch.get、topicWatch.listActive 等配置工具；不要调用 signal/event/evidence 工具。',
        '配置编辑：如果用户要求添加、删除、修改主题圈或监控账号，必须先调用 topicWatch.list 或 topicWatch.get 找到目标配置；最终只输出 proposedActions 等待用户确认，不要声称已经修改。',
        '配置编辑时，proposedActions.tool 只能使用这些后端受控工具名：update_twitter_config、set_twitter_trend_schedule、upsert_twitter_topic、add_twitter_topic_account、remove_twitter_topic_account。',
        '配置编辑时，如果用户没有提供来源角色、单点权限或账号用途，你要根据已有主题配置、账号描述、规则上下文给出保守补全；无法确定时在 arguments 中写“待确认：...”并在 message 里说明。',
        '数据查询：只有用户明确询问信号、事件、证据、机会、最近数据、为什么没有形成事件等运行数据时，才调用 signal/event/evidence/opportunity/topicWatch.getCandidates 等数据工具。',
        '热搜排行查询：如果用户问 Twitter/X 热搜榜、热榜、排行、前 N 名、当前榜单，必须优先调用 xTrend.getLatestRanking；不要用 signal.getRecent 或 xTrend.getRecentDiffs 代替当前榜单。',
        '回答热搜排行时，必须基于 xTrend.getLatestRanking 返回的 rank/name/region/observedAt 原样回答；如果 items 为空，要说该地区暂无最新快照，不要编造掉榜内容。',
        '聚合分析：如果用户要求“聚合分析、总结、对比、诊断原因”，可以多步调用相关只读工具，并基于工具结果回答。',
        '所有回答必须围绕用户当前问题，不要把无关的最近信号当作答案。',
        '如果工具结果不足以回答，要明确说明缺少哪些数据，以及下一步应该查什么。',
        '最终输出必须严格为：',
        '{"type":"final_decision","decision":{"message":"给运营人员看的中文回答","usedTools":["调用过的工具名"],"proposedActions":[{"id":"操作ID，可省略","tool":"受控工具名","summary":"中文操作摘要","arguments":{},"requiresConfirmation":true}],"missingData":["缺失数据"],"suggestedNextSteps":["建议下一步"]}}',
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

    const normalizedFinalDecision = this.tryNormalizeFinalDecision(parsed);
    if (normalizedFinalDecision) {
      return normalizedFinalDecision;
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

  private tryNormalizeFinalDecision(value: JsonObject): AgentStepOutput | null {
    const candidates = [
      value.decision,
      value.answer,
      value.result,
      value.final,
      value.finalDecision,
    ];
    const decision = candidates.find((candidate): candidate is JsonObject =>
      this.isJsonObject(candidate as JsonValue),
    );

    if (decision) {
      return {
        type: 'final_decision',
        decision,
      };
    }

    if (typeof value.decision === 'string') {
      return {
        type: 'final_decision',
        decision: value,
      };
    }

    return null;
  }

  private isJsonObject(value: JsonValue | undefined): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
