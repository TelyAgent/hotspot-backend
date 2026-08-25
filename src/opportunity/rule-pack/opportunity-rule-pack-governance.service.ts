import { Inject, Injectable } from '@nestjs/common';
import { MODEL_PROVIDER } from '../../agent/agent.tokens';
import { ModelProvider } from '../../agent/model-provider/model-provider.interface';
import { DomainError } from '../../common/errors/domain-error';
import { JsonObject } from '../../common/types/json.type';
import { OpportunityMiningOrchestratorService } from '../mining/opportunity-mining-orchestrator.service';
import { OpportunityMiningSignalSelectorService } from '../mining/opportunity-mining-signal-selector.service';
import { OpportunityRepository } from '../opportunity.repository';
import { OpportunityRulePackLoaderService } from './opportunity-rule-pack-loader.service';
import {
  OpportunityRuleDocument,
  OpportunityRulePackSnapshot,
} from './opportunity-rule-pack.types';

@Injectable()
export class OpportunityRulePackGovernanceService {
  constructor(
    private readonly repository: OpportunityRepository,
    private readonly loader: OpportunityRulePackLoaderService,
    private readonly orchestrator: OpportunityMiningOrchestratorService,
    private readonly signalSelector: OpportunityMiningSignalSelectorService,
    @Inject(MODEL_PROVIDER)
    private readonly modelProvider: ModelProvider,
  ) {}

  getActiveRulePack(): Promise<OpportunityRulePackSnapshot> {
    return this.loader.loadActiveRulePack();
  }

  async createDraft(input: {
    description?: string;
    documents?: Array<{
      id: string;
      markdown: string;
      title?: string;
    }>;
  }) {
    const active = await this.loader.loadActiveRulePack();
    const documents = this.mergeDocuments(active.documents, input.documents ?? []);
    const version = (await this.repository.findLatestRulePackVersion()) + 1;

    return this.repository.createRulePack({
      version,
      status: 'draft',
      basePath: active.basePath,
      manifest: {
        documents: documents.map((document) => ({
          id: document.id,
          title: document.title,
          path: document.path,
          markdown: document.markdown,
        })),
      },
      description: input.description ?? 'AI 修改规则包草稿',
      generatedBy: 'agent',
    });
  }

  activate(id: string) {
    return this.repository.activateRulePack(id);
  }

  async reset() {
    const preset = await this.loader.loadPresetRulePack();
    const version = (await this.repository.findLatestRulePackVersion()) + 1;

    return this.repository.createRulePack({
      version,
      status: 'active',
      basePath: preset.basePath,
      manifest: {
        documents: preset.documents.map((document) => ({
          id: document.id,
          title: document.title,
          path: document.path,
          markdown: document.markdown,
        })),
      },
      description: '重置为系统预设热点挖掘规则包',
      generatedBy: 'system',
    });
  }

  async testRun(input: {
    signalId?: string;
    rulePackId?: string;
    instruction?: string;
  }) {
    const ruleDocuments = await this.resolveRuleDocuments(input.rulePackId);
    const signalId = input.signalId?.trim() || (await this.selectDefaultTestSignalId());

    const result = await this.orchestrator.run({
      goal: {
        ...this.orchestrator.createGoal({
          instruction: input.instruction ?? '使用指定规则包测试这条 Signal 的热点挖掘结果。',
          seedSignalIds: [signalId],
          writeMode: 'suggest_only',
        }),
        ruleDocuments,
      },
    });

    return {
      status: 'passed',
      result,
    };
  }

