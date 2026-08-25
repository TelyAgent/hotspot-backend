import { DomainError } from '../../common/errors/domain-error';
import { AgentStepOutput } from '../workflow-engine/agent-workflow-engine.interface';
import {
  ModelProvider,
  ModelProviderInput,
} from './model-provider.interface';

export class MockModelProvider implements ModelProvider {
  private cursor = 0;
  readonly inputs: ModelProviderInput[] = [];

  constructor(private readonly outputs: AgentStepOutput[]) {}

  async completeStructured(
    input: ModelProviderInput,
  ): Promise<AgentStepOutput> {
    this.inputs.push(input);
    const output = this.outputs[this.cursor];

    if (!output) {
      throw new DomainError(
        'Mock model provider has no remaining outputs.',
        'MOCK_MODEL_OUTPUT_EXHAUSTED',
      );
    }

    this.cursor += 1;
    return output;
  }
}
