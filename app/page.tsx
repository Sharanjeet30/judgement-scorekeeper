'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  GameState, Player, Round, newGame, load, save, clear,
  generatePlanRows, totalsByPlayer, computePointsFromOk, SUITS, maxCardsForPlayers,
  roundsWon, currentWinStreak, roundsFullyScored
} from "@/lib/storage";
import { getSupabase } from "@/lib/supabaseClient";

function useTheme() {
  const [theme, setTheme] = useState<"light"|"dark">("light");
  useEffect(() => {
    const t = (localStorage.getItem("theme") as "light"|"dark") || "light";
    setTheme(t);
    document.documentElement.classList.toggle("dark", t === "dark");
  }, []);
  function toggle() {
    const t = theme === "light" ? "dark" : "light";
    setTheme(t);
    document.documentElement.classList.toggle("dark", t === "dark");
    localStorage.setItem("theme", t);
  }
  return { theme, toggle };
}

const suitMeta: Record<string, { sym: string; color: string }> = {
  Spades:   { sym: "♠", color: "text-gray-900 dark:text-gray-100" },
  Hearts:   { sym: "♥", color: "text-rose-600 dark:text-rose-400" },
  Clubs:    { sym: "♣", color: "text-gray-900 dark:text-gray-100" },
  Diamonds: { sym: "♦", color: "text-rose-600 dark:text-rose-400" },
};

