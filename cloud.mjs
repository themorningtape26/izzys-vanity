import { createClient } from '@supabase/supabase-js';

export class ConflictError extends Error {
  constructor() { super('This collection changed on another device. Your device copy is safe. Back it up before loading the cloud version.'); this.name = 'ConflictError'; }
}
export function createCloud(config) {
  const client = createClient(config.url, config.key);
  let owner;
  const revisions = new Map();
  const photoCache = new Map();
  const paths = new Map();
  async function authorize() {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new Error('Please sign in again. Your device draft is still saved.');
    const allowed = await client.from('vanity_accounts').select('user_id').eq('user_id', data.user.id).maybeSingle();
    if (allowed.error || !allowed.data) throw new Error('This account has not been invited to Izzy’s Vanity.');
    if (owner !== data.user.id) { revisions.clear(); photoCache.clear(); paths.clear(); }
    owner = data.user.id;
    return data.user;
  }
  async function photoPath(dataUrl) {
    if (!dataUrl) return '';
    if (paths.has(dataUrl)) return paths.get(dataUrl);
    const blob = await (await fetch(dataUrl)).blob();
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    const hash = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
    const path = `${owner}/${hash}.${blob.type.split('/')[1]}`;
    // Content-addressed, immutable objects: never overwrite another tab's photo.
    const result = await client.storage.from('vanity-photos').upload(path, blob, { contentType: blob.type, upsert: false });
    if (result.error && !['409', 'Duplicate'].includes(String(result.error.statusCode)) && !/already exists/i.test(result.error.message)) throw result.error;
    paths.set(dataUrl, path); photoCache.set(path, dataUrl);
    return path;
  }
  async function photoData(path) {
    if (!path) return '';
    if (!path.startsWith(`${owner}/`)) throw new Error('Invalid photo owner.');
    if (photoCache.has(path)) return photoCache.get(path);
    const result = await client.storage.from('vanity-photos').download(path);
    if (result.error) throw new Error('A photo could not be loaded. Please reconnect and try again.');
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(result.data);
    });
    photoCache.set(path, data); paths.set(data, path);
    return data;
  }
  async function encode(kind, value) {
    const packed = structuredClone(value);
    if (kind === 'collection') for (const product of packed.products) {
      product.photoPath = await photoPath(product.photo); product.photo = '';
    }
    if (kind === 'drafts') for (const draft of Object.values(packed)) if (draft) {
      draft.photoPath = await photoPath(draft.photo || ''); delete draft.photo;
    }
    return packed;
  }
  async function decode(kind, value) {
    if (!value) return null;
    const unpacked = structuredClone(value);
    if (kind === 'collection') for (const product of unpacked.products) {
      product.photo = await photoData(product.photoPath); delete product.photoPath;
    }
    if (kind === 'drafts') for (const draft of Object.values(unpacked)) if (draft) {
      draft.photo = await photoData(draft.photoPath); delete draft.photoPath;
    }
    return unpacked;
  }
  return {
    client, authorize, revision: kind => revisions.get(kind),
    async load(kind) {
      const { data, error } = await client.from('vanity_documents').select('payload,revision').eq('user_id', owner).eq('kind', kind).maybeSingle();
      if (error) throw error;
      revisions.set(kind, data?.revision || 0);
      return decode(kind, data?.payload);
    },
    async save(kind, value, expected = revisions.get(kind)) {
      if (!revisions.has(kind)) throw new Error('Load your cloud collection before saving.');
      const payload = await encode(kind, value);
      const { data, error } = await client.rpc('save_vanity_document', { document_kind: kind, document_payload: payload, expected_revision: expected });
      if (error?.code === '40001') throw new ConflictError();
      if (error) throw error;
      revisions.set(kind, data);
    },
    async recognize(image) {
      const { data } = await client.auth.getSession();
      if (!data.session) throw new Error('Sign in to identify a photo.');
      const response = await fetch('/api/identify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ image }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Photo identification is unavailable. You can still enter the name yourself.');
      return body;
    }
  };
}
