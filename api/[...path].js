// Vercel serverless function - catch-all for Express app
import app from '../server.js';

// Vercel expects a default export function, not the app directly
export default async function handler(req, res) {
  // Let Express handle the request
  return app(req, res);
}
