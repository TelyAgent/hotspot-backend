import { ConfigService } from '@nestjs/config';
import { DomainError } from '../../../src/common/errors/domain-error';
import { OpenAiModelProvider } from '../../../src/agent/model-provider/openai-model-provider';

describe('OpenAiModelProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('throws a clear domain error when api key is not configured', async () => {
    const provider = new OpenAiModelProvider(createConfig({}));

    await expect(provider.completeStructured(createInput())).rejects.toThrow(
      expect.objectContaining({
        code: 'MODEL_PROVIDER_NOT_CONFIGURED',
      }),
    );
  });

  it('parses a final decision response', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        createResponse({
          output_text: JSON.stringify({
            type: 'final_decision',
            decision: {
              decision: 'create_opportunity',
            },
          }),
        }),
      ),
    ) as never;
    const provider = new OpenAiModelProvider(
      createConfig({
        OPENAI_API_KEY: 'test-key',
        OPENAI_MODEL: 'test-model',
      }),
    );

    const result = await provider.completeStructured(createInput());

    expect(result).toEqual({
      type: 'final_decision',
      decision: {
        decision: 'create_opportunity',
      },
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    );
  });

  it('parses a tool call response', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        createResponse({
          output_text: JSON.stringify({
            type: 'tool_call',
            toolName: 'signal.search',
            reason: 'Need signals.',
            arguments: {
              query: 'AI',
            },
            requestedFields: ['id', 'title', 42],
          }),
        }),
      ),
    ) as never;
    const provider = new OpenAiModelProvider(
      createConfig({
        OPENAI_API_KEY: 'test-key',
      }),
    );

    const result = await provider.completeStructured(createInput());

    expect(result).toEqual({
      type: 'tool_call',
      toolName: 'signal.search',
      reason: 'Need signals.',
      arguments: {
        query: 'AI',
      },
      requestedFields: ['id', 'title'],
    });
  });

  it('normalizes common final answer shapes from the model', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        createResponse({
          output_text: JSON.stringify({
            type: 'answer',
            answer: {
              decision: 'ignore',
              title: '证据不足',
            },
          }),
        }),
      ),
    ) as never;
    const provider = new OpenAiModelProvider(
      createConfig({
        OPENAI_API_KEY: 'test-key',
      }),
    );

    await expect(provider.completeStructured(createInput())).resolves.toEqual({
      type: 'final_decision',
      decision: {
        decision: 'ignore',
        title: '证据不足',
      },
    });
  });

  it('normalizes bare decision objects from the model', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        createResponse({
          output_text: JSON.stringify({
            decision: 'request_human_review',
            title: '证据不足',
          }),
        }),
      ),
    ) as never;
    const provider = new OpenAiModelProvider(
      createConfig({
        OPENAI_API_KEY: 'test-key',
      }),
    );

    await expect(provider.completeStructured(createInput())).resolves.toEqual({
      type: 'final_decision',
      decision: {
        decision: 'request_human_review',
        title: '证据不足',
      },
    });
  });

  it('uses gpt-4o-mini by default when model is not configured', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        createResponse({
          output_text: JSON.stringify({
            type: 'final_decision',
            decision: {
              decision: 'skip',
            },
          }),
        }),
      ),
    ) as never;
    const provider = new OpenAiModelProvider(
      createConfig({
        OPENAI_API_KEY: 'test-key',
      }),
    );

    await provider.completeStructured(createInput());

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        body: expect.stringContaining('"model":"gpt-4o-mini"'),
      }),
    );
  });

  it('adds a strict output contract for opportunity rule pack editor', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        createResponse({
          output_text: JSON.stringify({
            type: 'final_decision',
            decision: {
              markdown: '# 修改后的规则',
              changeSummary: '更新规则。',
              suggestions: [],
            },
          }),
        }),
      ),
    ) as never;
    const provider = new OpenAiModelProvider(
      createConfig({
        OPENAI_API_KEY: 'test-key',
      }),
    );

    await provider.completeStructured({
      ...createInput(),
      agentType: 'opportunity_rule_pack_editor',
    });

    const body = JSON.parse(
      String((global.fetch as jest.Mock).mock.calls[0][1].body),
    ) as { input: Array<{ content: Array<{ text: string }> }> };
    expect(body.input[0].content[0].text).toContain(
      '当前 agentType=opportunity_rule_pack_editor。',
    );
    expect(body.input[0].content[0].text).toContain(
      '"markdown":"修改后的完整 Markdown 文档"',
    );
  });

  it('instructs assistant agent to plan configuration edits before querying runtime data', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        createResponse({
          output_text: JSON.stringify({
            type: 'final_decision',
            decision: {
              message: '需要先确认配置变更。',
              proposedActions: [],
            },
          }),
        }),
      ),
    ) as never;
    const provider = new OpenAiModelProvider(
      createConfig({
        OPENAI_API_KEY: 'test-key',
      }),
    );

    await provider.completeStructured({
      ...createInput(),
      agentType: 'assistant',
      goal: {
        message: '预测市场行业添加监控账号 @Jason',
      },
      availableTools: [
        {
          name: 'topicWatch.list',
          description: '读取全部重点主题配置。',
          permission: 'read' as const,
          execute: jest.fn(),
        },
        {
          name: 'signal.getRecent',
          description: '读取最近信号。',
          permission: 'read' as const,
          execute: jest.fn(),
        },
      ],
    });

    const body = JSON.parse(
      String((global.fetch as jest.Mock).mock.calls[0][1].body),
    ) as { input: Array<{ content: Array<{ text: string }> }> };
    expect(body.input[0].content[0].text).toContain(
      '配置编辑：如果用户要求添加、删除、修改主题圈或监控账号，必须先调用 topicWatch.list 或 topicWatch.get 找到目标配置',
    );
    expect(body.input[0].content[0].text).toContain(
      '不要把无关的最近信号当作答案',
    );
    expect(body.input[0].content[0].text).toContain('proposedActions');
  });

  it('instructs assistant agent to use latest ranking tool for x trend ranking questions', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        createResponse({
          output_text: JSON.stringify({
            type: 'final_decision',
            decision: {
              message: '已读取最新热搜。',
              proposedActions: [],
            },
          }),
        }),
      ),
    ) as never;
    const provider = new OpenAiModelProvider(
      createConfig({
        OPENAI_API_KEY: 'test-key',
      }),
    );

    await provider.completeStructured({
      ...createInput(),
      agentType: 'assistant',
      goal: {
        message: 'twitter的热搜排行前五有哪些',
      },
      availableTools: [
        {
          name: 'xTrend.getLatestRanking',
          description: '读取指定地区最新一次 X/Twitter 热搜榜快照。',
          permission: 'read' as const,
          execute: jest.fn(),
        },
        {
          name: 'signal.getRecent',
          description: '读取最近信号。',
          permission: 'read' as const,
          execute: jest.fn(),
        },
      ],
    });

    const body = JSON.parse(
      String((global.fetch as jest.Mock).mock.calls[0][1].body),
    ) as { input: Array<{ content: Array<{ text: string }> }> };
    expect(body.input[0].content[0].text).toContain(
      '热搜排行查询：如果用户问 Twitter/X 热搜榜、热榜、排行、前 N 名、当前榜单，必须优先调用 xTrend.getLatestRanking',
    );
    expect(body.input[0].content[0].text).toContain(
      '不要用 signal.getRecent 或 xTrend.getRecentDiffs 代替当前榜单',
    );
  });

  it('instructs opportunity mining agent to output Chinese copy and fixed domain labels only', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        createResponse({
          output_text: JSON.stringify({
            type: 'final_decision',
            decision: {
              decision: 'create_insight',
            },
          }),
        }),
      ),
    ) as never;
    const provider = new OpenAiModelProvider(
      createConfig({
        OPENAI_API_KEY: 'test-key',
      }),
    );

    await provider.completeStructured(createInput());

    const body = JSON.parse(
      String((global.fetch as jest.Mock).mock.calls[0][1].body),
    ) as { input: Array<{ content: Array<{ text: string }> }> };
    expect(body.input[0].content[0].text).toContain(
      'title、summary、whyNow、whyItMatters、productAngles、contentWindow、missingData、riskNotes 必须使用中文',
    );
    expect(body.input[0].content[0].text).toContain(
      '领域只能从固定集合中选择：AI、Technology、Politics & Elections、Geopolitics & Conflict、Macro & Financial Markets、Crypto & Web3、Prediction Markets、Official Schedule',
    );
    expect(body.input[0].content[0].text).toContain('goal.evidenceMemory.enrichedPackages');
  });

  it('throws a domain error when the API fails', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        createResponse(
          {
            error: {
              message: 'bad request',
            },
          },
          false,
          400,
        ),
      ),
    ) as never;
    const provider = new OpenAiModelProvider(
      createConfig({
        OPENAI_API_KEY: 'test-key',
      }),
    );

    await expect(provider.completeStructured(createInput())).rejects.toThrow(
      expect.objectContaining({
        code: 'OPENAI_MODEL_REQUEST_FAILED',
      }),
    );
  });
});

function createConfig(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function createInput() {
  return {
    agentType: 'opportunity_mining',
    goal: {
      instruction: 'Find opportunity.',
    },
    stepIndex: 0,
    evidence: [],
    toolResults: [],
    availableTools: [
      {
        name: 'signal.search',
        description: 'Search signals.',
        permission: 'read' as const,
        execute: jest.fn(),
      },
    ],
  };
}

function createResponse(
  payload: unknown,
  ok = true,
  status = 200,
): Response {
  return {
    ok,
    status,
    json: jest.fn(() => Promise.resolve(payload)),
  } as unknown as Response;
}
