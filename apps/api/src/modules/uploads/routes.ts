import { Hono } from 'hono';
import { UTApi } from 'uploadthing/server';
import { HttpError, limitBody, mediaType, type ApiEnv } from '../../http.js';

const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const limitImage = limitBody(4 * 1024 * 1024);
export const uploadsRoutes = new Hono<ApiEnv>();

uploadsRoutes.post('/', (context, next) => {
  const type = mediaType(context.req.header('Content-Type'));
  return type && imageTypes.includes(type) ? limitImage(context, next) : next();
}, async (context) => {
  if (!process.env.UPLOADTHING_TOKEN) throw new HttpError(503, 'Image upload is not configured. You can paste an image URL instead.');
  const contentType = context.req.header('Content-Type');
  const type = mediaType(contentType);
  const body = type && imageTypes.includes(type) ? await context.req.arrayBuffer() : null;
  if (!body?.byteLength) throw new HttpError(400, 'Choose a JPEG, PNG, WebP or GIF image (up to 4 MB)');
  const file = new File([body], 'trip-image', { type: contentType });
  const result = await new UTApi().uploadFiles(file);
  if (result.error || !result.data) throw new HttpError(502, 'Image upload failed');
  return context.json({ url: result.data.ufsUrl }, 201);
});
