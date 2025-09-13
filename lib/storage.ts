export type Player={id:string;name:string};
export type Round={id:string;index:number;suit:'Spades'|'Hearts'|'Clubs'|'Diamonds';cards:number;locked:boolean;bids:Record<string,number>;ok:Record<string,boolean|undefined>};
export type GameSettings={scoringMode:'BID_EQUALS_POINTS'|'TEN_PLUS_BID'};
export type GameState={id:string;createdAt:number;players:Player[];rounds:Round[];settings:GameSettings};
const KEY='judgement-scorekeeper:v4';
export function newGame():GameState{ return { id:crypto.randomUUID(), createdAt:Date.now(), players:[], rounds:[], settings:{scoringMode:'TEN_PLUS_BID'} }; }
export function load():GameState|null{ if(typeof window==='undefined')return null; try{const raw=localStorage.getItem(KEY); if(!raw)return null; return JSON.parse(raw);}catch{return null;} }
export function save(state:GameState){ if(typeof window==='undefined')return; localStorage.setItem(KEY, JSON.stringify(state)); }
export function clear(){ if(typeof window==='undefined')return; localStorage.removeItem(KEY); }
export function maxCardsForPlayers(count:number){ if(count<=0) return 13; return Math.floor(52/count); }
export const SUITS=['Spades','Hearts','Clubs','Diamonds'] as const;
export function generatePlanRows(playerCount:number,descending:boolean){ const max=maxCardsForPlayers(playerCount); const seq:number[]=[]; if(descending){for(let c=max;c>=1;c--) seq.push(c);} else {for(let c=1;c<=max;c++) seq.push(c);} return seq.map((cards,i)=>({cards,suit:SUITS[i%4]})); }
export function computePointsFromOk(bid:number|undefined, ok:boolean|undefined, mode:GameSettings['scoringMode']){ if(bid===undefined) return 0; if(!ok) return 0; return mode==='TEN_PLUS_BID'?10+bid:bid; }
export function totalsByPlayer(state:GameState){ const totals:Record<string,number>={}; for(const p of state.players) totals[p.id]=0; for(const r of state.rounds){ for(const p of state.players){ const pts=computePointsFromOk(r.bids[p.id], r.ok[p.id], state.settings.scoringMode); totals[p.id]+=pts; } } return totals; }