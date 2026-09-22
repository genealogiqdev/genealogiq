-- Pet ownership is an attachment, not a genealogical relation. Keeping it in
-- its own table prevents a co-owned pet from joining two unrelated family
-- graphs during traversal.
CREATE TABLE "app_pet_ownerships" (
  "id" TEXT NOT NULL,
  "pet_id" VARCHAR NOT NULL,
  "owner_id" VARCHAR NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "app_pet_ownerships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "app_pet_ownerships_pet_owner_different" CHECK ("pet_id" <> "owner_id")
);

CREATE UNIQUE INDEX "app_pet_ownerships_pet_owner_key"
  ON "app_pet_ownerships"("pet_id", "owner_id");
CREATE INDEX "app_pet_ownerships_pet_id_idx"
  ON "app_pet_ownerships"("pet_id");
CREATE INDEX "app_pet_ownerships_owner_id_idx"
  ON "app_pet_ownerships"("owner_id");

ALTER TABLE "app_pet_ownerships"
  ADD CONSTRAINT "app_pet_ownerships_pet_id_fkey"
  FOREIGN KEY ("pet_id") REFERENCES "app_users"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "app_pet_ownerships"
  ADD CONSTRAINT "app_pet_ownerships_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "app_users"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

-- Refuse to silently discard malformed legacy data. All existing accepted
-- PET_OF rows must point from a pet to a non-pet profile before migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "app_family_relations" relation
    JOIN "app_users" pet ON pet."id" = relation."app_from_id"
    JOIN "app_users" owner ON owner."id" = relation."app_to_id"
    WHERE relation."type" = 'PET_OF'
      AND relation."status" = 'ACCEPTED'
      AND (
        pet."role" <> 'APP_PET'
        OR owner."role" = 'APP_PET'
        OR relation."app_from_id" = relation."app_to_id"
      )
  ) THEN
    RAISE EXCEPTION 'Invalid accepted PET_OF relation found; pet ownership migration aborted';
  END IF;
END
$$;

-- Reuse the relation CUID so the migration is deterministic and needs no
-- database-side CUID generator.
INSERT INTO "app_pet_ownerships" ("id", "pet_id", "owner_id", "created_at")
SELECT relation."id", relation."app_from_id", relation."app_to_id", relation."created_at"
FROM "app_family_relations" relation
JOIN "app_users" pet ON pet."id" = relation."app_from_id"
JOIN "app_users" owner ON owner."id" = relation."app_to_id"
WHERE relation."type" = 'PET_OF'
  AND relation."status" = 'ACCEPTED'
  AND pet."role" = 'APP_PET'
  AND owner."role" <> 'APP_PET'
ON CONFLICT ("pet_id", "owner_id") DO NOTHING;

DELETE FROM "app_family_relations" WHERE "type" = 'PET_OF';

-- Future ownership writes are protected even when they do not originate from
-- the application server.
CREATE OR REPLACE FUNCTION "validate_app_pet_ownership"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  pet_role "AppRole";
  owner_role "AppRole";
BEGIN
  SELECT "role" INTO pet_role FROM "app_users" WHERE "id" = NEW."pet_id";
  SELECT "role" INTO owner_role FROM "app_users" WHERE "id" = NEW."owner_id";

  IF pet_role IS DISTINCT FROM 'APP_PET'::"AppRole" THEN
    RAISE EXCEPTION 'pet_id must reference an APP_PET profile';
  END IF;
  IF owner_role IS NULL OR owner_role = 'APP_PET'::"AppRole" THEN
    RAISE EXCEPTION 'owner_id must reference a human profile';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "app_pet_ownerships_validate_roles"
BEFORE INSERT OR UPDATE ON "app_pet_ownerships"
FOR EACH ROW EXECUTE FUNCTION "validate_app_pet_ownership"();

ALTER TABLE "app_family_relations"
  ADD CONSTRAINT "app_family_relations_type_check"
  CHECK ("type" IN ('PARENT_OF', 'SPOUSE', 'SIBLING'));
