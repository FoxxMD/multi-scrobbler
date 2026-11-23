CREATE TABLE `play_mirrors` (
	`id` integer PRIMARY KEY,
	`userId` text,
	`service` text(50) NOT NULL,
	`account` text(200),
	`name` text NOT NULL,
	`coverage` text NOT NULL,
	`createdAt` number NOT NULL,
	`updatedAt` number NOT NULL,
	CONSTRAINT `fk_play_mirrors_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `plays_historical` ADD `mirrorId` integer REFERENCES play_mirrors(id) ON UPDATE CASCADE ON DELETE CASCADE;--> statement-breakpoint
CREATE INDEX `mirror_user_id_idx` ON `play_mirrors` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `mirror_user_service_account_idx` ON `play_mirrors` (`userId`,`service`,`account`);--> statement-breakpoint
CREATE INDEX `play_historical_mirror_played_idx` ON `plays_historical` (`mirrorId`,`playedAt`);