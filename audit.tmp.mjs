import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const srv=createServer((q,r)=>{const u=q.url.split('?')[0];let f=join('dist',u==='/'?'index.html':u.slice(1));if(!existsSync(f)||!extname(f))f=join('dist','index.html');r.writeHead(200,{'Content-Type':T[extname(f)]||'text/plain'});r.end(readFileSync(f));});
await new Promise(r=>srv.listen(4610,r));
const BASE='http://localhost:4610';
const ROUTES=['/','/report','/triage','/account','/sms','/coverage','/methodology','/toolkits','/toolkits/register','/toolkits/sra','/toolkits/spi','/toolkits/maturity','/templates','/glossary','/about','/tutorials','/faq','/privacy','/terms'];
mkdirSync('shots.tmp',{recursive:true});
const F=[];
const b=await chromium.launch();

/* 320px is SC 1.4.10 Reflow — the width a 1280px page must survive at
   400% zoom, and also the narrowest handset still in service. */
for (const [name,W,H] of [['w320',320,760],['w390',390,844],['land',844,390]]) {
  const c=await b.newContext({viewport:{width:W,height:H}});
  const p=await c.newPage();
  for (const route of ROUTES) {
    await p.goto(BASE+route,{waitUntil:'networkidle'});
    await p.waitForTimeout(200);
    const r=await p.evaluate(()=>{
      const de=document.documentElement, vw=de.clientWidth;
      const out={overflow:de.scrollWidth>vw+1?de.scrollWidth:0, small:[], unlabelled:[], widest:null};
      // widest offender
      let worst=0;
      for(const el of document.querySelectorAll('body *')){
        const b=el.getBoundingClientRect();
        if(b.width>0&&b.right>vw+2&&b.right>worst){worst=b.right;out.widest=`${el.tagName}.${(el.className||'').toString().split(' ')[0]} right=${Math.round(b.right)}`;}
      }
      // SC 2.5.8 Target Size (Minimum) — 24x24 CSS px
      const interactive=document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[tabindex]:not([tabindex="-1"])');
      for(const el of interactive){
        const b=el.getBoundingClientRect();
        if(b.width===0&&b.height===0) continue;             // not rendered
        const cs=getComputedStyle(el);
        if(cs.visibility==='hidden'||cs.display==='none') continue;
        // inline links in prose are exempt from 2.5.8
        const inProse=el.tagName==='A'&&['P','LI','DD','DT','SPAN','STRONG','EM'].includes(el.parentElement?.tagName??'');
        if(inProse) continue;
        if(b.width<24||b.height<24){
          out.small.push(`${el.tagName}.${(el.className||'').toString().split(' ')[0]||'-'} ${Math.round(b.width)}x${Math.round(b.height)} "${(el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,24)}"`);
        }
      }
      // accessible name on every form control
      for(const el of document.querySelectorAll('input:not([type=hidden]),select,textarea')){
        const id=el.id;
        const named=(id&&document.querySelector(`label[for="${CSS.escape(id)}"]`))||el.closest('label')||el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')||el.getAttribute('title');
        if(!named) out.unlabelled.push(`${el.tagName}[name=${el.name||'-'}]`);
      }
      return out;
    });
    if(r.overflow) F.push(`${name} ${route}: SCROLLS SIDEWAYS ${r.overflow}px — ${r.widest??'?'}`);
    if(r.small.length) F.push(`${name} ${route}: ${r.small.length} target(s) under 24px — ${[...new Set(r.small)].slice(0,4).join(' | ')}`);
    if(r.unlabelled.length) F.push(`${name} ${route}: ${r.unlabelled.length} unlabelled control(s) — ${[...new Set(r.unlabelled)].slice(0,4).join(', ')}`);
    if(name==='w390'&&['/','/report','/toolkits/maturity','/templates','/sms'].includes(route))
      await p.screenshot({path:`shots.tmp/${route.replace(/\//g,'_')||'_home'}.png`,fullPage:false});
  }
  await c.close();
}
await b.close(); srv.close();
console.log(F.length?'FINDINGS ('+F.length+'):\n'+[...new Set(F)].map(x=>'  · '+x).join('\n'):'No accessibility findings across '+(ROUTES.length*3)+' runs.');
