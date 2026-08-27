import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma.service';
import { EventDomainLabelService } from '../../../src/opportunity/labeling/event-domain-label.service';
import { EventLabelingService } from '../../../src/opportunity/labeling/event-labeling.service';

describe('EventLabelingService provider', () => {
  it('compiles with explicit EventDomainLabelService injection metadata', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        EventLabelingService,
        EventDomainLabelService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    expect(moduleRef.get(EventLabelingService)).toBeInstanceOf(EventLabelingService);
  });
});
