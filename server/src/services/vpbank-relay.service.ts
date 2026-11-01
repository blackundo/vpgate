import { preferenceService } from './preference.service';

export type VpbankRelayConfig = {
  enabled: boolean;
  url: string;
  secret: string;
};

const RELAY_KEY = 'vpbankRelay';
const ALLOWED_HOSTS = new Set([
  'neo.vpbank.com.vn',
  'asia-east2-vpbank-online-new---prod.cloudfunctions.net',
]);

function normalizeRelayUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Relay URL must use http or https');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Relay URL must not contain credentials, query or fragment');
  }
  return parsed.toString().replace(/\/$/, '');
}

function validateTarget(target: string): void {
  const parsed = new URL(target);
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error('Relay target is not an allowed VPBank HTTPS host');
  }
}

export class VpbankRelayService {
  async getConfig(userId: string): Promise<VpbankRelayConfig | null> {
    const value = await preferenceService.get(userId, RELAY_KEY);
    if (!value || typeof value !== 'object') return null;
    return {
      enabled: value.enabled === true,
      url: typeof value.url === 'string' ? value.url : '',
      secret: typeof value.secret === 'string' ? value.secret : '',
    };
  }

  async getPublicConfig(userId: string) {
    const config = await this.getConfig(userId);
    return {
      enabled: config?.enabled ?? false,
      url: config?.url ?? '',
      hasSecret: !!config?.secret,
    };
  }

  async saveConfig(userId: string, input: { enabled?: boolean; url?: string; secret?: string }) {
    const previous = await this.getConfig(userId);
    const url = normalizeRelayUrl(String(input.url ?? previous?.url ?? '').trim());
    const secret = String(input.secret || previous?.secret || '').trim();
    const enabled = input.enabled === true;
    if (enabled && (!url || !secret)) throw new Error('Relay URL and secret are required when enabled');
    if (secret && secret.length < 24) throw new Error('Relay secret must be at least 24 characters');
    await preferenceService.set(userId, RELAY_KEY, { enabled, url, secret });
    return this.getPublicConfig(userId);
  }

  async fetch(target: string, init: RequestInit, userId?: string): Promise<Response> {
    validateTarget(target);
    const config = userId ? await this.getConfig(userId) : null;
    if (!config?.enabled) return fetch(target, init);
    if (!config.url || !config.secret) throw new Error('VPBank relay is enabled but incomplete');

    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => { headers[key] = value; });
    const body = typeof init.body === 'string' ? init.body : undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const relayResponse = await fetch(`${config.url}/v1/fetch`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.secret}`,
        },
        body: JSON.stringify({ target, method: init.method || 'GET', headers, body }),
        signal: controller.signal,
      });
      const payload: any = await relayResponse.json().catch(() => null);
      if (!relayResponse.ok) {
        throw new Error(`Relay error ${relayResponse.status}: ${payload?.error || 'invalid response'}`);
      }
      if (!payload || typeof payload.status !== 'number' || typeof payload.body !== 'string') {
        throw new Error('Relay returned an invalid response');
      }
      return new Response(Buffer.from(payload.body, 'base64'), {
        status: payload.status,
        headers: payload.headers || {},
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async test(userId: string) {
    const config = await this.getConfig(userId);
    if (!config?.enabled) throw new Error('Enable and save the relay first');
    const response = await this.fetch("https://neo.vpbank.com.vn/cb/odata/ns/authenticationservice/ValidationNonSecureNotificationShare?KeyShare='RELAY-HEALTH-CHECK'&PinShare='INVALID'", {
      method: 'GET',
      headers: { 'user-agent': 'Mozilla/5.0 BillGate Relay Health Check' },
      redirect: 'manual',
    }, userId);
    const location = response.headers.get('location');
    const selfRedirect = response.status >= 300 && response.status < 400 && location?.startsWith('https://neo.vpbank.com.vn');
    return { ok: !selfRedirect, status: response.status, location, message: selfRedirect ? 'Relay IP is still redirected by VPBank WAF' : 'Relay can reach VPBank' };
  }
}

export const vpbankRelayService = new VpbankRelayService();
