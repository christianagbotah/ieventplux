\set ON_ERROR_STOP on
-- Immediately after a fresh fixture load, before test users make changes.
BEGIN READ ONLY;
DO $$ BEGIN
 IF current_user <> 'ieventplux_app' THEN RAISE EXCEPTION 'Use the application role'; END IF;
 IF (SELECT count(*) FROM "User" WHERE id LIKE 'qa27-%')<>13 OR (SELECT count(*) FROM "Organization" WHERE id LIKE 'qa27-%')<>5 OR (SELECT count(*) FROM "Event" WHERE id LIKE 'qa27-%')<>18 OR (SELECT count(*) FROM "Order" WHERE id LIKE 'qa27-%')<>30 OR (SELECT count(*) FROM "Ticket" WHERE id LIKE 'qa27-%')<>60 THEN RAISE EXCEPTION 'Fixture identity or ticket counts mismatch'; END IF;
 IF (SELECT count(*) FROM "MarketplaceStore" WHERE id LIKE 'qa27-%')<>4 OR (SELECT count(*) FROM "MarketplaceProduct" WHERE id LIKE 'qa27-%')<>16 OR (SELECT count(*) FROM "MarketplaceVariant" WHERE id LIKE 'qa27-%')<>32 OR (SELECT count(*) FROM "MarketplacePurchaseRequest" WHERE id LIKE 'qa27-%')<>4 THEN RAISE EXCEPTION 'Fixture catalogue counts mismatch'; END IF;
 IF (SELECT count(*) FROM "AgendaItem" WHERE id LIKE 'qa27-%')<>18 OR (SELECT count(*) FROM "ServiceProviderProfile" WHERE id LIKE 'qa27-%')<>3 OR (SELECT count(*) FROM "EventMeeting" WHERE id LIKE 'qa27-%')<>1 OR (SELECT count(*) FROM "TransportVehicle" WHERE id LIKE 'qa27-%')<>1 THEN RAISE EXCEPTION 'Extended fixture counts mismatch'; END IF;
 IF (SELECT count(*) FROM "PaymentAttempt" WHERE id LIKE 'qa27-%')<>24 OR EXISTS(SELECT 1 FROM "PaymentAttempt" WHERE id LIKE 'qa27-%' AND (provider<>'SIMULATOR' OR status<>'SUCCESS' OR "providerPaymentId" IS NOT NULL)) THEN RAISE EXCEPTION 'Non-simulated payment or unexpected count'; END IF;
 IF EXISTS(SELECT 1 FROM "TicketType" t WHERE t.id LIKE 'qa27-%' AND (t."soldCount"<>(SELECT count(*) FROM "Ticket" WHERE "ticketTypeId"=t.id) OR (t."priceMinor">0 AND (t."saleEndsAt" IS NULL OR t."saleEndsAt">now())))) THEN RAISE EXCEPTION 'Ticket counts or paid sale window mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM "Order" o WHERE o.id LIKE 'qa27-%' AND (o."totalMinor"<>(SELECT coalesce(sum(i."lineTotalMinor"),0) FROM "OrderItem" i WHERE i."orderId"=o.id) OR o."userId" NOT LIKE 'qa27-%' OR o."eventId" NOT LIKE 'qa27-%' OR o."orgId" NOT LIKE 'qa27-%')) THEN RAISE EXCEPTION 'Order totals or ownership mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM "MarketplaceVariant" v WHERE v.id LIKE 'qa27-%' AND (v."stockReserved"<>0 OR v."stockOnHand"<>coalesce((SELECT sum(m."qtyDelta") FROM "MarketplaceStockMovement" m WHERE m."variantId"=v.id),0))) THEN RAISE EXCEPTION 'Inventory ledger mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM "LedgerJournal" WHERE "orgId" LIKE 'qa27-%' OR "refId" LIKE 'qa27-%') OR EXISTS(SELECT 1 FROM "MessageDelivery" WHERE "userId" LIKE 'qa27-%' OR "orgId" LIKE 'qa27-%' OR target LIKE '%@qa.ieventplux.invalid') OR EXISTS(SELECT 1 FROM "OutboxJob" WHERE payload LIKE '%qa27-%') THEN RAISE EXCEPTION 'Unexpected simulated financial or external delivery side effect'; END IF;
 IF EXISTS(SELECT 1 FROM "ServiceProviderProfile" WHERE id LIKE 'qa27-%' AND (published OR "jurisdictionApproved" OR "reviewStatus"<>'PENDING')) THEN RAISE EXCEPTION 'Synthetic provider must remain unapproved'; END IF;
 IF (SELECT count(*) FROM "User" WHERE id LIKE 'qa27-%' AND "emailVerifiedAt" IS NULL)<>1 THEN RAISE EXCEPTION 'Unverified test case missing'; END IF;
END $$;
SELECT 'QA_FIXTURE_BATCH_VERIFIED' AS result;
ROLLBACK;
