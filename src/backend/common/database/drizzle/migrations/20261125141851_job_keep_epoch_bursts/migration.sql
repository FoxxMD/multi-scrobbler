ALTER TABLE `job_targets` ADD `epochDecision` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `exportKeepEpochBursts` integer DEFAULT false NOT NULL;