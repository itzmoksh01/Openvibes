export async function readResponseBuffer(
  response: Response,
  maxBytes: number,
  errorCode: string,
): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error('INVALID_RESPONSE_SIZE_LIMIT');
  }
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error(`${errorCode}_TOO_LARGE`);
    }
  }

  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`${errorCode}_TOO_LARGE`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export async function readResponseText(
  response: Response,
  maxBytes: number,
  errorCode: string,
): Promise<string> {
  return (await readResponseBuffer(response, maxBytes, errorCode)).toString('utf8');
}

export async function readResponseJson<T>(
  response: Response,
  maxBytes: number,
  errorCode: string,
): Promise<T> {
  const body = await readResponseText(response, maxBytes, errorCode);
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`${errorCode}_INVALID_JSON`);
  }
}
