import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { AssignmentController } from './assignment.controller';
import { AssignmentRepository } from './assignment.repository';
import { LocalAccountProviderService } from './account-provider/local-account-provider.service';
import { AssignmentAgentService } from './decision/assignment-agent.service';
import { ACCOUNT_PROVIDER } from './assignment.tokens';
import { DEFAULT_LOCAL_ACCOUNTS } from './account-provider/default-local-accounts';

@Module({
  imports: [AgentModule],
  controllers: [AssignmentController],
  providers: [
    AssignmentRepository,
    {
      provide: LocalAccountProviderService,
      useFactory: () => new LocalAccountProviderService(DEFAULT_LOCAL_ACCOUNTS),
    },
    {
      provide: ACCOUNT_PROVIDER,
      useExisting: LocalAccountProviderService,
    },
    AssignmentAgentService,
  ],
  exports: [
    AssignmentRepository,
    LocalAccountProviderService,
    ACCOUNT_PROVIDER,
    AssignmentAgentService,
  ],
})
export class AssignmentModule {}
