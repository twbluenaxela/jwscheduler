export async function fetchRetry(input, init) {
  const response = await fetch(input, init);
  if (response.status !== 503) return response;
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return fetch(input, init);
}
