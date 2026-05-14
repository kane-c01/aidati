/**
 * 一次性脚本:清空所有 book + chapter
 * 用法:cd backend && npx ts-node scripts/clean-books.ts
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

(async () => {
  const c = await p.chapter.deleteMany({});
  const b = await p.book.deleteMany({});
  console.log(`已清空: chapter=${c.count}, book=${b.count}`);
  await p.$disconnect();
})();
