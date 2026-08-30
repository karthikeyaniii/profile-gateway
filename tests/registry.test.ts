import { describe, expect, test } from 'bun:test';
import { COMMANDS, commandNames, findCommand, helpText } from '../src/commands/registry.ts';

describe('registry integrity', () => {
  test('command names are unique', () => {
    expect(new Set(commandNames).size).toBe(commandNames.length);
  });

  test('every command declares a usage line naming itself', () => {
    for (const c of COMMANDS) {
      expect(c.usage).toContain(`profile-gateway ${c.name}`);
    }
  });

  test('every command has a non-empty summary and cost hint', () => {
    for (const c of COMMANDS) {
      expect(c.summary.length).toBeGreaterThan(0);
      expect(c.cost.length).toBeGreaterThan(0);
    }
  });

  test('findCommand resolves a known name and rejects an unknown one', () => {
    expect(findCommand('doctor')?.name).toBe('doctor');
    expect(findCommand('definitely-not-a-command')).toBeUndefined();
  });
});

describe('help', () => {
  test('lists every command', () => {
    const help = helpText();
    for (const name of commandNames) {
      expect(help).toContain(name);
    }
  });

  test('marks unimplemented commands so help never overpromises', () => {
    expect(helpText()).toContain('not yet implemented');
  });
});
