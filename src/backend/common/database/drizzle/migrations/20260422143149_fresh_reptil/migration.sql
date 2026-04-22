CREATE TABLE `users_table` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`age` integer NOT NULL,
	`email` text NOT NULL UNIQUE
);
