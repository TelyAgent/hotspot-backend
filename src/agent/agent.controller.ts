import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { JsonObject } from '../common/types/json.type';
import { parseTake } from '../common/utils/request.util';
import { AGENT_WORKFLOW_ENGINE } from './agent.tokens';
import { AgentRunLogService } from './run-log/agent-run-log.service';
import { ToolRegistryService } from './tool-registry/tool-registry.service';
import { AgentWorkflowEngine } from './workflow-engine/agent-workflow-engine.interface';

@Controller('agent')
export class AgentController {
  constructor(
    private readonly agentRunLogService: AgentRunLogService,
    private readonly toolRegistry: ToolRegistryService,
    @Inject(AGENT_WORKFLOW_ENGINE)
    private readonly workflowEngine: AgentWorkflowEngine,
  ) {}

  @Get('runs')
  listRuns(
    @Query('agentType') agentType?: string,
    @Query('status') status?: string,
    @Query('take') take?: string,
  ) {
    return this.agentRunLogService.listRuns({
      agentType,
      status,
      take: parseTake(take),
    });
  }

  @Get('runs/:id')
  findRunById(@Param('id') id: string) {
    return this.agentRunLogService.findRunById(id);
  }

  @Get('runs/:id/steps')
  listSteps(@Param('id') id: string) {
    return this.agentRunLogService.listSteps(id);
  }

  @Get('runs/:id/tool-calls')
  listToolCalls(@Param('id') id: string) {
    return this.agentRunLogService.listToolCalls(id);
  }

  @Get('tools')
  listTools() {
    return this.toolRegistry.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      permission: tool.permission,
      inputSchema: tool.inputSchema ?? null,
      outputSchema: tool.outputSchema ?? null,
      fieldSelection: tool.fieldSelection ?? null,
      limits: tool.limits ?? null,
    }));
  }

  @Post('playground/run')
  runPlayground(@Body() body: Record<string, unknown>) {
    return this.workflowEngine.run({
      agentType: String(body.agentType ?? 'playground'),
      goal:
        typeof body.goal === 'object' && body.goal !== null
          ? (body.goal as JsonObject)
          : {},
      maxSteps:
        typeof body.maxSteps === 'number'
          ? Math.min(Math.max(Math.trunc(body.maxSteps), 1), 10)
          : 5,
    });
  }
}
