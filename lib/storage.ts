export type Player={id:string;name:string};
export type Round={id:string;index:number;suit:'Spades'|'Hearts'|'Clubs'|'Diamonds';cards:number;locked:boolean;bids:Record<string,number|undefined>;ok:Record<string,boolean|undefined>};
export type GameSettings={scoringMode:'TEN_PLUS_BID'};
export type GameState={id:string;createdAt:number;players:Player[];rounds:Round[];settings:GameSettings};
const KEY='judgement-scorekeeper:v6';
export function newGame():GameState{ return { id:crypto.randomUUID(), createdAt:Date.now(), players:[], rounds:[], settings:{scoringMode:'TEN_PLUS_BID'} }; }
export function load():GameState|null{ if(typeof window==='undefined') return null; try{const raw=localStorage.getItem(KEY); if(!raw) return null; return JSON.parse(raw);}catch{return null;} }
export function save(state:GameState){ if(typeof window==='undefined') return; localStorage.setItem(KEY, JSON.stringify(state)); }
export function clear(){ if(typeof window==='undefined') return; localStorage.removeItem(KEY); }
export function maxCardsForPlayers(count:number){ return count<=0?13:Math.floor(52/count); }
export const SUITS=['Spades','Hearts','Clubs','Diamonds'] as const;
export function generatePlanRows(playerCount:number,descending:boolean){ const max=maxCardsForPlayers(playerCount); const seq:number[]=[]; if(descending){for(let c=max;c>=1;c--) seq.push(c);} else {for(let c=1;c<=max;c++) seq.push(c);} return seq.map((cards,i)=>({cards,suit:SUITS[i%4]})); }
export function computePointsFromOk(bid:number|undefined, ok:boolean|undefined){ if(bid===undefined) return 0; if(!ok) return 0; return 10+bid; }
export function totalsByPlayer(state:GameState){ const totals:Record<string,number>={}; for(const p of state.players) totals[p.id]=0; for(const r of state.rounds){ for(const p of state.players){ totals[p.id]+=computePointsFromOk(r.bids[p.id], r.ok[p.id]); } } return totals; }
export function roundsWon(state:GameState, pid:string){ return state.rounds.reduce((acc,r)=>acc+(r.ok[pid]?1:0),0); }
export function currentWinStreak(state:GameState, pid:string){ let streak=0; for(let i=state.rounds.length-1;i>=0;i--){ const v=state.rounds[i].ok[pid]; if(v===true) streak++; else break; } return streak; }
export function roundsFullyScored(state:GameState){ if(!state.rounds.length||!state.players.length) return 0; return state.rounds.filter(r=> state.players.every(p=> r.ok[p.id]!==undefined)).length; }