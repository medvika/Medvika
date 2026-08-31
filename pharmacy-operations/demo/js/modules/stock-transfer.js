window.initStockTransferModule=async function(){
 const UI=window.MedvikaUI,$=id=>document.getElementById(id),pid=window.MedvikaAuth?.profile?.pharmacy_id;
 const body=document.querySelector("#stStockTable tbody"),transferBody=document.querySelector("#stTransferTable tbody");
 const n=v=>Number.isFinite(Number(v))?Number(v):0,qty=v=>n(v).toFixed(3).replace(/\.?0+$/,"");
 let stores=[],stock=[],transfers=[],selected=new Set();
 const toast=(m,t="success")=>UI.toast(m,t==="danger"?"error":t);
 const storeName=id=>stores.find(x=>(x.id||x.pharmacy_id)===id)?.name||"Branch";

 async function load(){
  const [sr,ir,tr]=await Promise.all([
   supabaseClient.rpc("list_my_stores"),
   supabaseClient.from("stock_movement_traceability_v1").select("*").eq("pharmacy_id",pid).gt("quantity_available",0).eq("is_blocked",false).order("brand_name").limit(10000),
   supabaseClient.from("stock_transfers").select("*").order("transfer_date",{ascending:false}).limit(1000)
  ]);
  if(sr.error)throw sr.error;if(ir.error)throw ir.error;if(tr.error)throw tr.error;
  stores=sr.data||[];stock=ir.data||[];transfers=tr.data||[];
  fillStores();renderStock();renderTransfers();
 }
 function fillStores(){
  const source=stores.find(x=>(x.id||x.pharmacy_id)===pid);
  $("stSource").value=source?.name||window.MedvikaAuth.profile?.pharmacy?.name||"Active branch";
  const dest=stores.filter(x=>(x.id||x.pharmacy_id)!==pid&&(x.is_active??true));
  $("stDestination").innerHTML='<option value="">Select destination</option>'+dest.map(x=>`<option value="${x.id||x.pharmacy_id}">${UI.safe(x.name||"Branch")}</option>`).join("");
  $("stNoBranch").hidden=dest.length>0;$("stCreate").disabled=dest.length===0;
 }
 function rows(){const q=$("stSearch").value.trim().toLowerCase();return stock.filter(x=>!q||`${x.brand_name} ${x.generic_name||""} ${x.batch_number}`.toLowerCase().includes(q));}
 function renderStock(){
  const data=rows();
  body.innerHTML=data.length?data.map(x=>`<tr><td><input class="st-check" type="checkbox" data-id="${x.medicine_batch_id}" ${selected.has(x.medicine_batch_id)?"checked":""}></td><td><b>${UI.safe(x.brand_name)}</b><small>${UI.safe(x.generic_name||"")}</small></td><td>${UI.safe(x.batch_number)}</td><td>${new Date(x.expiry_date+"T00:00:00").toLocaleDateString("en-IN")}</td><td>${qty(x.quantity_available)}</td><td><input class="st-qty" data-id="${x.medicine_batch_id}" type="number" min=".001" max="${n(x.quantity_available)}" step=".001" value="1"></td></tr>`).join(""):'<tr><td colspan="6" class="empty">No transferable batch stock found.</td></tr>';
  body.querySelectorAll(".st-check").forEach(x=>x.onchange=()=>x.checked?selected.add(x.dataset.id):selected.delete(x.dataset.id));
 }
 function renderTransfers(){
  const status=$("stStatus").value,data=transfers.filter(x=>status==="ALL"||x.status===status);
  transferBody.innerHTML=data.length?data.map(x=>{
   const canDispatch=x.status==="DRAFT"&&x.source_pharmacy_id===pid,canReceive=x.status==="IN_TRANSIT"&&x.destination_pharmacy_id===pid,canCancel=canDispatch;
   return `<tr><td><b>${UI.safe(x.transfer_number)}</b></td><td>${new Date(x.transfer_date).toLocaleString("en-IN")}</td><td>${UI.safe(storeName(x.source_pharmacy_id))}</td><td>${UI.safe(storeName(x.destination_pharmacy_id))}</td><td><span class="st-status ${x.status.toLowerCase()}">${UI.safe(x.status)}</span></td><td>${UI.safe(x.dispatch_reference||"—")}</td><td class="st-actions">${canDispatch?`<button data-dispatch="${x.id}">Dispatch</button>`:""}${canReceive?`<button class="green-button" data-receive="${x.id}">Receive</button>`:""}${canCancel?`<button class="danger-button" data-cancel="${x.id}">Cancel</button>`:""}</td></tr>`;
  }).join(""):'<tr><td colspan="7" class="empty">No stock transfers found.</td></tr>';
  transferBody.querySelectorAll("[data-dispatch]").forEach(b=>b.onclick=()=>dispatch(b.dataset.dispatch));
  transferBody.querySelectorAll("[data-receive]").forEach(b=>b.onclick=()=>receive(b.dataset.receive));
  transferBody.querySelectorAll("[data-cancel]").forEach(b=>b.onclick=()=>cancel(b.dataset.cancel));
 }
 async function create(){
  const destination=$("stDestination").value;if(!destination)return toast("Select a destination branch.","warning");
  const items=[...selected].map(id=>{const input=body.querySelector(`.st-qty[data-id="${id}"]`);return{source_batch_id:id,quantity:n(input?.value)}}).filter(x=>x.quantity>0);
  if(!items.length)return toast("Select at least one batch and quantity.","warning");
  const {data,error}=await supabaseClient.rpc("create_stock_transfer_v1",{p_destination_pharmacy_id:destination,p_items:items,p_notes:$("stNotes").value.trim()||null});
  if(error)return toast(error.message,"danger");toast(`Draft transfer ${data.transfer_number} created.`);selected.clear();await load();
 }
 async function dispatch(id){
  const ref=prompt("Dispatch / courier reference (optional):","")??null;if(ref===null)return;
  if(!confirm("Dispatch this transfer? Source batch stock will be reduced."))return;
  const {data,error}=await supabaseClient.rpc("dispatch_stock_transfer_v1",{p_stock_transfer_id:id,p_dispatch_reference:ref||null});
  if(error)return toast(error.message,"danger");toast(`${data.transfer_number} dispatched.`);await load();
 }
 async function receive(id){
  if(!confirm("Confirm physical receipt? Destination batch stock will be increased."))return;
  const {data,error}=await supabaseClient.rpc("receive_stock_transfer_v1",{p_stock_transfer_id:id});
  if(error)return toast(error.message,"danger");toast(`${data.transfer_number} received and completed.`);await load();
 }
 async function cancel(id){
  const reason=prompt("Cancellation reason:","");if(!reason?.trim())return;
  const {data,error}=await supabaseClient.rpc("cancel_stock_transfer_v1",{p_stock_transfer_id:id,p_reason:reason.trim()});
  if(error)return toast(error.message,"danger");toast(`${data.transfer_number} cancelled.`);await load();
 }
 $("stCreate").onclick=create;$("stRefresh").onclick=()=>load().catch(e=>toast(e.message,"danger"));
 $("stSearch").oninput=renderStock;$("stStatus").onchange=renderTransfers;
 try{await load()}catch(e){toast("Stock Transfer could not load: "+e.message,"danger")}
};