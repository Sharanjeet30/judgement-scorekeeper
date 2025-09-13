export type Player = { id: string; name: string; };

export type Round = {
  id: string;
  index: number;          // 1-based round number
  trump: string;          // Hearts/Spades/Clubs/Diamonds/NoTrumps
  cards: number;          // number of cards dealt this round
  bids: Record<string, number>;   // playerId -> bid
  tricks: Record<string, number>; // playerId -> actual
  locked: boolean;
};

export type GameSettings = {
  scoringMode: "BID_EQUALS_POINTS" | "TEN_PLUS_BID";
  allowNoTrumps: boolean;
};

export type GameState = {
  id: string;
  createdAt: number;
  players: Player[];
  rounds: Round[];
  settings: GameSettings;
};

const KEY = "judgement-scorekeeper:v2";

export function load(): GameState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function save(state: GameState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function clear() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

export function newGame(): GameState {
  const id = crypto.randomUUID();
  return {
    id,
    createdAt: Date.now(),
    players: [],
    rounds: [],
    settings: { scoringMode: "TEN_PLUS_BID", allowNoTrumps: true },
  };
}

export function computePoints(
  bid: number | undefined,
  tricks: number | undefined,
  mode: GameSettings["scoringMode"]
): number {
  if (bid === undefined || tricks === undefined) return 0;
  const ok = bid === tricks;
  if (!ok) return 0;
  return mode === "TEN_PLUS_BID" ? 10 + bid : bid;
}

export function totalsByPlayer(state: GameState): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const p of state.players) totals[p.id] = 0;
  for (const r of state.rounds) {
    for (const p of state.players) {
      const pts = computePoints(r.bids[p.id], r.tricks[p.id], state.settings.scoringMode);
      totals[p.id] += pts;
    }
  }
  return totals;
}

export function standingsByRound(state: GameState): Array<Record<string, number>> {
  const hist: Array<Record<string, number>> = [];
  const running: Record<string, number> = {};
  for (const p of state.players) running[p.id] = 0;
  for (const r of state.rounds) {
    for (const p of state.players) {
      const pts = computePoints(r.bids[p.id], r.tricks[p.id], state.settings.scoringMode);
      running[p.id] += pts;
    }
    hist.push({ ...running });
  }
  return hist;
}

export function generatePlan(playerCount: number, direction: "ASC" | "DESC"): number[] {
  // For 4 players: 13..1 or 1..13 ; For 5 players: 10..1 or 1..10
  const start = playerCount === 5 ? 10 : 13;
  const seq: number[] = [];
  if (direction === "DESC") for (let c = start; c >= 1; c--) seq.push(c);
  else for (let c = 1; c <= start; c++) seq.push(c);
  return seq;
}
