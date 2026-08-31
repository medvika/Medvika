(function(){
  function amount(text){
    return Number(String(text||"0").replace(/[^0-9.-]/g,""))||0;
  }

  function updateCashChange(){
    const method=document.getElementById("paymentMethod");
    const paid=document.getElementById("amountPaid");
    const block=document.getElementById("cashTenderBlock");
    const received=document.getElementById("cashReceived");
    const output=document.getElementById("cashReturnText");
    const grand=document.getElementById("grandTotalText");
    if(!method||!paid||!block||!received||!output||!grand) return;

    const isCash=method.value==="cash";
    const due=Math.max(0,amount(grand.textContent));
    block.hidden=!isCash;

    if(isCash){
      paid.value=due.toFixed(2);
      paid.readOnly=true;
      paid.title="Automatically equal to the current bill total for cash payment.";
    }else{
      paid.readOnly=false;
      paid.title="";
    }

    const change=isCash?Math.max(0,(Number(received.value)||0)-due):0;
    output.textContent=`₹${change.toFixed(2)}`;
  }

  document.addEventListener("input",function(event){
    if(!event.target) return;
    if(event.target.id==="cashReceived"){
      updateCashChange();
      return;
    }
    if(
      event.target.id==="invoiceDiscount" ||
      event.target.id==="roundOff" ||
      event.target.closest?.("#salesItemsTable")
    ){
      setTimeout(updateCashChange,0);
    }
  });

  document.addEventListener("change",function(event){
    if(!event.target) return;
    if(event.target.id==="paymentMethod" || event.target.closest?.("#salesItemsTable")){
      setTimeout(updateCashChange,0);
    }
  });

  document.addEventListener("click",function(event){
    if(event.target?.closest?.('a[href="#sales"], [data-route="sales"]')){
      setTimeout(updateCashChange,250);
    }
  });

  window.MedvikaUpdateCashChange=updateCashChange;
})();