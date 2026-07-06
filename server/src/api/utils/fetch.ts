export async function fetchWithTimeout(url: string, options?: RequestInit, timeout = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Timeout: request took more than 15 seconds');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
