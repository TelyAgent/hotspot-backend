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
  list(@Query('take') take?: string, @Query('signalType') signalType?: string) {
    return this.signalRepository.findMany({
      take: parseTake(take),
      signalType,
    });
  }

  @Get('evidence')
  listEvidenceByIds(@Query('ids') ids?: string) {
    return this.evidenceRepository.findByIds(parseIds(ids));
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

function parseIds(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 100);
}
