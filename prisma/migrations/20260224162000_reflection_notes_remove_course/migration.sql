ALTER TABLE "reflection_notes" DROP CONSTRAINT IF EXISTS "reflection_notes_course_id_fkey";
ALTER TABLE "reflection_notes" DROP COLUMN IF EXISTS "course_id";
