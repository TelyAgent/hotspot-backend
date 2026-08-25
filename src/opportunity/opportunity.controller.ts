import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { parseTake } from '../common/utils/request.util';
import { OpportunityMiningAgentService } from './mining/opportunity-mining-agent.service';
import { OpportunityRepository } from './opportunity.repository';
import { OpportunityMiningDecision } from './opportunity.types';

@Controller('opportunities')
export class OpportunityController {
  constructor(
    private readonly opportunityRepository: OpportunityRepository,
    private readonly miningAgentService: OpportunityMiningAgentService,
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

  @Post('mine')
  async mine(@Body() body: Record<string, unknown>) {
    const decision = await this.miningAgentService.evaluate({
      instruction: String(body.instruction ?? ''),
      signals: Array.isArray(body.signals) ? body.signals : [],
      evidence: Array.isArray(body.evidence) ? body.evidence : [],
      topicCandidates: Array.isArray(body.topicCandidates)
        ? body.topicCandidates
        : [],
    });

    return this.persistDecision(decision);
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

  private persistDecision(decision: OpportunityMiningDecision) {
    if (decision.decision === 'create_event') {
      return this.opportunityRepository.createEvent({
        title: decision.title,
        eventType: decision.opportunityType,
        summary: decision.summary,
        evidenceRefs: decision.evidenceRefs,
        missingData: decision.missingData,
        riskNotes: decision.riskNotes,
        confidence: decision.confidence,
        status: 'suggested',
      });
    }

    if (decision.decision === 'create_opportunity') {
      return this.opportunityRepository.createOpportunity({
        title: decision.title,
        type: decision.opportunityType,
        summary: decision.summary,
        whyNow: decision.whyNow,
        whyItMatters: decision.whyItMatters,
        productAngles: decision.productAngles,
        contentWindow: decision.contentWindow,
        evidenceRefs: decision.evidenceRefs,
        missingData: decision.missingData,
        riskNotes: decision.riskNotes,
        confidence: decision.confidence,
        status: 'suggested',
      });
    }

    return decision;
  }
}
