const STORAGE_KEY = 'sonno_queue';

export function loadQueue(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveQueue(storage, queue) {
  storage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function startSession(storage, id, inizioISO) {
  const queue = loadQueue(storage);
  queue.push({ id, inizio: inizioISO, fine: null });
  saveQueue(storage, queue);
  return queue;
}

export function endSession(storage, id, fineISO) {
  const queue = loadQueue(storage);
  const sessione = queue.find((s) => s.id === id);
  if (sessione) sessione.fine = fineISO;
  saveQueue(storage, queue);
  return queue;
}

export function getActiveSession(storage) {
  const queue = loadQueue(storage);
  return queue.find((s) => s.fine === null) || null;
}

export function removeSession(storage, id) {
  const queue = loadQueue(storage).filter((s) => s.id !== id);
  saveQueue(storage, queue);
  return queue;
}
