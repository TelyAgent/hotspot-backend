import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  CreatePostMetricSnapshotInput,
  PostMetricSnapshot,
} from '../performance.types';

@Injectable()
export class PostMetricSnapshotRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreatePostMetricSnapshotInput,
  ): Promise<PostMetricSnapshot> {
    return this.prisma.postMetricSnapshot.create({
      data: {
        publishedPost: {
          connect: {
            id: input.publishedPostId,
          },
        },
        observedAt: input.observedAt,
        likes: input.likes ?? null,
        replies: input.replies ?? null,
        reposts: input.reposts ?? null,
        quotes: input.quotes ?? null,
        views: input.views ?? null,
        rawMetrics: (input.rawMetrics ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        isMissingData: input.isMissingData ?? false,
        errorMessage: input.errorMessage ?? null,
      },
    }) as unknown as Promise<PostMetricSnapshot>;
  }

  async listByPublishedPost(
    publishedPostId: string,
  ): Promise<PostMetricSnapshot[]> {
    return this.prisma.postMetricSnapshot.findMany({
      where: {
        publishedPostId,
      },
      orderBy: {
        observedAt: 'desc',
      },
    }) as unknown as Promise<PostMetricSnapshot[]>;
  }
}
