import fs from 'node:fs';
import fsp, { type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const extensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm'];

export function ensureOutputDirs(root: string): void {
  for (const directory of ['images', 'videos', 'image-to-video', 'thumbnails']) {
    fs.mkdirSync(path.join(root, directory), { recursive: true, mode: 0o700 });
  }
}

export function safeAssetPath(
  root: string,
  category: 'images' | 'videos' | 'image-to-video',
  filename: string,
): string {
  if (
    filename.includes('/') ||
    filename.includes(String.fromCharCode(92)) ||
    filename === '.' ||
    filename === '..'
  ) {
    throw new Error('INVALID_FILENAME');
  }
  if (!extensions.includes(path.extname(filename).toLowerCase())) {
    throw new Error('UNSUPPORTED_MEDIA_EXTENSION');
  }
  const base = path.resolve(root, category);
  const target = path.resolve(base, filename);
  if (!target.startsWith(base + path.sep)) throw new Error('PATH_TRAVERSAL_BLOCKED');
  return target;
}

/**
 * Persist completed media without ever exposing a partially written target file.
 *
 * The temporary file is created beside the target, fully written and synced, then
 * hard-linked into place. A hard link is an atomic create-if-absent operation on
 * the same filesystem, so existing assets are never overwritten and readers only
 * see the complete file. The temporary name is removed on both success and error.
 */
export async function writeFileAtomic(targetPath: string, bytes: Uint8Array): Promise<void> {
  const target = path.resolve(targetPath);
  const directory = path.dirname(target);
  const temporary = path.join(directory, '.openvibes-' + randomUUID() + '.tmp');
  let handle: FileHandle | undefined;
  let temporaryCreated = false;

  try {
    handle = await fsp.open(temporary, 'wx', 0o600);
    temporaryCreated = true;
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;

    // link() atomically creates target only when it does not already exist.
    // Keeping the temporary file in the same directory guarantees the same volume.
    await fsp.link(temporary, target);
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    if (temporaryCreated) await fsp.unlink(temporary).catch(() => undefined);
  }
}
