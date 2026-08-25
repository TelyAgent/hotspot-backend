import { Controller, Get, Param, Query } from '@nestjs/common';
import { parseTake } from '../common/utils/request.util';
import { EvidenceRepository } from './evidence/evidence.repository';
import { SignalRepository } from './signal/signal.repository';

@Controller('signals')
export class SignalController {
  constructor(
    private readonly signalRepository: SignalRepository,
    private readonly evidenceRepository: EvidenceRepository,
  ) {}

  @Get()
  list(@Query('take') take?: string) {
    return this.signalRepository.findMany({
      take: parseTake(take),
    });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.signalRepository.findById(id);
  }

  @Get(':id/evidence')
  listEvidence(@Param('id') id: string, @Query('take') take?: string) {
    return this.evidenceRepository.findMany({
      signalId: id,
      take: parseTake(take),
    });
  }
}
