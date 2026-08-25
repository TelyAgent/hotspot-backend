import { Inject, Injectable } from '@nestjs/common';
import { AGENT_WORKFLOW_ENGINE } from '../../agent/agent.tokens';
import { AgentWorkflowEngine } from '../../agent/workflow-engine/agent-workflow-engine.interface';

@Injectable()
export class FutureEventDiscoveryAgentService {
  constructor(
    @Inject(AGENT_WORKFLOW_ENGINE)
    private readonly workflowEngine: AgentWorkflowEngine,
  ) {}

  async discover(input: { instruction: string; domains: string[] }) {
    return this.workflowEngine.run({
      agentType: 'future_event_discovery',
      goal: {
        instruction: input.instruction,
        domains: input.domains,
      },
      maxSteps: 5,
    });
  }
}
