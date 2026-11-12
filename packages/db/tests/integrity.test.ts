import { randomUUID } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = new PrismaClient();
const prefix = randomUUID();
let userId: string;
let orgId: string;
let eventId: string;
let debitId: string;
let creditId: string;
let journalId: string;
let entryId: string;

const journalData = (
  id = randomUUID(),
): Prisma.LedgerJournalUncheckedCreateInput => ({
  id,
  idempotencyKey: id,
  createdBy: userId,
  refType: 'ADJUSTMENT',
  refId: prefix,
  memo: 'Integration test',
});

beforeAll(async () => {
  await db.country.upsert({
    where: { code: 'GH' },
    update: {},
    create: { code: 'GH', name: 'Ghana', currency: 'GHS' },
  });
  const user = await db.user.create({
    data: {
      email: prefix + '@example.test',
      displayName: 'Synthetic test user',
      passwordHash: 'not-a-login-capable-hash',
    },
  });
  userId = user.id;
  const org = await db.organization.create({
    data: { ownerId: userId, name: 'Synthetic test org', slug: prefix },
  });
  orgId = org.id;
  await db.category.create({ data: { slug: prefix, name: 'Test' } });
  const event = await db.event.create({
    data: {
      orgId,
      title: 'Synthetic test event',
      description: 'Synthetic PostgreSQL integration-test fixture',
      slug: prefix,
      categorySlug: prefix,
      createdBy: userId,
      startsAt: new Date('2026-12-01T10:00:00Z'),
      endsAt: new Date('2026-12-01T12:00:00Z'),
    },
  });
  eventId = event.id;
  debitId = (
    await db.ledgerAccount.create({
      data: { orgId, code: 'CASH', type: 'ASSET', name: 'Test cash' },
    })
  ).id;
  creditId = (
    await db.ledgerAccount.create({
      data: { orgId, code: 'PAYABLE', type: 'LIABILITY', name: 'Test payable' },
    })
  ).id;
  const balanced = await db.$transaction(async (tx) => {
    const journal = await tx.ledgerJournal.create({ data: journalData() });
    const debit = await tx.ledgerEntry.create({
      data: {
        journalId: journal.id,
        accountId: debitId,
        direction: 'DEBIT',
        amountMinor: 5_000_000_000n,
      },
    });
    await tx.ledgerEntry.create({
      data: {
        journalId: journal.id,
        accountId: creditId,
        direction: 'CREDIT',
        amountMinor: 5_000_000_000n,
      },
    });
    return { journalId: journal.id, entryId: debit.id };
  });
  journalId = balanced.journalId;
  entryId = balanced.entryId;
});

afterAll(() => db.$disconnect());

describe('PostgreSQL ledger integrity', () => {
  it('commits a balanced multi-statement journal with BigInt amounts', async () => {
    expect(
      (await db.ledgerEntry.findUniqueOrThrow({ where: { id: entryId } }))
        .amountMinor,
    ).toBe(5_000_000_000n);
    expect(await db.ledgerEntry.count({ where: { journalId } })).toBe(2);
  });
  it('rejects an unbalanced journal at transaction commit and rolls back all rows', async () => {
    const id = randomUUID();
    await expect(
      db.$transaction(async (tx) => {
        await tx.ledgerJournal.create({ data: journalData(id) });
        await tx.ledgerEntry.createMany({
          data: [
            {
              journalId: id,
              accountId: debitId,
              direction: 'DEBIT',
              amountMinor: 100n,
            },
            {
              journalId: id,
              accountId: creditId,
              direction: 'CREDIT',
              amountMinor: 99n,
            },
          ],
        });
      }),
    ).rejects.toThrow(/not balanced/);
    expect(await db.ledgerJournal.findUnique({ where: { id } })).toBeNull();
    expect(await db.ledgerEntry.count({ where: { journalId: id } })).toBe(0);
  });
  it('rejects an empty journal', async () => {
    await expect(
      db.ledgerJournal.create({ data: journalData() }),
    ).rejects.toThrow(/not balanced/);
  });
  it.each(['update', 'delete'] as const)(
    'rejects ledger entry %s',
    async (operation) => {
      const request =
        operation === 'update'
          ? db.ledgerEntry.update({
              where: { id: entryId },
              data: { amountMinor: 1n },
            })
          : db.ledgerEntry.delete({ where: { id: entryId } });
      await expect(request).rejects.toThrow(/append-only/);
    },
  );
  it.each(['update', 'delete'] as const)(
    'rejects journal %s',
    async (operation) => {
      const request =
        operation === 'update'
          ? db.ledgerJournal.update({
              where: { id: journalId },
              data: { memo: 'tampered' },
            })
          : db.ledgerJournal.delete({ where: { id: journalId } });
      await expect(request).rejects.toThrow(/append-only/);
    },
  );
  it('rejects new entries on an already committed journal', async () => {
    await expect(
      db.ledgerEntry.create({
        data: {
          journalId,
          accountId: debitId,
          direction: 'DEBIT',
          amountMinor: 1n,
        },
      }),
    ).rejects.toThrow(/committed ledger journal/);
  });
  it('rejects duplicate journal idempotency keys', async () => {
    const existing = await db.ledgerJournal.findUniqueOrThrow({
      where: { id: journalId },
    });
    await expect(
      db.ledgerJournal.create({
        data: { ...journalData(), idempotencyKey: existing.idempotencyKey },
      }),
    ).rejects.toThrow(/Unique constraint/);
  });
});

describe('PostgreSQL inventory and promotion constraints', () => {
  it('accepts full capacity and zero inventory', async () => {
    const ticket = await db.ticketType.create({
      data: {
        eventId,
        orgId,
        name: 'At capacity',
        quota: 10,
        soldCount: 7,
        reservedCount: 3,
      },
    });
    expect(ticket.soldCount + ticket.reservedCount).toBe(ticket.quota);
    expect(
      (
        await db.ticketType.create({
          data: { eventId, orgId, name: 'Empty', quota: 0 },
        })
      ).quota,
    ).toBe(0);
  });
  it.each([
    { soldCount: 8, reservedCount: 3, quota: 10 },
    { soldCount: -1, reservedCount: 0, quota: 10 },
    { soldCount: 0, reservedCount: -1, quota: 10 },
    { soldCount: 0, reservedCount: 0, quota: -1 },
  ])('rejects invalid inventory %j on INSERT and UPDATE', async (inventory) => {
    await expect(
      db.ticketType.create({
        data: { eventId, orgId, name: 'Invalid', ...inventory },
      }),
    ).rejects.toThrow(/ticket_inventory/);
    const ticket = await db.ticketType.create({
      data: { eventId, orgId, name: 'Valid', quota: 10 },
    });
    await expect(
      db.ticketType.update({ where: { id: ticket.id }, data: inventory }),
    ).rejects.toThrow(/ticket_inventory/);
  });
  it('rejects promotion spending past its budget', async () => {
    const campaign = await db.promotionCampaign.create({
      data: {
        orgId,
        eventId,
        name: 'Test promotion',
        budgetMinor: 100,
        spentMinor: 100,
        startsAt: new Date('2026-12-01T10:00:00Z'),
        endsAt: new Date('2026-12-02T10:00:00Z'),
      },
    });
    await expect(
      db.promotionCampaign.update({
        where: { id: campaign.id },
        data: { spentMinor: { increment: 1 } },
      }),
    ).rejects.toThrow(/promotion_budget/);
  });
});
