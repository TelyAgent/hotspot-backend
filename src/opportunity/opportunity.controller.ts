import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { parseTake } from '../common/utils/request.util';
import { JsonObject } from '../common/types/json.type';
import { OpportunityMiningOrchestratorService } from './mining/opportunity-mining-orchestrator.service';
import { OpportunityMiningSchedulerService } from './mining/opportunity-mining-scheduler.service';
import { OpportunityRepository } from './opportunity.repository';
import { OpportunityRulePackGovernanceService } from './rule-pack/opportunity-rule-pack-governance.service';

@Controller('opportunities')
export class OpportunityController {
  constructor(
    private readonly opportunityRepository: OpportunityRepository,
    private readonly miningOrchestrator: OpportunityMiningOrchestratorService,
    private readonly miningScheduler: OpportunityMiningSchedulerService,
    private readonly rulePackGovernance: OpportunityRulePackGovernanceService,
  ) {}

  @Get()
  list(@Query('status') status?: string, @Query('take') take?: string) {
    return this.opportunityRepository.listOpportunities({
      status,
      take: parseTake(take),
    });
  }

  @Get('events')
  listEvents(@Query('status') status?: string, @Query('take') take?: string) {
    return this.opportunityRepository.listEvents({
      status,
      take: parseTake(take),
    });
  }

  @Get('rule-pack')
  getRulePack() {
    return this.rulePackGovernance.getActiveRulePack();
  }

  @Post('rule-pack/draft')
  createRulePackDraft(@Body() body: Record<string, unknown>) {
    return this.rulePackGovernance.createDraft({
      description:
        typeof body.description === 'string' ? body.description : undefined,
      documents: this.parseRuleDocumentPatches(body.documents),
    });
  }

  @Post('rule-pack/ai-draft')
  createRulePackAiDraft(@Body() body: Record<string, unknown>) {
    return this.rulePackGovernance.createAiDraft({
      documentId: String(body.documentId ?? ''),
      instruction: String(body.instruction ?? ''),
    });
  }

  @Post('rule-pack/reset')
  resetRulePack() {
    return this.rulePackGovernance.reset();
  }

  @Post('rule-pack/test-run')
  testRunRulePack(@Body() body: Record<string, unknown>) {
    return this.rulePackGovernance.testRun({
      signalId:
        typeof body.signalId === 'string' && body.signalId.trim()
          ? body.signalId
          : undefined,
      rulePackId:
        typeof body.rulePackId === 'string' ? body.rulePackId : undefined,
      instruction:
        typeof body.instruction === 'string' ? body.instruction : undefined,
    });
  }

  @Post('rule-pack/:id/activate')
  activateRulePack(@Param('id') id: string) {
    return this.rulePackGovernance.activate(id);
  }

  @Get('mining-runs')
  listMiningRuns(
    @Query('status') status?: string,
    @Query('signalId') signalId?: string,
    @Query('take') take?: string,
  ) {
    return this.opportunityRepository.listMiningSignalRuns({
      status,
      signalId,
      take: parseTake(take),
    });
  }

  @Post('mine')
  async mine(@Body() body: Record<string, unknown>) {
    const seedSignalIds = this.parseStringArray(body.seedSignalIds);
    const seedEvidenceIds = this.parseStringArray(body.seedEvidenceIds);

    return this.miningOrchestrator.run({
      goal: this.miningOrchestrator.createGoal({
        instruction: String(body.instruction ?? '判断是否形成热点机会。'),
        seedSignalIds,
        seedEvidenceIds,
        sourceContext: this.parseJsonObject(body.sourceContext),
        writeMode: body.writeMode === 'allow_create' ? 'allow_create' : 'suggest_only',
        type:
          body.type === 'form_event' ||
          body.type === 'analyze_hot_topic' ||
          body.type === 'analyze_viral_content' ||
          body.type === 'future_event_response'
            ? body.type
            : 'detect_opportunity',
      }),
    });
  }

  @Post('mine-signal/:signalId')
  mineSignal(
    @Param('signalId') signalId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.miningOrchestrator.run({
      goal: this.miningOrchestrator.createGoal({
        instruction: String(body.instruction ?? '判断这条 Signal 是否形成热点机会。'),
        seedSignalIds: [signalId],
        writeMode: body.writeMode === 'allow_create' ? 'allow_create' : 'suggest_only',
        sourceContext: this.parseJsonObject(body.sourceContext),
        type:
          body.type === 'form_event' ||
          body.type === 'analyze_hot_topic' ||
          body.type === 'analyze_viral_content' ||
          body.type === 'future_event_response'
            ? body.type
            : 'detect_opportunity',
      }),
    });
  }

  @Post('mine-due')
  mineDue(@Body() body: Record<string, unknown>) {
    const now = this.parseDate(body.now) ?? new Date();
    return this.miningScheduler.runDueMining(now);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.opportunityRepository.findOpportunityById(id);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string) {
    return this.opportunityRepository.updateOpportunityStatus({
      id,
      status: 'confirmed',
    });
  }

  @Post(':id/ignore')
  ignore(@Param('id') id: string) {
    return this.opportunityRepository.updateOpportunityStatus({
      id,
      status: 'ignored',
    });
  }

  private parseStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private parseJsonObject(value: unknown): JsonObject | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as JsonObject)
      : undefined;
  }

  private parseDate(value: unknown): Date | undefined {
    if (typeof value !== 'string' || !value.trim()) {
      return undefined;
    }

    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : undefined;
  }

  private parseRuleDocumentPatches(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter(
        (
          item,
        ): item is {
          id: string;
          markdown: string;
          title?: string;
        } =>
          typeof item === 'object' &&
          item !== null &&
          !Array.isArray(item) &&
          typeof item.id === 'string' &&
          typeof item.markdown === 'string',
      )
      .map((item) => ({
        id: item.id,
        markdown: item.markdown,
        title: typeof item.title === 'string' ? item.title : undefined,
      }));
  }
}
