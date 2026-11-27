export const categories = ['Makeup', 'Eyes & brows', 'Skincare', 'Body & lotions', 'Fragrance', 'Hair care', 'Tools & extras'];
export const statuses = ['In rotation', 'Unopened', 'Running low', 'Wishlist', 'Finished'];
export function safeUrl(value) {
  if (!value) return '';
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use a shopping link starting with https:// or http://.');
  return url.href;
}
export function validateBackup(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.products) || !Array.isArray(data.brands)) throw new Error('Choose an Izzy’s Vanity backup file.');
  const ids = new Set();
  const field = (x, key, max, required = false) => { if (typeof x[key] !== 'string' || x[key].length > max || (required && !x[key].trim())) throw new Error(`Invalid ${key} in backup.`); };
  for (const [kind, records] of [['product', data.products], ['brand', data.brands]]) for (const x of records) {
    if (!x || typeof x !== 'object') throw new Error('Invalid record in backup.');
    field(x, 'id', 100, true); field(x, 'name', 100, true); field(x, 'notes', 1000);
    if (ids.has(x.id)) throw new Error('Duplicate records in backup.'); ids.add(x.id);
    if (!Number.isFinite(x.created)) throw new Error('Invalid creation date in backup.');
    if (kind === 'brand') { field(x, 'list', 60, true); field(x, 'url', 4000); safeUrl(x.url); }
    else {
      field(x, 'brand', 80); field(x, 'shade', 80); field(x, 'opened', 10); field(x, 'months', 3); field(x, 'photo', 16000000);
      if (!categories.includes(x.category) || !statuses.includes(x.status) || typeof x.favorite !== 'boolean') throw new Error('Invalid product in backup.');
      if (x.photo && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(x.photo)) throw new Error('Invalid product photo in backup.');
      if (x.opened && (!/^\d{4}-\d{2}-\d{2}$/.test(x.opened) || !Number.isFinite(Date.parse(x.opened)))) throw new Error('Invalid opened date.');
      if (x.months && (!/^\d+$/.test(x.months) || +x.months < 1 || +x.months > 120)) throw new Error('Invalid use-within period.');
    }
  }
  return data;
}
export function filterProducts(products, {category = 'All', view = 'collection', query = '', sort = 'newest'} = {}) {
  const q = query.toLocaleLowerCase().trim();
  return products.filter(p => (category === 'All' || p.category === category) && (view !== 'favorites' || p.favorite) && [p.name, p.brand, p.shade, p.notes].join(' ').toLocaleLowerCase().includes(q)).sort((a,b) => sort === 'newest' ? b.created-a.created : (a[sort] || '').localeCompare(b[sort] || ''));
}
