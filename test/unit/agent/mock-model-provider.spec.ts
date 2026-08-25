import { DomainError } from '../../../src/common/errors/domain-error';
import { MockModelProvider } from '../../../src/agent/model-provider/mock-model-provider';

describe('MockModelProvider', () => {
  it('returns structured outputs in order', async () => {
    const provider = new MockModelProvider([
      {
        type: 'final_decision',
        decision: {
          decision: 'ignore',
        },
      },
    ]);

    await expect(
      provider.completeStructured({
        agentType: 'opportunity',
        goal: {},
        stepIndex: 0,
        evidence: [],
        toolResults: [],
      }),
    ).resolves.toEqual({
      type: 'final_decision',
      decision: {
        decision: 'ignore',
      },
    });
  });

  it('throws when no outputs remain', async () => {
    const provider = new MockModelProvider([]);

    await expect(
      provider.completeStructured({
        agentType: 'opportunity',
        goal: {},
        stepIndex: 0,
        evidence: [],
        toolResults: [],
      }),
    ).rejects.toThrow(DomainError);
  });
});
