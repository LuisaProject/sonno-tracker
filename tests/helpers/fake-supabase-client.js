// Fake minimale del client Supabase per testare la logica di scripts/check-soglia.js
// senza rete. Ogni `.from(tabella)` restituisce un query builder incatenabile che,
// se atteso (await/then), risolve sempre con `tabelle[tabella]` (indipendentemente
// dai filtri applicati: nei test controlliamo direttamente il dato restituito).
// Le chiamate a `.update(...)` vengono registrate in `calls` per poterle verificare.
export function createFakeSupabaseClient(tabelle) {
  const calls = [];

  function builderFor(tabella) {
    const builder = {
      select() {
        return builder;
      },
      single() {
        return builder;
      },
      or() {
        return builder;
      },
      gte() {
        return builder;
      },
      is() {
        return builder;
      },
      eq(colonna, valore) {
        calls.push({ tabella, metodo: 'eq', args: [colonna, valore] });
        return builder;
      },
      update(campi) {
        calls.push({ tabella, metodo: 'update', args: [campi] });
        return builder;
      },
      then(resolve, reject) {
        return Promise.resolve(tabelle[tabella]).then(resolve, reject);
      },
    };
    return builder;
  }

  return {
    calls,
    from(tabella) {
      return builderFor(tabella);
    },
  };
}
