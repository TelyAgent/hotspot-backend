import { Body, Controller, Post } from '@nestjs/common';
import { JsonObject } from '../common/types/json.type';
import { AssistantService } from './assistant.service';
import {
  AssistantChatContext,
  AssistantChatResponse,
  AssistantToolExecutionResponse,
  AssistantToolName,
} from './assistant.types';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post('chat')
  chat(@Body() body: Record<string, unknown>): Promise<AssistantChatResponse> {
    return this.assistantService.chat({
      message: typeof body.message === 'string' ? body.message : '',
      context: normalizeContext(body.context),
    });
  }

  @Post('tool-executions')
  executeTool(
    @Body() body: Record<string, unknown>,
  ): Promise<AssistantToolExecutionResponse> {
    return this.assistantService.executeTool({
      tool: String(body.tool ?? '') as AssistantToolName,
      arguments:
        typeof body.arguments === 'object' &&
        body.arguments !== null &&
        !Array.isArray(body.arguments)
          ? (body.arguments as JsonObject)
          : {},
    });
  }
}

function normalizeContext(value: unknown): AssistantChatContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      page: 'unknown',
    };
  }

  const context = value as Record<string, unknown>;
  return {
    page: getString(context.page) ?? 'unknown',
    setting: getString(context.setting) ?? undefined,
    region: getString(context.region) ?? undefined,
    event: getString(context.event) ?? undefined,
  };
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
