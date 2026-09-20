// Phase 6 render check — proves the adherence UI survives every distinct day
// shape in the real data, including the no-program branch.
//
// app.jsx is JSX, so this needs bundling first. From the repo root:
//
//   npx esbuild verify-render.mjs --bundle --loader:.jsx=jsx --platform=node \
//     --format=esm --outfile=render.bundle.mjs --external:react --external:react-dom \
//     && node render.bundle.mjs && rm render.bundle.mjs
//
// Programs and logs both come from ./fixtures, so it depends on nothing
// outside this repo.

import fs from "fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAllAdherence } from "./src/core/adherence.js";
import { Adherence, DayCard, Publisher } from "./src/app.jsx";
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
for(const needle of ["Effective from","Program definition","does not change","Check"]){
  if(!opened.includes(needle)){console.log("    open form missing: "+needle);bad++;}
}
if(/Publish<\/button>/.test(opened)){console.log("    Publish button rendered before any check passed");bad++;}
console.log(bad?`\n${bad} render problem(s)`:"\nAll render checks passed.");
process.exit(bad?1:0);
