import { isIP } from 'node:net';

/**
 * Validate the ComfyUI trust boundary. Loopback is the safe default because
 * ComfyUI's local API is normally unauthenticated. Remote access requires an
 * explicit opt-in and HTTPS; credentials, query strings and fragments are never
 * accepted in the base URL.
 */
export function normalizeComfyUiUrl(value: string, allowRemote = false): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('INVALID_COMFYUI_URL');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('INVALID_COMFYUI_URL');
  }

  let host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  const family = isIP(host);
  const ipv4Loopback = family === 4 && Number(host.split('.')[0]) === 127;
  const ipv6Loopback = family === 6 && (host === '::1' || host.startsWith('::ffff:127.'));
  const loopback = host === 'localhost' || ipv4Loopback || ipv6Loopback;

  if (!loopback && !allowRemote) throw new Error('REMOTE_COMFYUI_NOT_ALLOWED');
  if (!loopback && url.protocol !== 'https:') throw new Error('REMOTE_COMFYUI_REQUIRES_HTTPS');

  return url.toString().replace(/\/$/, '');
}
