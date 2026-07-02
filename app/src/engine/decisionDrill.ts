import { ALL_DRAWS, generateOutsScenario, hitPercent } from './outsDrill';
import type { DrawType, OutsScenario } from './outsDrill';

// Ties the "how many outs do I have?" drill to the "what do I do about it?"
// decision: equity here is never invented — it's always outs × 2 or × 4 from a
// scenario the Outs Trainer already verifies against the real hand evaluator.
// That's the fix for "where does the 16% come from?": the player counts it
// themselves in phase one, then this module only adds a price to compare it to.

export type DecisionAction = 'fold' | 'call' | 'raise';

export interface DecisionScenario {
  outsScenario: OutsScenario;
  equityPercent: number;
  potBefore: number;
  toCall: number;
  breakEvenPercent: number;
  action: DecisionAction;
  // A draw needs 8+ outs (OESD, flush, or combo) to be a textbook semi-bluff
  // raise candidate — enough equity plus real fold equity to profit from
  // raising rather than just calling. Gutshots (4) and overcards (6) are
  // call-only: live, but not strong enough to represent a raise convincingly.
  raiseEligible: boolean;
}

const round25 = (n: number) => Math.max(25, Math.round(n / 25) * 25);

function computeAction(equityPercent: number, breakEvenPercent: number, outs: number): DecisionAction {
  if (equityPercent < breakEvenPercent) return 'fold';
  return outs >= 8 ? 'raise' : 'call';
}

export function generateDecisionScenario(enabledDraws: DrawType[] = ALL_DRAWS): DecisionScenario {
  // Retry a few times to avoid a razor-thin, unfairly ambiguous tie between
  // equity and the break-even price (e.g. 16% vs 16.4%) — real decisions do
  // sometimes land that close, but a teaching drill shouldn't grade a coin flip.
  for (let tries = 0; tries < 60; tries++) {
    const outsScenario = generateOutsScenario(enabledDraws);
    const equityPercent = hitPercent(outsScenario.outs, outsScenario.cardsToCome);
    const potBefore = round25(100 + Math.random() * 700);
    // Centered on THIS scenario's own equity (which varies from 8% to 60%
    // across draw types) rather than a fixed absolute range — otherwise a
    // fixed price range mostly sits above the smaller draws' equity and the
    // drill ends up almost always "fold", starving practice on call/raise.
    const spread = (Math.random() * 2 - 1) * 22; // ±22 points around equity
    const targetBreakEven = Math.max(8, Math.min(75, equityPercent + spread));
    const toCall = round25(potBefore * (targetBreakEven / (100 - targetBreakEven)));
    const breakEvenPercent = (toCall / (potBefore + toCall)) * 100;
    if (Math.abs(equityPercent - breakEvenPercent) < 3) continue;
    return {
      outsScenario,
      equityPercent,
      potBefore,
      toCall,
      breakEvenPercent,
      action: computeAction(equityPercent, breakEvenPercent, outsScenario.outs),
      raiseEligible: outsScenario.outs >= 8,
    };
  }
  // Fallback (astronomically unlikely): fixed pot/call so the function always returns.
  const outsScenario = generateOutsScenario(enabledDraws);
  const equityPercent = hitPercent(outsScenario.outs, outsScenario.cardsToCome);
  const potBefore = 300;
  const toCall = 100;
  const breakEvenPercent = (toCall / (potBefore + toCall)) * 100;
  return {
    outsScenario,
    equityPercent,
    potBefore,
    toCall,
    breakEvenPercent,
    action: computeAction(equityPercent, breakEvenPercent, outsScenario.outs),
    raiseEligible: outsScenario.outs >= 8,
  };
}
