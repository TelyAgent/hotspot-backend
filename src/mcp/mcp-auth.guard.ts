import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const configuredKey = this.configService.get<string>('HOTSPOT_MCP_API_KEY');
    if (!configuredKey) {
      throw new UnauthorizedException('MCP API key is not configured.');
    }

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const authorization = request.headers.authorization;
    const header = Array.isArray(authorization) ? authorization[0] : authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';

    if (token !== configuredKey) {
      throw new UnauthorizedException('MCP API key is invalid.');
    }

    return true;
  }
}
