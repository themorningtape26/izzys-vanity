export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    url: process.env.SUPABASE_URL || '',
    // This is a public key. No database password or service-role key is used anywhere in this app.
    key: process.env.SUPABASE_PUBLISHABLE_KEY || '',
    recognition: Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL)
  });
}
