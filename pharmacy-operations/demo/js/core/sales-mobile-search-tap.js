(function(){
  let lastHandled=0;

  document.addEventListener('touchend',function(event){
    const row=event.target?.closest?.('#medicineSearchResults .search-result[data-id]');
    if(!row) return;
    if(event.target?.closest?.('.record-bounce')) return;

    /* Mobile Chrome may use the first tap to dismiss the keyboard instead of
       reliably delivering the row's normal click. Reuse the existing desktop
       onclick path rather than duplicating Sales add-item logic. */
    event.preventDefault();
    event.stopPropagation();
    lastHandled=Date.now();
    row.click();
  },{passive:false,capture:true});

  document.addEventListener('click',function(event){
    const row=event.target?.closest?.('#medicineSearchResults .search-result[data-id]');
    if(!row) return;
    if(Date.now()-lastHandled<450 && event.isTrusted){
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },true);
})();