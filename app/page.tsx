'use client';

import { useEffect, useMemo, useState } from "react";
import {
  GameState, Player, Round, newGame, load, save, clear,
  totalsByPlayer, standingsByRound, computePoints, generatePlan
} from "@/lib/storage";

const SUITS = ["Spades", "Hearts", "Clubs", "Diamonds", "NoTrumps"] as const;
type Suit = typeof SUITS[number];

export default function Home() {
  const [state, setState] = useState<GameState>(() => load() ?? newGame());
  const [playerName, setPlayerName] = useState("");

  useEffect(() => { save(state); }, [state]);

  const totals = useMemo(() => totalsByPlayer(state), [state]);
  const hist = useMemo(() => standingsByRound(state), [state]);
  const playersSorted = useMemo(() => [...state.players].sort((a, b) => totals[b.id] - totals[a.id]), [state.players, totals]);

  function addPlayer() {
    if (!playerName.trim()) return;
    const p: Player = { id: crypto.randomUUID(), name: playerName.trim() };
    setState(s => ({ ...s, players: [...s.players, p] }));
    setPlayerName("");
  }

  function removePlayer(id: string) {
    setState(s => ({
      ...s,
      players: s.players.filter(p => p.id !== id),
      rounds: s.rounds.map(r => {
        const { [id]: _, ...bidsRest } = r.bids;
        const { [id]: __, ...tricksRest } = r.tricks;
        return { ...r, bids: bidsRest, tricks: tricksRest };
      })
    }));
  }

  function addRound() {
    const r: Round = {
      id: crypto.randomUUID(),
      index: state.rounds.length + 1,
      trump: state.settings.allowNoTrumps ? "NoTrumps" : "Spades",
      cards: 1,
      bids: {},
      tricks: {},
      locked: false,
    };
    setState(s => ({ ...s, rounds: [...s.rounds, r] }));
  }

  function setTrump(rid: string, suit: Suit) {
    setState(s => ({ ...s, rounds: s.rounds.map(r => r.id === rid ? { ...r, trump: suit } : r) }));
  }

  function setCards(rid: string, val: number) {
    setState(s => ({ ...s, rounds: s.rounds.map(r => r.id === rid ? { ...r, cards: Math.max(1, val) } : r) }));
  }

  function setBid(rid: string, pid: string, val: number) {
    setState(s => ({ ...s, rounds: s.rounds.map(r => r.id === rid ? { ...r, bids: { ...r.bids, [pid]: val } } : r) }));
  }

  function setTrick(rid: string, pid: string, val: number) {
    setState(s => ({ ...s, rounds: s.rounds.map(r => r.id === rid ? { ...r, tricks: { ...r.tricks, [pid]: val } } : r) }));
  }

  function lockRound(rid: string, locked: boolean) {
    setState(s => ({ ...s, rounds: s.rounds.map(r => r.id === rid ? { ...r, locked } : r) }));
  }

  function resetAll() {
    if (!confirm("Start a fresh game? This clears local data.")) return;
    clear();
    setState(newGame());
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `judgement-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { setState(JSON.parse(String(reader.result))); }
      catch { alert("Invalid JSON"); }
    };
    reader.readAsText(file);
  }

  useEffect(() => { if (state.rounds.length === 0) addRound(); }, []);

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Judgement Scorekeeper</h1>
        <div className="flex items-center gap-2">
          <button onClick={exportJson} className="px-3 py-1 rounded-xl border">Export</button>
          <label className="px-3 py-1 rounded-xl border cursor-pointer">
            Import
            <input type="file" accept="application/json" onChange={importJson} className="hidden" />
          </label>
          <button onClick={resetAll} className="px-3 py-1 rounded-xl border">New Game</button>
        </div>
      </header>

      {/* Players */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Players</h2>
        <div className="flex gap-2">
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Add player name"
            className="border rounded-xl px-3 py-2 flex-1"
          />
          <button onClick={addPlayer} className="px-3 py-2 rounded-xl bg-black text-white">Add</button>
        </div>
        {state.players.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {state.players.map(p => (
              <li key={p.id} className="px-3 py-1 rounded-full border flex items-center gap-2">
                <span>{p.name}</span>
                <button onClick={() => removePlayer(p.id)} className="text-sm opacity-60 hover:opacity-100">✕</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Settings */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Settings</h2>
        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-2">
            <span>Scoring:</span>
            <select
              value={state.settings.scoringMode}
              onChange={(e) => setState(s => ({ ...s, settings: { ...s.settings, scoringMode: e.target.value as any } }))}
              className="border rounded-xl px-2 py-1"
            >
              <option value="BID_EQUALS_POINTS">Bid = points (exact), else 0</option>
              <option value="TEN_PLUS_BID">10 + bid (exact), else 0</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={state.settings.allowNoTrumps}
              onChange={(e) => setState(s => ({ ...s, settings: { ...s.settings, allowNoTrumps: e.target.checked } }))}
            />
            <span>Allow No Trumps</span>
          </label>
        </div>
      </section>

      {/* Rounds */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Rounds</h2>
          <div className="flex items-center gap-2">
            <button onClick={addRound} className="px-3 py-2 rounded-xl bg-black text-white">Add Round</button>
            <button
              onClick={() => {
                const seq = generatePlan(state.players.length, "DESC");
                const order = ["Spades","Hearts","Clubs","Diamonds"] as const;
                const rounds = seq.map((cards, idx) => ({
                  id: crypto.randomUUID(),
                  index: idx + 1,
                  trump: order[idx % order.length],
                  cards,
                  bids: {},
                  tricks: {},
                  locked: false,
                }));
                setState(s => ({ ...s, rounds }));
              }}
              className="px-3 py-2 rounded-xl border"
            >Plan 13/10 → 1</button>
            <button
              onClick={() => {
                const seq = generatePlan(state.players.length, "ASC");
                const order = ["Spades","Hearts","Clubs","Diamonds"] as const;
                const rounds = seq.map((cards, idx) => ({
                  id: crypto.randomUUID(),
                  index: idx + 1,
                  trump: order[idx % order.length],
                  cards,
                  bids: {},
                  tricks: {},
                  locked: false,
                }));
                setState(s => ({ ...s, rounds }));
              }}
              className="px-3 py-2 rounded-xl border"
            >Plan 1 → 13/10</button>
          </div>
        </div>

        <div className="space-y-4">
          {state.rounds.map((r) => (
            <div key={r.id} className="border rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="font-medium">Round {r.index}</span>
                  <label className="flex items-center gap-2">
                    <span className="opacity-70 text-sm">Cards</span>
                    <input type="number" min={1} value={r.cards}
                      onChange={(e)=> setCards(r.id, parseInt(e.target.value || "1"))}
                      disabled={r.locked}
                      className="w-20 border rounded-xl px-2 py-1"
                    />
                  </label>
                  <select
                    value={r.trump}
                    onChange={(e) => setTrump(r.id, e.target.value as Suit)}
                    disabled={r.locked}
                    className="border rounded-xl px-2 py-1"
                  >
                    {["Spades","Hearts","Clubs","Diamonds"].concat(state.settings.allowNoTrumps?["NoTrumps"]:[]).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  {!r.locked ? (
                    <button onClick={() => lockRound(r.id, true)} className="px-3 py-1 rounded-xl border">Lock</button>
                  ) : (
                    <button onClick={() => lockRound(r.id, false)} className="px-3 py-1 rounded-xl border">Unlock</button>
                  )}
                </div>
              </div>

              {/* Table */}
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="p-2">Cards</th>
                      <th className="p-2">Player</th>
                      <th className="p-2">Bid</th>
                      <th className="p-2">Tricks</th>
                      <th className="p-2">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.players.map(p => {
                      const bid = r.bids[p.id] ?? 0;
                      const tricks = r.tricks[p.id] ?? 0;
                      const pts = computePoints(bid, tricks, state.settings.scoringMode);
                      const missed = (r.bids[p.id] !== undefined && r.tricks[p.id] !== undefined && r.bids[p.id] !== r.tricks[p.id]);
                      return (
                        <tr key={p.id} className="border-t">
                          <td className="p-2">{r.cards}</td>
                          <td className="p-2">{p.name}</td>
                          <td className="p-2">
                            <input type="number" min={0} value={bid}
                              onChange={(e) => setBid(r.id, p.id, Math.max(0, parseInt(e.target.value || "0")))}
                              disabled={r.locked}
                              className="w-20 border rounded-xl px-2 py-1"
                            />
                          </td>
                          <td className="p-2">
                            <input type="number" min={0} value={tricks}
                              onChange={(e) => setTrick(r.id, p.id, Math.max(0, parseInt(e.target.value || "0")))}
                              disabled={r.locked}
                              className="w-20 border rounded-xl px-2 py-1"
                            />
                          </td>
                          {missed ? (
                            <td className="p-2 font-medium"><span className="line-through opacity-60">0</span></td>
                          ) : (
                            <td className="p-2 font-medium">{pts}</td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Leaderboard */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Leaderboard</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="p-2">Rank</th>
                <th className="p-2">Player</th>
                <th className="p-2">Total</th>
                <th className="p-2">Progress</th>
              </tr>
            </thead>
            <tbody>
              {playersSorted.map((p, idx) => {
                const total = totals[p.id] ?? 0;
                const series = hist.map(h => h[p.id] ?? 0);
                const max = Math.max(1, ...hist.flatMap(h => Object.values(h)));
                return (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">{idx + 1}</td>
                    <td className="p-2">{p.name}</td>
                    <td className="p-2 font-medium">{total}</td>
                    <td className="p-2"><Sparkline data={series} max={max} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="py-6 text-center text-xs opacity-60">
        Data is saved locally in your browser. Use Export/Import to move games across devices.
      </footer>
    </main>
  );
}

function Sparkline({ data, max }: { data: number[]; max: number }) {
  const w = Math.max(60, data.length * 20);
  const h = 30;
  const pts = data.map((v, i) => {
    const x = (i / Math.max(1, data.length - 1)) * (w - 4) + 2;
    const y = h - 2 - (v / max) * (h - 4);
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
