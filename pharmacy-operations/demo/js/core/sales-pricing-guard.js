(function(){
  const batchCache=new Map();
  let bypassNextSubmit=false;

  function notify(message,type="error"){
    if(window.MedvikaUI?.toast) window.MedvikaUI.toast(message,type);
  }

  async function getBatch(batchId){
    if(!batchId) return null;
    if(batchCache.has(batchId)) return batchCache.get(batchId);
    const {data,error}=await supabaseClient
      .from("medicine_batches")
      .select("id,batch_number,mrp,purchase_rate,selling_rate")
      .eq("id",batchId)
      .maybeSingle();
    if(error) throw error;
    batchCache.set(batchId,data||null);
    return data||null;
  }

  function rowName(row){
    return row?.querySelector("td b")?.textContent?.trim()||"Medicine";
  }

  async function validateRow(row,{interactive=false}={}){
    const batchId=row.querySelector(".batch-select")?.value||"";
    const rateInput=row.querySelector(".rate");
    const discInput=row.querySelector(".disc");
    if(!batchId||!rateInput||!discInput) return {ok:true,belowCost:false};

    const rate=Number(rateInput.value||0);
    const discount=Number(discInput.value||0);
    if(!Number.isFinite(rate)||rate<0){
      if(interactive){rateInput.value="0";rateInput.focus();}
      return {ok:false,message:`Selling rate cannot be negative for ${rowName(row)}.`};
    }
    if(!Number.isFinite(discount)||discount<0||discount>100){
      if(interactive){discInput.value=String(Math.min(100,Math.max(0,Number.isFinite(discount)?discount:0)));discInput.focus();}
      return {ok:false,message:`Discount must be between 0% and 100% for ${rowName(row)}.`};
    }

    const batch=await getBatch(batchId);
    if(!batch) return {ok:false,message:`Selected batch is unavailable for ${rowName(row)}.`};
    const mrp=Number(batch.mrp||0);
    const purchase=Number(batch.purchase_rate||0);

    if(mrp>0 && rate>mrp+0.000001){
      if(interactive){rateInput.value=String(mrp);rateInput.focus();rateInput.select();}
      return {ok:false,message:`${rowName(row)} cannot be billed above MRP ${mrp.toFixed(2)}.`};
    }

    const netRate=rate*(1-discount/100);
    return {ok:true,belowCost:purchase>0&&netRate+0.000001<purchase,name:rowName(row),netRate,purchase};
  }

  document.addEventListener("change",async event=>{
    if(!event.target.matches("#salesItemsTable .rate, #salesItemsTable .disc")) return;
    try{
      const result=await validateRow(event.target.closest("tr"),{interactive:true});
      if(!result.ok) notify(result.message,"error");
      else if(result.belowCost) notify(`${result.name} is currently below purchase cost after discount.`,"warning");
    }catch(error){
      notify("Pricing validation failed: "+error.message,"error");
    }
  },true);

  document.addEventListener("submit",async event=>{
    const form=event.target;
    if(!form||form.id!=="salesForm") return;
    if(bypassNextSubmit){bypassNextSubmit=false;return;}

    event.preventDefault();
    event.stopImmediatePropagation();

    try{
      const rows=Array.from(document.querySelectorAll("#salesItemsTable tbody tr"));
      const below=[];
      for(const row of rows){
        const result=await validateRow(row);
        if(!result.ok){notify(result.message,"error");return;}
        if(result.belowCost) below.push(result);
      }

      if(below.length){
        const names=below.map(x=>x.name).join(", ");
        const approved=confirm(`Below-cost sale detected for: ${names}.\n\nContinue with this approved exception?`);
        if(!approved){notify("Sale not submitted because below-cost pricing was not approved.","warning");return;}
      }

      bypassNextSubmit=true;
      form.requestSubmit();
    }catch(error){
      notify("Pricing validation failed: "+error.message,"error");
    }
  },true);
})();