-- M8 PR2.6: 拍照功能统一入口 + PDF 自建书双写到 photo_set
-- 1) book 表加 linked_photo_set_id (一本书可能关联到一个用于"逐页校对"的 photo_set)
-- 2) photo_set 表加 source_kind / source_book_id (反向关联 + 区分入口来源)
--    - capture: 拍照/相册照片(默认, 既有数据回填这一类)
--    - pdf:     用户在拍照页直接导入 PDF
--    - book:    自建书 PDF 双写过来的, source_book_id 记录原书
--    PhotoSet 默认 7 天 TTL; 当 source_kind='book' 时, expires_at 在写入时自动延 50 年, 不被清理任务命中

ALTER TABLE `book`
  ADD COLUMN `linked_photo_set_id` BIGINT UNSIGNED NULL AFTER `import_updated_at`,
  ADD INDEX `idx_book_linked_photo_set` (`linked_photo_set_id`);

ALTER TABLE `photo_set`
  ADD COLUMN `source_kind` VARCHAR(16) NOT NULL DEFAULT 'capture' AFTER `total_pages`,
  ADD COLUMN `source_book_id` BIGINT UNSIGNED NULL AFTER `source_kind`,
  ADD INDEX `idx_photo_set_source_book` (`source_book_id`);
