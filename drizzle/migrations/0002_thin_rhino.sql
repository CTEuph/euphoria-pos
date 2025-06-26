ALTER TABLE `employees` ADD `role` text DEFAULT 'cashier' NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` DROP COLUMN `can_override_price`;--> statement-breakpoint
ALTER TABLE `employees` DROP COLUMN `can_void_transaction`;--> statement-breakpoint
ALTER TABLE `employees` DROP COLUMN `is_manager`;