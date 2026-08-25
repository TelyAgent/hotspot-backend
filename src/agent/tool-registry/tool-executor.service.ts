import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { JsonObject, JsonValue } from '../../common/types/json.type';
import { AgentRunLogService } from '../run-log/agent-run-log.service';
import {
  ExecuteToolInput,
  ExecuteToolResult,
} from './agent-tool.interface';
import { ToolRegistryService } from './tool-registry.service';

@Injectable()
export class ToolExecutorService {
  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly agentRunLogService: AgentRunLogService,
  ) {}

  async execute(input: ExecuteToolInput): Promise<ExecuteToolResult> {
    const tool = this.toolRegistry.get(input.toolName);
    this.validateRequestedFields(input);

    const startedAt = new Date();

    try {
      const output = this.applyFieldSelection(
        await tool.execute(input.arguments),
        input.requestedFields ?? tool.fieldSelection?.defaultFields,
      );
      const finishedAt = new Date();

      await this.agentRunLogService.recordToolCall({
        runId: input.runId,
        toolName: input.toolName,
        status: 'succeeded',
        input: this.createLoggedInput(input),
        output,
        startedAt,
        finishedAt,
      });

      return {
        toolName: input.toolName,
        output,
      };
    } catch (error) {
      const finishedAt = new Date();
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown tool error';

      await this.agentRunLogService.recordToolCall({
        runId: input.runId,
        toolName: input.toolName,
        status: 'failed',
        input: this.createLoggedInput(input),
        errorMessage,
        startedAt,
        finishedAt,
      });

      throw error;
    }
  }

  private validateRequestedFields(input: ExecuteToolInput): void {
    if (!input.requestedFields?.length) {
      return;
    }

    const tool = this.toolRegistry.get(input.toolName);

    if (!tool.fieldSelection?.supported) {
      throw new DomainError(
        `Tool does not support field selection: ${input.toolName}`,
        'AGENT_TOOL_FIELD_SELECTION_UNSUPPORTED',
        {
          toolName: input.toolName,
        },
      );
    }

    const deniedFields = input.requestedFields.filter(
      (field) => !tool.fieldSelection?.allowedFields.includes(field),
    );

    if (deniedFields.length > 0) {
      throw new DomainError(
        `Tool field selection denied: ${input.toolName}`,
        'AGENT_TOOL_FIELD_DENIED',
        {
          toolName: input.toolName,
          deniedFields,
        },
      );
    }
  }

  private createLoggedInput(input: ExecuteToolInput): JsonObject {
    return {
      arguments: input.arguments,
      requestedFields: input.requestedFields ?? [],
    };
  }

  private applyFieldSelection(
    output: JsonValue,
    fields?: string[],
  ): JsonValue {
    if (!fields?.length) {
      return output;
    }

    if (Array.isArray(output)) {
      return output.map((item) => this.pickFields(item, fields));
    }

    if (this.isJsonObject(output) && Array.isArray(output.items)) {
      return {
        ...output,
        items: output.items.map((item) => this.pickFields(item, fields)),
      };
    }

    return this.pickFields(output, fields);
  }

  private pickFields(value: JsonValue, fields: string[]): JsonValue {
    if (!this.isJsonObject(value)) {
      return value;
    }

    return fields.reduce<JsonObject>((result, field) => {
      if (field in value) {
        result[field] = value[field];
      }

      return result;
    }, {});
  }

  private isJsonObject(value: JsonValue): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
