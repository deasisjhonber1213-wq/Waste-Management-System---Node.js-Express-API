-- Waste Management System schema for the local XAMPP database.
-- Safe to import repeatedly: existing tables and data are not dropped or altered.
-- Existing tables are not retrofitted with foreign keys by CREATE TABLE IF NOT EXISTS.

USE `smartwaste`;

CREATE TABLE IF NOT EXISTS `users` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `role` VARCHAR(30) NOT NULL DEFAULT 'resident',
    `phone` VARCHAR(30) NULL,
    `address` VARCHAR(255) NULL,
    `email_verified` TINYINT(1) NOT NULL DEFAULT 0,
    `sms_notifications_enabled` TINYINT(1) NOT NULL DEFAULT 1,
    `reset_pin` VARCHAR(6) NULL,
    `reset_pin_expires` DATETIME NULL,
    `reset_attempts` INT UNSIGNED NOT NULL DEFAULT 0,
    `password_updated_at` DATETIME NULL,
    `last_login` DATETIME NULL,
    `last_ip` VARCHAR(45) NULL,
    `failed_attempts` INT UNSIGNED NOT NULL DEFAULT 0,
    `locked_at` DATETIME NULL,
    `latitude` DECIMAL(10,7) NULL,
    `longitude` DECIMAL(10,7) NULL,
    `location_updated_at` DATETIME NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_users_email` (`email`),
    KEY `idx_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `routes` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `zone_name` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `waypoints_json` LONGTEXT NULL,
    `path_mode` VARCHAR(50) NOT NULL DEFAULT 'pin',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_routes_zone_name` (`zone_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trucks` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `plate_number` VARCHAR(50) NOT NULL,
    `model` VARCHAR(150) NULL,
    `latitude` DECIMAL(10,7) NULL,
    `longitude` DECIMAL(10,7) NULL,
    `location_updated_at` DATETIME NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_trucks_plate_number` (`plate_number`),
    KEY `idx_trucks_location_updated_at` (`location_updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `route_assignments` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `driver_id` BIGINT UNSIGNED NOT NULL,
    `truck_id` BIGINT UNSIGNED NOT NULL,
    `route_id` BIGINT UNSIGNED NOT NULL,
    `assigned_date` DATE NOT NULL,
    `pickup_type` VARCHAR(50) NOT NULL DEFAULT 'regular',
    `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
    `progress_log` LONGTEXT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_assignment_driver_truck_route_date_type`
        (`driver_id`, `truck_id`, `route_id`, `assigned_date`, `pickup_type`),
    KEY `idx_assignments_driver_date` (`driver_id`, `assigned_date`),
    KEY `idx_assignments_truck_date` (`truck_id`, `assigned_date`),
    KEY `idx_assignments_route_date` (`route_id`, `assigned_date`),
    CONSTRAINT `fk_assignments_driver`
        FOREIGN KEY (`driver_id`) REFERENCES `users` (`id`)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT `fk_assignments_truck`
        FOREIGN KEY (`truck_id`) REFERENCES `trucks` (`id`)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT `fk_assignments_route`
        FOREIGN KEY (`route_id`) REFERENCES `routes` (`id`)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trip_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `assignment_id` BIGINT UNSIGNED NOT NULL,
    `latitude` DECIMAL(10,7) NULL,
    `longitude` DECIMAL(10,7) NULL,
    `logged_at` DATETIME NULL,
    `completed_at` DATETIME NULL,
    `end_time` DATETIME NULL,
    `status` VARCHAR(30) NULL,
    `fuel_used` DECIMAL(10,2) NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_trip_logs_assignment_logged` (`assignment_id`, `logged_at`),
    KEY `idx_trip_logs_logged_at` (`logged_at`),
    CONSTRAINT `fk_trip_logs_assignment`
        FOREIGN KEY (`assignment_id`) REFERENCES `route_assignments` (`id`)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reports` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `resident_id` BIGINT UNSIGNED NULL,
    `resolved_by` BIGINT UNSIGNED NULL,
    `type` VARCHAR(80) NOT NULL,
    `description` TEXT NOT NULL,
    `location_note` VARCHAR(255) NULL,
    `latitude` DECIMAL(10,7) NULL,
    `longitude` DECIMAL(10,7) NULL,
    `image_url` LONGTEXT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
    `admin_notes` TEXT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NULL,
    PRIMARY KEY (`id`),
    KEY `idx_reports_resident_created` (`resident_id`, `created_at`),
    KEY `idx_reports_status_created` (`status`, `created_at`),
    KEY `idx_reports_type` (`type`),
    CONSTRAINT `fk_reports_resident`
        FOREIGN KEY (`resident_id`) REFERENCES `users` (`id`)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT `fk_reports_resolved_by`
        FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `user_type` VARCHAR(30) NOT NULL DEFAULT 'resident',
    `message` TEXT NOT NULL,
    `type` VARCHAR(80) NULL,
    `is_read` TINYINT(1) NOT NULL DEFAULT 0,
    `related_id` BIGINT UNSIGNED NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_notifications_user_created` (`user_id`, `created_at`),
    KEY `idx_notifications_user_type` (`user_id`, `user_type`),
    CONSTRAINT `fk_notifications_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `announcements` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `message` TEXT NOT NULL,
    `pickup_date` DATE NULL,
    `image_url` VARCHAR(1000) NULL,
    `created_by` BIGINT UNSIGNED NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_announcements_created_at` (`created_at`),
    CONSTRAINT `fk_announcements_creator`
        FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `app_settings` (
    `key` VARCHAR(100) NOT NULL,
    `value` LONGTEXT NOT NULL,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mrf_locations` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `address` VARCHAR(255) NULL,
    `latitude` DECIMAL(10,7) NOT NULL,
    `longitude` DECIMAL(10,7) NOT NULL,
    `created_by` BIGINT UNSIGNED NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_mrf_locations_creator` (`created_by`),
    CONSTRAINT `fk_mrf_locations_creator`
        FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(255) NOT NULL,
    `action` VARCHAR(255) NOT NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` TEXT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_audit_logs_user` (`user_id`),
    KEY `idx_audit_logs_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `resident_report_requests` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `resident_id` BIGINT UNSIGNED NOT NULL,
    `request_id` CHAR(36) NOT NULL,
    `report_id` BIGINT UNSIGNED NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_resident_report_request` (`resident_id`, `request_id`),
    KEY `idx_resident_report_requests_created_at` (`created_at`),
    KEY `idx_resident_report_requests_report` (`report_id`),
    CONSTRAINT `fk_resident_report_requests_resident`
        FOREIGN KEY (`resident_id`) REFERENCES `users` (`id`)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT `fk_resident_report_requests_report`
        FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
