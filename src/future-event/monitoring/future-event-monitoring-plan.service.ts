import { Injectable } from '@nestjs/common';
import {
  CreateFutureEventMonitoringPlanInput,
  FutureEventMonitoringPlan,
} from '../future-event.types';
import { FutureEventRepository } from '../future-event.repository';

@Injectable()
export class FutureEventMonitoringPlanService {
  constructor(private readonly futureEventRepository: FutureEventRepository) {}

  async createDraft(
    input: Omit<CreateFutureEventMonitoringPlanInput, 'status'>,
  ): Promise<FutureEventMonitoringPlan> {
    return this.futureEventRepository.createMonitoringPlan({
      ...input,
      status: 'draft',
    });
  }
}
