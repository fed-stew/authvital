// Tiny server-render helpers — no template engine, just strings.

export function esc(input: unknown): string {
  return String(input ?? '').replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    };
    return map[c];
  });
}

export function jsonBlock(label: string, data: unknown): string {
  return `<h3>${esc(label)}</h3><pre>${esc(JSON.stringify(data, null, 2))}</pre>`;
}

export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 860px; margin: 24px auto; padding: 0 16px;
         background:#0f1220; color:#e7e9f3; line-height:1.5; }
  h1 { font-size: 1.4rem; } h2 { font-size: 1.1rem; margin-top: 28px; }
  a { color:#6c8cff; } code { background:#0b0e19; padding:1px 5px; border-radius:4px; }
  pre { background:#0b0e19; padding:12px; border-radius:8px; overflow:auto; font-size:.82rem; }
  .card { background:#1a1f36; border:1px solid #2a3150; border-radius:12px; padding:16px; margin:16px 0; }
  .btn { display:inline-block; background:#6c8cff; color:#fff; padding:8px 14px; border-radius:8px;
         text-decoration:none; margin-right:8px; }
  .muted { color:#9aa3c0; } table { border-collapse:collapse; width:100%; font-size:.85rem; }
  th,td { border-bottom:1px solid #2a3150; padding:6px 8px; text-align:left; vertical-align:top; }
</style>
</head>
<body>
${body}
<hr style="border-color:#2a3150;margin-top:32px" />
<p class="muted">AuthVital BFF example · <a href="/">home</a> · <a href="/events">events</a> ·
<a href="/api/protected">/api/protected</a> · <a href="/api/m2m">/api/m2m</a></p>
</body>
</html>`;
}