  async createAiDraft(input: {
    documentId: string;
    instruction: string;
  }) {
    const active = await this.loader.loadActiveRulePack();
    const document = active.documents.find((item) => item.id === input.documentId);
    if (!document) {
      throw new DomainError(
        `Opportunity rule document missing from pack: ${input.documentId}`,
        'OPPORTUNITY_RULE_DOCUMENT_MISSING',
        { id: input.documentId },
      );
    }

    const output = await this.modelProvider.completeStructured({
      agentType: 'opportunity_rule_pack_editor',
      goal: {
        documentId: document.id,
        title: document.title,
        instruction: input.instruction,
        currentMarkdown: document.markdown,
        outputContract: {
          markdown: '修改后的完整 Markdown 文档，必须是中文，不要省略未修改部分。',
          changeSummary: '中文修改摘要。',
          suggestions: '字符串数组，说明启用前应注意的测试建议或风险。',
        },
      },
      stepIndex: 0,
      evidence: [],
      toolResults: [],
      availableTools: [],
    });

    if (output.type !== 'final_decision') {
      throw new DomainError(
        'Opportunity rule pack AI editor must return a final decision.',
        'OPPORTUNITY_RULE_AI_DRAFT_INVALID',
      );
    }

    const markdown = getMarkdownFromDecision(output.decision);
    if (!markdown?.trim()) {
      throw new DomainError(
        'Opportunity rule pack AI editor returned empty markdown.',
        'OPPORTUNITY_RULE_AI_DRAFT_EMPTY',
      );
    }

    return {
      document: {
        ...document,
        markdown,
      },
      changeSummary: getString(output.decision.changeSummary) ?? 'AI 已修改规则文档。',
      suggestions: getStringArray(output.decision.suggestions),
    };
  }

  private mergeDocuments(
    activeDocuments: OpportunityRuleDocument[],
    patches: Array<{
      id: string;
      markdown: string;
      title?: string;
    }>,
  ): OpportunityRuleDocument[] {
    const patchById = new Map(patches.map((patch) => [patch.id, patch]));

    return activeDocuments.map((document) => {
      const patch = patchById.get(document.id);
      if (!patch) {
        return document;
      }

      if (!patch.markdown.trim()) {
        throw new DomainError(
          `Opportunity rule document cannot be empty: ${document.id}`,
          'OPPORTUNITY_RULE_DOCUMENT_EMPTY',
          { id: document.id },
        );
      }

      return {
        ...document,
        title: patch.title?.trim() || document.title,
        markdown: patch.markdown,
      };
    });
  }

  private async resolveRuleDocuments(rulePackId?: string) {
    if (!rulePackId) {
      return (await this.loader.loadActiveRulePack()).documents;
    }

    const record = await this.repository.findRulePackById(rulePackId);
    if (!record) {
      throw new DomainError(
        `Opportunity rule pack not found: ${rulePackId}`,
        'OPPORTUNITY_RULE_PACK_NOT_FOUND',
        { id: rulePackId },
      );
    }

    const manifest = record.manifest as JsonObject;
    const documents = manifest.documents;
    if (!Array.isArray(documents)) {
      throw new DomainError(
        'Opportunity rule pack manifest missing documents.',
        'OPPORTUNITY_RULE_PACK_MANIFEST_INVALID',
      );
    }

    return documents.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new DomainError(
          'Opportunity rule pack document manifest item is invalid.',
          'OPPORTUNITY_RULE_PACK_DOCUMENT_INVALID',
        );
      }

      return {
        id: String(item.id),
        title: String(item.title),
        path: String(item.path),
        markdown: String(item.markdown),
      };
    });
  }

  private async selectDefaultTestSignalId(): Promise<string> {
    const signals = await this.signalSelector.select({
      now: new Date(),
      take: 1,
    });
    const signal = signals[0];
    if (!signal) {
      throw new DomainError(
        'No recent Signal is available for opportunity rule pack test run.',
        'OPPORTUNITY_RULE_TEST_SIGNAL_NOT_FOUND',
      );
    }

    return signal.id;
  }
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getMarkdownFromDecision(decision: JsonObject): string | undefined {
  const direct =
    getString(decision.markdown) ??
    getString(decision.updatedMarkdown) ??
    getString(decision.fullMarkdown);
  if (direct) {
    return direct;
  }

  const document = decision.document;
  if (document && typeof document === 'object' && !Array.isArray(document)) {
    return getString((document as JsonObject).markdown);
  }

  return undefined;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
