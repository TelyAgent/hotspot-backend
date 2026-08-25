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
