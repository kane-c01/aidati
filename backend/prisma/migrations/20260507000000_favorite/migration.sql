-- M9 favorite 表
--
-- 记录用户对书的收藏关系, V2 上线该表;
-- 与现有 user / book 关系软约束(FK 同 mistake/paper 现有风格, 不写 ON DELETE CASCADE,
-- 由应用层 cleanup job 处理孤儿)。

CREATE TABLE `favorite` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `book_id` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY `uk_favorite_user_book` (`user_id`, `book_id`),
  KEY `idx_favorite_user_created` (`user_id`, `created_at`),
  KEY `idx_favorite_book` (`book_id`),
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
