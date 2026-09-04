import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  ContentDraft,
  CreateContentDraftInput,
} from '../content.types';

@Injectable()
export class ContentDraftRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getNextVersion(contentTaskId: string): Promise<number> {
    const latest = await this.prisma.contentDraft.findFirst({
      where: { contentTaskId },
      orderBy: { version: 'desc' },
    });

    return latest ? latest.version + 1 : 1;
  }

  async create(input: CreateContentDraftInput): Promise<ContentDraft> {
    return this.prisma.contentDraft.create({
      data: {
        contentTaskId: input.contentTaskId,
        version: input.version,
        body: input.body,
        evidenceRefs: input.evidenceRefs,
        generationInput: input.generationInput as Prisma.InputJsonValue,
        userInstruction: input.userInstruction ?? null,
        status: input.status ?? 'draft',
      },
    }) as unknown as Promise<ContentDraft>;
  }

  async listByTask(contentTaskId: string): Promise<ContentDraft[]> {
    return this.prisma.contentDraft.findMany({
      where: {
        contentTaskId,
      },
      orderBy: {
        version: 'desc',
      },
    }) as unknown as Promise<ContentDraft[]>;
  }

  async updateStatus(
    id: string,
    status: ContentDraft['status'],
  ): Promise<ContentDraft> {
    return this.prisma.contentDraft.update({
      where: {
        id,
      },
      data: {
        status,
      },
    }) as unknown as Promise<ContentDraft>;
  }

  async findTaskById(contentTaskId: string) {
    return this.prisma.contentTask.findUnique({
      where: {
        id: contentTaskId,
      },
    });
  }
}
