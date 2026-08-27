import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { EventDomainLabelService } from '../../opportunity/labeling/event-domain-label.service';
import { EvidenceQualityGateService } from './evidence-quality-gate.service';
import { SIGNAL_EVIDENCE_ENRICHERS } from './signal-evidence-enrichment.tokens';
import { SignalEvidenceEnrichmentService } from './signal-evidence-enrichment.service';
import { XTrendEvidenceEnricher } from './x-trend-evidence-enricher';
import { YoutubeTranscriptEvidenceEnricher } from './youtube-transcript-evidence-enricher';

@Module({
  imports: [PrismaModule],
  providers: [
    EventDomainLabelService,
    EvidenceQualityGateService,
    XTrendEvidenceEnricher,
    YoutubeTranscriptEvidenceEnricher,
    {
      provide: SIGNAL_EVIDENCE_ENRICHERS,
      useFactory: (
        xTrend: XTrendEvidenceEnricher,
        youtube: YoutubeTranscriptEvidenceEnricher,
      ) => [xTrend, youtube],
      inject: [XTrendEvidenceEnricher, YoutubeTranscriptEvidenceEnricher],
    },
    SignalEvidenceEnrichmentService,
  ],
  exports: [EvidenceQualityGateService, SignalEvidenceEnrichmentService],
})
export class SignalEvidenceEnrichmentModule {}
