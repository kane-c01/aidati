/**
 * BigInt JSON 序列化补丁
 * 文档:03-API接口文档.md §1.6 - 业务 ID 一律 BIGINT, JSON 中以字符串返回
 *
 * Node 原生 JSON.stringify 遇 BigInt 会抛 TypeError, 全局打补丁后转为字符串
 * 在 main.ts 启动时调用一次即可
 */
export function patchBigIntJson(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (BigInt.prototype as any).toJSON = function (): string {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self: bigint = this as unknown as bigint;
    return self.toString();
  };
}
