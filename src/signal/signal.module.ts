import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { EvidenceRepository } from './evidence/evidence.repository';
import { EvidenceService } from './evidence/evidence.service';
import { RawItemRepository } from './raw-item/raw-item.repository';
import { RawItemService } from './raw-item/raw-item.service';
import { SignalController } from './signal.controller';
import { SignalRepository } from './signal/signal.repository';
import { SignalService } from './signal/signal.service';
import { SignalEvidenceEnrichmentModule } from './enrichment/signal-evidence-enrichment.module';

@Module({
  imports: [PrismaModule, SignalEvidenceEnrichmentModule],
  controllers: [SignalController],
  providers: [
    RawItemRepository,
    RawItemService,
    SignalRepository,
    SignalService,
    EvidenceRepository,
    EvidenceService,
  ],
  exports: [RawItemService, SignalService, EvidenceService, SignalEvidenceEnrichmentModule],
})
export class SignalModule {}
