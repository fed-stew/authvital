import { postWebhook, WEBHOOK_TIMEOUT_MS } from './webhook-http';

describe('postWebhook', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('should NEVER follow redirects (SSRF: a public URL must not 302 into private ranges)', async () => {
    await postWebhook('https://receiver.example.com/hook', {}, '{}');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://receiver.example.com/hook',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('should POST with the standard 30s timeout signal', async () => {
    await postWebhook(
      'https://receiver.example.com/hook',
      { 'Content-Type': 'application/json' },
      '{"a":1}',
    );

    const options = fetchMock.mock.calls[0][1];
    expect(options.method).toBe('POST');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(WEBHOOK_TIMEOUT_MS).toBe(30_000);
  });
});
