import { load } from 'cheerio';
import type { ProfileDate, ProfileDocument } from '../profile.ts';

export type RenderedSection = 'experience' | 'education' | 'skills';

export interface ProfileSupplement {
  name?: string;
  experience?: ProfileDocument['experience'];
  education?: ProfileDocument['education'];
  skills?: ProfileDocument['skills'];
  images?: ProfileDocument['images'];
}

export interface SkillAssociation {
  id: string;
  title: string;
}

const INVALID_PAGE = /checkpoint\/challenge|\/uas\/login|authwall/i;
const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function textLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function date(value: string): ProfileDate | undefined {
  const match = value.match(/\b([A-Za-z]{3})\s+(\d{4})\b/);
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  const month = MONTHS[match[1].toLowerCase()];
  if (month === undefined) return undefined;
  return { month, year: Number(match[2]) };
}

function dateRange(value: string): { startDate?: ProfileDate; endDate?: ProfileDate } {
  const [start = '', end = ''] = value.split(/\s+[-–]\s+/, 2);
  const out: { startDate?: ProfileDate; endDate?: ProfileDate } = {};
  const startDate = date(start);
  const endDate = date(end);
  if (startDate !== undefined) out.startDate = startDate;
  if (endDate !== undefined) out.endDate = endDate;
  return out;
}

function assertProfilePage(html: string): void {
  if (INVALID_PAGE.test(html.slice(0, 20_000))) {
    throw new Error('LinkedIn returned a challenge or login page');
  }
}

export function parseProfileSection(html: string, section: RenderedSection): ProfileSupplement {
  assertProfilePage(html);
  const $ = load(html);
  const root = $('main section').first();

  if (section === 'experience') {
    const experience: ProfileDocument['experience'] = [];
    root.find('a').each((_index, anchor) => {
      const lines = $(anchor)
        .find('p')
        .toArray()
        .map((node) => $(node).text().trim())
        .filter(Boolean);
      const dateAt = lines.findIndex((line) => /\b[A-Za-z]{3}\s+\d{4}\s+[-–]\s+/.test(line));
      if (dateAt < 2) return;
      const title = lines[dateAt - 2];
      const company = lines[dateAt - 1]?.split(/\s*(?:Â·|·)\s*/)[0]?.trim();
      if (title === undefined || company === undefined) return;
      const locationLine = lines[dateAt + 1];
      const location = locationLine?.split(/\s*(?:Â·|·)\s*/)[0]?.trim();
      experience.push({
        title,
        company,
        ...(location === undefined || /skills?/i.test(location) ? {} : { location }),
        ...dateRange(lines[dateAt] ?? ''),
      });
    });
    return { experience };
  }

  if (section === 'education') {
    const education: ProfileDocument['education'] = [];
    root.find('a').each((_index, anchor) => {
      const lines = $(anchor)
        .find('p')
        .toArray()
        .map((node) => $(node).text().trim())
        .filter(Boolean);
      if (lines.length < 2 || lines[0] === undefined || lines[1] === undefined) return;
      const [degree, fieldOfStudy] = lines[1].split(',').map((part) => part.trim());
      education.push({
        school: lines[0],
        ...(degree === undefined ? {} : { degree }),
        ...(fieldOfStudy === undefined ? {} : { fieldOfStudy }),
      });
    });
    return { education };
  }

  const ignored = /^(all|industry knowledge|tools & technologies|other skills|\d+ endorsements?)$/i;
  const names = new Set<string>();
  root.find('a').each((_index, anchor) => {
    const lines = $(anchor)
      .find('p, span')
      .toArray()
      .filter((node) => $(node).children().length === 0)
      .flatMap((node) => textLines($(node).text()));
    const name = lines.find((line) => !ignored.test(line) && !/^show all/i.test(line));
    if (name !== undefined) names.add(name);
  });
  return { skills: [...names].map((name) => ({ name })) };
}

/** Locate the SDUI overlays LinkedIn attaches to each rendered experience card. */
export function parseSkillAssociations(html: string): SkillAssociation[] {
  assertProfilePage(html);
  const $ = load(html);
  const experience = parseProfileSection(html, 'experience').experience ?? [];
  const associations = new Map<string, SkillAssociation>();
  $('a[href*="skill-associations-details"]').each((index, anchor) => {
    const href = $(anchor).attr('href') ?? '';
    const id = href.match(/\/overlay\/(\d+)\/skill-associations-details/)?.[1];
    if (id === undefined) return;
    const item = experience[index];
    const title =
      item?.title !== undefined && item.company !== undefined
        ? `${item.title} at ${item.company}`
        : '';
    if (title !== '') associations.set(id, { id, title });
  });
  return [...associations.values()];
}

/** Extract skill names from an SDUI/RSC overlay without trying to decode React Flight. */
export function parseSkillOverlay(raw: string): ProfileDocument['skills'] {
  const names = new Set<string>();
  for (const match of raw.matchAll(/\\?"aria-label\\?":\\?"Collapsed,\s*([^"\\]+)\\?"/g)) {
    const name = match[1]?.trim();
    if (name !== undefined && name !== '') names.add(name);
  }
  return [...names].map((name) => ({ name }));
}

export function parseProfilePage(html: string): ProfileSupplement {
  assertProfilePage(html);
  const $ = load(html);
  const title = $('meta[property="og:title"]').attr('content') ?? $('title').first().text();
  const name =
    title
      .replace(/^\(\d+\)\s*/, '')
      .replace(/\s*\|\s*LinkedIn.*$/i, '')
      .trim() || undefined;
  const renderedProfileImage = $('main img')
    .toArray()
    .map((node) => $(node).attr('src'))
    .find((source) => source?.includes('profile-displayphoto'));
  const profile = renderedProfileImage ?? $('meta[property="og:image"]').attr('content');
  return {
    ...(name === undefined ? {} : { name }),
    images: profile === undefined ? {} : { profile },
  };
}
