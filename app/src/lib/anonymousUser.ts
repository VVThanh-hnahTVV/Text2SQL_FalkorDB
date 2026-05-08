const ANON_ID_KEY = 'anon_id';

function readCookie(name: string): string {
  if (typeof document === 'undefined') {
    return '';
  }
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : '';
}

function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  const encoded = encodeURIComponent(value);
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encoded}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secureFlag}`;
}

function generateAnonymousId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const randomPart = Math.random().toString(36).slice(2, 12);
  return `anon-${Date.now()}-${randomPart}`;
}

export function getOrCreateAnonId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const localValue = localStorage.getItem(ANON_ID_KEY)?.trim() || '';
  const cookieValue = readCookie(ANON_ID_KEY).trim();
  const existing = localValue || cookieValue;

  if (existing) {
    localStorage.setItem(ANON_ID_KEY, existing);
    writeCookie(ANON_ID_KEY, existing);
    return existing;
  }

  const created = generateAnonymousId();
  localStorage.setItem(ANON_ID_KEY, created);
  writeCookie(ANON_ID_KEY, created);
  return created;
}

export function userIdHeaders(): Record<string, string> {
  const anonId = getOrCreateAnonId();
  return anonId ? { 'X-User-Id': anonId } : {};
}
