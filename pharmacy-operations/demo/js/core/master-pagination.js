(function(){
  const PAGE_SIZE=50;
  const PREFIXES=['mfr','sup','cus','doc'];
  const state={};
  let applying=false;

  function activePrefix(){return PREFIXES.find(p=>document.getElementById(p+'Body')&&document.getElementById(p+'Count'))||null;}

  function ensureControls(prefix){
    let bar=document.getElementById(prefix+'Pagination');
    if(bar)return bar;
    const head=document.querySelector('.master-head-actions');
    if(!head)return null;
    bar=document.createElement('div');
    bar.id=prefix+'Pagination';
    bar.className='pagination-bar';
    bar.innerHTML=`<button id="${prefix}PrevPage" type="button">← Previous</button><span id="${prefix}PageInfo">Page 1 of 1</span><button id="${prefix}NextPage" type="button">Next →</button>`;
    head.appendChild(bar);
    state[prefix]=state[prefix]||{page:1,lastSignature:''};
    document.getElementById(prefix+'PrevPage').onclick=()=>{if(state[prefix].page>1){state[prefix].page--;apply(prefix,true)}};
    document.getElementById(prefix+'NextPage').onclick=()=>{const total=getRows(prefix).length,pages=Math.max(1,Math.ceil(total/PAGE_SIZE));if(state[prefix].page<pages){state[prefix].page++;apply(prefix,true)}};
    return bar;
  }

  function getRows(prefix){
    const body=document.getElementById(prefix+'Body');
    if(!body)return[];
    return Array.from(body.querySelectorAll('tr')).filter(r=>!r.querySelector('td.empty'));
  }

  function signature(rows){return rows.map(r=>r.querySelector('[data-id]')?.dataset.id||r.textContent?.slice(0,60)||'').join('|');}

  function apply(prefix,scrollToTop=false){
    if(applying)return;
    applying=true;
    try{
      if(!ensureControls(prefix))return;
      const rows=getRows(prefix),sig=signature(rows);
      state[prefix]=state[prefix]||{page:1,lastSignature:''};
      if(sig!==state[prefix].lastSignature){state[prefix].page=1;state[prefix].lastSignature=sig;}
      const total=rows.length,pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
      if(state[prefix].page>pages)state[prefix].page=pages;
      const start=(state[prefix].page-1)*PAGE_SIZE,end=start+PAGE_SIZE;
      rows.forEach((r,i)=>{r.style.display=(i>=start&&i<end)?'':'none';});
      const prev=document.getElementById(prefix+'PrevPage'),next=document.getElementById(prefix+'NextPage'),info=document.getElementById(prefix+'PageInfo');
      if(info)info.textContent=`Page ${state[prefix].page} of ${pages}`;
      if(prev)prev.disabled=state[prefix].page<=1;
      if(next)next.disabled=state[prefix].page>=pages||total===0;
      if(scrollToTop){document.querySelector('.masters-module')?.scrollIntoView({behavior:'smooth',block:'start'});}
    }finally{applying=false;}
  }

  function refresh(){const p=activePrefix();if(p)requestAnimationFrame(()=>apply(p));}
  const observer=new MutationObserver(refresh);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('input',e=>{if(e.target?.id&&PREFIXES.some(p=>e.target.id===p+'Search'))setTimeout(refresh,0)});
  document.addEventListener('change',e=>{if(e.target?.id&&PREFIXES.some(p=>e.target.id===p+'Status'))setTimeout(refresh,0)});
  document.addEventListener('DOMContentLoaded',refresh);
  setTimeout(refresh,0);
})();