// The first forwarded value is the original client-facing proxy value.
export function publicOrigin(request) {
  const url = new URL(request.url);
  const first = (value) => value?.split(',')[0].trim();
  const protocol = first(request.headers.get('x-forwarded-proto')) || url.protocol.replace(/:$/, '');
  const host = first(request.headers.get('x-forwarded-host')) || first(request.headers.get('host')) || url.host;
  return `${protocol}://${host}`;
}
