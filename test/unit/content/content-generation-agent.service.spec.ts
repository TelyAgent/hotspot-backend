import { AgentWorkflowEngine } from '../../../src/agent/workflow-engine/agent-workflow-engine.interface';
import { DomainError } from '../../../src/common/errors/domain-error';
import { ContentDraftRepository } from '../../../src/content/draft/content-draft.repository';
import { ContentGenerationAgentService } from '../../../src/content/generation/content-generation-agent.service';
import { ContentTask } from '../../../src/content/content.types';
import { EvidenceItem } from '../../../src/signal/evidence/evidence.types';

describe('ContentGenerationAgentService', () => {
  it('generates a draft from a content task and evidence', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'run_1',
          status: 'succeeded',
          result: {
            body: 'OpenAI 发布新模型，开发者需要关注它对产品路线的影响。',
            evidenceRefs: ['ev_1'],
            riskNotes: [],
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const repository = {
      getNextVersion: jest.fn(() => Promise.resolve(2)),
      create: jest.fn((input) =>
        Promise.resolve({
          id: 'draft_1',
          ...input,
          createdAt: new Date('2026-08-24T10:00:00.000Z'),
          updatedAt: new Date('2026-08-24T10:00:00.000Z'),
        }),
      ),
    } as unknown as ContentDraftRepository;
    const service = new ContentGenerationAgentService(workflowEngine, repository);

    const result = await service.generate({
      contentTask: createContentTask(),
      accountPersona: 'AI 产品观察账号',
      contentRules: '必须基于证据表达。',
      evidence: [createEvidence()],
      userInstruction: '语气更简洁。',
    });

    expect(workflowEngine.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'content_generation',
        maxSteps: 4,
      }),
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        contentTaskId: 'ctask_1',
        version: 2,
        evidenceRefs: ['ev_1'],
        userInstruction: '语气更简洁。',
      }),
    );
    expect(result.body).toContain('OpenAI');
  });

  it('rejects generation without evidence', async () => {
    const service = new ContentGenerationAgentService(
      {
        run: jest.fn(),
      } as unknown as AgentWorkflowEngine,
      {
        getNextVersion: jest.fn(),
        create: jest.fn(),
      } as unknown as ContentDraftRepository,
    );

    await expect(
      service.generate({
        contentTask: createContentTask(),
        accountPersona: 'AI 产品观察账号',
        contentRules: '必须基于证据表达。',
        evidence: [],
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: 'CONTENT_GENERATION_EVIDENCE_REQUIRED',
      }),
    );
  });
});

function createContentTask(): ContentTask {
  return {
    id: 'ctask_1',
    targetType: 'opportunity',
    targetId: 'opp_1',
    accountId: 'acct_1',
    contentType: 'short_post',
    contentGoal: '解释事件影响。',
    angle: '产品观察角度',
    constraints: ['引用证据'],
    evidenceRefs: ['ev_1'],
    status: 'confirmed',
    createdAt: new Date('2026-08-24T10:00:00.000Z'),
    updatedAt: new Date('2026-08-24T10:00:00.000Z'),
  };
}

function createEvidence(): EvidenceItem {
  return {
    id: 'ev_1',
    signalId: 'sig_1',
    sourceTool: null,
    sourceType: 'post',
    sourceItemId: 'sig_1',
    claim: 'OpenAI 发布新模型。',
    text: 'OpenAI 发布新模型。',
    url: 'https://x.com/OpenAI/status/1',
    author: 'OpenAI',
    publishedAt: new Date('2026-08-24T10:00:00.000Z'),
    observedAt: new Date('2026-08-24T10:10:00.000Z'),
    metrics: null,
    confidence: 'high',
    rawRef: 'raw_1',
    metadata: null,
    createdAt: new Date('2026-08-24T10:10:00.000Z'),
    updatedAt: new Date('2026-08-24T10:10:00.000Z'),
  };
}
