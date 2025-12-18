// Vercel serverless function - handles all /api/* routes
import app from '../server.js';

export default async function handler(req, res) {
  // Let Express handle all API routes
  return app(req, res);
}
