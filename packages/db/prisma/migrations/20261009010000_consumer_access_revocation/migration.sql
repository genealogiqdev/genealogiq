ALTER TABLE "consumer_access_grants"
    ADD COLUMN "revoked_at" TIMESTAMP(3),
    ADD COLUMN "revoked_by_id" TEXT,
    ADD CONSTRAINT "consumer_access_grants_revocation_check"
        CHECK (("revoked_at" IS NULL) = ("revoked_by_id" IS NULL));
