import { createApiHandler, type ParsedProfileUrl, type ProfileFetchResult } from './api.ts';
import type { Session } from './engine/auth.ts';
import { createEngine } from './engine/index.ts';
import { shapeEntity } from './format.ts';
import { shapeFullProfile } from './profile.ts';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is required`);
  return value;
}

function sessionFromEnvironment(): Session {
  return {
    liAt: required('LINKEDIN_LI_AT'),
    jsessionId: required('LINKEDIN_JSESSIONID'),
    userAgent: required('LINKEDIN_USER_AGENT'),
    capturedAt: process.env.LINKEDIN_SESSION_CAPTURED_AT ?? new Date().toISOString(),
  };
}

const session = sessionFromEnvironment();
const engine = createEngine(session, undefined, true);
let queue: Promise<void> = Promise.resolve();

/** Serialize profile calls so concurrent HTTP traffic cannot defeat the shared pacing ledger. */
function fetchProfile(target: ParsedProfileUrl): Promise<ProfileFetchResult> {
  const task = queue.then(async (): Promise<ProfileFetchResult> => {
    const result = await engine.fullProfile(target.publicIdentifier, target.publicIdentifier);
    if (!result.ok) return result;
    if (result.value === undefined) {
      return { ok: false, code: 'NOT_FOUND', message: 'LinkedIn returned no matching profile' };
    }
    return {
      ok: true,
      profile: shapeFullProfile(
        result.value.profile,
        result.value.index,
        target.profileUrl,
        result.value.supplement,
      ),
    };
  });
  queue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

async function resolveTarget() {
  const result = await engine.whoami();
  if (!result.ok) return result;
  if (result.value === undefined) {
    return {
      ok: false as const,
      code: 'NOT_FOUND',
      message: 'authenticated profile was not found',
    };
  }
  const publicIdentifier = shapeEntity(result.value).publicId;
  if (typeof publicIdentifier !== 'string' || publicIdentifier === '') {
    return {
      ok: false as const,
      code: 'SCHEMA_DRIFT',
      message: 'authenticated profile has no public identifier',
    };
  }
  return {
    ok: true as const,
    target: {
      publicIdentifier,
      profileUrl: `https://www.linkedin.com/in/${encodeURIComponent(publicIdentifier)}/`,
    },
  };
}

const apiKey = process.env.API_KEY;
if (process.env.NODE_ENV === 'production' && (apiKey === undefined || apiKey === '')) {
  throw new Error('API_KEY is required when NODE_ENV=production');
}

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1-65535');

const handler = createApiHandler({
  fetchProfile,
  resolveTarget,
  ...(apiKey === undefined || apiKey === '' ? {} : { apiKey }),
  ...(process.env.CORS_ORIGIN === undefined ? {} : { corsOrigin: process.env.CORS_ORIGIN }),
});

Bun.serve({ port, fetch: handler });
process.stderr.write(`profile-gateway API listening on port ${port}\n`);
