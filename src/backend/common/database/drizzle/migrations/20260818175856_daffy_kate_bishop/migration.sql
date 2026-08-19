CREATE TABLE `play_events` (
	`id` integer PRIMARY KEY,
	`playId` integer NOT NULL,
	`eventName` text(50) NOT NULL,
	`data` text,
	`error` text,
	`createdAt` number NOT NULL,
	CONSTRAINT `fk_play_events_playId_plays_id_fk` FOREIGN KEY (`playId`) REFERENCES `plays`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `play_event_id_idx` ON `play_events` (`playId`);