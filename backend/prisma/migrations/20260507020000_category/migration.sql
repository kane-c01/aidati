-- 历史迁移:书籍分类(管理员维护)
-- 注:本次发版(2026-05-07)已下线分类管理体系,
--    紧接着的 `20260507030000_drop_category` 会把它 drop 掉。
--    保留本文件仅为了与已应用过此迁移的数据库保持一致(避免 prisma migrate 检测出差异)。
CREATE TABLE IF NOT EXISTS `category` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(64) NOT NULL,
  `sort_weight` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY `uk_category_name` (`name`),
  INDEX `idx_category_active_sort` (`is_active`, `sort_weight`),

  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
