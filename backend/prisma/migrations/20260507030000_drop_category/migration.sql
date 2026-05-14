-- 移除「书籍分类」体系
-- 业务决策:小程序定位为考证学习, 不再做分类管理, 用「推荐 + 标签 + 全文搜索」即可。
-- 1. 删除 book.category 字段及其索引
-- 2. 删除 category 表(若存在)
-- 备注:旧 category 名字弃用, 不做数据迁移; 想保留的请用 tags。

ALTER TABLE `book` DROP INDEX `idx_book_category`;
ALTER TABLE `book` DROP COLUMN `category`;

DROP TABLE IF EXISTS `category`;
