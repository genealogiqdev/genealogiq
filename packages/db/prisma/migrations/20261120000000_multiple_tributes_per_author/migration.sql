-- Keep every tribute. Allow an author to add more tributes to the same profile.
ALTER TABLE "app_tributes" DROP CONSTRAINT IF EXISTS "tributes_app_author_profile_key";
-- Some legacy databases keep this key as an index rather than a constraint.
DROP INDEX IF EXISTS "tributes_app_author_profile_key";
CREATE INDEX IF NOT EXISTS "tributes_app_author_profile_idx"
  ON "app_tributes"("app_author_id", "app_profile_id");
