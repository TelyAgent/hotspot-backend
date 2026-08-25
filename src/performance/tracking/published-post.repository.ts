import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  CreatePublishedPostInput,
  PublishedPost,
} from '../performance.types';

@Injectable()
export class PublishedPostRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePublishedPostInput): Promise<PublishedPost> {
    return this.prisma.publishedPost.create({
      data: {
        contentTaskId: input.contentTaskId,
        platform: input.platform,
        url: input.url,
        publishedAt: input.publishedAt,
        trackingStatus: 'active',
      },
    }) as unknown as Promise<PublishedPost>;
  }

  async listByContentTask(contentTaskId: string): Promise<PublishedPost[]> {
    return this.prisma.publishedPost.findMany({
      where: {
        contentTaskId,
      },
      orderBy: {
        publishedAt: 'desc',
      },
    }) as unknown as Promise<PublishedPost[]>;
  }
}
