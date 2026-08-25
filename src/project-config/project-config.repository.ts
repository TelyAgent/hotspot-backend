import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { JsonValue } from '../common/types/json.type';
import { ProjectConfig } from './project-config.types';

@Injectable()
export class ProjectConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByKey(key: string): Promise<ProjectConfig | null> {
    return this.prisma.projectConfig.findUnique({
      where: {
        key,
      },
    }) as Promise<ProjectConfig | null>;
  }

  async list(): Promise<ProjectConfig[]> {
    return this.prisma.projectConfig.findMany({
      orderBy: {
        key: 'asc',
      },
    }) as Promise<ProjectConfig[]>;
  }

  async upsert(input: {
    key: string;
    value: JsonValue;
    description?: string | null;
    updatedBy?: string | null;
  }): Promise<ProjectConfig> {
    return this.prisma.projectConfig.upsert({
      where: {
        key: input.key,
      },
      update: {
        value: input.value as Prisma.InputJsonValue,
        description: input.description,
        updatedBy: input.updatedBy,
      },
      create: {
        key: input.key,
        value: input.value as Prisma.InputJsonValue,
        description: input.description,
        updatedBy: input.updatedBy,
      },
    }) as Promise<ProjectConfig>;
  }
}
