const t=document.getElementById('theme'),r=document.documentElement;const sync=()=>t&&(t.textContent=r.dataset.theme==='dark'?'☀':'☾');sync();
t&&t.addEventListener('click',()=>{r.dataset.theme=r.dataset.theme==='dark'?'light':'dark';try{localStorage.theme=r.dataset.theme}catch(e){}sync()});
document.querySelectorAll('.copy').forEach(b=>b.addEventListener('click',()=>{navigator.clipboard&&navigator.clipboard.writeText(b.dataset.copy);b.textContent='✔ Copied';setTimeout(()=>b.textContent='⧉ Copy',1500)}));
document.querySelectorAll('[data-group]').forEach(g=>g.addEventListener('click',e=>{if(e.target.classList.contains('chip')){g.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));e.target.classList.add('on')}}));
const s=document.getElementById('stream');if(s){const w="Hello! I'll check the weather for you…".split(/(?<= )/);let i=0;setInterval(()=>{if(i>=w.length){i=0;s.textContent=''}s.textContent+=w[i++]},220)}
const d=document.getElementById('drop'),f=document.getElementById('file'),dt=document.getElementById('droptxt');
if(d){['dragover','dragenter'].forEach(e=>d.addEventListener(e,x=>{x.preventDefault();d.classList.add('over')}));['dragleave','drop'].forEach(e=>d.addEventListener(e,x=>{x.preventDefault();d.classList.remove('over')}));
d.addEventListener('drop',x=>{const n=x.dataTransfer.files.length;dt.textContent=n+' item(s) selected — deploy pipeline coming soon.'});f.addEventListener('change',()=>dt.textContent=f.files.length+' file(s) selected — deploy pipeline coming soon.')}
