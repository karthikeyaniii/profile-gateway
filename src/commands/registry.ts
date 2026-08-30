// Single source of truth for command definitions. Drives CLI dispatch + help,
// the CLI command surface.
//
// `audience` is load-bearing, not documentation: the command dispatcher selects
// commands marked `mcp`, so a write can never reach an agent by accident. The
// research half of this tool is the product; writes are a thin, human-gated
// layer that dispatches the declared command surface.

export type Audience = 'cli' | 'mcp';
export type RiskClass = 'read' | 'local' | 'write';

export interface CommandDef {
  name: string;
  /** Funnel cost hint shown in help + skill. */
  cost: string;
  summary: string;
  usage: string;
  audience: Audience[];
  risk: RiskClass;
  /** false until the command is actually wired up. */
  implemented: boolean;
}

export const COMMANDS: CommandDef[] = [
  // ─── local / meta — no network, available today ────────────────────────────
  {
    name: 'doctor',
    cost: 'free with --offline',
    summary: 'Diagnose setup: entry point, cache dir, cookies, cooldown, budget.',
    usage: 'profile-gateway doctor [--offline]',
    audience: ['cli', 'mcp'],
    risk: 'local',
    implemented: true,
  },
  {
    name: 'budget',
    cost: 'free',
    summary: "Spend ledger per class, with each cap's provenance. Reset a cooldown here.",
    usage: 'profile-gateway budget [--reset-cooldown --confirm]',
    audience: ['cli', 'mcp'],
    risk: 'local',
    implemented: true,
  },
  {
    name: 'risk',
    cost: 'free',
    summary: 'Circuit-breaker state. Check this BEFORE spending budget on research.',
    usage: 'profile-gateway risk',
    audience: ['cli', 'mcp'],
    risk: 'local',
    implemented: true,
  },

  // ─── session ───────────────────────────────────────────────────────────────
  {
    name: 'login',
    cost: 'free — local browser',
    summary: 'Mint a session from a logged-in Chrome via DevTools. Stores cookies owner-only.',
    usage:
      'profile-gateway login\n' +
      '       Requires a Chrome started with remote debugging on port 9222.',
    audience: ['cli'],
    risk: 'local',
    implemented: true,
  },

  // ─── reads — verified live 2026-08-01 ─────────────────────────────────────
  {
    name: 'whoami',
    cost: '1 call',
    summary: 'The authenticated member: name, headline, URN.',
    usage: 'profile-gateway whoami',
    audience: ['cli', 'mcp'],
    risk: 'read',
    implemented: true,
  },
  {
    name: 'profile',
    cost: '1 call (+1 per section)',
    summary: 'A member profile. Expensive sections are opt-in.',
    usage:
      'profile-gateway profile <public-id|urn|url> [--raw]\n' +
      "       Returns headline, location, current title, company and school. LinkedIn's profile\n" +
      '       projections do not return a name — use the identifier you passed in.',
    audience: ['cli', 'mcp'],
    risk: 'read',
    implemented: true,
  },
  {
    name: 'search',
    cost: 'cheap — the net',
    summary: 'Search people, companies or jobs. Cast wide, then deep-read the finalists.',
    usage:
      'profile-gateway search people|companies|jobs "<query>" [--limit N]\n' +
      '       [--compact | --fields a,b,c] [--retain] [--raw]',
    audience: ['cli', 'mcp'],
    risk: 'read',
    implemented: true,
  },
  {
    name: 'post',
    cost: 'expensive — full read',
    summary: 'A post plus its comment thread, cursor-followed.',
    usage:
      'profile-gateway post <activity-urn|url> [--limit N] [--compact | --fields a,b] [--retain]\n' +
      '       Check meta.returnedCount / claimedCount / state. claimedCount > 0 with\n' +
      '       returnedCount 0 is a FAILED FETCH, not an empty thread.',
    audience: ['cli', 'mcp'],
    risk: 'read',
    implemented: true,
  },
  {
    name: 'reactions',
    cost: 'medium',
    summary: 'Who reacted to a post, and with which reaction.',
    usage: 'profile-gateway reactions <activity-urn|url> [--limit N] [--compact | --fields a,b]',
    audience: ['cli', 'mcp'],
    risk: 'read',
    implemented: true,
  },
  {
    name: 'company',
    cost: 'medium',
    summary: 'A company page, optionally with a bounded sample of its updates.',
    usage: 'profile-gateway company <universal-name|url> [--updates N]',
    audience: ['cli', 'mcp'],
    risk: 'read',
    implemented: false,
  },
  {
    name: 'job',
    cost: '1 call',
    summary: 'A job posting detail.',
    usage: 'profile-gateway job <job-id|url>',
    audience: ['cli', 'mcp'],
    risk: 'read',
    implemented: false,
  },
  {
    name: 'feed',
    cost: 'medium',
    summary: 'Your own chronological feed.',
    usage: 'profile-gateway feed [--limit N] [--compact | --fields a,b,c] [--retain] [--raw]',
    audience: ['cli', 'mcp'],
    risk: 'read',
    implemented: true,
  },

  // ─── cache-backed — Phase 4 ────────────────────────────────────────────────
  {
    name: 'sync',
    cost: 'medium — 1-2 calls',
    summary: 'Pull your own posts or connections into the local cache for offline search.',
    usage: 'profile-gateway sync my-posts|connections [--limit N] [--force]',
    audience: ['cli'],
    risk: 'read',
    implemented: true,
  },
  {
    name: 'connections',
    cost: 'free — local cache',
    summary: 'Your connections, from the local cache. Fill it with `sync connections`.',
    usage:
      'profile-gateway connections [-q "<query>"] [--limit N] [--compact | --fields a,b]   # free; cache',
    audience: ['cli', 'mcp'],
    risk: 'read',
    implemented: true,
  },
  {
    name: 'my-posts',
    cost: 'free — local cache',
    summary: 'Your own authored posts, from the local cache. Fill it with `sync my-posts`.',
    usage:
      'profile-gateway my-posts [-q "<query>"] [--limit N] [--compact | --fields a,b]      # free; cache',
    audience: ['cli', 'mcp'],
    risk: 'read',
    implemented: true,
  },
  {
    name: 'local',
    cost: 'free — local cache',
    summary: 'Offline search across everything synced. The default research path after a sync.',
    usage:
      'profile-gateway local "<query>" [--source connections,my-posts,third-party] [--since YYYY-MM-DD]\n' +
      '       [--limit N] [--compact | --fields a,b,c]',
    audience: ['cli', 'mcp'],
    risk: 'read',
    implemented: true,
  },
  {
    name: 'cache-status',
    cost: 'free — local cache',
    summary: 'What is cached, per source, with sync checkpoints and the retention policy.',
    usage: 'profile-gateway cache-status',
    audience: ['cli', 'mcp'],
    risk: 'local',
    implemented: true,
  },
  {
    name: 'purge',
    cost: 'free',
    summary: 'Delete cached data. Never contacts LinkedIn.',
    usage: 'profile-gateway purge [--all] --confirm     # default scope: third-party only',
    audience: ['cli'],
    risk: 'local',
    implemented: true,
  },

  // ─── writes — Phase 6, official OAuth only, never the HTTP API ──────────────────────
  {
    name: 'oauth',
    cost: 'free',
    summary:
      "Obtain and inspect the write credential, over LinkedIn's own self-serve scope. " +
      'Never prints the token.',
    usage:
      'profile-gateway oauth login --client-id <id> [--client-secret <secret>]\n' +
      '       profile-gateway oauth status | logout\n' +
      '       The secret is prompted for if omitted; LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET also work.\n' +
      '       Needs an app you registered: see the hint printed when no token is stored.',
    audience: ['cli'],
    risk: 'local',
    implemented: true,
  },
  {
    name: 'share',
    cost: '1 call — write',
    summary:
      "Post to your own feed. Prefers LinkedIn's official OAuth scope, falls back to the " +
      'private API when no token exists — the prompt always names which.',
    usage:
      'profile-gateway share "<text>" [--visibility public|connections] [--via oauth|voyager]\n' +
      '       Stops and asks at an interactive terminal. No TTY = no write, and no network call.',
    audience: ['cli'],
    risk: 'write',
    implemented: true,
  },
  {
    name: 'comment',
    cost: '1 call — write',
    summary:
      'Add a comment to a post. Harvests its binding tokens from the rendered page; no browser ' +
      'needed, but it costs one heavy read.',
    usage:
      'profile-gateway comment <activity-urn> "<text>"\n' +
      '       Fetches the post page (~2.8 MB) to harvest a binding key and trackingId, and proves\n' +
      '       the key belongs to that post before asking. To change a comment, see `edit`.',
    audience: ['cli'],
    risk: 'write',
    implemented: true,
  },
  {
    name: 'delete',
    cost: '1 read + 1 write',
    summary:
      'Delete one of your own posts or comments. Reads a post back and shows its text first — ' +
      'this is the one action that cannot be undone.',
    usage:
      'profile-gateway delete <activity-urn>     # a post; shows you its text before destroying it\n' +
      '       profile-gateway delete <comment-urn>      # a comment; the server decides if you may',
    audience: ['cli'],
    risk: 'write',
    implemented: true,
  },
  {
    name: 'reply',
    cost: '1 read + 1 write',
    summary:
      'Reply to a comment, nested under it. Goes over Voyager — a different endpoint from ' +
      'commenting, with the parent named in threadUrn.',
    usage: 'profile-gateway reply <comment-urn> "<text>"',
    audience: ['cli'],
    risk: 'write',
    implemented: true,
  },
  {
    name: 'edit',
    cost: '1 read + 1 write',
    summary:
      'Change the text of a comment you wrote. Its own verb, so a comment urn can never be ' +
      'mistaken for something to comment ON.',
    usage: 'profile-gateway edit <comment-urn> "<text>"',
    audience: ['cli'],
    risk: 'write',
    implemented: true,
  },
  {
    name: 'react',
    cost: '1 call — write',
    summary: "React to a post or comment, over LinkedIn's SDUI surface. Reversible with --remove.",
    usage:
      'profile-gateway react <activity-urn | comment-urn> [--type LIKE|PRAISE|EMPATHY|INTEREST|APPRECIATION|ENTERTAINMENT]\n' +
      '       profile-gateway react <urn> --remove          # take the reaction back',
    audience: ['cli'],
    risk: 'write',
    implemented: true,
  },
];

export const commandNames = COMMANDS.map((c) => c.name);

export function findCommand(name: string): CommandDef | undefined {
  return COMMANDS.find((c) => c.name === name);
}

export function helpText(): string {
  const lines = [
    'profile-gateway — deep research over LinkedIn from your own account',
    '',
    'Commands:',
  ];
  const width = Math.max(...commandNames.map((n) => n.length));
  for (const c of COMMANDS) {
    const flag = c.implemented ? ' ' : '·'; // · = designed, not yet wired
    lines.push(`  ${flag} ${c.name.padEnd(width)}  ${c.summary}  [${c.cost}]`);
  }
  lines.push('', '  · = not yet implemented');
  lines.push('', 'Run `profile-gateway <command> --help` for usage.');
  return lines.join('\n');
}
