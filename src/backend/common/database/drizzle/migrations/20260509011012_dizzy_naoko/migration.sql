CREATE TABLE "components" (
	"id" serial PRIMARY KEY,
	"uid" varchar(200) NOT NULL,
	"mode" varchar(15) NOT NULL,
	"type" varchar(50) NOT NULL,
	"name" varchar NOT NULL,
	"countLive" integer DEFAULT 0 NOT NULL,
	"countNonLive" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY,
	"componentFromId" integer NOT NULL,
	"componentToId" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"status" varchar(20) DEFAULT 'idle' NOT NULL,
	"retries" integer DEFAULT 0 NOT NULL,
	"error" json,
	"transformOptions" json,
	"initialParameters" json,
	"cursor" json,
	"total" integer,
	"imported" integer DEFAULT 0 NOT NULL,
	"scrobbled" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL,
	"completedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "play_inputs" (
	"id" serial PRIMARY KEY,
	"playId" integer NOT NULL,
	"data" json,
	"play" jsonb NOT NULL,
	"createdAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "plays" (
	"id" serial PRIMARY KEY,
	"uid" varchar(30) NOT NULL UNIQUE,
	"componentId" integer,
	"error" json,
	"playedAt" timestamp,
	"seenAt" timestamp,
	"updatedAt" timestamp NOT NULL,
	"play" jsonb NOT NULL,
	"state" varchar(20) NOT NULL,
	"parentId" integer,
	"jobId" integer,
	"playHash" varchar(100),
	"mbidIdentifier" varchar(100),
	"compacted" varchar(30)
);
--> statement-breakpoint
CREATE TABLE "play_queue_states" (
	"id" serial PRIMARY KEY,
	"playId" integer NOT NULL,
	"componentId" integer NOT NULL,
	"queueName" varchar(50) NOT NULL,
	"queueStatus" varchar(20) DEFAULT 'queued' NOT NULL,
	"retries" integer DEFAULT 0 NOT NULL,
	"error" json,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uid_mode_type_idx" ON "components" ("uid","mode","type");--> statement-breakpoint
CREATE UNIQUE INDEX "play_input_id_idx" ON "play_inputs" ("playId");--> statement-breakpoint
CREATE INDEX "play_parent_id_idx" ON "plays" ("parentId");--> statement-breakpoint
CREATE INDEX "play_component_id_idx" ON "plays" ("componentId");--> statement-breakpoint
CREATE UNIQUE INDEX "play_uid_idx" ON "plays" ("uid");--> statement-breakpoint
CREATE INDEX "play_playedAt_idx" ON "plays" ("playedAt");--> statement-breakpoint
CREATE INDEX "play_seenAt_idx" ON "plays" ("seenAt");--> statement-breakpoint
CREATE INDEX "play_queue_state_id_idx" ON "play_queue_states" ("playId");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_componentFromId_components_id_fkey" FOREIGN KEY ("componentFromId") REFERENCES "components"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_componentToId_components_id_fkey" FOREIGN KEY ("componentToId") REFERENCES "components"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "play_inputs" ADD CONSTRAINT "play_inputs_playId_plays_id_fkey" FOREIGN KEY ("playId") REFERENCES "plays"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "plays" ADD CONSTRAINT "plays_componentId_components_id_fkey" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "plays" ADD CONSTRAINT "plays_parentId_plays_id_fkey" FOREIGN KEY ("parentId") REFERENCES "plays"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "plays" ADD CONSTRAINT "plays_jobId_jobs_id_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "play_queue_states" ADD CONSTRAINT "play_queue_states_playId_plays_id_fkey" FOREIGN KEY ("playId") REFERENCES "plays"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "play_queue_states" ADD CONSTRAINT "play_queue_states_componentId_components_id_fkey" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE CASCADE ON UPDATE CASCADE;