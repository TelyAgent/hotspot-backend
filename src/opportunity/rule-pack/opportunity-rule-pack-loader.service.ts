import { Injectable, Optional } from '@nestjs/common';
import { access, readFile } from 'fs/promises';
import { join } from 'path';
import { DomainError } from '../../common/errors/domain-error';
import { JsonObject, JsonValue } from '../../common/types/json.type';
import { OpportunityRepository } from '../opportunity.repository';
import {
  OpportunityRuleDocument,
  OpportunityRulePackSnapshot,
  OpportunityRuleRoute,
  SelectOpportunityRuleDocumentsInput,
} from './opportunity-rule-pack.types';

const DEFAULT_RULE_PACK_BASE_PATH = 'docs/runtime/opportunity-mining';

const DEFAULT_DOCUMENT_IDS = [
  'README',
  'global-principles',
  'source-routing',
  'x-trend-rules',
  'topic-watch-rules',
  'youtube-video-rules',
  'future-event-rules',
  'product-angle-rules',
  'dedupe-and-evidence-rules',
  'output-policy',
];

@Injectable()
export class OpportunityRulePackLoaderService {
  constructor(
    @Optional()
    private readonly opportunityRepository?: OpportunityRepository,
  ) {}

  async loadActiveRulePack(): Promise<OpportunityRulePackSnapshot> {
    const activeRulePack = await this.opportunityRepository?.findActiveRulePack();
    if (activeRulePack) {
      return this.createSnapshotFromRecord(activeRulePack);
    }

    return this.loadPresetRulePack();
  }

  async loadPresetRulePack(): Promise<OpportunityRulePackSnapshot> {
    const basePath = await this.resolvePresetRulePackBasePath();
    const documents = await Promise.all(
      DEFAULT_DOCUMENT_IDS.map((id) => this.loadDocument(basePath, id)),
    );

    return {
      id: 'preset-opportunity-rule-pack-v1',
      version: 1,
      status: 'active',
      basePath,
      documents,
      routes: this.parseRoutes(this.requireDocument(documents, 'source-routing')),
    };
  }

  selectDocuments(input: SelectOpportunityRuleDocumentsInput): OpportunityRuleDocument[] {
    const route =
      input.rulePack.routes.find((item) => item.signalType === input.signalType) ??
      input.rulePack.routes.find((item) => item.signalType === 'default');

    const documentIds = route?.documents ?? [
      'global-principles',
      'source-routing',
      'dedupe-and-evidence-rules',
      'output-policy',
    ];

    return documentIds.map((id) => this.requireDocument(input.rulePack.documents, id));
  }

  private async loadDocument(
    basePath: string,
    id: string,
  ): Promise<OpportunityRuleDocument> {
    const path = join(basePath, `${id}.md`);
    const markdown = await readFile(path, 'utf8').catch((error: unknown) => {
      throw new DomainError(
        `Opportunity rule document not found: ${id}`,
        'OPPORTUNITY_RULE_DOCUMENT_NOT_FOUND',
        {
          id,
          path,
          cause: error instanceof Error ? error.message : String(error),
        },
      );
    });

    return {
      id,
      title: this.extractTitle(markdown) ?? id,
      path,
      markdown,
    };
  }

  private async resolvePresetRulePackBasePath(): Promise<string> {
    const candidates = [
      join(process.cwd(), DEFAULT_RULE_PACK_BASE_PATH),
      join(__dirname, '..', '..', '..', DEFAULT_RULE_PACK_BASE_PATH),
    ];

    for (const candidate of candidates) {
      const readmePath = join(candidate, 'README.md');
      const exists = await access(readmePath)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        return candidate;
      }
    }

