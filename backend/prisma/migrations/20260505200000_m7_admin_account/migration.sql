-- m7: 后台账号密码登录支持
-- - openid 改为可空(后台账号无微信 openid)
-- - 加 username (unique nullable) + password_hash

ALTER TABLE `user`
  MODIFY COLUMN `openid` VARCHAR(64) NULL,
  ADD COLUMN `username` VARCHAR(64) NULL,
  ADD COLUMN `password_hash` VARCHAR(255) NULL,
  ADD UNIQUE KEY `uk_user_username` (`username`);
