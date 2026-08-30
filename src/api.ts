import type { Entity } from './engine/parse.ts';
import type { ProfileDocument } from './profile.ts';

export interface ParsedProfileUrl {
  publicIdentifier: string;
  profileUrl: string;
}

export function parseLinkedInProfileUrl(input: string): ParsedProfileUrl {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('url must be an absolute LinkedIn profile URL');
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || (host !== 'linkedin.com' && !host.endsWith('.linkedin.com'))) {
    throw new Error('url must use HTTPS on linkedin.com');
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'in' || parts[1] === undefined) {
    throw new Error('url must point to a LinkedIn member profile (/in/<public-id>)');
  }
  const publicIdentifier = decodeURIComponent(parts[1]);
  if (!/^[\p{L}\p{N}_%-]+$/u.test(publicIdentifier)) {
    throw new Error('profile public identifier contains unsupported characters');
  }
  return {
    publicIdentifier,
    profileUrl: `https://www.linkedin.com/in/${encodeURIComponent(publicIdentifier)}/`,
  };
}

export type ProfileFetchResult =
  | { ok: true; profile: ProfileDocument }
  | { ok: false; code: string; message: string; hint?: string; retryAfterMs?: number };

export type TargetResolution =
  | { ok: true; target: ParsedProfileUrl }
  | { ok: false; code: string; message: string };

export interface ApiDependencies {
  fetchProfile: (target: ParsedProfileUrl) => Promise<ProfileFetchResult>;
  resolveTarget?: () => Promise<TargetResolution>;
  apiKey?: string;
  corsOrigin?: string;
}

function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

function upstreamStatus(code: string): number {
  if (code === 'NOT_FOUND') return 404;
  if (code === 'RATE_LIMITED' || code === 'BUDGET_EXHAUSTED' || code === 'COOLDOWN_ACTIVE')
    return 429;
  return 502;
}

async function readTarget(
  request: Request,
  cors: Record<string, string>,
  resolveTarget: ApiDependencies['resolveTarget'],
): Promise<ParsedProfileUrl | Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 8192) return json(413, { error: { code: 'PAYLOAD_TOO_LARGE' } }, cors);

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 8192) return json(413, { error: { code: 'PAYLOAD_TOO_LARGE' } }, cors);
    body = JSON.parse(raw);
  } catch {
    return json(
      400,
      { error: { code: 'INVALID_INPUT', message: 'body must be valid JSON' } },
      cors,
    );
  }
  const suppliedUrl =
    body !== null && typeof body === 'object' ? (body as Record<string, unknown>).url : undefined;
  if (suppliedUrl === undefined && resolveTarget !== undefined) {
    const resolved = await resolveTarget();
    if (resolved.ok) return resolved.target;
    return json(
      upstreamStatus(resolved.code),
      { error: { code: resolved.code, message: resolved.message } },
      cors,
    );
  }
  if (typeof suppliedUrl !== 'string') {
    return json(400, { error: { code: 'INVALID_INPUT', message: 'url must be a string' } }, cors);
  }
  try {
    return parseLinkedInProfileUrl(suppliedUrl);
  } catch (error) {
    return json(400, { error: { code: 'INVALID_INPUT', message: (error as Error).message } }, cors);
  }
}

/** Framework-free Fetch handler, usable by Bun.serve and straightforward to unit test. */
export function createApiHandler(deps: ApiDependencies): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    const cors: Record<string, string> =
      deps.corsOrigin === undefined ? {} : { 'access-control-allow-origin': deps.corsOrigin };
    if (request.method === 'GET' && url.pathname === '/health') {
      return json(200, { status: 'ok' }, cors);
    }
    if (request.method === 'OPTIONS' && url.pathname === '/v1/profiles') {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-allow-methods': 'POST, OPTIONS',
        },
      });
    }
    if (url.pathname !== '/v1/profiles') return json(404, { error: { code: 'NOT_FOUND' } }, cors);
    if (request.method !== 'POST') {
      return json(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'use POST' } }, cors);
    }
    if (
      deps.apiKey !== undefined &&
      request.headers.get('authorization') !== `Bearer ${deps.apiKey}`
    ) {
      return json(
        401,
        { error: { code: 'UNAUTHORIZED', message: 'a valid bearer token is required' } },
        cors,
      );
    }
    const target = await readTarget(request, cors, deps.resolveTarget);
    if (target instanceof Response) return target;

    const result = await deps.fetchProfile(target);
    if (!result.ok) {
      const status = upstreamStatus(result.code);
      const headers = { ...cors };
      if (result.retryAfterMs !== undefined) {
        headers['retry-after'] = String(Math.ceil(result.retryAfterMs / 1000));
      }
      return json(status, { error: { code: result.code, message: result.message } }, headers);
    }
    return json(200, { data: result.profile }, cors);
  };
}

// Retained as a compile-time boundary: API code never returns Voyager entities directly.
export type InternalProfileGraph = { profile: Entity; index: Map<string, Entity> };
