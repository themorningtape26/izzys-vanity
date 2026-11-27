import { createClient } from '@supabase/supabase-js';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, Output } from 'ai';
import { metric } from '@vercel/functions';
import { identificationPrompt, recognitionSchema, validateImage } from '../lib/recognition.mjs';

export default async function handler(req, res) {
  const start = performance.now(); let outcome = 'error';
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Use POST.' }); }
    const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key, ANTHROPIC_API_KEY: apiKey, ANTHROPIC_MODEL: model } = process.env;
    if (!url || !key || !apiKey || !model) return res.status(503).json({ error: 'Photo identification is not connected yet. Your photo draft can still be saved.' });
    const auth = req.headers.authorization || '';
    if (!/^Bearer \S+$/.test(auth)) return res.status(401).json({ error: 'Please sign in.' });
    const client = createClient(url, key, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.getUser(auth.slice(7));
    if (error || !data.user) return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
    const allowed = await client.from('vanity_accounts').select('user_id').eq('user_id', data.user.id).maybeSingle();
    if (allowed.error || !allowed.data) return res.status(403).json({ error: 'This account has not been invited.' });
    let image;
    try { image = validateImage(req.body?.image); } catch (error) { return res.status(400).json({ error: error.message }); }
    // Durable per-account quota, enforced in Postgres rather than an ephemeral function instance.
    const quota = await client.rpc('take_vanity_recognition');
    if (quota.error) return res.status(503).json({ error: 'Could not check the photo allowance. Please try again later.' });
    if (!quota.data) return res.status(429).json({ error: 'Today’s photo identification allowance is used. You can still add products manually.' });
    const result = await generateText({
      model: createAnthropic({ apiKey })(model),
      output: Output.object({ schema: recognitionSchema }),
      messages: [{ role: 'user', content: [{ type: 'text', text: identificationPrompt }, { type: 'image', image }] }],
      maxOutputTokens: 1500,
      abortSignal: AbortSignal.timeout(25_000), maxRetries: 0
    });
    outcome = 'success'; return res.status(200).json(result.output);
  } catch {
    // Never expose provider responses, credentials or photos in logs or client errors.
    return res.status(502).json({ error: 'Could not read this photo right now. Your draft is safe; try a clearer label or enter the name.' });
  } finally {
    metric('vanity.identify.requests', 1, { outcome });
    metric('vanity.identify.duration_ms', performance.now() - start, { outcome });
  }
}
