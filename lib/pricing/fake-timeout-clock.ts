// ─────────────────────────────────────────────────────────────────────────────
// TEST-ONLY hulpmiddel — NOOIT importeren vanuit productiecode.
//
// Waarom: timeout-tests maten eerder `Date.now() - start` tegen een echte
// `setTimeout`. Die twee klokken lopen niet synchroon: Node plant een timer
// vanaf de GECACHETE libuv-lustijd (`uv_now`, afgerond op hele ms, bijgewerkt
// aan het begin van een lus-iteratie), terwijl `Date.now()` de actuele
// wandklok leest. Onder runner-last ligt de gecachete lustijd al achter op het
// moment dat de test `start` noteert, dus de timer vuurt — gemeten met
// `Date.now()` — af en toe 1+ ms "te vroeg" (CI: 899ms < 900ms, 39ms < 40ms).
// Een marge is geen oplossing: die is per definitie onbegrensd onder last.
//
// Dit hulpmiddel vervangt `setTimeout`/`clearTimeout` door de nep-klok van
// `node:test` en schuift die per 1 ms op, met tussendoor een volledige
// microtask-flush. Resultaat: het EXACTE virtuele tijdstip waarop de promise
// settelt. Daarmee bewijst een test tegelijk "niet vóór de deadline" (hij was
// op deadline-1 nog niet klaar) en "niet onbeperkt" (hij settelt binnen
// `limitMs`), volledig deterministisch.
// ─────────────────────────────────────────────────────────────────────────────

import type { TestContext } from "node:test";

export interface FakeClockOutcome<T> {
  /** Virtuele ms (sinds `run()` startte) waarop de promise settelde. */
  settledAtMs: number;
  result: PromiseSettledResult<T>;
}

/** Laat alle pending microtasks (ook nieuw geketende) leeglopen; setImmediate wordt niet gemockt. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Draait `run()` op een nep-klok (alleen `setTimeout`/`clearTimeout`) en
 * geeft het exacte virtuele settle-moment terug. Gooit als de promise na
 * `limitMs` virtuele ms nog niet gesetteld is — dan is er geen bovengrens.
 * De nep-klok wordt door `t.mock` na de test automatisch hersteld.
 */
export async function settleOnFakeClock<T>(
  t: TestContext,
  run: () => Promise<T>,
  limitMs: number
): Promise<FakeClockOutcome<T>> {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let result: PromiseSettledResult<T> | null = null;
  run().then(
    (value) => {
      result = { status: "fulfilled", value };
    },
    (reason: unknown) => {
      result = { status: "rejected", reason };
    }
  );
  for (let elapsedMs = 0; ; elapsedMs += 1) {
    await flushMicrotasks();
    if (result) return { settledAtMs: elapsedMs, result };
    if (elapsedMs >= limitMs) {
      throw new Error(`promise na ${limitMs} virtuele ms nog niet gesetteld — geen bovengrens op de wachttijd?`);
    }
    t.mock.timers.tick(1);
  }
}
