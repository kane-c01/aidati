-- M8.4: book 表加异步抽章状态字段
-- import_status:preparing / extracting / splitting / ready / failed

ALTER TABLE `book`
  ADD COLUMN `import_status` ENUM('preparing','extracting','splitting','ready','failed') NOT NULL DEFAULT 'ready',
  ADD COLUMN `import_progress` INT NOT NULL DEFAULT 0,
  ADD COLUMN `import_error` TEXT NULL,
  ADD COLUMN `import_updated_at` TIMESTAMP NULL;

-- 已存在的书全部置为 ready(管理员录入 / public_domain 数据本就稳定)
UPDATE `book` SET `import_status` = 'ready' WHERE `import_status` IS NULL;
