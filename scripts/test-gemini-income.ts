import fs from "fs";
import { predictIncomeWithGemini } from "../lib/gemini-income";
import type { Transaction } from "../types";
import * as nodeFs from "fs";
// Load .env.local manually
const envContent = nodeFs.readFileSync(".env.local", "utf-8");
for (const line of envContent.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
}

function p(l:string){const o:string[]=[]; let c='',q=false;for(let i=0;i<l.length;i++){const ch=l[i];if(ch==='"'){q=!q;continue;}if(ch===','&&!q){o.push(c.trim());c='';continue;}c+=ch;}o.push(c.trim());return o;}
function t(d:string){const[m,dd,y]=d.split('/');return `${y}-${m.padStart(2,'0')}-${dd.padStart(2,'0')}`;}
const txs:Transaction[]=[];
for(const l of nodeFs.readFileSync('Chase7885_Activity20240224_20260224_20260224.CSV','utf-8').trim().split('\n').slice(1)){const c=p(l);if(c.length<6)continue;const d=t(c[0]),a=parseFloat(c[5]);if(!d||isNaN(a))continue;txs.push({transaction_id:'a'+txs.length,account_id:'cc',amount:a*-1,date:d,name:c[2],merchant_name:c[2],category:c[4]==='Payment'||c[4]==='Adjustment'?['Transfer']:[c[3]||''],pending:false,logo_url:null});}
for(const l of nodeFs.readFileSync('Chase6656_Activity_20260224.CSV','utf-8').trim().split('\n').slice(1)){const c=p(l);if(c.length<5)continue;const d=t(c[1]),a=parseFloat(c[3]);if(!d||isNaN(a))continue;const ix=c[4]==='LOAN_PMT'||c[4]==='ACCT_XFER',ii=/robinhood|schwab/i.test(c[2]);txs.push({transaction_id:'b'+txs.length,account_id:'chk',amount:a*-1,date:d,name:c[2],merchant_name:c[2],category:ix||ii?['Transfer']:/bilt|yardi/i.test(c[2])?['Housing']:/dominion/i.test(c[2])?['Utilities']:/venmo.*cashout/i.test(c[2])?['Income']:[''],pending:false,logo_url:null});}
txs.sort((a,b)=>a.date.localeCompare(b.date));

// Actuals
const actuals: Record<string, number> = {};
for (const tx of txs) {
    const cat = Array.isArray(tx.category)?tx.category[0]:tx.category;
    if (cat==='Transfer') continue;
    if (tx.amount>=0) continue;
    const m = tx.date.substring(0,7);
    actuals[m] = (actuals[m]||0) + Math.abs(tx.amount);
}

async function test() {
    const testMonths = [
        { ref: new Date(2025, 5, 30, 12), targets: ['2025-07','2025-08','2025-09'] },
        { ref: new Date(2025, 8, 30, 12), targets: ['2025-10','2025-11','2025-12'] },
        { ref: new Date(2025, 2, 31, 12), targets: ['2025-04','2025-05','2025-06'] },
    ];

    let allErrors: number[] = [];

    for (const test of testMonths) {
        const history = txs.filter(t => t.date < test.targets[0]);
        console.log(`\nPredicting ${test.targets.join(', ')} from ${history.length} txs...`);
        
        const result = await predictIncomeWithGemini(history, test.ref, 3);
        if (!result) {
            console.log('  FAILED');
            continue;
        }

        console.log(`  Reasoning: ${result.reasoning}`);
        for (let i = 0; i < 3; i++) {
            const month = test.targets[i];
            const pred = result.predictions[i];
            const actual = actuals[month] || 0;
            const err = actual > 0 ? Math.abs(pred - actual) / actual * 100 : 0;
            allErrors.push(err);
            console.log(`  ${month}: pred $${pred.toFixed(0)} vs actual $${actual.toFixed(0)} = ${err.toFixed(1)}%`);
        }
    }

    const avgErr = allErrors.reduce((a,b)=>a+b,0) / allErrors.length;
    console.log(`\nOverall Income MAPE: ${avgErr.toFixed(1)}%`);
}

test().catch(console.error);
