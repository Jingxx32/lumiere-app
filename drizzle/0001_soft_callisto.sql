ALTER TABLE "reading_sessions" DROP CONSTRAINT "reading_sessions_document_id_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "reading_sessions" ALTER COLUMN "document_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD COLUMN "document_title_snapshot" text;--> statement-breakpoint
UPDATE "reading_sessions" rs
SET "document_title_snapshot" = d.title
FROM "documents" d
WHERE rs.document_id = d.id;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
