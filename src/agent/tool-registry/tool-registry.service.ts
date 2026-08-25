import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { AgentToolDefinition } from './agent-tool.interface';

@Injectable()
export class ToolRegistryService {
  private readonly tools = new Map<string, AgentToolDefinition>();

  register(tool: AgentToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new DomainError(
        `Agent tool already registered: ${tool.name}`,
        'AGENT_TOOL_DUPLICATED',
        {
          toolName: tool.name,
        },
      );
    }

    this.tools.set(tool.name, tool);
  }

  get(toolName: string): AgentToolDefinition {
    const tool = this.tools.get(toolName);

    if (!tool) {
      throw new DomainError(
        `Agent tool not found: ${toolName}`,
        'AGENT_TOOL_NOT_FOUND',
        {
          toolName,
        },
      );
    }

    return tool;
  }

  list(): AgentToolDefinition[] {
    return [...this.tools.values()];
  }
}
