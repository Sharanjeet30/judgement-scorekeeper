export type Player = { id: string; name: string };

export type Round = {
  id: string;
  index: number;    // 1-based
  suit: "Spades" | "Hearts" | "Clubs" | "Diamonds";
  cards: number;    // cards dealt this round
  locked: boolean;  // bids locked
  bids: Record<string, number | undefined>;        // playerId -> bid
  ok: Record<string, boolean | undefined>; // playerId -> whether achieved bid (after round)
};

export type GameSettings = {
  scoringMode: "TEN_PLUS_BID"; // fixed
  targetPoints: number;        // for stats (default 100)
};

export type GameState = {
  id: string;
  createdAt: number;
  players: Player[];
  rounds: Round[];
  settings: GameSettings;
};

const KEY = "judgement-scorekeeper:v5";

export function newGame(): GameState {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    players: [],
    rounds: [],
    settings: { scoringMode: "TEN_PLUS_BID", targetPoints: 100 },
  };
}

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

export function maxCardsForPlayers(count: number): number {
  if (count <= 0) return 13;
  return Math.floor(52 / count);
}

export const SUITS = ["Spades","Hearts","Clubs","Diamonds"] as const;

export function generatePlanRows(playerCount: number, descending: boolean): Array<{cards:number, suit: typeof SUITS[number]}> {
  const max = maxCardsForPlayers(playerCount);
  const seq: number[] = [];
  if (descending) for (let c = max; c >= 1; c--) seq.push(c);
  else for (let c = 1; c <= max; c++) seq.push(c);
  return seq.map((cards, i) => ({ cards, suit: SUITS[i % 4] }));
}

export function computePointsFromOk(bid: number | undefined, ok: boolean | undefined): number {
  if (bid === undefined) return 0;
  if (!ok) return 0;
  return 10 + bid;  // TEN_PLUS_BID only
}

export function totalsByPlayer(state: GameState): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const p of state.players) totals[p.id] = 0;
  for (const r of state.rounds) {
    for (const p of state.players) {
      const pts = computePointsFromOk(r.bids[p.id], r.ok[p.id]);
      totals[p.id] += pts;
    }
  }
  return totals;
}

export function roundsWon(state: GameState, pid: string): number {
  return state.rounds.reduce((acc, r) => acc + (r.ok[pid] ? 1 : 0), 0);
}

export function currentWinStreak(state: GameState, pid: string): number {
  let streak = 0;
  for (let i = state.rounds.length - 1; i >= 0; i--) {
    const r = state.rounds[i];
    const v = r.ok[pid];
    if (v === true) streak++;
    else if (v === false) break;
    else break; // undefined (not decided) breaks streak
  }
  return streak;
}
