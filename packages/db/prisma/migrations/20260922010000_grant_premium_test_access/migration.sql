-- Temporary production test access: grant every existing APP_USER a
-- non-Stripe Premium entitlement without changing or replacing real sales.
-- Memorials and pets inherit the richest active plan from their guardians.
DO $$
DECLARE
  premium_subscription_id TEXT;
BEGIN
  SELECT "id"
  INTO premium_subscription_id
  FROM "subscriptions"
  WHERE "code" = 'PREMIUM'
    AND "is_active" = true
  LIMIT 1;

  IF premium_subscription_id IS NULL THEN
    RAISE EXCEPTION 'Active PREMIUM subscription not found';
  END IF;

  INSERT INTO "app_sales" (
    "id",
    "value",
    "app_user_id",
    "subscription_id",
    "created_at",
    "updated_at",
    "currency",
    "cadence",
    "status",
    "current_period_end",
    "cancel_at_period_end"
  )
  SELECT
    'test-premium-' || md5(app_user."id"),
    0,
    app_user."id",
    premium_subscription_id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    'BRL',
    'annual',
    'active',
    TIMESTAMP '2099-12-31 23:59:59',
    false
  FROM "app_users" app_user
  WHERE app_user."role" = 'APP_USER'
    AND NOT EXISTS (
      SELECT 1
      FROM "app_sales" existing_sale
      JOIN "subscriptions" existing_plan
        ON existing_plan."id" = existing_sale."subscription_id"
      WHERE existing_sale."app_user_id" = app_user."id"
        AND existing_plan."code" = 'PREMIUM'
        AND existing_sale."status" IN ('active', 'trialing')
        AND existing_sale."current_period_end" > CURRENT_TIMESTAMP
    )
  ON CONFLICT ("id") DO UPDATE SET
    "subscription_id" = EXCLUDED."subscription_id",
    "currency" = EXCLUDED."currency",
    "cadence" = EXCLUDED."cadence",
    "status" = EXCLUDED."status",
    "current_period_end" = EXCLUDED."current_period_end",
    "cancel_at_period_end" = false,
    "canceled_at" = NULL,
    "ended_at" = NULL,
    "updated_at" = CURRENT_TIMESTAMP;
END
$$;
