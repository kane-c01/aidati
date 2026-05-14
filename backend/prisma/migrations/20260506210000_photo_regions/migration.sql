-- M8.1: photo 增加 regions 字段(框选区域 + 区域级 OCR / 图表识别结果)
-- 结构详见 prisma/schema.prisma `Photo.regions` 注释

ALTER TABLE `photo`
  ADD COLUMN `regions` JSON NULL;
