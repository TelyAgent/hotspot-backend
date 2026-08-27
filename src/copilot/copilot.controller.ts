import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ToolRegistryService } from '../agent/tool-registry/tool-registry.service';
import { DomainError } from '../common/errors/domain-error';
import { JsonObject } from '../common/types/json.type';
import { CopilotService } from './copilot.service';
import {
  CopilotActionExecutionResponse,
  CopilotChatResponse,
} from './copilot.types';

@Controller('copilot')
export class CopilotController {
  constructor(
    private readonly copilotService: CopilotService,
    private readonly toolRegistry: ToolRegistryService,
  ) {}

  @Post('chat')
  chat(@Body() body: Record<string, unknown>): Promise<CopilotChatResponse> {
    return this.withDomainErrors(() =>
      this.copilotService.chat({
        sessionId: getString(body.sessionId) ?? undefined,
        tenantId: getString(body.tenantId) ?? 'default',
        userId: getString(body.userId) ?? 'anonymous',
        client: getString(body.client) ?? 'unknown',
        message: getString(body.message) ?? '',
        context: getJsonObject(body.context) ?? {},
      }),
    );
  }

  @Post('actions/:actionId/confirm')
  confirmAction(
    @Param('actionId') actionId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<CopilotActionExecutionResponse> {
    return this.withDomainErrors(() =>
      this.copilotService.confirmAction(actionId, {
        confirmedBy: getString(body.confirmedBy) ?? 'anonymous',
      }),
    );
  }

  @Post('actions/:actionId/reject')
  rejectAction(
    @Param('actionId') actionId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<CopilotActionExecutionResponse> {
    return this.withDomainErrors(() =>
      this.copilotService.rejectAction({
        actionId,
        rejectedBy: getString(body.rejectedBy) ?? 'anonymous',
        reason: getString(body.reason) ?? undefined,
      }),
    );
  }

  @Get('tools')
  listTools() {
    return {
      items: this.toolRegistry.list().map((tool) => ({
        name: tool.name,
        description: tool.description,
        permission: tool.permission,
        inputSchema: tool.inputSchema ?? null,
        outputSchema: tool.outputSchema ?? null,
        fieldSelection: tool.fieldSelection ?? null,
        limits: tool.limits ?? null,
      })),
    };
  }

  private async withDomainErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof DomainError) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            message: error.message,
            code: error.code,
            details: error.details,
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      throw error;
    }
  }
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getJsonObject(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}
