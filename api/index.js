// Vercel serverless function - handles all /api/* routes
import app from '../server.js';

// Disable Vercel's built-in body parser so multer can handle multipart uploads
// and increase the size limit for file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // Let Express handle all API routes
  return app(req, res);
}
