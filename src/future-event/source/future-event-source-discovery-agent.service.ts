import { Inject, Injectable } from '@nestjs/common';
import { AGENT_WORKFLOW_ENGINE } from '../../agent/agent.tokens';
import { AgentWorkflowEngine } from '../../agent/workflow-engine/agent-workflow-engine.interface';
import { DomainError } from '../../common/errors/domain-error';
import { JsonObject } from '../../common/types/json.type';
import { DataSourcePluginRegistry } from '../../data-source/registry/data-source-plugin.registry';
import { FutureEventRepository } from '../future-event.repository';
import {
  FutureEventSourcePlan,
  FutureEventSourcePlanMissingSource,
  FutureEventSourcePlanSource,
} from '../future-event.types';

@Injectable()
export class FutureEventSourceDiscoveryAgentService {
  constructor(
    @Inject(AGENT_WORKFLOW_ENGINE)
    private readonly workflowEngine: AgentWorkflowEngine,
    private readonly pluginRegistry: DataSourcePluginRegistry,
    private readonly futureEventRepository: FutureEventRepository,
  ) {}

  async generatePlanFromStrategy(input: {
    strategyMarkdown: string;
    activate?: boolean;
  }): Promise<FutureEventSourcePlan> {
    const latestPlan = await this.futureEventRepository.findLatestSourcePlan();
    const nextVersion = (latestPlan?.version ?? 0) + 1;
    const result = await this.workflowEngine.run({
      agentType: 'future_event_source_discovery',
      goal: {
        strategyMarkdown: input.strategyMarkdown,
        availablePlugins: this.serializePlugins(),
        previousPlan: latestPlan ? this.serializePlan(latestPlan) : null,
        nextVersion,
      },
      maxSteps: 5,
    });

    if (result.status !== 'succeeded' || !result.result) {
      throw new DomainError(
        result.errorMessage ?? 'Future event source discovery agent failed.',
        'FUTURE_EVENT_SOURCE_DISCOVERY_AGENT_FAILED',
      );
    }

    const plan = this.parsePlan(result.result);
    const created = await this.futureEventRepository.createSourcePlan({
      version: nextVersion,
      status: 'draft',
      strategyMarkdown: input.strategyMarkdown,
      sources: plan.sources,
      missingSources: plan.missingSources,
      refreshPolicy: plan.refreshPolicy,
      reason: plan.reason,
      generatedBy: 'agent',
      agentRunId: result.runId,
    });

    if (input.activate) {
      return this.futureEventRepository.activateSourcePlan(created.id);
    }

    return created;
  }

  private serializePlugins() {
    return this.pluginRegistry.list().map((plugin) => ({
      pluginId: plugin.id,
      name: plugin.name,
      platform: plugin.platform,
      capabilities: plugin.capabilities.map((capability) => ({
        capabilityId: capability.id,
        name: capability.name,
        description: capability.description ?? null,
        inputSchema: capability.inputSchema ?? null,
      })),
    }));
  }

  private serializePlan(plan: FutureEventSourcePlan): JsonObject {
    return {
      id: plan.id,
      version: plan.version,
      status: plan.status,
      sources: plan.sources as unknown as JsonObject[],
      missingSources: plan.missingSources as unknown as JsonObject[],
      refreshPolicy: plan.refreshPolicy,
      reason: plan.reason,
    };
  }

  private parsePlan(value: unknown): {
    sources: FutureEventSourcePlanSource[];
    missingSources: FutureEventSourcePlanMissingSource[];
    refreshPolicy: JsonObject;
    reason: string;
  } {
    if (!isRecord(value)) {
      throw new DomainError(
        'Future event source plan must be an object.',
        'FUTURE_EVENT_SOURCE_PLAN_INVALID',
      );
    }

    const sources = Array.isArray(value.sources)
      ? value.sources.map(toSource).filter(isSource)
      : [];
    const missingSources = Array.isArray(value.missingSources)
      ? value.missingSources.map(toMissingSource).filter(isMissingSource)
      : [];
    const refreshPolicy = isRecord(value.refreshPolicy)
      ? (value.refreshPolicy as JsonObject)
      : {};
    const reason = getString(value.reason) ?? 'Agent 根据来源策略生成采集计划。';

    if (sources.length === 0 && missingSources.length === 0) {
      throw new DomainError(
        'Future event source plan has no executable or missing sources.',
        'FUTURE_EVENT_SOURCE_PLAN_EMPTY',
      );
    }

    return {
      sources,
      missingSources,
      refreshPolicy,
      reason,
    };
  }
}

function toSource(value: unknown): FutureEventSourcePlanSource | null {
  if (!isRecord(value)) return null;

  const pluginId = getString(value.pluginId);
  const capabilityId = getString(value.capabilityId);
  if (!pluginId || !capabilityId) return null;

  return {
    id: getString(value.id),
    pluginId,
    capabilityId,
    params: isRecord(value.params) ? (value.params as JsonObject) : {},
    reason: getString(value.reason) ?? 'Agent 选择该来源。',
  };
}

function toMissingSource(value: unknown): FutureEventSourcePlanMissingSource | null {
  if (!isRecord(value)) return null;
  const name = getString(value.name);
  const reason = getString(value.reason);
  return name && reason ? { name, reason } : null;
}

function isSource(
  value: FutureEventSourcePlanSource | null,
): value is FutureEventSourcePlanSource {
  return value !== null;
}

function isMissingSource(
  value: FutureEventSourcePlanMissingSource | null,
): value is FutureEventSourcePlanMissingSource {
  return value !== null;
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
