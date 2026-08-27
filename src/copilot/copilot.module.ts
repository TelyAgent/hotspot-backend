import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { AssistantModule } from '../assistant/assistant.module';
import { PrismaModule } from '../database/prisma.module';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';

@Module({
  imports: [AgentModule, AssistantModule, PrismaModule],
  controllers: [CopilotController],
  providers: [CopilotService],
  exports: [CopilotService],
})
export class CopilotModule {}
