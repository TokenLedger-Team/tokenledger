// AI Model Map: node size = throughput, hue = family, brightness = load, ring/dot = health, dashed ghost = off-peak size.
const FAM={GPT:{h:162,p:"OpenAI"},Claude:{h:24,p:"Anthropic"},Gemini:{h:215,p:"Google"},Llama:{h:268,p:"Meta"}};
// t = k req/min, l = p50 latency ms, ld = load %  → [off-peak, peak]
const MODELS=[
{n:"GPT-4o",f:"GPT",v:0,t:[18,42],l:[380,640],ld:[41,86],ctx:"128k"},
{n:"GPT-4o mini",f:"GPT",v:1,t:[22,46],l:[190,260],ld:[30,62],ctx:"128k"},
{n:"GPT-4.1",f:"GPT",v:2,t:[9,21],l:[420,610],ld:[35,71],ctx:"1M"},
{n:"Claude 3.5 Sonnet",f:"Claude",v:0,t:[12,29],l:[460,820],ld:[38,91],ctx:"200k"},
{n:"Claude Haiku",f:"Claude",v:1,t:[14,31],l:[210,300],ld:[28,58],ctx:"200k"},
{n:"Gemini 1.5 Pro",f:"Gemini",v:0,t:[7,16],l:[510,690],ld:[30,64],ctx:"2M"},
{n:"Gemini Flash",f:"Gemini",v:1,t:[10,24],l:[230,330],ld:[26,55],ctx:"1M"},
{n:"Llama 3.1 70B",f:"Llama",v:0,t:[5,11],l:[540,980],ld:[34,89],ctx:"128k"}];
const D=t=>26+58*Math.sqrt(t/46), st=(l,ld)=>ld>=88||l>=900?"deg":ld>=80?"warn":"ok";
let peak=1,sel=null;const root=document.getElementById("modelMap"),fmt=n=>n.toLocaleString("en-US");
function color(m,i){const h=FAM[m.f].h+m.v*7,bad=st(m.l[i],m.ld[i])==="deg";return `hsl(${h} ${bad?38:72}% ${34+m.ld[i]*.28}%)`}
function render(){
  const i=peak,avg=k=>MODELS.reduce((a,m)=>a+m[k][i],0)/MODELS.length,avgO=k=>MODELS.reduce((a,m)=>a+m[k][0],0)/MODELS.length;
  const lat=avg("l"),dl=Math.round((lat/avgO("l")-1)*100),rpm=MODELS.reduce((a,m)=>a+m.t[i],0),deg=MODELS.filter(m=>st(m.l[i],m.ld[i])==="deg").length;
  const groups=Object.keys(FAM).map(f=>{const ms=MODELS.filter(m=>m.f===f);
    return `<div class="mm-group" style="--n:${ms.length};--h:${FAM[f].h}"><div class="mm-ghead"><i></i>${f}<span>${FAM[f].p}</span></div><div class="mm-nodes">${ms.map(m=>{
      const d=D(m.t[i]),g=D(m.t[0]),s=st(m.l[i],m.ld[i]),c=color(m,i);
      return `<button class="mm-cell ${sel===m.n?"sel":""}" data-m="${m.n}" title="${m.n}: ${m.l[i]} ms · ${m.ld[i]}% load · ${m.t[i]}k req/min"><div class="mm-slot">${i?`<span class="mm-ghost" style="width:${g}px;height:${g}px"></span>`:""}<div class="mm-node ${s}" style="width:${d}px;height:${d}px;--fs:${d>56?15:12}px;background:radial-gradient(circle at 30% 25%,${c.replace(/(\d+)%\)$/,x=>(+x[0].slice(0,-1)+14)+"%)")},${c});box-shadow:0 0 ${m.ld[i]*.32}px hsl(${FAM[f].h+m.v*7} 80% 55% / ${m.ld[i]/160})"><b>${m.l[i]}</b><small>ms</small></div></div><span class="mm-name">${m.n}</span></button>`}).join("")}</div></div>`}).join("");
  const rows=MODELS.map(m=>{const dd=Math.round((m.l[1]/m.l[0]-1)*100),s=st(m.l[i],m.ld[i]),c=color(m,i);
    return `<div class="mm-row ${sel===m.n?"sel":""}" data-m="${m.n}"><span class="nm"><i style="background:${c}"></i>${m.n}</span>
    <span class="mm-lat"><b>${m.l[i]} ms</b> <span>${i?`off-peak ${m.l[0]}`:`peak ${m.l[1]}`}</span><span class="${dd>60?"d-up":"d-ok"}">${i?"▲":"+"}${dd}%</span></span>
    <span><span class="mm-bar"><i style="width:${m.ld[i]}%;background:${s==="deg"?"var(--bad)":s==="warn"?"var(--warn)":c}"></i></span></span><span>${m.t[i]}k /min</span><span>${m.ctx}</span></div>`}).join("");
  root.innerHTML=`<div class="mm-top"><div class="mm-kpis">
    <div class="mm-kpi"><small>Fleet p50 latency</small><strong>${Math.round(lat)} ms</strong><em class="${dl>20?"d-up":"d-ok"}">${i?"+"+dl+"% vs off-peak":"baseline"}</em></div>
    <div class="mm-kpi"><small>Throughput</small><strong>${rpm}k /min</strong></div>
    <div class="mm-kpi"><small>Degraded models</small><strong style="color:${deg?"var(--bad)":"var(--ok)"}">${deg} / ${MODELS.length}</strong></div></div>
    <div class="mm-seg" role="group" aria-label="Traffic window"><button data-p="0" class="${i?"":"on"}">Off-peak<small>02–06 UTC</small></button><button data-p="1" class="${i?"on":""}">Peak<small>14–18 UTC</small></button></div></div>
    <div class="mm-stage">${groups}</div>
    <div class="mm-legend"><span><i style="width:14px;height:14px;background:#6b7a99"></i>Size = throughput (req/min)</span><span><i style="width:10px;height:10px;background:hsl(162 72% 55%)"></i>Brightness = load</span><span><i style="width:12px;height:12px;border:1px dashed var(--muted)"></i>Ghost = off-peak size</span><span><i style="width:8px;height:8px;background:var(--ok)"></i><i style="width:8px;height:8px;background:var(--warn)"></i><i style="width:8px;height:8px;background:var(--bad)"></i>Healthy · Strained · Degraded</span></div>
    <div class="mm-table"><div class="mm-row h"><span>Model</span><span>Latency p50</span><span>Load</span><span>Throughput</span><span>Context</span></div>${rows}</div>`;
}
root.addEventListener("click",e=>{const p=e.target.closest("[data-p]"),m=e.target.closest("[data-m]");
  if(p){peak=+p.dataset.p;render();notify(peak?"Peak window: latency and load climb":"Off-peak window: baseline")}
  else if(m){sel=sel===m.dataset.m?null:m.dataset.m;render()}});
render();

const tt=document.getElementById("themeToggle");
function paintTheme(){const d=document.documentElement.dataset.theme==="dark";document.getElementById("themeIcon").textContent=d?"☀":"☾";document.getElementById("themeLabel").textContent=d?"Light":"Dark"}
tt.addEventListener("click",()=>{const n=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=n;try{localStorage.setItem("tl-theme",n)}catch(e){}paintTheme();notify(n[0].toUpperCase()+n.slice(1)+" theme")});
paintTheme();
