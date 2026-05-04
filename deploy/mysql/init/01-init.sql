-- ====================================================
-- MySQL 初始化脚本(本地 dev 环境自动执行)
-- ai_quiz 数据库已通过 MYSQL_DATABASE 环境变量自动创建
-- 业务表结构由 Prisma migrate 在 backend 启动后自动应用(M1 起)
-- ====================================================

SET NAMES utf8mb4;

-- 确保 app 用户对 ai_quiz 库有完整权限(便于 Prisma migrate 创建表)
GRANT ALL PRIVILEGES ON ai_quiz.* TO 'app'@'%';
FLUSH PRIVILEGES;

SELECT 'MySQL init completed for ai_quiz (utf8mb4)' AS message;
