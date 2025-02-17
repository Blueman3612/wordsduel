const isProd = process.env.NODE_ENV === 'production'

export const config = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  githubClientId: isProd 
    ? 'Ov23liampCT2G2nvJeyc'  // Production Client ID
    : 'Ov23liZDOkq7h0o8w2aj',    // Development Client ID
  baseUrl: isProd
    ? 'https://wordsduel.vercel.app'  // Production URL
    : 'http://localhost:3000'         // Development URL
} 