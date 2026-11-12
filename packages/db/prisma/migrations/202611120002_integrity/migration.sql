ALTER TABLE "TicketType"
  ADD CONSTRAINT ticket_inventory_nonnegative CHECK ("quota" >= 0 AND "soldCount" >= 0 AND "reservedCount" >= 0),
  ADD CONSTRAINT ticket_inventory_capacity CHECK ("soldCount"::bigint + "reservedCount"::bigint <= "quota"),
  ADD CONSTRAINT ticket_price_nonnegative CHECK ("priceMinor" >= 0);
ALTER TABLE "InventoryReservation" ADD CONSTRAINT reservation_qty_positive CHECK ("qty" > 0);
ALTER TABLE "PromotionCampaign"
  ADD CONSTRAINT promotion_budget CHECK ("budgetMinor" >= 0 AND "spentMinor" >= 0 AND "spentMinor" <= "budgetMinor");
ALTER TABLE "LedgerEntry" ADD CONSTRAINT ledger_amount_positive CHECK ("amountMinor" > 0);
CREATE UNIQUE INDEX ledger_platform_account_code ON "LedgerAccount" ("code") WHERE "orgId" IS NULL;

CREATE FUNCTION reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; use a reversal journal', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER ledger_journals_append_only BEFORE UPDATE OR DELETE ON "LedgerJournal"
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON "LedgerEntry"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER ledger_journals_no_truncate BEFORE TRUNCATE ON "LedgerJournal"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_mutation();

CREATE FUNCTION validate_ledger_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_currency text; account_currency text; journal_xid xid;
BEGIN
  SELECT "currency", xmin INTO journal_currency, journal_xid FROM "LedgerJournal" WHERE id = NEW."journalId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ledger journal does not exist' USING ERRCODE = '23503';
  END IF;
  IF journal_xid <> pg_current_xact_id()::text::xid THEN
    RAISE EXCEPTION 'Cannot append entries to a committed ledger journal' USING ERRCODE = '23514';
  END IF;
  SELECT "currency" INTO account_currency FROM "LedgerAccount" WHERE id = NEW."accountId";
  IF account_currency IS DISTINCT FROM journal_currency THEN
    RAISE EXCEPTION 'Ledger account and journal currency must match' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_entry_validation BEFORE INSERT ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION validate_ledger_entry();

CREATE FUNCTION assert_ledger_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_id text; debit numeric; credit numeric; entry_count bigint;
BEGIN
  IF TG_TABLE_NAME = 'LedgerJournal' THEN journal_id := NEW.id;
  ELSE journal_id := NEW."journalId";
  END IF;
  SELECT count(*),
    COALESCE(sum("amountMinor") FILTER (WHERE direction = 'DEBIT'), 0),
    COALESCE(sum("amountMinor") FILTER (WHERE direction = 'CREDIT'), 0)
    INTO entry_count, debit, credit FROM "LedgerEntry" WHERE "journalId" = journal_id;
  IF entry_count < 2 OR debit <> credit THEN
    RAISE EXCEPTION 'Ledger journal % is not balanced: debits %, credits %, entries %', journal_id, debit, credit, entry_count
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER ledger_journal_balanced AFTER INSERT ON "LedgerJournal"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_ledger_balanced();
CREATE CONSTRAINT TRIGGER ledger_entries_balanced AFTER INSERT ON "LedgerEntry"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_ledger_balanced();

CREATE FUNCTION reject_money_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Cannot delete financial history from %', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['Order', 'OrderItem', 'PaymentAttempt', 'RefundCase', 'Payout', 'Invoice', 'Settlement', 'SettlementHold', 'LedgerAccount', 'FeeVersion'] LOOP
    EXECUTE format('CREATE TRIGGER financial_history_no_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_money_delete()', table_name);
    EXECUTE format('CREATE TRIGGER financial_history_no_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION reject_money_delete()', table_name);
  END LOOP;
END;
$$;
