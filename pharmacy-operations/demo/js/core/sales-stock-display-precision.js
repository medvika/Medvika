(function(){
  function fixRow(row){
    const batch=row?.querySelector('.batch-select');
    if(!batch) return;
    const option=batch.options?.[batch.selectedIndex];
    const stockMatch=String(option?.textContent||'').match(/Stock\s+([0-9]+(?:\.[0-9]+)?)/i);
    const medicineText=String(row.children?.[0]?.innerText||'');
    const unitsMatch=medicineText.match(/1\s+\S+\s*=\s*(\d+)\s+/i);
    if(!stockMatch||!unitsMatch) return;
    const stock=Number(stockMatch[1]);
    const unitsPerPack=Math.max(1,Number(unitsMatch[1]));
    if(!Number.isFinite(stock)||!Number.isFinite(unitsPerPack)) return;
    const totalLoose=Math.round(stock*unitsPerPack);
    const fullPacks=Math.floor(totalLoose/unitsPerPack);
    const looseUnits=totalLoose%unitsPerPack;
    const cell=row.children?.[2];
    if(!cell) return;
    const small=cell.querySelector('small');
    const suffix=small?small.outerHTML:'';
    cell.innerHTML=`${fullPacks}:${looseUnits}${suffix?'<br>'+suffix:''}`;
  }
  function sync(){document.querySelectorAll('#salesItemsTable tbody tr').forEach(fixRow);}
  const observer=new MutationObserver(()=>requestAnimationFrame(sync));
  document.addEventListener('DOMContentLoaded',()=>{observer.observe(document.body,{childList:true,subtree:true});sync();});
  document.addEventListener('change',e=>{if(e.target?.matches?.('.batch-select'))setTimeout(sync,0);});
})();