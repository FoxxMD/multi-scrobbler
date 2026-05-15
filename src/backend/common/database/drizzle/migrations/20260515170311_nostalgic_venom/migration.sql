CREATE TABLE `plays_historical` (
	`id` integer PRIMARY KEY,
	`uid` text(200),
	`componentId` integer,
	`playedAt` number,
	`seenAt` number,
	`play` text NOT NULL,
	`playHash` text,
	`mbidIdentifier` text,
	CONSTRAINT `fk_plays_historical_componentId_components_id_fk` FOREIGN KEY (`componentId`) REFERENCES `components`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `components` ADD `lastReadyAt` number;--> statement-breakpoint
ALTER TABLE `components` ADD `lastActiveAt` number;--> statement-breakpoint
CREATE INDEX `play_historical_component_id_idx` ON `plays_historical` (`componentId`);--> statement-breakpoint
CREATE UNIQUE INDEX `play_historical_uid_idx` ON `plays_historical` (`uid`);--> statement-breakpoint
CREATE INDEX `play_historical_playedAt_idx` ON `plays_historical` (`playedAt`);