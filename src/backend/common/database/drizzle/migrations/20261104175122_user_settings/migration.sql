CREATE TABLE `user_settings` (
	`userId` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `user_settings_pk` PRIMARY KEY(`userId`, `key`),
	CONSTRAINT `fk_user_settings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
