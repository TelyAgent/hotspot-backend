import { Body, Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
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
  async executeTool(
    @Body() body: Record<string, unknown>,
  ): Promise<AssistantToolExecutionResponse> {
    try {
      return await this.assistantService.executeTool({
        tool: String(body.tool ?? '') as AssistantToolName,
        arguments:
          typeof body.arguments === 'object' &&
          body.arguments !== null &&
          !Array.isArray(body.arguments)
            ? (body.arguments as JsonObject)
            : {},
      });
    } catch (error) {
      if (error instanceof DomainError) {
        throw new HttpException({
          statusCode: HttpStatus.BAD_REQUEST,
          message: error.message,
          code: error.code,
          details: error.details,
        }, HttpStatus.BAD_REQUEST);
      }
      throw error;
    }
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
