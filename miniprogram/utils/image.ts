/**
 * 图片编辑工具:封装 wx.editImage(裁剪 + 旋转 + 涂鸦)
 *
 * wx.editImage 是微信原生能力, 只接受本地文件路径(wxfile:// / 临时路径)。
 * 网络图(image_url)需要先 wx.downloadFile 下到本地, 再 editImage。
 *
 * 本工具屏蔽差异, 对外暴露两个方法:
 *  - editLocal(localPath): 直接编辑本地图, 返回新 tempFilePath
 *  - editRemote(url):      自动下载 → 编辑, 返回新 tempFilePath
 *
 * 用户取消编辑时 reject 一个 { cancel: true } 错误, 调用方按需吞掉。
 */

export interface EditImageOptions {
  /** 是否在编辑结束后把结果加入相册(用户体验上不开, 避免污染相册) */
  saveToAlbum?: boolean;
}

export interface EditImageCancelError extends Error {
  isCancel: true;
}

function isCancelMsg(msg: string | undefined): boolean {
  if (!msg) return false;
  return /cancel/i.test(msg);
}

function buildCancelError(): EditImageCancelError {
  const e = new Error('用户取消编辑') as EditImageCancelError;
  e.isCancel = true;
  return e;
}

/**
 * 编辑本地图片(临时路径或 wxfile://), 返回新临时路径
 */
export function editLocal(localPath: string, _opts: EditImageOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!localPath) {
      reject(new Error('缺少 localPath'));
      return;
    }
    if (typeof wx.editImage !== 'function') {
      reject(new Error('当前微信版本不支持图片编辑, 请升级微信'));
      return;
    }
    wx.editImage({
      src: localPath,
      success: (res) => {
        const next = (res as { tempFilePath?: string }).tempFilePath;
        if (next) resolve(next);
        else reject(new Error('编辑结果路径缺失'));
      },
      fail: (err) => {
        const msg = (err as { errMsg?: string })?.errMsg;
        if (isCancelMsg(msg)) reject(buildCancelError());
        else reject(new Error(msg ?? '图片编辑失败'));
      },
    });
  });
}

/**
 * 编辑网络图:先 wx.downloadFile 下到本地临时区, 再 editImage
 *
 * 注:downloadFile 的域名必须在 request 合法域名里(server.json),
 *     OSS 直链应已加入 (storage 上传策略保证)。
 */
export function editRemote(url: string, opts: EditImageOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('缺少 url'));
      return;
    }
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`下载失败 status=${res.statusCode}`));
          return;
        }
        editLocal(res.tempFilePath, opts).then(resolve, reject);
      },
      fail: (err) => {
        const msg = (err as { errMsg?: string })?.errMsg ?? '下载失败';
        reject(new Error(msg));
      },
    });
  });
}

export function isEditCancel(err: unknown): boolean {
  return Boolean(err && (err as { isCancel?: boolean }).isCancel);
}
