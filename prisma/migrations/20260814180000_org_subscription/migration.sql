-- Subscription state on an operator, so there is something to bill.
--
-- THREE NULLABLE COLUMNS AND NO BACKFILL, deliberately.
--
-- `fleetSize` is null for every Org that existed before this migration,
-- and `billableBand` in packages/shared/src/subscription.ts returns null
-- for a missing fleet rather than falling back to the cheapest band.
-- Defaulting it to 1 here would have been one word of SQL and would
-- have invented a billable fact about every existing customer.
--
-- `trialEndsOn` and `paidThrough` are likewise null: an Org created
-- before subscriptions existed has neither, and stateOn() reads a null
-- trial as an expired one. That is the correct reading — these orgs
-- predate the commercial model and their state is a decision for
-- whoever sets their terms, not for a DEFAULT clause.
--
-- Nothing reads these columns yet. This migration exists because the
-- generated Prisma client SELECTs every scalar field on the model, so
-- the schema change alone broke every Org read the moment it landed:
--   ERROR: column Org.fleetSize does not exist
-- A schema without its migration is not "not applied yet", it is a
-- client that no longer matches its database.
ALTER TABLE "Org" ADD COLUMN "fleetSize" INTEGER;
ALTER TABLE "Org" ADD COLUMN "trialEndsOn" TIMESTAMP(3);
ALTER TABLE "Org" ADD COLUMN "paidThrough" TIMESTAMP(3);
