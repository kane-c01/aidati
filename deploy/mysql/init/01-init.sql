-- ====================================================
-- MySQL 初始化脚本(本地 dev 环境自动执行)
-- ai_quiz 数据库已通过 MYSQL_DATABASE 环境变量自动创建
-- 业务表结构由 Prisma migrate 在 backend 启动后自动应用(M1 起)
--
-- ⚠️ 仅 dev 用:为方便 Prisma migrate dev 自动创建 shadow database,
--   这里给 app 用户开了「prisma_migrate_shadow_db_%」库的全部权限。
--   生产环境严格按最小权限,只授予 ai_quiz.*。
-- ====================================================

SET NAMES utf8mb4;

GRANT ALL PRIVILEGES ON ai_quiz.* TO 'app'@'%';

-- Prisma migrate dev 会创建/销毁 prisma_migrate_shadow_db_<uuid> 库做 diff
GRANT CREATE, DROP, ALTER, REFERENCES, INDEX, SELECT, INSERT, UPDATE, DELETE
  ON `prisma\_migrate\_shadow\_db\_%`.* TO 'app'@'%';

FLUSH PRIVILEGES;

SELECT 'MySQL init completed for ai_quiz (utf8mb4)' AS message;
