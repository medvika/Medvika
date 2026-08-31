(function(){
  function toast(message){
    if(window.MedvikaUI?.toast) window.MedvikaUI.toast(message,"error");
  }

  // Search-result guard: an out-of-stock medicine remains visible for Bounce capture,
  // but clicking the result itself must never add it to the invoice.
  document.addEventListener("click",function(event){
    const row=event.target.closest("#medicineSearchResults .search-result[data-id]");
    if(!row) return;
    if(event.target.closest(".record-bounce")) return;

    const unavailable=row.querySelector(".record-bounce");
    if(!unavailable) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    toast("This medicine is out of stock. Record the unavailable request instead.");
  },true);

  // Final defensive guard: even if another UI path creates a line without a usable
  // batch, the Sales form cannot be submitted with that line.
  document.addEventListener("submit",function(event){
    const form=event.target;
    if(!form || form.id!=="salesForm") return;

    const rows=Array.from(document.querySelectorAll("#salesItemsTable tbody tr"));
    const invalid=rows.some(row=>{
      const batch=row.querySelector(".batch-select");
      return batch && !batch.value;
    });

    if(!invalid) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toast("Sale cannot be saved: one or more medicines have no sellable stock batch.");
  },true);
})();