'use client';

import { useEffect, useMemo, useState } from "react";
import {
  GameState, Player, Round, newGame, load, save, clear,
  generatePlanRows, totalsByPlayer, computePointsFromOk, SUITS, maxCardsForPlayers,
  roundsWon, currentWinStreak
} from "@/lib/storage";
import { getSupabase } from "@/lib/supabaseClient";

function useHasSupabase() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export default function Page() {
  const [state, setState] = useState<GameState>(() => load() ?? newGame());
  const [playerName, setPlayerName] = useState("");
  const hasSupabase = useHasSupabase();
  useEffect(() => { save(state); }, [state]);

  const totals = useMemo(() => totalsByPlayer(state), [state]);
  const playersSorted = useMemo(() => [...state.players].sort((a,b)=> totals[b.id]-totals[a.id]), [state.players, totals]);

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
        const { [id]: _, ...restBids } = r.bids;
        const { [id]: __, ...restOk } = r.ok;
        return { ...r, bids: restBids, ok: restOk };
      })
    }));
  }

  function buildPlan(descending: boolean) {
    const rows = generatePlanRows(state.players.length || 4, descending);
    const rounds: Round[] = rows.map((row, idx) => ({
      id: crypto.randomUUID(),
      index: idx + 1,
      suit: row.suit,
      cards: row.cards,
      locked: false,
      bids: {},
      ok: {},
    }));
    setState(s => ({ ...s, rounds }));
  }

  function appendReverse() {
    const max = maxCardsForPlayers(state.players.length || 4);
    if (state.rounds.length === 0) return buildPlan(false);
    const endsAtOne = state.rounds[state.rounds.length - 1]?.cards === 1;
    if (!endsAtOne) return;
    const startIndex = state.rounds.length;
    const rounds = [...state.rounds];
    for (let i = 0; i < max; i++) {
      const cards = i + 1;
      rounds.push({
        id: crypto.randomUUID(),
        index: startIndex + i + 1,
        suit: SUITS[(startIndex + i) % 4],
        cards,
        locked: false,
        bids: {},
        ok: {},
      });
    }
    setState(s => ({ ...s, rounds }));
  }

  function setBid(rid: string, pid: string, val: number | undefined) {
    setState(s => ({
      ...s,
      rounds: s.rounds.map(r => r.id === rid ? { ...r, bids: { ...r.bids, [pid]: val } } : r)
    }));
  }

  function setOk(rid: string, pid: string, value: boolean) {
    setState(s => ({
      ...s,
      rounds: s.rounds.map(r => r.id === rid ? { ...r, ok: { ...r.ok, [pid]: value } } : r)
    }));
  }

  function lockRow(rid: string, locked: boolean) {
    setState(s => ({
      ...s,
      rounds: s.rounds.map(r => r.id === rid ? { ...r, locked } : r)
    }));
  }

  // Stats messages
  function computeStats(): string[] {
    const stats: string[] = [];
    if (state.players.length === 0) return stats;

    // 1) Players with zero wins
    const noWins = state.players.filter(p => roundsWon(state, p.id) === 0).map(p => p.name);
    if (noWins.length > 0) {
      stats.push(`${noWins.join(", ")} ${noWins.length === 1 ? "has" : "have"} not won a round yet.`);
    }

    // 2) Current winning streaks (max)
    const streaks = state.players.map(p => ({ name: p.name, streak: currentWinStreak(state, p.id) }));
    const maxStreak = Math.max(...streaks.map(s => s.streak));
    if (maxStreak > 0) {
      const who = streaks.filter(s => s.streak === maxStreak).map(s => s.name).join(", ");
      stats.push(`${who} ${who.includes(",") ? "have" : "has"} a ${maxStreak} round winning streak.`);
    }

    // 3) Lead gap
    if (playersSorted.length >= 2) {
      const a = playersSorted[0], b = playersSorted[1];
      const diff = Math.abs((totals[a.id] ?? 0) - (totals[b.id] ?? 0));
      stats.push(`${a.name} and ${b.name} are leading with only ${diff} points between them.`);
    }

    // 4) Points to target (per player)
    for (const p of state.players) {
      const need = state.settings.targetPoints - (totals[p.id] ?? 0);
      if (need > 0) stats.push(`${p.name} needs ${need} more to reach ${state.settings.targetPoints}.`);
      else stats.push(`${p.name} has reached ${state.settings.targetPoints}!`);
    }

    return stats;
  }
  const stats = computeStats();
  const [statIndex, setStatIndex] = useState(0);
  const statMsg = stats.length ? stats[statIndex % stats.length] : "Add players to see live stats.";
  useEffect(() => { setStatIndex(0); }, [state.players.length, state.rounds.length]);

  // Cloud save/load (Supabase)
  async function saveCloud() {
    const sb = getSupabase();
    if (!sb) { alert("Supabase env vars missing."); return; }
    const { error } = await sb.from("games").upsert({ id: state.id, data: state });
    if (error) alert("Save failed: " + error.message);
    else alert("Saved to cloud (id: " + state.id + ").");
  }
  async function loadCloud() {
    const id = prompt("Enter game id to load:", state.id);
    if (!id) return;
    const sb = getSupabase();
    if (!sb) { alert("Supabase env vars missing."); return; }
    const { data, error } = await sb.from("games").select("data").eq("id", id).maybeSingle();
    if (error || !data) { alert("Not found."); return; }
    setState(data.data as GameState);
  }

  // Initialize default plan
  useEffect(() => { if (state.rounds.length === 0) buildPlan(true); }, []);

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Judgement Scorekeeper</h1>
        <div className="flex items-center gap-2">
          {hasSupabase && (<>
            <button onClick={saveCloud} className="px-3 py-1 rounded-xl border">Save Cloud</button>
            <button onClick={loadCloud} className="px-3 py-1 rounded-xl border">Load Cloud</button>
          </>)}
          <button onClick={() => { clear(); setState(newGame()); }} className="px-3 py-1 rounded-xl border">New Game</button>
        </div>
      </header>

      {/* Players */}
      <section className="space-y-2">
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

      {/* Controls + Stats */}
      <section className="flex flex-wrap items-center gap-3">
        <button onClick={() => buildPlan(true)} className="px-3 py-2 rounded-xl border">Plan Max → 1</button>
        <button onClick={() => buildPlan(false)} className="px-3 py-2 rounded-xl border">Plan 1 → Max</button>
        <button onClick={() => appendReverse()} className="px-3 py-2 rounded-xl border">Append Reverse (1 → Max)</button>
        <label className="flex items-center gap-2 ml-auto">
          <span className="help">Target Points</span>
          <input
            type="number" min={10}
            value={state.settings.targetPoints}
            onChange={(e)=> setState(s => ({...s, settings: {...s.settings, targetPoints: Math.max(10, parseInt(e.target.value||'100'))}}))}
            className="w-24 border rounded-xl px-2 py-1"
          />
        </label>
      </section>

      <section className="statcard cursor-pointer" onClick={()=> setStatIndex(i=> i+1)}>
        <div className="statheader">Live stat</div>
        <div className="statbig">{statMsg}</div>
        <div className="help">Click for next</div>
      </section>

      {/* Single Table */}
      <section className="overflow-auto table-card">
        <table className="min-w-full text-sm table-fixed">
          <thead>
            <tr className="text-left">
              <th className="p-2 w-28">Suit</th>
              <th className="p-2 w-20">Cards</th>
              {state.players.map(p => (
                <th key={p.id} className="p-2">{p.name}</th>
              ))}
              <th className="p-2 w-24">Lock</th>
            </tr>
          </thead>
          <tbody>
            {state.rounds.map((r) => {
              // last-bidder constraint
              const bidsEntered = state.players.filter(p => r.bids[p.id] !== undefined);
              const missing = state.players.filter(p => r.bids[p.id] === undefined);
              const sumEntered = bidsEntered.reduce((acc, p) => acc + (r.bids[p.id] ?? 0), 0);
              const forbidden = r.cards - sumEntered;
              return (
                <tr key={r.id}>
                  <td className="p-2">{r.suit}</td>
                  <td className="p-2">{r.cards}</td>
                  {state.players.map(p => {
                    const bid = r.bids[p.id];
                    const ok = r.ok[p.id];
                    const pts = computePointsFromOk(bid, ok);
                    const isLastToBid = !r.locked && missing.length === 1 && missing[0].id === p.id;
                    const showWarn = isLastToBid && bid === forbidden;
                    return (
                      <td key={p.id} className="p-2 align-top">
                        {!r.locked ? (
                          <div className="space-y-1">
                            <input
                              type="number" min={0}
                              value={bid ?? ""}
                              onChange={(e) => {
                                const v = e.target.value === "" ? undefined : Math.max(0, parseInt(e.target.value));
                                setBid(r.id, p.id, v);
                              }}
                              className={"w-20 border rounded-xl px-2 py-1 " + (showWarn ? "border-red-500" : "")}
                            />
                            {isLastToBid && (
                              <div className={"help " + (showWarn ? "text-red-600" : "")}>
                                Can't bid <b>{forbidden}</b>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {ok === undefined ? (
                              // LOCKED: show the player's bid and ✓/✗ selector
                              <>
                                <span className="px-2 py-1 rounded-lg bg-gray-100 min-w-8 text-center">{bid ?? "-"}</span>
                                <button onClick={() => setOk(r.id, p.id, true)} className="h-7 w-7 rounded-full border flex items-center justify-center hover:bg-gray-100" title="Made bid">✓</button>
                                <button onClick={() => setOk(r.id, p.id, false)} className="h-7 w-7 rounded-full border flex items-center justify-center hover:bg-gray-100" title="Missed bid">✗</button>
                              </>
                            ) : (
                              // After choose: only show points; no Redo
                              <div className="w-10 text-right">
                                {ok === false ? <span className="line-through opacity-60">0</span> : pts}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-2">
                    {!r.locked ? (
                      <button onClick={() => lockRow(r.id, true)} className="px-3 py-1 rounded-xl border">Lock</button>
                    ) : (
                      <button onClick={() => lockRow(r.id, false)} className="px-3 py-1 rounded-xl border">Unlock</button>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="p-2 font-medium">Total</td>
              <td className="p-2" />
              {state.players.map(p => (
                <td key={p.id} className="p-2 font-medium">{totals[p.id] ?? 0}</td>
              ))}
              <td className="p-2" />
            </tr>
          </tbody>
        </table>
      </section>

      {/* How to play */}
      <section className="prose max-w-none">
        <h2 className="text-lg font-semibold mt-6">How to play Judgement (Oh Hell)</h2>
        <ol className="list-decimal pl-5 space-y-1 text-sm">
          <li><b>Deal & trump:</b> Deal N cards to each player (N auto-set by players). Trump rotates: <b>Spades → Hearts → Clubs → Diamonds</b>.</li>
          <li><b>Bidding:</b> Before play, each player bids how many tricks they expect to win. Enter bids in the row, then click <b>Lock</b>. <i>Last bidder rule:</i> when only one player remains to bid, they cannot bid the number that makes <i>total bids = cards</i> for that round.</li>
          <li><b>Playing a trick:</b> Leader plays any card. Others must follow the suit led if they can. If you cannot follow suit, you may play any card — including a trump.</li>
          <li><b>Winning a trick:</b> If no trump is played, the highest card of the led suit wins. If any trump is played, the highest trump wins. Only a higher trump can beat a trump.</li>
          <li><b>Scoring:</b> Exact bid scores <b>10 + bid</b> (0-call exact = <b>10</b>). Missed bids always score <span className="line-through">0</span>.</li>
          <li><b>Recording results:</b> After the round is locked, each cell shows the bid and ✓/✗. Choose one; the buttons disappear and only points remain. Unlock the row to change.</li>
          <li><b>Continue:</b> Use <b>Plan</b> buttons to set rounds (Max→1 or 1→Max). After reaching 1, <b>Append Reverse</b> continues 1→Max on the same table.</li>
        </ol>
      </section>
    </main>
  );
}
