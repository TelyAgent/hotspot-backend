import { Injectable } from '@nestjs/common';

@Injectable()
export class TopicMonitoringPlanService {
  createDraftVersion(input: { currentVersion?: number }) {
    return (input.currentVersion ?? 0) + 1;
  }
}
