-- CreateTable
CREATE TABLE `user` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `openid` VARCHAR(64) NOT NULL,
    `unionid` VARCHAR(64) NULL,
    `nickname` VARCHAR(64) NULL,
    `avatar_url` VARCHAR(512) NULL,
    `role` ENUM('user', 'admin', 'super_admin') NOT NULL DEFAULT 'user',
    `status` TINYINT NOT NULL DEFAULT 1,
    `is_minor` TINYINT NOT NULL DEFAULT 0,
    `minor_mode_enabled` TINYINT NOT NULL DEFAULT 0,
    `privacy_version` VARCHAR(16) NULL,
    `privacy_agreed_at` TIMESTAMP(0) NULL,
    `last_login_at` TIMESTAMP(0) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL,
    `deleted_at` TIMESTAMP(0) NULL,

    UNIQUE INDEX `uk_user_openid`(`openid`),
    INDEX `idx_user_unionid`(`unionid`),
    INDEX `idx_user_status`(`status`),
    INDEX `idx_user_deleted_at`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `book` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(256) NOT NULL,
    `author` VARCHAR(128) NULL,
    `isbn` VARCHAR(20) NULL,
    `description` TEXT NULL,
    `cover_url` VARCHAR(512) NULL,
    `pdf_url` VARCHAR(512) NULL,
    `pdf_pages` INTEGER NULL,
    `category` VARCHAR(64) NULL,
    `tags` JSON NULL,
    `source` ENUM('admin', 'user_upload', 'public_domain') NOT NULL DEFAULT 'admin',
    `copyright_status` ENUM('public_domain', 'licensed', 'user_claimed', 'unknown') NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `is_recommended` TINYINT NOT NULL DEFAULT 0,
    `sort_weight` INTEGER NOT NULL DEFAULT 0,
    `created_by` BIGINT UNSIGNED NOT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL,
    `deleted_at` TIMESTAMP(0) NULL,

    INDEX `idx_book_status_recommend`(`status`, `is_recommended`, `sort_weight`),
    INDEX `idx_book_category`(`category`),
    INDEX `idx_book_isbn`(`isbn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chapter` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `book_id` BIGINT UNSIGNED NOT NULL,
    `order_no` INTEGER NOT NULL,
    `title` VARCHAR(256) NOT NULL,
    `start_page` INTEGER NULL,
    `end_page` INTEGER NULL,
    `content_summary` TEXT NULL,
    `content_full` LONGTEXT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_chapter_book_order`(`book_id`, `order_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `photo_set` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `name` VARCHAR(128) NULL,
    `ocr_text` LONGTEXT NULL,
    `ocr_status` ENUM('pending', 'processing', 'done', 'failed') NOT NULL DEFAULT 'pending',
    `total_pages` INTEGER NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `expires_at` TIMESTAMP(0) NOT NULL,

    INDEX `idx_photo_set_user_created`(`user_id`, `created_at`),
    INDEX `idx_photo_set_expires`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `photo` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `photo_set_id` BIGINT UNSIGNED NOT NULL,
    `order_no` INTEGER NOT NULL,
    `image_url` VARCHAR(512) NOT NULL,
    `ocr_text` TEXT NULL,
    `ocr_corrected` TINYINT NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_photo_set_order`(`photo_set_id`, `order_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `paper` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `source_type` ENUM('book', 'chapter', 'photo_set') NOT NULL,
    `book_id` BIGINT UNSIGNED NULL,
    `chapter_id` BIGINT UNSIGNED NULL,
    `photo_set_id` BIGINT UNSIGNED NULL,
    `config` JSON NOT NULL,
    `status` ENUM('generating', 'ready', 'failed', 'submitted', 'graded') NOT NULL DEFAULT 'generating',
    `total_questions` INTEGER NOT NULL DEFAULT 0,
    `llm_model` VARCHAR(64) NULL,
    `llm_tokens_input` INTEGER NULL,
    `llm_tokens_output` INTEGER NULL,
    `llm_cost` DECIMAL(10, 4) NULL,
    `idempotency_key` VARCHAR(128) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL,

    UNIQUE INDEX `uk_paper_idempotency`(`idempotency_key`),
    INDEX `idx_paper_user_created`(`user_id`, `created_at`),
    INDEX `idx_paper_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `question` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `paper_id` BIGINT UNSIGNED NOT NULL,
    `order_no` INTEGER NOT NULL,
    `type` ENUM('single', 'multiple', 'judge', 'fill', 'short_answer') NOT NULL,
    `difficulty` ENUM('easy', 'medium', 'hard') NOT NULL,
    `stem` TEXT NOT NULL,
    `options` JSON NULL,
    `correct_answer` JSON NOT NULL,
    `explanation` TEXT NULL,
    `knowledge_points` JSON NULL,
    `stem_hash` VARCHAR(64) NULL,
    `score` INTEGER NOT NULL DEFAULT 10,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_question_paper_order`(`paper_id`, `order_no`),
    INDEX `idx_question_stem_hash`(`stem_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `answer` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `paper_id` BIGINT UNSIGNED NOT NULL,
    `question_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `user_answer` JSON NULL,
    `is_correct` TINYINT NULL,
    `score` INTEGER NULL,
    `ai_feedback` TEXT NULL,
    `ai_confidence` DECIMAL(3, 2) NULL,
    `graded_by` ENUM('local', 'ai', 'human') NULL,
    `graded_at` TIMESTAMP(0) NULL,
    `time_spent_sec` INTEGER NULL,

    INDEX `idx_answer_user`(`user_id`),
    UNIQUE INDEX `uk_answer_paper_question_user`(`paper_id`, `question_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mistake` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `question_id` BIGINT UNSIGNED NOT NULL,
    `book_id` BIGINT UNSIGNED NULL,
    `stem_hash` VARCHAR(64) NOT NULL,
    `first_wrong_at` TIMESTAMP(0) NOT NULL,
    `last_wrong_at` TIMESTAMP(0) NOT NULL,
    `wrong_count` INTEGER NOT NULL DEFAULT 1,
    `consecutive_correct` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('active', 'mastered', 'manual_mastered') NOT NULL DEFAULT 'active',
    `mastered_at` TIMESTAMP(0) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL,

    INDEX `idx_mistake_user_status`(`user_id`, `status`),
    INDEX `idx_mistake_book`(`book_id`),
    UNIQUE INDEX `uk_mistake_user_stem`(`user_id`, `stem_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usage_quota` (
    `user_id` BIGINT UNSIGNED NOT NULL,
    `date` DATE NOT NULL,
    `used_count` INTEGER NOT NULL DEFAULT 0,
    `invite_bonus` INTEGER NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL,

    PRIMARY KEY (`user_id`, `date`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `moderation_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NULL,
    `scene` ENUM('photo', 'ocr_text', 'book_info', 'answer', 'ai_question', 'ai_explanation', 'pdf_text', 'pdf_cover') NOT NULL,
    `content_hash` VARCHAR(64) NOT NULL,
    `content_snapshot_url` VARCHAR(512) NULL,
    `result` ENUM('pass', 'block', 'warn') NOT NULL,
    `reason` VARCHAR(256) NULL,
    `api_provider` VARCHAR(32) NOT NULL DEFAULT 'wechat',
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_moderation_user_time`(`user_id`, `created_at`),
    INDEX `idx_moderation_scene_result`(`scene`, `result`),
    INDEX `idx_moderation_time`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `admin_id` BIGINT UNSIGNED NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `target_type` VARCHAR(32) NOT NULL,
    `target_id` BIGINT UNSIGNED NULL,
    `meta` JSON NULL,
    `ip` VARCHAR(45) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_admin_log_admin_time`(`admin_id`, `created_at`),
    INDEX `idx_admin_log_target`(`target_type`, `target_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_config` (
    `key_name` VARCHAR(64) NOT NULL,
    `value` JSON NOT NULL,
    `description` VARCHAR(256) NULL,
    `updated_by` BIGINT UNSIGNED NULL,
    `updated_at` TIMESTAMP(0) NOT NULL,

    PRIMARY KEY (`key_name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `book` ADD CONSTRAINT `book_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chapter` ADD CONSTRAINT `chapter_book_id_fkey` FOREIGN KEY (`book_id`) REFERENCES `book`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `photo_set` ADD CONSTRAINT `photo_set_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `photo` ADD CONSTRAINT `photo_photo_set_id_fkey` FOREIGN KEY (`photo_set_id`) REFERENCES `photo_set`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paper` ADD CONSTRAINT `paper_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paper` ADD CONSTRAINT `paper_book_id_fkey` FOREIGN KEY (`book_id`) REFERENCES `book`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paper` ADD CONSTRAINT `paper_chapter_id_fkey` FOREIGN KEY (`chapter_id`) REFERENCES `chapter`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paper` ADD CONSTRAINT `paper_photo_set_id_fkey` FOREIGN KEY (`photo_set_id`) REFERENCES `photo_set`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `question` ADD CONSTRAINT `question_paper_id_fkey` FOREIGN KEY (`paper_id`) REFERENCES `paper`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `answer` ADD CONSTRAINT `answer_paper_id_fkey` FOREIGN KEY (`paper_id`) REFERENCES `paper`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `answer` ADD CONSTRAINT `answer_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `question`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `answer` ADD CONSTRAINT `answer_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mistake` ADD CONSTRAINT `mistake_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mistake` ADD CONSTRAINT `mistake_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `question`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mistake` ADD CONSTRAINT `mistake_book_id_fkey` FOREIGN KEY (`book_id`) REFERENCES `book`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usage_quota` ADD CONSTRAINT `usage_quota_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `moderation_log` ADD CONSTRAINT `moderation_log_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_log` ADD CONSTRAINT `admin_log_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
