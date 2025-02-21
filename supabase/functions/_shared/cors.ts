// Define allowed origins
const ALLOWED_ORIGINS = {
  development: [
    'http://localhost:3000',
    'https://wordsduel-git-dev-nathan-halls-projects-720edcf9.vercel.app',
    'https://wordsduel-7518xbye9-nathan-halls-projects-720edcf9.vercel.app'
  ],
  production: ['https://logobout.com']
};

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true'
};

// Runtime function to get correct CORS headers
export const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get('origin');
  const env = typeof Deno !== 'undefined' ? Deno.env.get('ENVIRONMENT') || 'development' : 'development';
  const allowedOrigins = ALLOWED_ORIGINS[env as keyof typeof ALLOWED_ORIGINS];
  
  return {
    ...corsHeaders,
    'Access-Control-Allow-Origin': origin && allowedOrigins.includes(origin) 
      ? origin 
      : allowedOrigins[0]
  };
}; 