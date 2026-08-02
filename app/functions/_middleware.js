const CANONICAL_HOST = 'poker.buildai.nz';

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.hostname.toLowerCase() === `www.${CANONICAL_HOST}`) {
    url.protocol = 'https:';
    url.hostname = CANONICAL_HOST;
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }

  return context.next();
}