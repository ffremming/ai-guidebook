ALTER TABLE "conversation_links"
  ALTER COLUMN "url" DROP NOT NULL,
  ADD COLUMN "usage_node_id" VARCHAR(150),
  ADD COLUMN "evidence_type" VARCHAR(20),
  ADD COLUMN "comment" TEXT;

UPDATE "conversation_links"
SET "evidence_type" = 'URL'
WHERE "url" IS NOT NULL;
