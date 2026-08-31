(function(){
  const isMobile=()=>window.matchMedia('(max-width:620px)').matches;
  const tbody=()=>document.querySelector('#salesItemsTable tbody');
  const search=()=>document.getElementById('medicineSearch');
  const completedKeys=new Set();
  let observer=null;

  function rowKey(row){
    if(!row) return '';
    const medicine=(row.children[0]?.innerText||'').replace(/\s+/g,' ').trim();
    const batch=row.querySelector('.batch-select')?.value||'';
    return `${medicine}::${batch}`;
  }

  function applyState(row){
    const key=rowKey(row);
    if(key && completedKeys.has(key)) row.classList.add('mobile-line-complete');
    else row.classList.remove('mobile-line-complete');
  }

  function enhanceRow(row){
    if(!isMobile()||!row) return;
    if(row.dataset.mobileLineFlow!=='1'){
      row.dataset.mobileLineFlow='1';
      const action=row.children[10];
      if(action){
        const done=document.createElement('button');
        done.type='button';
        done.className='mobile-line-done';
        done.textContent='✓ Done / Next Medicine';
        done.addEventListener('click',e=>{
          e.preventDefault();
          e.stopPropagation();
          finishRow(row);
        });
        action.appendChild(done);
      }
    }
    applyState(row);
  }

  function finishRow(row){
    if(!isMobile()) return;
    const key=rowKey(row);
    if(key) completedKeys.add(key);
    row.classList.add('mobile-line-complete');
    const q=search();
    if(q){
      q.value='';
      q.dispatchEvent(new Event('input',{bubbles:true}));
      setTimeout(()=>{
        q.scrollIntoView({behavior:'smooth',block:'center'});
        try{q.focus({preventScroll:true});}catch(_){q.focus();}
      },80);
    }
  }

  function reopenRow(row){
    if(!isMobile()) return;
    const key=rowKey(row);
    if(key) completedKeys.delete(key);
    row.classList.remove('mobile-line-complete');
  }

  document.addEventListener('click',e=>{
    if(!isMobile()) return;
    const row=e.target?.closest?.('#salesItemsTable tbody tr');
    if(!row) return;

    const clickedButton=e.target.closest('button');
    if(clickedButton && !clickedButton.classList.contains('mobile-line-done')){
      const key=rowKey(row);
      if(key) completedKeys.delete(key);
      return;
    }

    if(row.classList.contains('mobile-line-complete')&&!clickedButton){
      reopenRow(row);
    }
  },true);

  function syncRows(){
    const body=tbody();
    if(!body) return;
    [...body.rows].forEach(enhanceRow);
  }

  function init(){
    const body=tbody();
    if(!body) return;
    syncRows();
    if(observer) observer.disconnect();
    observer=new MutationObserver(()=>requestAnimationFrame(syncRows));
    observer.observe(body,{childList:true,subtree:false});
  }

  document.addEventListener('DOMContentLoaded',init);
  document.addEventListener('click',()=>setTimeout(init,0),true);
  document.addEventListener('input',e=>{
    if(e.target?.closest?.('#salesItemsTable')) setTimeout(syncRows,0);
  });
  document.addEventListener('change',e=>{
    if(e.target?.closest?.('#salesItemsTable')) setTimeout(syncRows,0);
  });
  window.addEventListener('resize',()=>setTimeout(init,0));
})();