import { describe, expect, test } from 'bun:test';
import type { Entity } from '../src/engine/parse.ts';
import { shapeFullProfile } from '../src/profile.ts';

describe('full profile shaping', () => {
  test('normalises profile sections and selects the largest image', () => {
    const root: Entity = {
      $type: 'com.linkedin.voyager.dash.identity.profile.Profile',
      entityUrn: 'urn:li:fsd_profile:1',
      firstName: 'Alex',
      lastName: 'Example',
      publicIdentifier: 'alex-example',
      headline: 'Platform Engineer',
      summary: 'Synthetic profile fixture',
      profilePicture: {
        displayImageReference: {
          vectorImage: {
            rootUrl: 'https://media.example/',
            artifacts: [
              { width: 100, fileIdentifyingUrlPathSegment: 'small.jpg' },
              { width: 800, fileIdentifyingUrlPathSegment: 'large.jpg' },
            ],
          },
        },
      },
    };
    const nodes: Entity[] = [
      {
        $type: 'com.linkedin.voyager.dash.identity.profile.Position',
        entityUrn: 'urn:li:position:1',
        title: 'Engineer',
        companyName: 'Example Labs',
        description: 'Synthetic experience fixture',
        timePeriod: { startDate: { year: 2020 }, endDate: { year: 2022 } },
      },
      {
        $type: 'com.linkedin.voyager.dash.identity.profile.Education',
        entityUrn: 'urn:li:education:1',
        schoolName: 'Example University',
        degreeName: 'Computer Science',
      },
      {
        $type: 'com.linkedin.voyager.dash.identity.profile.Skill',
        entityUrn: 'urn:li:skill:1',
        name: 'Algorithms',
      },
      {
        $type: 'com.linkedin.voyager.dash.identity.profile.Certification',
        entityUrn: 'urn:li:certification:1',
        name: 'Example Certification',
        authority: 'Example Institute',
      },
      {
        $type: 'com.linkedin.voyager.dash.identity.profile.Language',
        entityUrn: 'urn:li:language:1',
        name: 'English',
        proficiency: 'NATIVE_OR_BILINGUAL',
      },
    ];
    const index = new Map(nodes.map((node) => [String(node.entityUrn), node]));

    const result = shapeFullProfile(root, index, 'https://www.linkedin.com/in/alex-example/');
    expect(result.name).toBe('Alex Example');
    expect(result.about).toBe('Synthetic profile fixture');
    expect(result.experience[0]?.title).toBe('Engineer');
    expect(result.education[0]?.school).toBe('Example University');
    expect(result.skills).toEqual([{ name: 'Algorithms' }]);
    expect(result.certifications[0]?.issuer).toBe('Example Institute');
    expect(result.languages[0]?.proficiency).toBe('NATIVE_OR_BILINGUAL');
    expect(result.images.profile).toBe('https://media.example/large.jpg');
  });

  test('returns stable empty arrays when optional sections are unavailable', () => {
    const result = shapeFullProfile(
      { $type: 'profile.Profile', publicIdentifier: 'empty-example' },
      new Map(),
      'https://www.linkedin.com/in/empty-example/',
    );
    expect(result.experience).toEqual([]);
    expect(result.education).toEqual([]);
    expect(result.skills).toEqual([]);
    expect(result.certifications).toEqual([]);
    expect(result.languages).toEqual([]);
  });

  test('resolves nested star-prefixed references used by live geo locations', () => {
    const location: Entity = {
      entityUrn: 'urn:li:fsd_geo:1',
      defaultLocalizedName: 'Example City, Example Region',
    };
    const result = shapeFullProfile(
      {
        $type: 'profile.Profile',
        publicIdentifier: 'location-example',
        geoLocation: { '*geo': 'urn:li:fsd_geo:1' },
      },
      new Map([[String(location.entityUrn), location]]),
      'https://www.linkedin.com/in/location-example/',
    );
    expect(result.location).toBe('Example City, Example Region');
  });
});
