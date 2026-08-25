import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import {
  ModelProvider,
  ModelProviderInput,
} from './model-provider.interface';
import { AgentStepOutput } from '../workflow-engine/agent-workflow-engine.interface';

@Injectable()
export class UnconfiguredModelProvider implements ModelProvider {
  async completeStructured(
    input: ModelProviderInput,
  ): Promise<AgentStepOutput> {
    throw new DomainError(
      `Model provider is not configured for agent: ${input.agentType}`,
      'MODEL_PROVIDER_NOT_CONFIGURED',
      {
        agentType: input.agentType,
      },
    );
  }
}
