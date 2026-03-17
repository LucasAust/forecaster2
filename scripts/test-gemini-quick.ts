import { geminiClient } from "../lib/gemini";
import { generateDeterministicForecast, validateForecast } from "../lib/forecast-engine";
import fs from "fs";
import type { Transaction } from "../types";

function parseCsvLine(l: string){const o: string[]=[];let c='',q=false;for(let i=0;i<l.length;i++){const ch=l[i];if(ch==='"'){q=!q;continue}if(ch===','&&!q){o.push(c.trim());c='';continue}c+=ch}o.push(c.trim());return o}
function toISO(d: string){const m=d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[1]}-${m[2]}`:null}

const txs = fs.readFileSync("Chase7885_Activity20240224_20260224_20260224.CSV","utf-8").trim().split("\n").slice(1).map((l,i)=>{
  const c=parseCsvLine(l);if(c.length<6)return null;const d=toISO(c[0]);const a=parseFloat(c[5]);if(!d||isNaN(a))return null;
  return{transaction_id:"7885-"+i,account_id:"chase-7885",amount:a*-1,date:d,name:c[2],merchant_name:c[2],category:c[4]==="Payment"?["Transfer"]:[c[3]||""],pending:false,logo_url:null} as Transaction;
}).filter(Boolean) as Transaction[];

const history = txs.filter(t => t.date < "2025-10-01");
console.log("History count:", history.length);

// Deterministic first
const detForecast = generateDeterministicForecast(history, new Date("2025-10-01T12:00:00"));
const detOct = detForecast.predicted_transactions.filter(t => t.date.startsWith("2025-10"));
console.log("\nDETERMINISTIC:");
console.log("Total txs:", detForecast.predicted_transactions.length);
console.log("Oct txs:", detOct.length);
console.log("Oct expenses:", Math.abs(detOct.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0)).toFixed(0));
console.log("Oct income:", detOct.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0).toFixed(0));

// Gemini hybrid
geminiClient.generateForecast(history, true).then(f => {
  console.log("\nGEMINI HYBRID:");
  console.log("Total txs:", f.predicted_transactions.length);
  const oct = f.predicted_transactions.filter(t => t.date.startsWith("2025-10"));
  console.log("Oct txs:", oct.length);
  console.log("Oct expenses:", Math.abs(oct.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0)).toFixed(0));
  console.log("Oct income:", oct.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0).toFixed(0));
}).catch(e => console.error("Error:", e.message));
