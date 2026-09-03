import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackupPayload } from '../scripts/backup-settimanale.js';

test('buildBackupPayload: include profili e sessioni nel JSON con nome file corretto', () => {
  const now = new Date('2026-09-06T03:00:00.000Z');
  const profiles = [{ id: '1', nome: 'Luisa', eta: 40 }];
  const sessioni = [{ id: 'a', user_id: '1', inizio: '2026-09-05T22:00:00.000Z', fine: null }];

  const { filename, jsonString } = buildBackupPayload(profiles, sessioni, now);
  const parsed = JSON.parse(jsonString);

  assert.equal(filename, 'backup-sonno-tracker-2026-09-06.json');
  assert.deepEqual(parsed.profiles, profiles);
  assert.deepEqual(parsed.sessioni_sonno, sessioni);
  assert.equal(parsed.generato_il, now.toISOString());
});

test('buildBackupPayload: gestisce profili/sessioni null senza errori', () => {
  const now = new Date('2026-09-06T03:00:00.000Z');
  const { jsonString } = buildBackupPayload(null, null, now);
  const parsed = JSON.parse(jsonString);

  assert.deepEqual(parsed.profiles, []);
  assert.deepEqual(parsed.sessioni_sonno, []);
});
