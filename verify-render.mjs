// Phase 6 render check — proves the adherence UI survives every distinct day
// shape in the real data, including the no-program branch.
//
// app.jsx is JSX, so this needs bundling first. From the repo root:
//
//   npx esbuild verify-render.mjs --bundle --loader:.jsx=jsx --platform=node \
//     --format=esm --outfile=render.bundle.mjs --packages=external \
//     && node render.bundle.mjs && rm render.bundle.mjs
//
// Programs and logs both come from ./fixtures, so it depends on nothing
// outside this repo.

import fs from "fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAllAdherence } from "./src/core/adherence.js";
import { Adherence, DayCard, Publisher, PersonPanel, TABS, parseHash } from "./src/app.jsx";
import { buildPersonCtx } from "./src/core/overview.js";
import { buildRecovery } from "./src/core/recovery.js";
import { ProgrammeEditor } from "./src/editor.jsx";
import { buildNameMap } from "./src/core/names.js";

const ID={juha:"1da21dd7-5f90-423b-ba6c-bf8dc3dd8dee",henna:"5b757e16-813a-46f6-be67-423ff3b093cc",joonatan:"47ba0f5b-9844-4a24-81ca-f561a7b2fc9d"};
const read=p=>JSON.parse(fs.readFileSync("./fixtures/"+p,"utf8"));
const rows=o=>Object.keys(o).sort().map(day=>({day,payload:o[day]}));
const programs=read("programs.json");

const roster=[{id:ID.juha,name:"Juha"},{id:ID.henna,name:"Henna"},{id:ID.joonatan,name:"Joonatan"},{id:"ghost",name:"Ghost"}];
const logs={[ID.juha]:rows(read("logs-juha.json")),[ID.henna]:rows(read("logs-henna.json")),[ID.joonatan]:rows(read("logs-joonatan.json")),ghost:[{day:"2026-09-01",payload:{done:{}}}]};
const ov={[ID.juha]:rows(read("overrides-juha.json")),[ID.joonatan]:rows(read("overrides-joonatan.json"))};

const a=buildAllAdherence(roster,logs,ov,programs);
let bad=0;
for(const p of roster){
  const html=renderToStaticMarkup(React.createElement(Adherence,{person:p,adherence:a[p.id]}));
  const tag=a[p.id].noProgram?"noProgram notice":"summary panel";
  console.log(`  ${p.name.padEnd(10)} ${tag.padEnd(16)} ${String(html.length).padStart(5)} chars`);
  if(!html.length) bad++;
}
// every distinct day shape Juha's history contains
const byDay={}; a[ID.juha].days.forEach(d=>byDay[d.date]=d);
const specimens=[
 ["skip day","2026-09-07"],["high pct","2026-08-19"],["low pct","2026-09-16"],
 ["today, barely started","2026-09-20"],["substitutions","2026-09-04"]];
