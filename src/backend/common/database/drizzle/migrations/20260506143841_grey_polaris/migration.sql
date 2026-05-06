CREATE TABLE `components` (
	`id` integer PRIMARY KEY,
	`uid` text(200) NOT NULL,
	`mode` text NOT NULL,
	`type` text(50) NOT NULL,
	`name` text NOT NULL,
	`countLive` integer DEFAULT 0 NOT NULL,
	`countNonLive` integer DEFAULT 0 NOT NULL,
	`createdAt` number
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY,
	`componentFromId` integer NOT NULL,
	`componentToId` integer NOT NULL,
	`name` text(50) NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`retries` integer DEFAULT 0 NOT NULL,
	`error` text,
	`transformOptions` text,
	`initialParameters` text,
	`cursor` text,
	`total` integer,
	`imported` integer DEFAULT 0 NOT NULL,
	`scrobbled` integer DEFAULT 0 NOT NULL,
	`createdAt` number NOT NULL,
	`updatedAt` number NOT NULL,
	`completedAt` number,
	CONSTRAINT `fk_jobs_componentFromId_components_id_fk` FOREIGN KEY (`componentFromId`) REFERENCES `components`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_jobs_componentToId_components_id_fk` FOREIGN KEY (`componentToId`) REFERENCES `components`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `play_inputs` (
	`id` integer PRIMARY KEY,
	`playId` integer NOT NULL,
	`data` text,
	`play` text NOT NULL,
	`createdAt` number,
	CONSTRAINT `fk_play_inputs_playId_plays_id_fk` FOREIGN KEY (`playId`) REFERENCES `plays`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `plays` (
	`id` integer PRIMARY KEY,
	`uid` text(30) NOT NULL,
	`componentId` integer,
	`error` text,
	`playedAt` number,
	`seenAt` number,
	`updatedAt` number NOT NULL,
	`play` text NOT NULL,
	`state` text NOT NULL,
	`parentId` integer,
	`jobId` integer,
	`playHash` text,
	`mbidIdentifier` text,
	`compacted` text,
	CONSTRAINT `fk_plays_componentId_components_id_fk` FOREIGN KEY (`componentId`) REFERENCES `components`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_plays_parentId_plays_id_fk` FOREIGN KEY (`parentId`) REFERENCES `plays`(`id`) ON UPDATE CASCADE ON DELETE SET NULL,
	CONSTRAINT `fk_plays_jobId_jobs_id_fk` FOREIGN KEY (`jobId`) REFERENCES `jobs`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `play_queue_states` (
	`id` integer PRIMARY KEY,
	`playId` integer NOT NULL,
	`componentId` integer NOT NULL,
	`queueName` text(50) NOT NULL,
	`queueStatus` text DEFAULT 'queued' NOT NULL,
	`retries` integer DEFAULT 0 NOT NULL,
	`error` text,
	`createdAt` number NOT NULL,
	`updatedAt` number NOT NULL,
	CONSTRAINT `fk_play_queue_states_playId_plays_id_fk` FOREIGN KEY (`playId`) REFERENCES `plays`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_play_queue_states_componentId_components_id_fk` FOREIGN KEY (`componentId`) REFERENCES `components`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uid_mode_type_idx` ON `components` (`uid`,`mode`,`type`);--> statement-breakpoint
CREATE UNIQUE INDEX `play_input_id_idx` ON `play_inputs` (`playId`);--> statement-breakpoint
CREATE INDEX `play_parent_id_idx` ON `plays` (`parentId`);--> statement-breakpoint
CREATE INDEX `play_component_id_idx` ON `plays` (`componentId`);--> statement-breakpoint
CREATE UNIQUE INDEX `play_uid_idx` ON `plays` (`uid`);--> statement-breakpoint
CREATE INDEX `play_playedAt_idx` ON `plays` (`playedAt`);--> statement-breakpoint
CREATE INDEX `play_seenAt_idx` ON `plays` (`seenAt`);--> statement-breakpoint
CREATE INDEX `play_queue_state_id_idx` ON `play_queue_states` (`playId`);