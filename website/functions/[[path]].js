import { handleRequest } from '../server/handler.mjs';
export const onRequest = context => handleRequest(context.request, { ...context.env, ASSETS:{ fetch:request=>context.next(request) } }, { waitUntil:promise=>context.waitUntil(promise) });
