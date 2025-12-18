// API URL configuration
// In production (Vercel), API routes are at the same domain
// In development, they're at localhost:3001

const API_BASE_URL = import.meta.env.PROD
  ? '' // Production: use relative URLs (same domain)
  : 'http://localhost:3001'; // Development: use localhost

export default API_BASE_URL;
