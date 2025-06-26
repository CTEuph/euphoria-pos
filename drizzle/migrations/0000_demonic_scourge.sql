CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_code` text(20) NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`pin` text(60) NOT NULL,
	`is_active` integer DEFAULT true,
	`can_override_price` integer DEFAULT false,
	`can_void_transaction` integer DEFAULT false,
	`is_manager` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_employee_code_unique` ON `employees` (`employee_code`);--> statement-breakpoint
CREATE INDEX `employees_code_idx` ON `employees` (`employee_code`);--> statement-breakpoint
CREATE TABLE `inventory` (
	`product_id` text PRIMARY KEY NOT NULL,
	`current_stock` integer DEFAULT 0 NOT NULL,
	`reserved_stock` integer DEFAULT 0 NOT NULL,
	`last_updated` integer NOT NULL,
	`last_synced_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `product_barcodes` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`barcode` text(50) NOT NULL,
	`is_primary` integer DEFAULT false,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_barcodes_barcode_unique` ON `product_barcodes` (`barcode`);--> statement-breakpoint
CREATE INDEX `product_barcodes_barcode_idx` ON `product_barcodes` (`barcode`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`sku` text(50) NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`size` text NOT NULL,
	`cost` real NOT NULL,
	`retail_price` real NOT NULL,
	`parent_product_id` text,
	`units_in_parent` integer DEFAULT 1,
	`loyalty_point_multiplier` real DEFAULT 1,
	`is_active` integer DEFAULT true,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_unique` ON `products` (`sku`);--> statement-breakpoint
CREATE INDEX `products_sku_idx` ON `products` (`sku`);--> statement-breakpoint
CREATE INDEX `products_category_idx` ON `products` (`category`);