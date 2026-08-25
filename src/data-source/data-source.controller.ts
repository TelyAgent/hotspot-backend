import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JsonObject } from '../common/types/json.type';
import { parseTake } from '../common/utils/request.util';
import { DataSourcePluginRegistry } from './registry/data-source-plugin.registry';
import { CollectionRunRepository } from './runner/collection-run.repository';
import { CollectionRunnerService } from './runner/collection-runner.service';

@Controller('data-sources')
export class DataSourceController {
  constructor(
    private readonly registry: DataSourcePluginRegistry,
    private readonly runner: CollectionRunnerService,
    private readonly collectionRunRepository: CollectionRunRepository,
  ) {}

  @Get('plugins')
  listPlugins() {
    return this.registry.list().map((plugin) => ({
      id: plugin.id,
      name: plugin.name,
      platform: plugin.platform,
      capabilities: plugin.capabilities,
    }));
  }

  @Get('runs')
  listRuns(@Query('take') take?: string) {
    return this.collectionRunRepository.findMany({
      take: parseTake(take),
    });
  }

  @Post('collect')
  collect(@Body() body: Record<string, unknown>) {
    return this.runner.run({
      id: String(body.id ?? `collection_job_${randomUUID()}`),
      pluginId: String(body.pluginId),
      capabilityId: String(body.capabilityId),
      params: toJsonObject(body.params),
      observedAt: body.observedAt ? new Date(String(body.observedAt)) : undefined,
    });
  }
}

function toJsonObject(value: unknown): JsonObject {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as JsonObject;
  }

  return {};
}
