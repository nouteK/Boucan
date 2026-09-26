import { describe, expect, it } from 'vitest';
import { RoomSnapshot, ServerInfo, ServerMessage } from '../src';
import { FIXTURES } from '../fixtures';

/** Contract test: fixtures (what the frontend develops against) must match the schemas. */
describe('fixtures match the contract', () => {
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    it(name, () => {
      expect(fixture.description.length).toBeGreaterThan(10);
      if ('snapshot' in fixture) {
        RoomSnapshot.parse(fixture.snapshot);
        expect(fixture.snapshot.lobby.players.some((p) => p.id === fixture.you)).toBe(true);
      } else if ('serverInfo' in fixture) {
        ServerInfo.parse(fixture.serverInfo);
      } else {
        for (const entry of fixture.messages) ServerMessage.parse('message' in entry ? entry.message : entry);
      }
    });
  }

  it('covers the states the frontend needs', () => {
    expect(Object.keys(FIXTURES)).toEqual(
      expect.arrayContaining([
        'lobbyOnePlayer',
        'lobbyEightPlayers',
        'matchStarting',
        'minigameCountdown',
        'minigameActiveLocal',
        'minigameActiveServer',
        'minigameActiveRelay',
        'minigameResults',
        'matchResults',
        'playerDisconnected',
        'errors',
      ]),
    );
  });
});