export default function Page() {
  const [state, setState] = useState<GameState>(() => load() ?? newGame());
  const [playerName, setPlayerName] = useState("");
  const { theme, toggle } = useTheme();
  const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const tableCardRef = useRef<HTMLDivElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const howToRef = useRef<HTMLElement | null>(null);

  // Live sync controls
  const [live, setLive] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const selfUpdate = useRef(false); // prevent loops
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => { save(state); }, [state]);

  // Load from URL ?id=...
  useEffect(() => {
    if (!hasSupabase) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (!id) return;
    (async () => {
      const sb = getSupabase()!;
      const { data } = await sb.from("games").select("data").eq("id", id).maybeSingle();
      if (data?.data) setState(data.data as GameState);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSupabase]);

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
      rounds.push({
        id: crypto.randomUUID(),
        index: startIndex + i + 1,
        suit: SUITS[(startIndex + i) % 4],
        cards: i + 1,
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

    const scored = roundsFullyScored(state);
    stats.push(`Rounds scored: ${scored}/${state.rounds.length}.`);

    const noWins = state.players.filter(p => roundsWon(state, p.id) === 0).map(p => p.name);
    if (noWins.length) stats.push(`${noWins.join(", ")} ${noWins.length === 1 ? "has" : "have"} not won a round yet.`);

    const streaks = state.players.map(p => ({ name: p.name, streak: currentWinStreak(state, p.id) }));
    const maxStreak = Math.max(...streaks.map(s => s.streak));
    if (maxStreak > 0) {
      const who = streaks.filter(s => s.streak === maxStreak).map(s => s.name).join(", ");
      stats.push(`${who} ${who.includes(",") ? "have" : "has"} a ${maxStreak}-round winning streak.`);
    }

    if (playersSorted.length >= 2) {
      const a = playersSorted[0], b = playersSorted[1];
      const diff = Math.abs((totals[a.id] ?? 0) - (totals[b.id] ?? 0));
      stats.push(`${a.name} leads ${b.name} by ${diff} pts.`);
    } else if (playersSorted.length === 1) {
      stats.push(`${playersSorted[0].name} is in the lead.`);
    }

    const mostWins = Math.max(...state.players.map(p => roundsWon(state, p.id)));
    if (mostWins > 0) {
      const who = state.players.filter(p => roundsWon(state, p.id) === mostWins).map(p => p.name).join(", ");
      stats.push(`${who} ${who.includes(",") ? "have" : "has"} the most exact bids: ${mostWins}.`);
    }

    return stats;
  }
  const stats = computeStats();
  const [statIndex, setStatIndex] = useState(0);
  const statMsg = stats.length ? stats[statIndex % stats.length] : "Add players and rounds to see live stats.";
  const statsKey = JSON.stringify(stats);
  useEffect(() => { setStatIndex(0); }, [state.players.length, state.rounds.length]);
  useEffect(() => {
    if (stats.length <= 1) return;
    const timer = setInterval(() => { setStatIndex((i) => i + 1); }, 5000);
    return () => clearInterval(timer);
  }, [stats.length, statsKey]);
  const hasLockedRounds = useMemo(() => state.rounds.some(r => r.locked), [state.rounds]);

  // Cloud save/load (manual)
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

  // Live sync: publish on state changes; subscribe to DB changes
  useEffect(() => {
    if (!live || !hasSupabase) return;
    const sb = getSupabase()!;
    // ensure row exists
    sb.from("games").upsert({ id: state.id, data: state });
    // subscribe to updates on this id
    const channel = sb.channel("games_" + state.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${state.id}` },
        (payload) => {
          if (selfUpdate.current) return; // ignore echo
          const incoming = (payload.new as any)?.data as GameState | undefined;
          if (incoming && incoming.createdAt >= (state.createdAt ?? 0)) {
            setState(incoming);
          }
        })
      .subscribe();
    channelRef.current = channel;
    return () => { sb.removeChannel(channel); channelRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, hasSupabase, state.id]);

  // publish on state changes (throttled)
  const publishTimer = useRef<any>(null);
  useEffect(() => {
    if (!live || !hasSupabase) return;
    if (publishTimer.current) clearTimeout(publishTimer.current);
    publishTimer.current = setTimeout(async () => {
      selfUpdate.current = true;
      const sb = getSupabase()!;
      await sb.from("games").upsert({ id: state.id, data: state });
      selfUpdate.current = false;
    }, 350);
  }, [state, live, hasSupabase]);

  async function copyShareLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("id", state.id);
    const shareUrl = url.toString();
    let copied = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        copied = true;
      } catch {
        // Fallback handled below
      }
    }
    if (!copied) {
      window.prompt("Copy this link:", shareUrl);
    }
    if (!live) setLive(true);
    if (hasSupabase) {
      const sb = getSupabase();
      if (sb) {
        try {
          selfUpdate.current = true;
          await sb.from("games").upsert({ id: state.id, data: state });
        } finally {
          selfUpdate.current = false;
        }
      }
    }
    if (copied) {
      alert("Link copied! Live sync is on—share it with players to view/edit together.");
    } else {
      alert("Live sync is on. Copy the link above to share it with players.");
    }
  }

  function scrollToHowTo() {
    howToRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function exportTableImage() {
    if (!tableCardRef.current) return;
    setIsExporting(true);
    try {
      const card = tableCardRef.current;
      const scrollArea = tableScrollRef.current;
      const share = card.querySelector("[data-share-controls]") as HTMLElement | null;
      const width = Math.ceil((scrollArea?.scrollWidth ?? card.scrollWidth) || card.clientWidth);
      const baseHeight = scrollArea?.scrollHeight ?? (card.scrollHeight - (share?.offsetHeight ?? 0));
      const height = Math.ceil(baseHeight);

      const clone = card.cloneNode(true) as HTMLElement;
      const cloneShare = clone.querySelector("[data-share-controls]");
      if (cloneShare) {
        cloneShare.parentElement?.removeChild(cloneShare);
      }
      const cloneScroll = clone.querySelector("[data-export-scroll]") as HTMLElement | null;
      if (cloneScroll) {
        cloneScroll.style.overflow = "visible";
        cloneScroll.style.maxHeight = "none";
        cloneScroll.style.maxWidth = "none";
      }

      clone.style.width = `${width}px`;
      clone.style.height = `${height}px`;
      const background = theme === "dark" ? "#09090b" : "#ffffff";
      clone.style.background = background;
      clone.style.color = theme === "dark" ? "#f9fafb" : "#111827";
      clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");

      const cssText = (() => {
        let css = "";
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            const rules = sheet.cssRules;
            if (!rules) continue;
            css += Array.from(rules).map(rule => rule.cssText).join("");
          } catch (error) {
            // Ignore inaccessible stylesheets (e.g., cross-origin)
          }
        }
        return css;
      })();

      const htmlClass = document.documentElement.className;
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" class="${htmlClass}" style="width:${width}px;height:${height}px;background:${background};">
      <style>${cssText}</style>
      ${clone.outerHTML}
    </div>
  </foreignObject>
</svg>`;

      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const svgUrl = URL.createObjectURL(blob);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          URL.revokeObjectURL(svgUrl);
          resolve(image);
        };
        image.onerror = () => {
          URL.revokeObjectURL(svgUrl);
          reject(new Error("Could not load image"));
        };
        image.src = svgUrl;
      });

      const scale = Math.min(2, window.devicePixelRatio || 1);
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);

      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `judgement-score-${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
    } catch (err) {
      console.error(err);
      alert("Sorry, something went wrong while creating the image.");
    } finally {
      setIsExporting(false);
    }
  }

  // Initialize default plan
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (state.rounds.length === 0) buildPlan(true); }, []);

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-6">
      <header className="header">
        <h1 className="brand">Judgement Scorekeeper</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={toggle} className="button" title="Toggle theme">
            {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
          </button>
          {hasSupabase && (<>
            <button
              onClick={saveCloud}
              className="button"
              title="Save the current game state to Supabase using this game's ID."
            >
              Save Cloud
            </button>
            <button
              onClick={loadCloud}
              className="button"
              title="Load a saved game from Supabase by entering its ID."
            >
              Load Cloud
            </button>
            <button
              onClick={() => setLive(l => !l)}
              className={"button " + (live ? "primary" : "")}
              title={live
                ? "Live sync is on. Click to stop automatically sharing updates."
                : "Live sync is off. Click to automatically share updates via Supabase."}
            >
              {live ? "Live: ON" : "Live: OFF"}
            </button>
            <button
              onClick={copyShareLink}
              className="button"
              title="Copy a shareable link that opens this scoreboard."
            >
              Share Link
            </button>
          </>)}
          <button
            onClick={() => { clear(); setState(newGame()); }}
            className="button"
            title="Clear all players and rounds to start a fresh game."
          >
            New Game
          </button>
          <button
            onClick={scrollToHowTo}
            className="button"
            title="Jump to the How to Play guide at the bottom of the page."
          >
            How to Play ↓
          </button>
        </div>
      </header>

      {/* Players */}
      <section className="space-y-2">
        <div className="input-group">
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Add player name"
            className="input-base"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPlayer(); } }}
          />
          <button onClick={addPlayer} className="input-add">Add</button>
        </div>
        {state.players.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {state.players.map(p => (
              <li key={p.id} className="pill flex items-center gap-2">
                <span>{p.name}</span>
                <button onClick={() => removePlayer(p.id)} className="text-sm opacity-60 hover:opacity-100">✕</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Controls + Stats */}
      <section className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => buildPlan(true)}
          className="button"
          title="Create rounds that count down from the maximum hand size to one card."
        >
          Create Descending Plan (Max → 1)
        </button>
        <button
          onClick={() => buildPlan(false)}
          className="button"
          title="Create rounds that build up from one card to the maximum hand size."
        >
          Create Ascending Plan (1 → Max)
        </button>
        <button
          onClick={() => appendReverse()}
          className="button"
          title="After reaching one card, add another set of rounds that climb back to the maximum."
        >
          Append Ascending Rounds (1 → Max)
        </button>
      </section>

      <section className="statcard cursor-pointer" onClick={()=> setStatIndex(i=> i+1)}>
        <div className="statheader">Live stat</div>
        <div className="statbig">{statMsg}</div>
        <div className="help">Switches every 5s — click for next</div>
      </section>

      {/* Single Table */}
      <section className="table-card" ref={tableCardRef}>
        <div
          ref={tableScrollRef}
          className="overflow-x-auto p-4"
          data-export-scroll
        >
          <table className="min-w-full text-xs sm:text-sm table-fixed">
          <thead>
            <tr className="text-left">
              <th className="p-2 w-24 sm:w-36">Suit</th>
              <th className="p-2 w-16 sm:w-20">Cards</th>
              {state.players.map(p => (
                <th key={p.id} className="p-2">{p.name}</th>
              ))}
              <th className="p-2 w-24">Lock</th>
            </tr>
          </thead>
          <tbody>
            {state.rounds.map((r) => {
              const bidsEntered = state.players.filter(p => r.bids[p.id] !== undefined);
              const missing = state.players.filter(p => r.bids[p.id] === undefined);
              const sumEntered = bidsEntered.reduce((acc, p) => acc + (r.bids[p.id] ?? 0), 0);
              const forbidden = r.cards - sumEntered;
              return (
                <tr key={r.id}>
                  <td className="p-2">
                    <span className="suit">
                      <span className={"sym " + suitMeta[r.suit].color}>{suitMeta[r.suit].sym}</span>
                      <span>{r.suit}</span>
                    </span>
                  </td>
                  <td className="p-2">{r.cards}</td>
                  {state.players.map(p => {
                    const bid = r.bids[p.id];
                    const ok = r.ok[p.id];
                    const pts = computePointsFromOk(bid, ok);
                    const isLastToBid = !r.locked && missing.length === 1 && missing[0].id === p.id;
                    const canBidAnything = isLastToBid && forbidden < 0;
                    const showWarn = isLastToBid && forbidden >= 0 && bid === forbidden;
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
                              className={"input-base table-input " + (showWarn ? "border-red-500 focus:ring-red-500/30" : "")}
                            />
                            {isLastToBid && (
                              <div
                                className={`help ${showWarn ? "text-red-600 dark:text-rose-400" : ""} ${canBidAnything ? "text-emerald-600 dark:text-emerald-400" : ""}`}
                              >
                                {canBidAnything ? "Can bid anything" : <>Can&apos;t bid <b>{forbidden}</b></>}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {ok === undefined ? (
                              <>
                                <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-900 dark:bg-neutral-800 dark:text-gray-100 min-w-8 text-center">{bid ?? "-"}</span>
                                <button onClick={() => setOk(r.id, p.id, true)} className="button h-7 w-7 !p-0">✓</button>
                                <button onClick={() => setOk(r.id, p.id, false)} className="button h-7 w-7 !p-0">✗</button>
                              </>
                            ) : (
                              <div className="w-10 text-right">{ok === false ? <span className="line-through opacity-60">0</span> : pts}</div>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-2">
                    {!r.locked ? (
                      <button onClick={() => lockRow(r.id, true)} className="button">Lock</button>
                    ) : (
                      <button onClick={() => lockRow(r.id, false)} className="button">Unlock</button>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="p-2 font-medium">Total</td>
              <td className="p-2" />
              {state.players.map(p => (<td key={p.id} className="p-2 font-medium">{totals[p.id] ?? 0}</td>))}
              <td className="p-2" />
            </tr>
          </tbody>
        </table>
        </div>
        {hasLockedRounds && (
          <div
            className="px-4 py-3 border-t border-gray-200 dark:border-neutral-700 space-y-2 text-sm"
            data-share-controls
          >
            <button
              onClick={exportTableImage}
              className={`button primary ${isExporting ? "opacity-75 pointer-events-none" : ""}`}
              title="Download the table as an image you can share with friends."
            >
              {isExporting ? "Preparing image…" : "Export table as image"}
            </button>
            <p className="help">Lock a round to unlock sharing and download the full scoreboard as a PNG.</p>
          </div>
        )}
      </section>

      {/* How to play */}
      <section ref={howToRef} id="how-to-play" className="prose max-w-none">
        <h2 className="text-lg font-semibold mt-6">How to play Judgement (Oh Hell)</h2>
        <ol className="list-decimal pl-5 space-y-1 text-sm">
          <li><b>Set up players:</b> Add everyone&rsquo;s name above. Remove someone anytime with the ✕ pill button.</li>
          <li><b>Plan your rounds:</b> Use <b>Create Descending Plan</b> or <b>Create Ascending Plan</b> to auto-fill the deal pattern. Reach the single-card round? <b>Append Ascending Rounds</b> grows the game back to Max.</li>
          <li><b>Deal & trump:</b> Deal the number of cards shown in the <i>Cards</i> column. Trump rotates each round: <b>Spades (♠) → Hearts (♥) → Clubs (♣) → Diamonds (♦)</b>.</li>
          <li><b>Bid smart:</b> Enter each player&rsquo;s bid before the round. The last bidder can&rsquo;t make total bids equal the cards in the round—the cell warns you.</li>
          <li><b>Play the hand:</b> Follow suit if possible; otherwise play any card. The highest card of the led suit wins unless a trump is played—in that case the highest trump wins.</li>
          <li><b>Lock & score:</b> Click <b>Lock</b> when all bids are in. After the round, choose ✓ or ✗ to mark whether a player hit their bid. Scores (10 + bid for exact, 0 otherwise) tally automatically.</li>
          <li><b>Track progress:</b> Live stats above the table highlight streaks, leaders, and which rounds still need attention.</li>
          <li><b>Share with friends:</b> Use <b>Share Link</b> for live collaboration or tap <b>Export table as image</b> (unlocked whenever a round is completed) to download the scoreboard.</li>
        </ol>
      </section>
    </main>
  );
}
