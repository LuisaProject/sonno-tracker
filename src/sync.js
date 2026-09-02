import { loadQueue, removeSession } from './queue.js';

export async function syncQueue(storage, userId, upsertFn) {
  const queue = loadQueue(storage);
  for (const sessione of queue) {
    try {
      await upsertFn({ id: sessione.id, user_id: userId, inizio: sessione.inizio, fine: sessione.fine });
      if (sessione.fine !== null) {
        removeSession(storage, sessione.id);
      }
    } catch {
      // Resta in coda: verrà ritentata al prossimo tap, al ritorno online o alla riapertura app.
    }
  }
  return loadQueue(storage);
}
