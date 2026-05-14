/**
 * 图片本地压缩 — OCR 提速关键一步
 *
 * 为什么要压?
 * - chooseMedia sizeType=['compressed'] 仍可能输出 1-3MB 的 JPEG, 上传 OSS + DashScope
 *   重新拉取双向都是带宽 / 延迟大头。
 * - OCR 模型对清晰度的需求峰值在 1600-2000 像素短边 / JPEG q≥80, 再大不会提升识别率
 *   只是「白送钱白送时间」。
 * - 1600px 短边 + JPEG q85 一般能压到 100-300 KB, 上传 + 传给 DashScope 的时间合计降 70%+。
 *
 * 实现策略:
 * - 优先 wx.compressImage(quality 0-100, 不能直接控边长, 仅是质量压缩)
 *   - quality=85 通常已经够小, 且实现简单 / 无 CPU 抖动
 * - 第二档兜底: wx.canvasToTempFilePath + 自绘 image, 真正控边长(为以后接入)
 *   - MVP 不需要这条路, 留 TODO
 *
 * 容错:
 * - compressImage 报错时不阻塞主流程, 直接返回原路径
 * - 压完比原图还大(罕见, 但 PNG 可能), 也返回原路径
 */

export interface CompressOptions {
  /** JPEG 质量 0-100; OCR 推荐 75-90; 默认 85 */
  quality?: number;
  /** 强制 jpg 输出, 减少 PNG 体积 */
  compressedFileType?: 'jpg' | 'png';
}

interface CompressOk {
  ok: true;
  path: string;
  /** 是否真的压缩了(没成功就 fallback 到原图) */
  compressed: boolean;
}

export function compressImage(
  srcPath: string,
  opts: CompressOptions = {},
): Promise<CompressOk> {
  return new Promise((resolve) => {
    const quality = clampQuality(opts.quality ?? 85);
    if (!srcPath) {
      resolve({ ok: true, path: srcPath, compressed: false });
      return;
    }
    if (typeof wx.compressImage !== 'function') {
      resolve({ ok: true, path: srcPath, compressed: false });
      return;
    }
    wx.compressImage({
      src: srcPath,
      quality,
      compressedFileType: opts.compressedFileType ?? 'jpg',
      success: (res) => {
        const next = (res as { tempFilePath?: string }).tempFilePath || srcPath;
        resolve({ ok: true, path: next, compressed: next !== srcPath });
      },
      fail: () => {
        // 压缩失败回退到原图, 不影响主流程
        resolve({ ok: true, path: srcPath, compressed: false });
      },
    });
  });
}

/**
 * 批量压缩 — 串行(微信压缩本质 CPU 任务, 并行不会更快, 反而抖)
 */
export async function compressBatch(
  paths: string[],
  opts: CompressOptions = {},
): Promise<string[]> {
  const out: string[] = [];
  for (const p of paths) {
    const r = await compressImage(p, opts);
    out.push(r.path);
  }
  return out;
}

function clampQuality(q: number): number {
  if (!Number.isFinite(q)) return 85;
  return Math.max(20, Math.min(100, Math.round(q)));
}
