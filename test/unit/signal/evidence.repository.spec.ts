import { EvidenceRepository } from '../../../src/signal/evidence/evidence.repository';

describe('EvidenceRepository', () => {
  it('finds evidence items by ids', async () => {
    const prisma = {
      evidenceItem: {
        findMany: jest.fn(() => Promise.resolve([])),
      },
    };
    const repository = new EvidenceRepository(prisma as never);

    await repository.findByIds(['ev_1', 'ev_2']);

    expect(prisma.evidenceItem.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['ev_1', 'ev_2'],
        },
      },
      orderBy: {
        observedAt: 'desc',
      },
    });
  });
});
