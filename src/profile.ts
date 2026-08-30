import type { Entity } from './engine/parse.ts';
import type { ProfileSupplement } from './engine/profile-html.ts';

export interface ProfileDate {
  month?: number;
  year?: number;
}

export interface ProfileDocument {
  profileUrl: string;
  publicIdentifier: string;
  name?: string;
  headline?: string;
  location?: string;
  about?: string;
  experience: Array<{
    title?: string;
    company?: string;
    location?: string;
    description?: string;
    startDate?: ProfileDate;
    endDate?: ProfileDate;
  }>;
  education: Array<{
    school?: string;
    degree?: string;
    fieldOfStudy?: string;
    description?: string;
    startDate?: ProfileDate;
    endDate?: ProfileDate;
  }>;
  skills: Array<{ name: string }>;
  certifications: Array<{
    name?: string;
    issuer?: string;
    credentialId?: string;
    credentialUrl?: string;
    issuedAt?: ProfileDate;
    expiresAt?: ProfileDate;
  }>;
  languages: Array<{ name: string; proficiency?: string }>;
  images: { profile?: string; background?: string };
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (value === null || typeof value !== 'object') return undefined;
  const nested = (value as { text?: unknown }).text;
  return nested === value ? undefined : stringValue(nested);
}

function dateValue(value: unknown): ProfileDate | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const raw = value as { month?: unknown; year?: unknown };
  const date: ProfileDate = {};
  if (typeof raw.month === 'number') date.month = raw.month;
  if (typeof raw.year === 'number') date.year = raw.year;
  return Object.keys(date).length === 0 ? undefined : date;
}

function period(node: Entity): { startDate?: ProfileDate; endDate?: ProfileDate } {
  const value = node.timePeriod ?? node.dateRange;
  if (value === null || typeof value !== 'object') return {};
  const raw = value as { startDate?: unknown; endDate?: unknown };
  const out: { startDate?: ProfileDate; endDate?: ProfileDate } = {};
  const startDate = dateValue(raw.startDate);
  const endDate = dateValue(raw.endDate);
  if (startDate !== undefined) out.startDate = startDate;
  if (endDate !== undefined) out.endDate = endDate;
  return out;
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) delete value[key];
  }
  return value;
}

function typeOf(node: Entity): string {
  return String(node.$type ?? '').toLowerCase();
}

function largestVectorImage(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const root = value as Record<string, unknown>;
  const image =
    ((root.displayImageReference as Record<string, unknown> | undefined)?.vectorImage as
      | Record<string, unknown>
      | undefined) ??
    (root.vectorImage as Record<string, unknown> | undefined) ??
    root;
  const rootUrl = image.rootUrl;
  const artifacts = image.artifacts;
  if (typeof rootUrl !== 'string' || !Array.isArray(artifacts)) return undefined;
  const candidates = artifacts.filter(
    (item): item is Record<string, unknown> => item !== null && typeof item === 'object',
  );
  candidates.sort((a, b) => Number(b.width ?? 0) - Number(a.width ?? 0));
  const path = candidates[0]?.fileIdentifyingUrlPathSegment;
  return typeof path === 'string' ? `${rootUrl}${path}` : undefined;
}

function dereference(node: Entity, key: string, index: Map<string, Entity>): Entity | undefined {
  const ref = node[key];
  if (typeof ref === 'string') return index.get(ref);
  if (ref !== null && typeof ref === 'object') {
    for (const [nestedKey, nestedRef] of Object.entries(ref as Record<string, unknown>)) {
      if (nestedKey.startsWith('*') && typeof nestedRef === 'string') return index.get(nestedRef);
    }
  }
  return undefined;
}

/** Convert the decorated Voyager profile graph into a stable public API schema. */
export function shapeFullProfile(
  root: Entity,
  index: Map<string, Entity>,
  profileUrl: string,
  supplement: ProfileSupplement = {},
): ProfileDocument {
  const nodes = [...new Set(index.values())];
  const firstName = stringValue(root.firstName);
  const lastName = stringValue(root.lastName);
  const name = [firstName, lastName].filter(Boolean).join(' ') || stringValue(root.name);
  const publicIdentifier =
    stringValue(root.publicIdentifier) ??
    new URL(profileUrl).pathname.split('/').filter(Boolean)[1] ??
    '';
  const geo = dereference(root, 'geoLocation', index);

  const experience = nodes
    .filter((node) => typeOf(node).endsWith('profile.position'))
    .map((node) =>
      removeUndefined({
        title: stringValue(node.title),
        company: stringValue(node.companyName),
        location: stringValue(node.locationName),
        description: stringValue(node.description),
        ...period(node),
      }),
    );
  const education = nodes
    .filter((node) => typeOf(node).endsWith('profile.education'))
    .map((node) =>
      removeUndefined({
        school: stringValue(node.schoolName),
        degree: stringValue(node.degreeName),
        fieldOfStudy: stringValue(node.fieldOfStudy),
        description: stringValue(node.description),
        ...period(node),
      }),
    );
  const skills = nodes
    .filter((node) => typeOf(node).endsWith('profile.skill'))
    .map((node) => stringValue(node.name))
    .filter((name): name is string => name !== undefined)
    .map((name) => ({ name }));
  const certifications = nodes
    .filter((node) => typeOf(node).endsWith('profile.certification'))
    .map((node) => {
      const issuedAt = dateValue(node.startDate);
      const expiresAt = dateValue(node.endDate);
      return removeUndefined({
        name: stringValue(node.name),
        issuer: stringValue(node.authority) ?? stringValue(node.issuer),
        credentialId: stringValue(node.licenseNumber),
        credentialUrl: stringValue(node.url),
        issuedAt,
        expiresAt,
      });
    });
  const languages = nodes
    .filter((node) => typeOf(node).endsWith('profile.language'))
    .map((node) =>
      removeUndefined({
        name: stringValue(node.name) ?? '',
        proficiency: stringValue(node.proficiency),
      }),
    )
    .filter((language) => language.name !== '');

  const result: ProfileDocument = {
    profileUrl,
    publicIdentifier,
    experience: supplement.experience ?? experience,
    education: supplement.education ?? education,
    skills: supplement.skills ?? skills,
    certifications,
    languages,
    images:
      supplement.images ??
      removeUndefined({
        profile: largestVectorImage(root.profilePicture),
        background: largestVectorImage(root.backgroundPicture),
      }),
  };
  const resolvedName = supplement.name ?? name;
  if (resolvedName !== '') result.name = resolvedName;
  const headline = stringValue(root.headline) ?? stringValue(root.occupation);
  if (headline !== undefined) result.headline = headline;
  const location =
    stringValue(geo?.defaultLocalizedName) ??
    stringValue(geo?.localizedName) ??
    stringValue(root.locationName);
  if (location !== undefined) result.location = location;
  const about = stringValue(root.summary) ?? stringValue(root.about);
  if (about !== undefined) result.about = about;
  return result;
}