const juhaLogs=read("logs-juha.json"), juhaOv=read("overrides-juha.json");
for(const [label,date] of specimens){
  const names=buildNameMap(programs.filter(r=>r.assigned_to===ID.juha).map(r=>({definition:r.definition})), Object.keys(juhaOv).map(d=>({day:d,payload:juhaOv[d]})));
  const html=renderToStaticMarkup(React.createElement(DayCard,{day:{day:date,log:juhaLogs[date]||null,override:juhaOv[date]||null,updated:null},scored:byDay[date],names}));
  if(/>up-\d|>lo-\d|>mob-\d/.test(html)){console.log("    raw ID leaked into markup for "+date);bad++;}
  const shows = byDay[date].skip ? byDay[date].skip : Math.round(byDay[date].pct*100)+"%";
  const present = html.includes(shows.split(" ")[0]);
  console.log(`  ${label.padEnd(22)} ${date}  badge="${shows}" ${present?"present":"MISSING"}  ${String(html.length).padStart(5)} chars`);
  if(!present) bad++;
}
// The publisher is a write surface, so every state it can be in must have
// been seen rendered at least once before it ships.
const pubRows=Object.keys(juhaLogs).map(d=>({day:d,payload:juhaLogs[d]}));
const pub=(defaultOpen)=>renderToStaticMarkup(React.createElement(Publisher,{
  person:{id:ID.juha,name:"Juha"}, programs, logRows:pubRows, ownerId:ID.juha, onPublished:()=>{}, defaultOpen
}));
const closed=pub(false), opened=pub(true);
console.log(`  publisher collapsed  ${String(closed.length).padStart(5)} chars`);
console.log(`  publisher open       ${String(opened.length).padStart(5)} chars`);
if(closed.length===opened.length){console.log("    open and collapsed are identical — defaultOpen not honoured");bad++;}
if(!/Publish a new program version/.test(closed)){console.log("    collapsed label missing");bad++;}
for(const needle of ["Effective from","Program definition","their app runs this version","Check"]){
  if(!opened.includes(needle)){console.log("    open form missing: "+needle);bad++;}
}
if(/Publish<\/button>/.test(opened)){console.log("    Publish button rendered before any check passed");bad++;}
// The programme editor: collapsed and open for every fixture client.
const ville="2a545525-d9a4-450c-b90b-ce04d8f48abe";
const edRoster=[{id:ID.juha,name:"Juha"},{id:ID.henna,name:"Henna"},{id:ID.joonatan,name:"Joonatan"},{id:ville,name:"Ville"}];
const ed=(person,defaultOpen,extra)=>renderToStaticMarkup(React.createElement(ProgrammeEditor,{person,programs,logRows:[],ownerId:person.id,onPublished:()=>{},defaultOpen,...extra}));
// Strength and yoga are never cardio (Phase 6), so a yoga block has no Cardio target panel.
const cardioBlock={[ID.juha]:"cardio/hard",[ville]:"run/easy"};
const nonCardioBlock={[ID.henna]:"yoga/session",[ID.juha]:"strength/a"};
for(const p of edRoster){
  let c="",o="",t="",k="",nc="";
  try{
    c=ed(p,false);o=ed(p,true);t=ed(p,true,{defaultView:"table"});
    if(cardioBlock[p.id])k=ed(p,true,{defaultSelected:cardioBlock[p.id]});
    if(nonCardioBlock[p.id])nc=ed(p,true,{defaultSelected:nonCardioBlock[p.id]});
  }catch(e){console.log("    editor threw for "+p.name+": "+e.message);bad++;continue;}
  console.log(`  editor ${p.name.padEnd(9)} collapsed ${String(c.length).padStart(5)}  board ${String(o.length).padStart(6)}  table ${String(t.length).padStart(6)} chars`);
  if(c.length===o.length){console.log("    editor open == collapsed");bad++;}
  if(o===t){console.log("    board view == table view");bad++;}
  if(!c.includes("Edit programme for "+p.name)){console.log("    editor collapsed label missing");bad++;}
  for(const needle of ["Based on:","Effective from","Check","Add existing","Add new","+ Add block","Retire","Remove","Heart-rate zones","Use standard PK1/PK2/VK","Cardio types","Add cardio type"]) if(!o.includes(needle)){console.log("    editor open missing: "+needle);bad++;}
  for(const needle of ["Session library","Week board","Week A","Week B","Make Week B same as A","Make Week A same as B","Short label in the client&#x27;s picker","Changes","No changes",">Table<"]) if(!o.includes(needle)){console.log("    editor board missing: "+needle);bad++;}
  {
    // board view: seven Monday-first day columns, drop targets
    const order=[...o.matchAll(/data-part="day"/g)].length;
    const dows=[...o.matchAll(/data-dow="(\d)"/g)].map(m=>m[1]).slice(0,7).join("");
    if(order!==7){console.log("    board has "+order+" day columns, expected 7");bad++;}
    if(dows!=="1234560"){console.log("    board day order is "+dows+", expected 1234560");bad++;}
    if(!/data-card="library"/.test(o)){console.log("    library has no cards");bad++;}
    if(!/draggable/.test(o)){console.log("    no draggable cards");bad++;}
  }
  for(const needle of ["Weekly schedule","Week A","Week B","Make Week B same as A","Make Week A same as B",">Board<"]) if(!t.includes(needle)){console.log("    editor table missing: "+needle);bad++;}
  {
    // table view: the unchanged select grid, 7 columns, Monday first
    const grid=t.slice(t.indexOf("Weekly schedule"));
    const order=[...grid.matchAll(/data-dow="(\d)"/g)].map(m=>m[1]).slice(0,7).join("");
    if(order!=="1234560"){console.log("    schedule grid order is "+order+", expected 1234560");bad++;}
    if((t.match(/data-dow="/g)||[]).length!==7){console.log("    table view should have 7 day columns");bad++;}
    const first=grid.indexOf(">Mon<"), last=grid.indexOf(">Sun<");
    if(first<0||last<0||first>last){console.log("    schedule grid not Monday first");bad++;}
  }
  if(o.includes("Day notes")){console.log("    Day notes section should be gone from the publish panel");bad++;}
  if(!/Copies every day of Week A onto Week B/.test(o)){console.log("    copy button tooltip missing");bad++;}
  if(!/data-part="section"/.test(o)){console.log("    collapsible sections not boxed");bad++;}
  if(!/<button[^>]*disabled=""[^>]*>Check<\/button>/.test(o)){console.log("    Check not disabled with no changes");bad++;}
  if(nc){
    if(nc.includes("Cardio target")){console.log("    editor: a "+nonCardioBlock[p.id]+" block must not show the Cardio target panel");bad++;}
  }
  if(k){
    if(!k.includes("Cardio target")){console.log("    editor open missing: Cardio target");bad++;}
    if(p.id!==ID.joonatan && !k.includes("Zones need a heart-rate zone table")){console.log("    editor open missing: no-zones hint");bad++;}
  }
  if(/Publish<\/button>/.test(o)){console.log("    editor Publish button before any check");bad++;}
}
// retired blocks render read-only: Juha's strength "full" is in blocks but not in slotOptions
{
  const o=ed({id:ID.juha,name:"Juha"},true);
  const i=o.indexOf("full · retired");
  if(i<0){console.log("    retired block not marked");bad++;}
  else{
    const seg=o.slice(i,o.indexOf("</div>",i)+6);
    if(/<input/.test(seg)){console.log("    retired block renders inputs");bad++;}
    else console.log("  retired block read-only");
  }
  if(!o.includes("Restore")){console.log("    retired block has no Restore");bad++;}
  if(!/<input[^>]*value="Dumbbell bench press"/.test(o)){console.log("    live exercise name input missing");bad++;}
}
// R1 shell: the Overview and every tab, for each fixture person and the ghost.
{
  const shellRoster=[...roster.slice(0,3),{id:ville,name:"Ville"},roster[3]];
  const shellLogs={...logs,[ville]:[]};
  const data={roster:shellRoster,logs:shellLogs,overrides:ov,programs,wearables:{connections:[],days:{},workouts:{}}};
  const adh2=buildAllAdherence(shellRoster,shellLogs,ov,programs);
  for(const p of shellRoster){
    const names=buildNameMap(programs.filter(r=>r.assigned_to===p.id).map(r=>({definition:r.definition})),ov[p.id]);
    const ctx=buildPersonCtx(data,{...p,state:"ok"},{today:new Date(2026,8,18),recovery:buildRecovery([],[],p.id),adherence:adh2[p.id],names,draft:null});
    const lens=[];
    for(const t of TABS){
      let h="";
      try{
        h=renderToStaticMarkup(React.createElement(PersonPanel,{tab:t.id,person:{...p,state:"ok"},days:[],total:(shellLogs[p.id]||[]).length,adherence:adh2[p.id],pctByDay:{},recovery:ctx.recovery,connections:[],names,programs,logRows:shellLogs[p.id]||[],ownerId:p.id,ctx,onPublished:()=>{},onMore:()=>{}}));
      }catch(e){console.log("    tab "+t.id+" threw for "+p.name+": "+e.message);bad++;continue;}
      lens.push(t.id+":"+h.length);
      if(!h.length){console.log("    tab "+t.id+" empty for "+p.name);bad++;}
      if(/NaN|undefined|\[object/.test(h)){console.log("    tab "+t.id+" leaks NaN/undefined for "+p.name);bad++;}
      if(t.id==="overview"){
        for(const needle of ["This week · planned vs done","Needs attention","Recent sessions","Recovery · 7 nights","Choose what box 1 shows","Choose what box 4 shows"]) if(!h.includes(needle)){console.log("    overview missing: "+needle+" ("+p.name+")");bad++;}
        if((h.match(/<select/g)||[]).length!==4){console.log("    overview should have 4 selects");bad++;}
        if((h.match(/data-day="/g)||[]).length!==7){console.log("    overview week grid should have 7 days");bad++;}
      }
      if(t.id==="recovery"){
        for(const needle of ["Progress","Recovery trends","Tracked items","Getting stronger","Consistency","Sessions by sport","No wearable connected"]) if(!h.includes(needle)){console.log("    progress missing: "+needle+" ("+p.name+")");bad++;}
        if(h.includes('data-chart="recovery"')){console.log("    progress shows recovery charts with no wearable ("+p.name+")");bad++;}
      }
      if(t.id==="versions"&&!h.includes("Publish a new program version")){console.log("    versions tab missing collapsed publisher ("+p.name+")");bad++;}
      if(t.id==="programme"&&p.id!=="ghost"&&!h.includes("Based on:")){console.log("    programme tab not open by default ("+p.name+")");bad++;}
    }
    console.log(`  shell ${p.name.padEnd(9)} ${lens.join(" ")}`);
  }
  {
    // Progress with wearables: five recovery cards, connection tags, tracked cards for Juha.
    const wd=[];for(let n=1;n<=35;n++){const d=new Date(2026,8,18-n);const day=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");wd.push({user_id:ID.juha,vendor:"oura",day,sleep_minutes:420,readiness:75,resting_hr:50,hrv:55,steps:8000});}
    const wdata={...data,wearables:{connections:[{user_id:ID.juha,vendor:"oura",status:"connected",last_synced_at:new Date().toISOString()}],days:{[ID.juha]:wd},workouts:{}}};
    const p={id:ID.juha,name:"Juha",state:"ok"};
    const names=buildNameMap(programs.filter(r=>r.assigned_to===p.id).map(r=>({definition:r.definition})),ov[p.id]);
    const rec=buildRecovery(wd,[],p.id);
    const ctx=buildPersonCtx(wdata,p,{today:new Date(2026,8,18),recovery:rec,adherence:adh2[p.id],names,draft:null});
    const h=renderToStaticMarkup(React.createElement(PersonPanel,{tab:"recovery",person:p,days:[],total:1,adherence:adh2[p.id],pctByDay:{},recovery:rec,connections:wdata.wearables.connections,names,programs,logRows:shellLogs[p.id],ownerId:p.id,ctx,onPublished:()=>{},onMore:()=>{}}));
    const n=(h.match(/data-chart="recovery"/g)||[]).length, tr=(h.match(/data-card="tracked"/g)||[]).length;
    console.log(`  progress Juha with wearables: ${n} recovery cards, ${tr} tracked cards, ${h.length} chars`);
    if(n!==5){console.log("    expected 5 recovery cards");bad++;}
    if(tr<1){console.log("    expected tracked cards for Juha");bad++;}
    if(!h.includes("oura · synced")){console.log("    connection tag missing");bad++;}
    if(/NaN|undefined|\[object/.test(h)){console.log("    progress leaks NaN/undefined");bad++;}
  }
  const paused=renderToStaticMarkup(React.createElement(PersonPanel,{tab:"overview",person:{id:"x",name:"X",state:"paused"},days:[],total:0,programs:[],logRows:[],onPublished:()=>{}}));
  if(!paused.includes("Sharing is paused")){console.log("    paused notice missing");bad++;} else console.log("  paused notice renders");
  const hp=parseHash("#/abc/recovery"), hq=parseHash("#/abc/nonsense"), hr=parseHash("");
  if(hp.personId!=="abc"||hp.tab!=="recovery"||hq.tab!==null||hr.personId!==null){console.log("    parseHash wrong");bad++;}
}
console.log(bad?`\n${bad} render problem(s)`:"\nAll render checks passed.");
process.exit(bad?1:0);
