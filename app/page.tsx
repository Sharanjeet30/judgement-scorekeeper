'use client';
import { useEffect, useMemo, useState } from 'react';
import { GameState, Player, Round, newGame, load, save, clear, generatePlanRows, totalsByPlayer, computePointsFromOk, SUITS, maxCardsForPlayers } from '@/lib/storage';
export default function Page(){
  const [state,setState]=useState<GameState>(()=>load()??newGame());
  const [playerName,setPlayerName]=useState('');
  useEffect(()=>{save(state)},[state]);
  const totals=useMemo(()=>totalsByPlayer(state),[state]);
  function addPlayer(){ if(!playerName.trim()) return; const p:Player={id:crypto.randomUUID(),name:playerName.trim()}; setState(s=>({...s,players:[...s.players,p]})); setPlayerName(''); }
  function removePlayer(id:string){ setState(s=>({...s, players:s.players.filter(p=>p.id!==id), rounds:s.rounds.map(r=>{ const {[id]:_,...bids}=r.bids; const {[id]:__,...ok}=r.ok; return {...r,bids,ok}; }) })); }
  function buildPlan(desc:boolean){ const rows=generatePlanRows(state.players.length||4,desc); const rounds:Round[]=rows.map((row,idx)=>({ id:crypto.randomUUID(), index:idx+1, suit:row.suit, cards:row.cards, locked:false, bids:{}, ok:{} })); setState(s=>({...s,rounds})); }
  function appendReverse(){ const max=maxCardsForPlayers(state.players.length||4); if(state.rounds.length===0) return buildPlan(false); const endsAtOne=state.rounds[state.rounds.length-1]?.cards===1; if(!endsAtOne) return; const startIndex=state.rounds.length; const rounds=[...state.rounds]; for(let c=1;c<=max;c++){ rounds.push({ id:crypto.randomUUID(), index:startIndex+(c), suit:SUITS[(startIndex+(c-1))%4], cards:c, locked:false, bids:{}, ok:{} }); } setState(s=>({...s,rounds})); }
  function setBid(rid:string,pid:string,val:number){ setState(s=>({...s, rounds:s.rounds.map(r=>r.id===rid?{...r,bids:{...r.bids,[pid]:val}}:r)})); }
  function setOk(rid:string,pid:string,value:boolean){ setState(s=>({...s, rounds:s.rounds.map(r=>r.id===rid?{...r,ok:{...r.ok,[pid]:value}}:r)})); }
  function lockRow(rid:string,locked:boolean){ setState(s=>({...s, rounds:s.rounds.map(r=>r.id===rid?{...r,locked}:r)})); }
  useEffect(()=>{ if(state.rounds.length===0) buildPlan(true); },[]);
  return (<main className="max-w-6xl mx-auto p-4 space-y-6">
    <header className="flex items-center justify-between gap-2"><h1 className="text-2xl font-bold">Judgement Scorekeeper</h1>
      <div className="flex items-center gap-2"><button onClick={()=>{clear();setState(newGame());}} className="px-3 py-1 rounded-xl border">New Game</button></div>
    </header>
    <section className="space-y-2">
      <div className="flex gap-2">
        <input value={playerName} onChange={(e)=>setPlayerName(e.target.value)} placeholder="Add player name" className="border rounded-xl px-3 py-2 flex-1"/>
        <button onClick={addPlayer} className="px-3 py-2 rounded-xl bg-black text-white">Add</button>
      </div>
      {state.players.length>0 && (<ul className="flex flex-wrap gap-2">{state.players.map(p=>(
        <li key={p.id} className="px-3 py-1 rounded-full border flex items-center gap-2"><span>{p.name}</span><button onClick={()=>removePlayer(p.id)} className="text-sm opacity-60 hover:opacity-100">✕</button></li>
      ))}</ul>)}
    </section>
    <section className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2"><span>Scoring</span>
        <select value={state.settings.scoringMode} onChange={(e)=>setState(s=>({...s,settings:{scoringMode:e.target.value as any}}))} className="border rounded-xl px-2 py-1">
          <option value="BID_EQUALS_POINTS">Bid = points</option>
          <option value="TEN_PLUS_BID">10 + bid</option>
        </select>
      </label>
      <button onClick={()=>buildPlan(true)} className="px-3 py-2 rounded-xl border">Plan Max → 1</button>
      <button onClick={()=>buildPlan(false)} className="px-3 py-2 rounded-xl border">Plan 1 → Max</button>
      <button onClick={()=>appendReverse()} className="px-3 py-2 rounded-xl border">Append Reverse (1 → Max)</button>
    </section>
    <section className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead><tr className="text-left">
          <th className="p-2 w-28">Suit</th><th className="p-2 w-20">Cards</th>
          {state.players.map(p=>(<th key={p.id} className="p-2">{p.name}</th>))}
          <th className="p-2 w-24">Lock</th>
        </tr></thead>
        <tbody>
          {state.rounds.map(r=>(
            <tr key={r.id}>
              <td className="p-2">{r.suit}</td>
              <td className="p-2">{r.cards}</td>
              {state.players.map(p=>{
                const bid=r.bids[p.id]??0; const ok=r.ok[p.id];
                const pts=computePointsFromOk(r.bids[p.id], r.ok[p.id], state.settings.scoringMode);
                return (<td key={p.id} className="p-2">
                  {!r.locked ? (
                    <input type="number" min={0} value={bid} onChange={(e)=>setBid(r.id,p.id,Math.max(0,parseInt(e.target.value||'0')))} className="w-20 border rounded-xl px-2 py-1"/>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="w-10 text-right">{ok===false?<span className="line-through opacity-60">0</span>:pts}</div>
                      <div className="flex gap-1">
                        <button onClick={()=>setOk(r.id,p.id,true)} className={"h-7 w-7 rounded-full border flex items-center justify-center "+(ok===true?"bg-black text-white":"")} title="Made bid">✓</button>
                        <button onClick={()=>setOk(r.id,p.id,false)} className={"h-7 w-7 rounded-full border flex items-center justify-center "+(ok===false?"bg-black text-white":"")} title="Missed bid">✗</button>
                      </div>
                    </div>
                  )}
                </td>);
              })}
              <td className="p-2">{!r.locked ? (<button onClick={()=>lockRow(r.id,true)} className="px-3 py-1 rounded-xl border">Lock</button>) : (<button onClick={()=>lockRow(r.id,false)} className="px-3 py-1 rounded-xl border">Unlock</button>)}</td>
            </tr>
          ))}
          <tr>
            <td className="p-2 font-medium">Total</td><td className="p-2" />
            {state.players.map(p=>(<td key={p.id} className="p-2 font-medium">{totals[p.id]??0}</td>))}
            <td className="p-2"/>
          </tr>
        </tbody>
      </table>
    </section>
    <section className="prose max-w-none">
      <h2 className="text-lg font-semibold mt-6">How to play Judgement (Oh Hell)</h2>
      <ol className="list-decimal pl-5 space-y-1 text-sm">
        <li>Deal N cards to each player (N depends on players). Trump rotates in order <b>Spades → Hearts → Clubs → Diamonds</b>.</li>
        <li>Before play, each player <b>bids</b> tricks. Enter bids, then <b>Lock</b> the row.</li>
        <li>After the round, mark ✓ if the player matched their bid or ✗ if not. The cell shows points.</li>
        <li><b>Scoring:</b> <i>10 + bid</i> (default) → exact bid scores 10+bid (0-call exact = 10). <i>Bid = points</i> → exact bid scores bid. Misses score <span className="line-through">0</span>.</li>
        <li>Use <b>Plan</b> buttons to prefill rows: Max→1 or 1→Max, auto-sized by players. Use <b>Append Reverse</b> to continue 1→Max on the same table.</li>
      </ol>
    </section>
  </main>);
}