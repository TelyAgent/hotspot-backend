import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { ProjectConfigController } from './project-config.controller';
import { ProjectConfigRepository } from './project-config.repository';
import { ProjectConfigService } from './project-config.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProjectConfigController],
  providers: [ProjectConfigRepository, ProjectConfigService],
  exports: [ProjectConfigService],
})
export class ProjectConfigModule {}
