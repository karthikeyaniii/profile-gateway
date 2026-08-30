import { describe, expect, test } from 'bun:test';
import { createApiHandler, parseLinkedInProfileUrl } from '../src/api.ts';
import type { ProfileDocument } from '../src/profile.ts';

const profile: ProfileDocument = {
  profileUrl: 'https://www.linkedin.com/in/alex-example/',
  publicIdentifier: 'alex-example',
  name: 'Alex Example',
  headline: 'Platform Engineer',
  experience: [],
  education: [],
  skills: [],
  certifications: [],
  languages: [],
  images: {},
};

describe('LinkedIn profile URL validation', () => {
  test('accepts canonical and locale-prefixed profile URLs', () => {
    expect(parseLinkedInProfileUrl('https://www.linkedin.com/in/alex-example/?trk=x')).toEqual({
      publicIdentifier: 'alex-example',
      profileUrl: 'https://www.linkedin.com/in/alex-example/',
    });
    expect(parseLinkedInProfileUrl('https://uk.linkedin.com/in/alex-example')).toEqual({
      publicIdentifier: 'alex-example',
      profileUrl: 'https://www.linkedin.com/in/alex-example/',
    });
  });

  test('rejects non-HTTPS, lookalike hosts, and non-profile paths', () => {
    for (const value of [
      'http://www.linkedin.com/in/alex-example',
      'https://linkedin.com.evil.test/in/alex-example',
      'https://www.linkedin.com/company/openai',
      'alex-example',
    ]) {
      expect(() => parseLinkedInProfileUrl(value)).toThrow();
    }
  });
});

describe('profile HTTP API', () => {
  const handler = createApiHandler({
    apiKey: 'secret',
    fetchProfile: async () => ({ ok: true, profile }),
  });

  test('serves an unauthenticated health endpoint', async () => {
    const response = await handler(new Request('http://localhost/health'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('requires a bearer token when API_KEY is configured', async () => {
    const response = await handler(
      new Request('http://localhost/v1/profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: profile.profileUrl }),
      }),
    );
    expect(response.status).toBe(401);
  });

  test('returns a structured profile for a valid request', async () => {
    const response = await handler(
      new Request('http://localhost/v1/profiles', {
        method: 'POST',
        headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
        body: JSON.stringify({ url: profile.profileUrl }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: ProfileDocument };
    expect(body.data.name).toBe('Alex Example');
  });

  test('resolves the authenticated profile when the URL is omitted', async () => {
    let resolved = false;
    const selfHandler = createApiHandler({
      resolveTarget: async () => {
        resolved = true;
        return {
          ok: true,
          target: {
            publicIdentifier: 'alex-example',
            profileUrl: 'https://www.linkedin.com/in/alex-example/',
          },
        };
      },
      fetchProfile: async () => ({ ok: true, profile }),
    });
    const response = await selfHandler(
      new Request('http://localhost/v1/profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(response.status).toBe(200);
    expect(resolved).toBe(true);
  });

  test('reports malformed JSON and invalid URLs as 400', async () => {
    for (const body of ['{', JSON.stringify({ url: 'https://example.com/in/a' })]) {
      const response = await handler(
        new Request('http://localhost/v1/profiles', {
          method: 'POST',
          headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
          body,
        }),
      );
      expect(response.status).toBe(400);
    }
  });

  test('does not leak internal hints in upstream failures', async () => {
    const failing = createApiHandler({
      fetchProfile: async () => ({
        ok: false,
        code: 'AUTH_FAILED',
        message: 'session expired',
        hint: 'li_at=must-not-leak',
      }),
    });
    const response = await failing(
      new Request('http://localhost/v1/profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: profile.profileUrl }),
      }),
    );
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('must-not-leak');
  });
});
