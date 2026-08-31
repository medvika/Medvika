window.initPurchaseOrderModule=async function(){
  const UI=window.MedvikaUI;
  const $=id=>document.getElementById(id);
  const body=document.querySelector("#reorderTable tbody");
  const poBody=document.querySelector("#purchaseOrdersTable tbody");
  const detailBody=document.querySelector("#purchaseOrderDetailTable tbody");
  const toast=(m,t="success")=>UI.toast(m,t==="danger"?"error":t);

  let medicines=[],lots=[],suppliers=[],suggestions=[],visible=[],selected=new Set();
  let purchaseOrders=[],purchaseOrderItems=[],selectedPO=null,purchasedMedicineIds=new Set();
  let salesMovement=[],salesReturnMovement=[];
  let currentPage=1,pageSize=25;

  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const qty=v=>n(v).toFixed(3).replace(/\.?0+$/,"");

  async function load(){
    const pid=window.MedvikaAuth.profile?.pharmacy_id;

    const movementSince=new Date(Date.now()-90*86400000).toISOString();

    const [m,l,s,po,poi,ph,sm,srm]=await Promise.all([
      supabaseClient.from("medicines").select("*").eq("pharmacy_id",pid).eq("is_active",true).limit(10000),
      supabaseClient.from("inventory_supplier_lots_v1").select("*").eq("pharmacy_id",pid).limit(20000),
      supabaseClient.from("suppliers").select("*").eq("pharmacy_id",pid).limit(5000),
      supabaseClient.from("purchase_orders").select("*").eq("pharmacy_id",pid).order("po_date",{ascending:false}).limit(500),
      supabaseClient.from("purchase_order_items").select("*").eq("pharmacy_id",pid).limit(5000),
      supabaseClient.from("purchase_items").select("medicine_id").eq("pharmacy_id",pid).limit(30000),
      supabaseClient.from("sales_items").select("medicine_id,quantity,sales_invoices!inner(invoice_date,invoice_status)").eq("pharmacy_id",pid).gte("sales_invoices.invoice_date",movementSince).neq("sales_invoices.invoice_status","cancelled").limit(30000),
      supabaseClient.from("sales_return_items").select("medicine_id,return_quantity,sales_returns!inner(return_date,return_status)").eq("pharmacy_id",pid).gte("sales_returns.return_date",movementSince).neq("sales_returns.return_status","cancelled").limit(30000)
    ]);

    const err=[m,l,s,po,poi,ph,sm,srm].find(r=>r.error)?.error;
    if(err)throw err;

    medicines=m.data||[];
    lots=l.data||[];
    suppliers=s.data||[];
    purchaseOrders=po.data||[];
    purchaseOrderItems=poi.data||[];
    purchasedMedicineIds=new Set((ph.data||[]).map(x=>x.medicine_id));
    salesMovement=sm.data||[];
    salesReturnMovement=srm.data||[];

    buildSuggestions();
    fillSuppliers();
    apply();
    renderPurchaseOrders();
  }

  function supplierName(id){
    const s=suppliers.find(x=>x.id===id);
    return s?.supplier_name||s?.name||s?.company_name||"Supplier";
  }

  function buildSuggestions(){
    const lookback=Math.max(1,n($("movementLookbackDays")?.value)||30);
    const coverDays=Math.max(1,n($("targetCoverDays")?.value)||15);
    const cutoff=Date.now()-lookback*86400000;
    const sold=new Map();
    const returned=new Map();

    salesMovement.forEach(row=>{
      const date=new Date(row.sales_invoices?.invoice_date||0).getTime();
      if(date>=cutoff){
        sold.set(
          row.medicine_id,
          n(sold.get(row.medicine_id))+n(row.quantity)
        );
      }
    });

    salesReturnMovement.forEach(row=>{
      const date=new Date(row.sales_returns?.return_date||0).getTime();
      if(date>=cutoff){
        returned.set(
          row.medicine_id,
          n(returned.get(row.medicine_id))+n(row.return_quantity)
        );
      }
    });

    const openStatuses=new Set(["DRAFT","SENT","APPROVED","PARTIALLY_RECEIVED"]);
    const openOrderIds=new Set(
      purchaseOrders
        .filter(po=>openStatuses.has(String(po.status||"DRAFT").toUpperCase()))
        .map(po=>po.id)
    );
    const openByMedicine=new Map();

    purchaseOrderItems.forEach(item=>{
      if(openOrderIds.has(item.purchase_order_id)){
        openByMedicine.set(
          item.medicine_id,
          n(openByMedicine.get(item.medicine_id))+Math.max(0,n(item.ordered_quantity)-n(item.received_quantity))
        );
      }
    });

    suggestions=medicines.map(m=>{
      const mlots=lots.filter(l=>l.medicine_id===m.id);
      const netSales=Math.max(
        0,
        n(sold.get(m.id))-n(returned.get(m.id))
      );
      const isTracked=
        mlots.length>0 ||
        purchasedMedicineIds.has(m.id) ||
        netSales>0 ||
        n(m.minimum_stock)>0 ||
        n(m.reorder_quantity)>0;

      if(!isTracked)return null;

      const reorder=Math.max(0,n(m.reorder_level));
      if(reorder<=0)return null;

      const current=mlots.reduce((sum,l)=>sum+n(l.available_quantity),0);
      const openPo=n(openByMedicine.get(m.id));
      const avgDaily=netSales/lookback;
      const movementTarget=Math.ceil(avgDaily*coverDays);
      const target=Math.max(reorder,movementTarget);
      const suggested=Math.ceil(
        Math.max(0,target-current-openPo)
      );
      const status=current<=0?"OUT":current<=reorder?"LOW":"OK";

      const latest=mlots
        .slice()
        .sort((a,b)=>String(b.purchase_date||"").localeCompare(String(a.purchase_date||"")))[0]||{};

      return {
        medicine_id:m.id,
        brand_name:m.brand_name||"Medicine",
        generic_name:m.generic_name||"",
        current_stock:current,
        reorder_level:reorder,
        net_sales:netSales,
        average_daily_sales:avgDaily,
        open_po_quantity:openPo,
        target_stock:target,
        suggested_quantity:suggested,
        supplier_id:latest.supplier_id||null,
        estimated_rate:n(latest.purchase_rate),
        status
      };
    }).filter(Boolean);

    if($("movementSalesHeader"))$("movementSalesHeader").textContent=`Net Sales (${lookback}d)`;
  }

  function fillSuppliers(){
    const map=new Map();
    suggestions.forEach(x=>{
      if(x.supplier_id)map.set(x.supplier_id,supplierName(x.supplier_id));
    });

    $("reorderSupplierFilter").innerHTML=
      '<option value="ALL">All Suppliers</option>'+
      [...map.entries()]
        .sort((a,b)=>a[1].localeCompare(b[1]))
        .map(([id,name])=>`<option value="${id}">${UI.safe(name)}</option>`)
        .join("");
  }

  function apply(){
    buildSuggestions();

    const search=$("reorderSearch").value.trim().toLowerCase();
    const supplier=$("reorderSupplierFilter").value;
    const status=$("reorderStatusFilter").value;

    visible=suggestions.filter(x=>{
      const text=[
        x.brand_name,
        x.generic_name,
        x.supplier_id?supplierName(x.supplier_id):""
      ].join(" ").toLowerCase();

      const statusOk=
        status==="ALL" ||
        (status==="REORDER"&&x.suggested_quantity>0) ||
        (status==="OUT"&&x.status==="OUT") ||
        (status==="LOW"&&x.status==="LOW");

      return (!search||text.includes(search)) &&
        (supplier==="ALL"||x.supplier_id===supplier) &&
        statusOk;
    });

    currentPage=1;
    renderSuggestions();
    summary();
  }

  function pageRows(){
    const totalPages=Math.max(1,Math.ceil(visible.length/pageSize));
    currentPage=Math.min(Math.max(1,currentPage),totalPages);
    const start=(currentPage-1)*pageSize;
    return visible.slice(start,start+pageSize);
  }

  function renderSuggestions(){
    const rows=pageRows();
    body.innerHTML=rows.length
      ? rows.map(x=>`
        <tr>
          <td>
            <input
              type="checkbox"
              class="reorder-select"
              data-id="${x.medicine_id}"
              ${selected.has(x.medicine_id)?"checked":""}
            >
          </td>

          <td>
            <b>${UI.safe(x.brand_name)}</b>
            <small>${UI.safe(x.generic_name)}</small>
          </td>

          <td class="${x.status==="OUT"?"status-out":x.status==="LOW"?"status-low":""}">
            ${qty(x.current_stock)}
          </td>

          <td>
            <div class="reorder-level-editor">
              <input
                type="number"
                class="reorder-level-input"
                data-id="${x.medicine_id}"
                min="0"
                step="0.001"
                value="${qty(x.reorder_level)}"
                title="Set 0 to exclude from automatic reorder"
              >
              <button
                type="button"
                class="save-reorder-level"
                data-id="${x.medicine_id}"
              >Save</button>
            </div>
          </td>
          <td>${qty(x.net_sales)}</td>
          <td>${qty(x.open_po_quantity)}</td>
          <td>${qty(x.target_stock)}</td>

          <td>
            <input
              type="number"
              class="suggested-qty"
              data-id="${x.medicine_id}"
              min="0"
              step="0.001"
              value="${qty(x.suggested_quantity)}"
            >
          </td>

          <td>
            <select class="supplier-choice" data-id="${x.medicine_id}">
              <option value="">Select supplier</option>
              ${suppliers.map(s=>`
                <option value="${s.id}" ${s.id===x.supplier_id?"selected":""}>
                  ${UI.safe(supplierName(s.id))}
                </option>
              `).join("")}
            </select>
          </td>

          <td>${UI.money(x.estimated_rate)}</td>
          <td>${UI.money(x.suggested_quantity*x.estimated_rate)}</td>
        </tr>
      `).join("")
      : '<tr><td colspan="11" class="empty">No matching reorder suggestions.</td></tr>';

    const totalPages=Math.max(1,Math.ceil(visible.length/pageSize));
    const start=visible.length?(currentPage-1)*pageSize+1:0;
    const end=Math.min(currentPage*pageSize,visible.length);
    $("reorderResultCount").textContent=`${start}-${end} of ${visible.length} records`;
    if($("reorderPageInfo"))$("reorderPageInfo").textContent=`Page ${currentPage} of ${totalPages}`;
    if($("reorderPrevPage"))$("reorderPrevPage").disabled=currentPage<=1;
    if($("reorderNextPage"))$("reorderNextPage").disabled=currentPage>=totalPages;

    document.querySelectorAll(".save-reorder-level").forEach(button=>{
      button.onclick=()=>saveReorderLevel(button.dataset.id,button);
    });

    document.querySelectorAll(".reorder-level-input").forEach(input=>{
      input.onkeydown=event=>{
        if(event.key==="Enter"){
          event.preventDefault();
          const button=input.closest(".reorder-level-editor")
            ?.querySelector(".save-reorder-level");
          if(button)saveReorderLevel(input.dataset.id,button);
        }
      };
    });

    document.querySelectorAll(".reorder-select").forEach(box=>{
      box.onchange=()=>{
        if(box.checked)selected.add(box.dataset.id);
        else selected.delete(box.dataset.id);
        summary();
      };
    });

    document.querySelectorAll(".suggested-qty").forEach(input=>{
      input.oninput=()=>{
        const row=suggestions.find(x=>x.medicine_id===input.dataset.id);
        if(row)row.suggested_quantity=Math.max(0,n(input.value));
        summary();
      };
    });

    document.querySelectorAll(".supplier-choice").forEach(select=>{
      select.onchange=()=>{
        const row=suggestions.find(x=>x.medicine_id===select.dataset.id);
        if(row)row.supplier_id=select.value||null;
      };
    });
  }

  async function saveReorderLevel(medicineId,button){
    const input=document.querySelector(
      `.reorder-level-input[data-id="${medicineId}"]`
    );
    const level=Math.max(0,n(input?.value));

    button.disabled=true;
    button.textContent="Saving...";

    try{
      const {error}=await supabaseClient
        .from("medicines")
        .update({reorder_level:level})
        .eq("id",medicineId)
        .eq("pharmacy_id",window.MedvikaAuth.profile?.pharmacy_id);

      if(error)throw error;

      const medicine=medicines.find(x=>x.id===medicineId);
      if(medicine)medicine.reorder_level=level;
      if(level===0)selected.delete(medicineId);

      apply();
      toast(
        level===0
          ?"Automatic reorder disabled for this medicine."
          :`Reorder level updated to ${qty(level)}.`
      );
    }catch(error){
      toast(error.message||"Reorder level could not be updated.","danger");
      button.disabled=false;
      button.textContent="Save";
    }
  }

  function summary(){
    const reorder=suggestions.filter(x=>x.suggested_quantity>0);

    $("reorderMedicineCount").textContent=reorder.length;
    $("reorderOutCount").textContent=suggestions.filter(x=>x.status==="OUT").length;
    $("reorderLowCount").textContent=suggestions.filter(x=>x.status==="LOW").length;
    $("reorderSuggestedQty").textContent=qty(
      reorder.reduce((s,x)=>s+n(x.suggested_quantity),0)
    );
    $("reorderEstimatedValue").textContent=UI.money(
      reorder.reduce((s,x)=>s+n(x.suggested_quantity)*n(x.estimated_rate),0)
    );
    $("reorderSelectedCount").textContent=selected.size;
  }

  async function createPO(){
    const chosen=suggestions.filter(x=>selected.has(x.medicine_id));

    if(!chosen.length){
      toast("Select at least one medicine.","warning");
      return;
    }

    if(chosen.some(x=>!x.supplier_id)){
      toast("Select supplier for every selected medicine.","warning");
      return;
    }

    const supplierIds=[...new Set(chosen.map(x=>x.supplier_id))];

    if(supplierIds.length!==1){
      toast("Create one PO per supplier. Filter/select items for a single supplier.","warning");
      return;
    }

    const supplierId=supplierIds[0];

    const {data,error}=await supabaseClient.rpc(
      "create_purchase_order_v1",
      {
        p_supplier_id:supplierId,
        p_items:chosen.map(x=>({
          medicine_id:x.medicine_id,
          current_stock:n(x.current_stock),
          reorder_level:n(x.reorder_level),
          target_stock:n(x.target_stock),
          ordered_quantity:n(x.suggested_quantity),
          estimated_rate:n(x.estimated_rate)
        })),
        p_notes:"Generated from movement-based reorder suggestions"
      }
    );

    if(error){
      toast(error.message,"danger");
      return;
    }

    toast(`Purchase Order ${data.po_number} created.`);
    selected.clear();
    await load();
  }

  function renderPurchaseOrders(){
    poBody.innerHTML=purchaseOrders.length
      ? purchaseOrders.map(po=>`
        <tr>
          <td><b>${UI.safe(po.po_number)}</b></td>
          <td>${new Date(po.po_date).toLocaleString()}</td>
          <td>${UI.safe(supplierName(po.supplier_id))}</td>
          <td>${po.total_items}</td>
          <td>${UI.money(po.estimated_value)}</td>
          <td>${UI.safe(po.status)}</td>
          <td><button class="open-po" data-id="${po.id}">Open</button></td>
        </tr>
      `).join("")
      : '<tr><td colspan="7" class="empty">No purchase orders.</td></tr>';

    document.querySelectorAll(".open-po").forEach(b=>{
      b.onclick=()=>openPO(b.dataset.id);
    });
  }

  function openPO(id){
    selectedPO=purchaseOrders.find(x=>x.id===id)||null;
    if(!selectedPO)return;

    const items=purchaseOrderItems.filter(x=>x.purchase_order_id===id);

    $("purchaseOrderDetailPanel").hidden=false;
    $("poDetailTitle").textContent=selectedPO.po_number;
    $("poDetailSubTitle").textContent=
      `${supplierName(selectedPO.supplier_id)} • ${new Date(selectedPO.po_date).toLocaleString()}`;

    const poStatus=String(selectedPO.status||"").toUpperCase();
    const isDraft=poStatus==="DRAFT";
    const isOpen=["DRAFT","SENT","APPROVED","PARTIALLY_RECEIVED"].includes(poStatus);
    $("createPurchaseFromPOButton").hidden=!isOpen;
    $("savePurchaseOrderButton").hidden=!isDraft;
    $("cancelPurchaseOrderButton").hidden=!isDraft;

    detailBody.innerHTML=items.length
      ? items.map(i=>{
          const med=medicines.find(m=>m.id===i.medicine_id)||{};
          return `<tr data-item-id="${i.id}">
            <td><b>${UI.safe(med.brand_name||"Medicine")}</b></td>
            <td>${qty(i.current_stock)}</td>
            <td>${qty(i.reorder_level)}</td>
            <td>${isDraft
              ? `<input class="po-edit-qty" type="number" min="0.001" step="0.001" value="${qty(i.ordered_quantity)}">`
              : qty(i.ordered_quantity)}</td>
            <td>${qty(i.received_quantity)}</td>
            <td>${qty(Math.max(0,n(i.ordered_quantity)-n(i.received_quantity)))}</td>
            <td>${isDraft
              ? `<input class="po-edit-rate" type="number" min="0" step="0.01" value="${n(i.estimated_rate).toFixed(2)}">`
              : UI.money(i.estimated_rate)}</td>
            <td>${UI.money(i.estimated_value)}</td>
          </tr>`;
        }).join("")
      : '<tr><td colspan="8" class="empty">No PO items.</td></tr>';

    $("purchaseOrderDetailPanel").scrollIntoView({
      behavior:"smooth",
      block:"start"
    });
  }

  function createPurchaseFromPO(){
    if(!selectedPO)return;
    const poStatus=String(selectedPO.status||"").toUpperCase();
    if(!["DRAFT","SENT","APPROVED","PARTIALLY_RECEIVED"].includes(poStatus)){
      toast("This Purchase Order is no longer open.","warning");
      return;
    }

    const remainingItems=purchaseOrderItems
      .filter(x=>x.purchase_order_id===selectedPO.id)
      .map(x=>({
        purchase_order_item_id:x.id,
        medicine_id:x.medicine_id,
        remaining_quantity:Math.max(0,n(x.ordered_quantity)-n(x.received_quantity)),
        estimated_rate:n(x.estimated_rate)
      }))
      .filter(x=>x.remaining_quantity>0);

    if(!remainingItems.length){
      toast("No quantity remains to procure on this PO.","warning");
      return;
    }

    sessionStorage.setItem("medvikaPurchaseOrderContext",JSON.stringify({
      purchase_order_id:selectedPO.id,
      po_number:selectedPO.po_number,
      preferred_supplier_id:selectedPO.supplier_id,
      items:remainingItems
    }));
    window.MedvikaRouter.navigate("purchase");
  }

  async function saveDraftPO(){
    if(!selectedPO||String(selectedPO.status||"").toUpperCase()!=="DRAFT")return;

    const rows=[...detailBody.querySelectorAll("tr[data-item-id]")];
    const items=rows.map(row=>({
      item_id:row.dataset.itemId,
      ordered_quantity:n(row.querySelector(".po-edit-qty")?.value),
      estimated_rate:n(row.querySelector(".po-edit-rate")?.value)
    }));

    if(!items.length||items.some(item=>item.ordered_quantity<=0)){
      toast("Every PO item must have a quantity greater than zero.","warning");
      return;
    }

    const button=$("savePurchaseOrderButton");
    button.disabled=true;
    try{
      const {data,error}=await supabaseClient.rpc("update_draft_purchase_order_v1",{
        p_purchase_order_id:selectedPO.id,
        p_items:items,
        p_notes:selectedPO.notes||null
      });
      if(error)throw error;
      toast(`Purchase Order ${data.po_number} updated.`);
      await load();
      openPO(data.purchase_order_id);
    }catch(error){
      toast(error.message||"Purchase Order could not be updated.","danger");
    }finally{
      button.disabled=false;
    }
  }

  async function cancelDraftPO(){
    if(!selectedPO||String(selectedPO.status||"").toUpperCase()!=="DRAFT")return;
    if(!window.confirm(`Cancel Purchase Order ${selectedPO.po_number}? This keeps it in history and removes it from open reorder quantity.`))return;

    const button=$("cancelPurchaseOrderButton");
    button.disabled=true;
    try{
      const {data,error}=await supabaseClient.rpc("cancel_purchase_order_v1",{
        p_purchase_order_id:selectedPO.id
      });
      if(error)throw error;
      toast(`Purchase Order ${data.po_number} cancelled.`);
      $("purchaseOrderDetailPanel").hidden=true;
      selectedPO=null;
      await load();
    }catch(error){
      toast(error.message||"Purchase Order could not be cancelled.","danger");
    }finally{
      button.disabled=false;
    }
  }

  function printPO(){
    if(!selectedPO)return;

    const w=window.open("","_blank");
    if(!w){
      toast("Allow pop-ups to print.","warning");
      return;
    }

    w.document.write(`<!doctype html>
    <html>
    <head>
      <title>${UI.safe(selectedPO.po_number)}</title>
      <style>
        body{font-family:Arial;padding:20px}
        table{width:100%;border-collapse:collapse;margin-top:15px}
        th,td{border:1px solid #888;padding:7px;text-align:left}
      </style>
    </head>
    <body>
      <h1>Purchase Order</h1>
      <p><b>PO:</b> ${UI.safe(selectedPO.po_number)}</p>
      <p><b>Supplier:</b> ${UI.safe(supplierName(selectedPO.supplier_id))}</p>
      ${document.getElementById("purchaseOrderDetailTable").outerHTML}
      <script>window.onload=()=>window.print();<\/script>
    </body>
    </html>`);

    w.document.close();
  }

  $("selectAllReorderButton").onclick=()=>{
    pageRows().filter(x=>x.suggested_quantity>0).forEach(x=>selected.add(x.medicine_id));
    renderSuggestions();
    summary();
  };

  $("clearReorderSelectionButton").onclick=()=>{
    selected.clear();
    renderSuggestions();
    summary();
  };

  $("createPurchaseOrderButton").onclick=createPO;
  $("refreshPurchaseOrdersButton").onclick=load;
  if($("reorderPrevPage"))$("reorderPrevPage").onclick=()=>{if(currentPage>1){currentPage--;renderSuggestions();}};
  if($("reorderNextPage"))$("reorderNextPage").onclick=()=>{if(currentPage*pageSize<visible.length){currentPage++;renderSuggestions();}};
  if($("reorderPageSize"))$("reorderPageSize").onchange=()=>{pageSize=Math.max(10,n($("reorderPageSize").value)||25);currentPage=1;renderSuggestions();};

  [
    "reorderSearch",
    "reorderSupplierFilter",
    "movementLookbackDays",
    "targetCoverDays",
    "reorderStatusFilter"
  ].forEach(id=>{
    const control=$(id);
    if(!control)return;
    control.oninput=apply;
    control.onchange=apply;
  });

  $("closePurchaseOrderButton").onclick=()=>{
    $("purchaseOrderDetailPanel").hidden=true;
    selectedPO=null;
  };

  $("createPurchaseFromPOButton").onclick=createPurchaseFromPO;
  $("savePurchaseOrderButton").onclick=saveDraftPO;
  $("cancelPurchaseOrderButton").onclick=cancelDraftPO;
  $("printPurchaseOrderButton").onclick=printPO;

  try{
    await load();
  }catch(error){
    toast("Purchase Order module could not load: "+error.message,"danger");
  }
};