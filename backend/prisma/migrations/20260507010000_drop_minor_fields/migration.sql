-- 移除"未成年人模式"相关字段(产品决策, 不再支持该模式)
-- 同步删除 system_config 中的可用时段配置项

ALTER TABLE `user`
  DROP COLUMN `is_minor`,
  DROP COLUMN `minor_mode_enabled`;

DELETE FROM `system_config` WHERE `key_name` = 'minor_mode_window';
