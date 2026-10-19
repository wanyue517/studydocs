import { TextDecoder } from 'node:util';

/**
 * Multipart 文件头的 filename 可能由 Busboy 按 Latin-1 读取，而浏览器实际发送 UTF-8。
 * 优先使用由 FormData 单独发送的 UTF-8 普通字段；兼容不发送该字段的旧客户端。
 */
export function normalizeUploadFilename(multipartName: string, utf8FieldName?: string): string {
  const hasExplicitName = typeof utf8FieldName === 'string' && utf8FieldName.trim().length > 0;
  let name = hasExplicitName ? utf8FieldName! : multipartName;

  // 已经是真正的 Unicode 文件名时不做二次转码，防止正常中文被损坏。
  if (!hasExplicitName && /^[\u0000-\u00ff]*$/.test(name) && /[\u0080-\u00ff]/.test(name)) {
    try {
      name = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(name, 'latin1'));
    } catch {
      // 真实的 Latin-1 名称（如 café.pdf）应保持原样。
    }
  }

  return name.normalize('NFC').replace(/[\\/\u0000-\u001f\u007f]/g, '_').trim();
}
