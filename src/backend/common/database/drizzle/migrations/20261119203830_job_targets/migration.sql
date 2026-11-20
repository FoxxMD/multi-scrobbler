CREATE TABLE `job_targets` (
	`id` integer PRIMARY KEY,
	`jobId` integer NOT NULL,
	`componentId` integer NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`cursor` text,
	`exported` integer DEFAULT 0 NOT NULL,
	`queued` integer DEFAULT 0 NOT NULL,
	`stats` text,
	`error` text,
	`breaker` text NOT NULL,
	`startedAt` number,
	`completedAt` number,
	`createdAt` number NOT NULL,
	`updatedAt` number NOT NULL,
	CONSTRAINT `fk_job_targets_jobId_jobs_id_fk` FOREIGN KEY (`jobId`) REFERENCES `jobs`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_job_targets_componentId_components_id_fk` FOREIGN KEY (`componentId`) REFERENCES `components`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_target_job_component_idx` ON `job_targets` (`jobId`,`componentId`);--> statement-breakpoint
CREATE INDEX `job_target_component_id_idx` ON `job_targets` (`componentId`);