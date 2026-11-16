const transientCodes = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);
const transientMessage = /can't reach database server|connection terminated|server has closed the connection|timed out fetching a new connection|connection refused|ECONNRESET|ETIMEDOUT/i;

export function isTransientDbError(error) {
  return Boolean(error && (
    transientCodes.has(error.code) ||
    error.name === 'PrismaClientInitializationError' ||
    transientMessage.test(error.message || '')
  ));
}

export function withDbParams(url) {
  if (typeof url !== 'string' || !/^postgres(?:ql)?:\/\//i.test(url)) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('connect_timeout')) parsed.searchParams.append('connect_timeout', '20');
    if (!parsed.searchParams.has('pool_timeout')) parsed.searchParams.append('pool_timeout', '20');
    return parsed.toString();
  } catch {
    return url;
  }
}

export async function retryTransient(fn, { retries = 3, delays = [300, 1000, 2500], sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries || !isTransientDbError(error)) throw error;
      await sleep(delays[attempt] ?? delays[delays.length - 1] ?? 0);
    }
  }
}
