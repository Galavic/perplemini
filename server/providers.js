export function safeUrl(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}
export function normalizeSources(results) {
  const seen = new Set();
  return results.flatMap(r => {
    const url = safeUrl(r.url);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{ id: seen.size, title: String(r.title || new URL(url).hostname).slice(0,250), url, content: String(r.content || '').slice(0,5000), domain: new URL(url).hostname }];
  }).slice(0,12);
}
