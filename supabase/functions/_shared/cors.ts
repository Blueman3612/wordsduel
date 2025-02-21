const getEnvironment = () => {
  if (typeof Deno !== 'undefined') {
    return Deno.env.get('ENVIRONMENT') || 'development';
  }
  return 'development';
};

const getAllowedOrigin = () => {
  const env = getEnvironment();
  if (env === 'production') {
    return 'https://logobout.com';
  }
  
  // For development and preview environments
  const origin = Deno?.env?.get('ORIGIN');
  if (origin) {
    return origin;
  }
  
  // Allow Vercel preview domains and localhost
  return [
    'http://localhost:3000',
    'https://wordsduel-git-dev-nathan-halls-projects-720edcf9.vercel.app',
    'https://wordsduel-7518xbye9-nathan-halls-projects-720edcf9.vercel.app'
  ];
};

export const corsHeaders = {
  'Access-Control-Allow-Origin': Array.isArray(getAllowedOrigin()) 
    ? Deno?.env?.get('ORIGIN') || getAllowedOrigin()[0]  // Default to first origin if no specific origin found
    : getAllowedOrigin(),
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true'
} 