    return candidates[0];
  }

  private requireDocument(
    documents: OpportunityRuleDocument[],
    id: string,
  ): OpportunityRuleDocument {
    const document = documents.find((item) => item.id === id);
    if (!document) {
      throw new DomainError(
        `Opportunity rule document missing from pack: ${id}`,
        'OPPORTUNITY_RULE_DOCUMENT_MISSING',
        { id },
      );
    }

    return document;
  }

  private extractTitle(markdown: string): string | undefined {
    const match = markdown.match(/^#\s+(.+)$/m);
    return match?.[1]?.trim();
  }

  private parseRoutes(sourceRouting: OpportunityRuleDocument): OpportunityRuleRoute[] {
    const yamlBlock = sourceRouting.markdown.match(/```yaml\n([\s\S]*?)```/)?.[1];
    if (!yamlBlock) {
      return [];
    }

    const routeBodies = new Map<string, string[]>();
    let currentSignalType: string | undefined;

    for (const line of yamlBlock.split('\n')) {
      const routeMatch = line.match(/^  ([a-zA-Z0-9_]+):\s*$/);
      if (routeMatch) {
        currentSignalType = routeMatch[1];
        routeBodies.set(currentSignalType, []);
        continue;
      }

      if (currentSignalType) {
        routeBodies.get(currentSignalType)?.push(line);
      }
    }

    return Array.from(routeBodies.entries()).map(([signalType, lines]) => {
      const body = lines.join('\n');
      return {
        signalType,
        documents: this.parseList(body, 'documents'),
        lookbackHours: this.parseNumber(body, 'lookbackHours', 24),
        batchLimit: this.parseNumber(body, 'batchLimit', 10),
        priority: this.parsePriority(body),
      };
    });
  }

  private parseList(body: string, key: string): string[] {
    const lines = body.split('\n');
    const startIndex = lines.findIndex((line) => line.trim() === `${key}:`);
    if (startIndex === -1) {
      return [];
    }

    const items: string[] = [];
    for (const line of lines.slice(startIndex + 1)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      if (!trimmed.startsWith('- ')) {
        break;
      }

      items.push(trimmed.slice(2).trim());
    }

    return items;
  }

  private parseNumber(body: string, key: string, fallback: number): number {
    const match = body.match(new RegExp(`^\\s+${key}:\\s+(\\d+)\\s*$`, 'm'));
    return match ? Number(match[1]) : fallback;
  }

  private parsePriority(body: string): OpportunityRuleRoute['priority'] {
    const match = body.match(/^\s+priority:\s+([a-z]+)\s*$/m);
    if (match?.[1] === 'high' || match?.[1] === 'medium' || match?.[1] === 'low') {
      return match[1];
    }

    return 'low';
  }

  private createSnapshotFromRecord(record: {
    id: string;
    version: number;
    status: string;
    basePath: string;
    manifest: JsonObject;
  }): OpportunityRulePackSnapshot {
    const documents = this.parseManifestDocuments(record.manifest);

    return {
      id: record.id,
      version: record.version,
      status:
        record.status === 'draft' ||
        record.status === 'active' ||
        record.status === 'archived'
          ? record.status
          : 'active',
      basePath: record.basePath,
      documents,
      routes: this.parseRoutes(this.requireDocument(documents, 'source-routing')),
    };
  }

  private parseManifestDocuments(manifest: JsonObject): OpportunityRuleDocument[] {
    const rawDocuments = manifest.documents;
    if (!Array.isArray(rawDocuments)) {
      throw new DomainError(
        'Opportunity rule pack manifest missing documents.',
        'OPPORTUNITY_RULE_PACK_MANIFEST_INVALID',
      );
    }

    return rawDocuments.map((item) => {
      if (!isJsonObject(item)) {
        throw new DomainError(
          'Opportunity rule pack document manifest item is invalid.',
          'OPPORTUNITY_RULE_PACK_DOCUMENT_INVALID',
        );
      }

      return {
        id: requireString(item.id, 'id'),
        title: requireString(item.title, 'title'),
        path: requireString(item.path, 'path'),
        markdown: requireString(item.markdown, 'markdown'),
      };
    });
  }
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: JsonValue | undefined, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new DomainError(
      `Opportunity rule pack document missing field: ${field}`,
      'OPPORTUNITY_RULE_PACK_DOCUMENT_INVALID',
      { field },
    );
  }

  return value;
}
