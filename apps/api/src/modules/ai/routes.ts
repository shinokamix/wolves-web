import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { rateLimit, type ApiEnv } from '../../http.js';
import { streamTripChat } from './agent/operations.js';
import { runAiAction } from './service.js';

export const aiRoutes = new Hono<ApiEnv>();
aiRoutes.use('*', rateLimit);

aiRoutes.post('/chat', async (context) => {
  const { messages, tripContext } = context.get('body');
  const reader = (await streamTripChat(messages, tripContext)).getReader();
  context.header('Content-Type', 'text/plain; charset=utf-8');
  context.header('Cache-Control', 'no-cache');
  context.header('X-Accel-Buffering', 'no');
  return stream(context, async (output) => {
    output.onAbort(() => { void reader.cancel().catch(() => {}); });
    try {
      while (!output.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        await output.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  });
});

aiRoutes.post('/:action', async (context) => {
  const output = await runAiAction(context.req.param('action'), context.get('body'), context.get('user').id);
  return context.json(output);
});
