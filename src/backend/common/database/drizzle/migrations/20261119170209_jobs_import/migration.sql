-- Hand-written: jobs was never written to by any code, so it is dropped and recreated with the new shape.
-- drizzle's generated rebuild (ALTER ADD NOT NULL without default + __new_jobs copy) would fail and copies obsolete columns.
-- DROP TABLE performs an implicit DELETE that cascades through plays.jobId, which is null everywhere since no job ever existed.
-- plays.jobId references jobs by name so it binds to the recreated table.
DROP TABLE `jobs`;--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY,
	`userId` text,
	`name` text(100) NOT NULL,
	`mirrorId` integer NOT NULL,
	`componentFromId` integer,
	`importFile` text,
	`rangeFrom` number,
	`rangeTo` number NOT NULL,
	`persistInputs` integer DEFAULT true NOT NULL,
	`exportOrder` text DEFAULT 'desc' NOT NULL,
	`exportQueueLimit` integer DEFAULT 20 NOT NULL,
	`transformOptions` text,
	`transformSource` text,
	`importStatus` text DEFAULT 'idle' NOT NULL,
	`importCursor` text,
	`importTotal` integer,
	`importFetched` integer DEFAULT 0 NOT NULL,
	`imported` integer DEFAULT 0 NOT NULL,
	`importError` text,
	`importStartedAt` number,
	`importCompletedAt` number,
	`createdAt` number NOT NULL,
	`updatedAt` number NOT NULL,
	CONSTRAINT `fk_jobs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_jobs_mirrorId_play_mirrors_id_fk` FOREIGN KEY (`mirrorId`) REFERENCES `play_mirrors`(`id`),
	CONSTRAINT `fk_jobs_componentFromId_components_id_fk` FOREIGN KEY (`componentFromId`) REFERENCES `components`(`id`) ON UPDATE CASCADE ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `job_user_id_idx` ON `jobs` (`userId`);--> statement-breakpoint
CREATE INDEX `job_mirror_id_idx` ON `jobs` (`mirrorId`);--> statement-breakpoint
CREATE INDEX `play_job_id_idx` ON `plays` (`jobId`);