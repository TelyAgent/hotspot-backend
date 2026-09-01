import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpToolRegistryService } from './mcp-tool-registry.service';
import { McpErrorResponseBody, McpJsonRpcRequest } from './mcp.types';

@Controller('mcp')
@UseGuards(McpAuthGuard)
export class McpController {
  constructor(private readonly registry: McpToolRegistryService) {}

  @Post()
  @HttpCode(200)
  async handle(@Body() body: McpJsonRpcRequest) {
    try {
      if (body.method === 'tools/list') {
        return {
          jsonrpc: '2.0',
          id: body.id ?? null,
          result: {
            tools: this.registry.listTools(),
          },
        };
      }

      if (body.method === 'tools/call') {
        return {
          jsonrpc: '2.0',
          id: body.id ?? null,
          result: await this.registry.callTool(body.params?.name ?? '', body.params?.arguments ?? {}),
        };
      }

      return this.error(body.id, {
        code: 'MCP_METHOD_NOT_SUPPORTED',
        message: '当前 MCP endpoint 仅支持 tools/list 和 tools/call。',
        retryable: false,
        suggestion: '请使用 MCP tools/list 获取工具定义，再调用 tools/call。',
      });
    } catch (error) {
      return this.error(body.id, this.toMcpError(error));
    }
  }

  private error(id: string | number | null | undefined, error: McpErrorResponseBody) {
    return {
      jsonrpc: '2.0',
      id: id ?? null,
      error,
    };
  }

  private toMcpError(error: unknown): McpErrorResponseBody {
    if (error instanceof DomainError) {
      return {
        code: error.code,
        message: error.message,
        retryable: false,
        details: error.details,
      };
    }

    const status = typeof error === 'object' && error && 'getStatus' in error ? (error as { getStatus: () => number }).getStatus() : 500;
    if (status === 404) {
      return {
        code: 'MCP_TOOL_NOT_FOUND',
        message: '未找到指定 MCP 工具。',
        retryable: false,
        suggestion: '请先调用 tools/list 获取可用工具名称。',
      };
    }

    return {
      code: 'MCP_INTERNAL_ERROR',
      message: 'MCP 工具调用失败。',
      retryable: true,
      suggestion: '请稍后重试；如果持续失败，请联系系统管理员查看后端日志。',
    };
  }
}
