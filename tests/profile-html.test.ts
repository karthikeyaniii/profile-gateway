import { describe, expect, test } from 'bun:test';
import {
  parseProfilePage,
  parseProfileSection,
  parseSkillAssociations,
  parseSkillOverlay,
} from '../src/engine/profile-html.ts';

describe('server-rendered profile sections', () => {
  test('extracts every experience card rather than only the top position', () => {
    const html = `<!doctype html><main><section><h1>Experience</h1>
      <div><a><p>Backend Intern</p><p>Example Labs · Internship</p>
        <p>Jan 2026 - Jun 2026 · 6 mos</p><p>Example City · On-site</p></a></div>
      <hr>
      <div><a><p>ML Intern</p><p>Sample Systems · Internship</p>
        <p>Oct 2024 - Jan 2025 · 4 mos</p><p>Remote</p></a></div>
      <hr>
      <div><a><p>ML Intern</p><p>Demo Technologies · Internship</p>
        <p>May 2024 - Aug 2024 · 4 mos</p><p>Remote</p></a></div>
    </section></main>`;

    const result = parseProfileSection(html, 'experience');
    expect(result.experience).toHaveLength(3);
    expect(result.experience[0]).toEqual({
      title: 'Backend Intern',
      company: 'Example Labs',
      location: 'Example City',
      startDate: { month: 1, year: 2026 },
      endDate: { month: 6, year: 2026 },
    });
  });

  test('extracts skills when LinkedIn renders skill cards', () => {
    const html = `<main><section><h1>Skills</h1>
      <div><a><span>Python</span><span>3 endorsements</span></a></div>
      <div><a><span>Distributed Systems</span></a></div>
    </section></main>`;
    expect(parseProfileSection(html, 'skills').skills).toEqual([
      { name: 'Python' },
      { name: 'Distributed Systems' },
    ]);
  });

  test('discovers experience skill overlays and parses their RSC labels', () => {
    const html = `<main><section>
      <div><a><p>Backend Intern</p><p>Example Labs Â· Internship</p><p>Jan 2026 - Jun 2026</p></a>
      <a href="/in/example/overlay/1000000001/skill-associations-details/">Python and +2</a></div>
    </section></main>`;
    expect(parseSkillAssociations(html)).toEqual([
      { id: '1000000001', title: 'Backend Intern at Example Labs' },
    ]);
    const flight = `{"aria-label":"Collapsed, Python (Programming Language)"}{"aria-label":"Collapsed, Distributed Systems"}`;
    expect(parseSkillOverlay(flight)).toEqual([
      { name: 'Python (Programming Language)' },
      { name: 'Distributed Systems' },
    ]);
  });

  test('extracts every rendered education card', () => {
    const html = `<main><section><h1>Education</h1>
      <a><p>Example University</p><p>BTech, Computer Science</p><p>2022 - 2026</p></a>
      <a><p>Example School</p><p>Computer Science</p><p>2020 - 2022</p></a>
    </section></main>`;
    expect(parseProfileSection(html, 'education').education).toEqual([
      { school: 'Example University', degree: 'BTech', fieldOfStudy: 'Computer Science' },
      { school: 'Example School', degree: 'Computer Science' },
    ]);
  });

  test('extracts the canonical profile image from page metadata', () => {
    const html = `<html><head><meta property="og:image" content="https://media.example/profile.jpg"></head>
      <body><main></main></body></html>`;
    expect(parseProfilePage(html).images.profile).toBe('https://media.example/profile.jpg');
  });

  test('extracts name and the target profile image from the rendered header', () => {
    const html = `<html><head><title>(17) Alex Example | LinkedIn</title></head><body>
      <main><section><p>She/Her</p><p>Software Engineer</p>
      <img src="https://media.example/profile-displayphoto-shrink_800_800/me.jpg">
      <img src="https://media.example/company-logo_100_100/example.jpg"></section></main></body></html>`;
    const result = parseProfilePage(html);
    expect(result.name).toBe('Alex Example');
    expect(result.images.profile).toContain('profile-displayphoto');
  });

  test('challenge or login markup fails loudly', () => {
    expect(() => parseProfileSection('<main>checkpoint/challenge</main>', 'experience')).toThrow();
    expect(() => parseProfileSection('<main>/uas/login</main>', 'skills')).toThrow();
  });
});
