const getEnvironment = () => {
  if (typeof Deno !== 'undefined') {
    return Deno.env.get('ENVIRONMENT') || 'development';
  }
  return 'development';
};

export const corsHeaders = {
  'Access-Control-Allow-Origin': getEnvironment() === 'production'
    ? 'https://logobout.com'
    : 'http://localhost:3000',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true'
} 