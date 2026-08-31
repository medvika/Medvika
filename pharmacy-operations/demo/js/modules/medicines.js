window.initMedicinesModule=async function(){
  const CFG={"init":"initMedicinesModule","prefix":"med","title":"Medicines","name":"Medicine","table":"medicines","order":"brand_name","columns":[["Brand","brand_name"],["Generic","generic_name"],["Strength","strength"],["Pack","pack_size"],["GST %","gst_percent"],["MRP","default_mrp"],["Selling","default_selling_rate"],["Status","is_active"]],"search":["brand_name","generic_name","composition","barcode","hsn_code","category"],"fields":[["brand_name","Brand Name","text",true],["generic_name","Generic Name","text"],["composition","Composition","textarea"],["strength","Strength","text"],["dosage_form","Dosage Form","text"],["pack_size","Pack Size","text"],["primary_pack_unit","Primary Pack Unit","text",true],["loose_unit","Loose Unit","text"],["units_per_pack","Units per Pack","number",true],["package_unit","Package Unit","text"],["category","Category","text"],["schedule","Schedule","text"],["regulatory_schedule","Regulatory Schedule","text"],["storage_condition","Storage Condition","text"],["hsn_code","HSN Code","text"],["barcode","Barcode","text"],["gst_percent","GST Rate (%)","gst_select",true],["default_mrp","Default MRP","number",true],["default_purchase_rate","Default Purchase Rate","number",true],["default_selling_rate","Default Selling Rate","number",true],["minimum_stock","Minimum Stock","number",true],["reorder_level","Reorder Level","number",true],["reorder_quantity","Reorder Quantity","number",true],["manufacturer_id","Manufacturer","manufacturer"],["prescription_required","Prescription Required","checkbox"],["requires_register","Requires Register","checkbox"],["register_type","Register Type","text"],["prescription_retention_required","Prescription Retention Required","checkbox"],["prescription_retention_months","Retention Months","number"],["loose_sale_allowed","Loose Sale Allowed","checkbox"],["is_active","Active","checkbox"]]};
  const UI=window.MedvikaUI,$=id=>document.getElementById(id),P=CFG.prefix;
  const toast=(m,t="success")=>UI.toast(m,t==="danger"?"error":t);
  const profile=window.MedvikaAuth?.profile||{},pid=profile.pharmacy_id,uid=profile.user_id||null;
  const safe=v=>UI.safe(v??"");
  let rows=[],editing=null,manufacturers=[],catalogueRows=[];
  let currentPage=1;
  const pageSize=50;
  let totalRecords=0;
  if(!pid){toast("Pharmacy profile not available.","danger");return;}
  const E=s=>$(P+s);
  const totalPages=()=>Math.max(1,Math.ceil(totalRecords/pageSize));

  function display(v,key){if(key==="is_active")return v===false?"Inactive":"Active";if(v===null||v===undefined||v==="")return "—";if(["opening_balance","credit_limit","default_mrp","default_selling_rate"].includes(key))return UI.money(Number(v||0));return String(v);}

  async function load(){
    const from=(currentPage-1)*pageSize,to=from+pageSize-1;
    const {data,error,count}=await supabaseClient.from(CFG.table).select("*",{count:"exact"}).eq("pharmacy_id",pid).order(CFG.order,{ascending:true}).range(from,to);
    if(error)throw error;
    rows=data||[];totalRecords=count||0;
    if(currentPage>totalPages()){currentPage=totalPages();return load();}
    const r=await supabaseClient.from("manufacturers").select("id,name").eq("pharmacy_id",pid).eq("is_active",true).order("name").limit(5000);
    if(!r.error)manufacturers=r.data||[];
    render();
  }

  function updatePagination(){
    const pages=totalPages(),prev=E("PrevPage"),next=E("NextPage"),info=E("PageInfo");
    if(info)info.textContent=`Page ${currentPage} of ${pages}`;
    if(prev)prev.disabled=currentPage<=1;
    if(next)next.disabled=currentPage>=pages||totalRecords===0;
  }

  function render(){
    const q=E("Search").value.trim().toLowerCase(),status=E("Status").value;
    const filtered=rows.filter(r=>{const txt=CFG.search.map(k=>r[k]).filter(v=>v!==null&&v!==undefined).join(" ").toLowerCase();const st=status==="active"?r.is_active!==false:status==="inactive"?r.is_active===false:true;return st&&(!q||txt.includes(q));});
    const start=totalRecords?((currentPage-1)*pageSize)+1:0,end=Math.min(currentPage*pageSize,totalRecords);
    E("Count").textContent=`${start}-${end} of ${totalRecords} records`;
    updatePagination();
    E("Head").innerHTML="<tr>"+CFG.columns.map(c=>`<th>${safe(c[0])}</th>`).join("")+"<th>Actions</th></tr>";
    E("Body").innerHTML=filtered.length?filtered.map(r=>"<tr>"+CFG.columns.map(c=>`<td>${safe(display(r[c[1]],c[1]))}</td>`).join("")+`<td><button class="master-edit" data-id="${r.id}" type="button">Edit</button></td></tr>`).join(""):`<tr><td colspan="${CFG.columns.length+1}" class="empty">No records found on this page.</td></tr>`;
    document.querySelectorAll(".master-edit").forEach(b=>b.onclick=()=>openEdit(b.dataset.id));
  }

  function inputHtml(f,row={}){const [key,label,type,required]=f,v=row[key];if(type==="checkbox")return `<label class="check-field"><input data-field="${key}" type="checkbox" ${v===false?"":"checked"}> ${safe(label)}</label>`;if(type==="textarea")return `<label>${safe(label)}${required?" *":""}<textarea data-field="${key}" rows="3" ${required?"required":""}>${safe(v??"")}</textarea></label>`;if(type==="manufacturer")return `<label>${safe(label)}<select data-field="${key}"><option value="">None</option>${manufacturers.map(m=>`<option value="${m.id}" ${String(v||"")===m.id?"selected":""}>${safe(m.name)}</option>`).join("")}</select></label>`;if(type==="gst_select"){const current=String(v??0);return `<label>${safe(label)}${required?" *":""}<select data-field="${key}" ${required?"required":""}>${[0,5,12,18,28].map(rate=>`<option value="${rate}" ${current===String(rate)?"selected":""}>${rate}%</option>`).join("")}</select></label>`;}const step=type==="number"?'step="0.01"':"";return `<label>${safe(label)}${required?" *":""}<input data-field="${key}" type="${type}" ${step} value="${safe(v??"")}" ${required?"required":""}></label>`;}
  function defaults(){return{is_active:true,gst_percent:0,default_mrp:0,default_purchase_rate:0,default_selling_rate:0,minimum_stock:0,reorder_level:0,reorder_quantity:0,units_per_pack:1,primary_pack_unit:"strip",loose_sale_allowed:false,prescription_required:false,requires_register:false,prescription_retention_required:false};}
  function openNew(){editing=null;E("FormTitle").textContent="New Medicine";E("Fields").innerHTML=CFG.fields.map(f=>inputHtml(f,defaults())).join("");E("FormCard").hidden=false;E("FormCard").scrollIntoView({behavior:"smooth",block:"start"});}
  function openEdit(id){editing=rows.find(x=>x.id===id);if(!editing)return;E("FormTitle").textContent="Edit Medicine";E("Fields").innerHTML=CFG.fields.map(f=>inputHtml(f,editing)).join("");E("FormCard").hidden=false;E("FormCard").scrollIntoView({behavior:"smooth",block:"start"});}

  async function submitCandidate(localMedicineId){try{const {error}=await supabaseClient.rpc("submit_local_medicine_to_global_catalogue",{p_local_medicine_id:localMedicineId});if(error)throw error;}catch(e){console.warn("Global catalogue candidate submission failed:",e);toast("Medicine saved locally. Catalogue suggestion could not be submitted.","warning");}}

  async function save(ev){
    ev.preventDefault();const payload={};CFG.fields.forEach(f=>{const [key,,type]=f,el=document.querySelector(`[data-field="${key}"]`);if(!el)return;if(type==="checkbox")payload[key]=el.checked;else if(type==="number"||type==="gst_select")payload[key]=el.value===""?null:Number(el.value);else payload[key]=el.value===""?null:el.value.trim();});
    if(payload.hsn_code&&!/^\d{4,8}$/.test(String(payload.hsn_code)))throw new Error("HSN Code should contain 4 to 8 digits.");
    if(![0,5,12,18,28].includes(Number(payload.gst_percent||0)))throw new Error("Select a valid GST rate.");
    payload.pharmacy_id=pid;if(!editing&&uid)payload.created_by=uid;
    const btn=E("Save");btn.disabled=true;btn.textContent="Saving...";
    try{if(editing){const {error}=await supabaseClient.from(CFG.table).update(payload).eq("id",editing.id).eq("pharmacy_id",pid);if(error)throw error;toast("Medicine updated.");}else{const {data,error}=await supabaseClient.from(CFG.table).insert(payload).select("id").single();if(error)throw error;toast("Medicine created.");if(data?.id)await submitCandidate(data.id);}E("FormCard").hidden=true;editing=null;await load();}catch(e){toast(e.message,"danger");}finally{btn.disabled=false;btn.textContent="Save";}
  }

  function openCatalogue(){E("CatalogueCard").hidden=false;E("CatalogueSearch").focus();E("CatalogueCard").scrollIntoView({behavior:"smooth",block:"start"});}
  function closeCatalogue(){E("CatalogueCard").hidden=true;catalogueRows=[];E("CatalogueBody").innerHTML='<tr><td colspan="6" class="empty">Search the Medvika catalogue.</td></tr>';E("CatalogueCount").textContent="Enter at least 2 characters";}
  function renderCatalogue(){E("CatalogueCount").textContent=`${catalogueRows.length} result${catalogueRows.length===1?"":"s"}`;E("CatalogueBody").innerHTML=catalogueRows.length?catalogueRows.map(r=>`<tr><td>${safe(r.brand_name||"—")}</td><td>${safe(r.manufacturer_name||"—")}</td><td>${safe(r.composition||"—")}</td><td>${safe(r.pack_size||"—")}</td><td>${safe(r.category||"—")}</td><td><button class="catalogue-add primary" data-id="${safe(r.id)}" type="button">Add to Pharmacy</button></td></tr>`).join(""):'<tr><td colspan="6" class="empty">No catalogue medicines found.</td></tr>';document.querySelectorAll(".catalogue-add").forEach(b=>b.onclick=()=>activateCatalogueMedicine(b.dataset.id,b));}
  async function searchCatalogue(){const term=E("CatalogueSearch").value.trim();if(term.length<2){catalogueRows=[];E("CatalogueCount").textContent="Enter at least 2 characters";E("CatalogueBody").innerHTML='<tr><td colspan="6" class="empty">Enter at least 2 characters.</td></tr>';return;}const btn=E("CatalogueSearchBtn");btn.disabled=true;btn.textContent="Searching...";E("CatalogueBody").innerHTML='<tr><td colspan="6" class="empty">Searching...</td></tr>';try{const {data,error}=await supabaseClient.rpc("search_global_medicine_catalogue",{p_search_text:term,p_limit:50});if(error)throw error;catalogueRows=data||[];renderCatalogue();}catch(e){catalogueRows=[];E("CatalogueBody").innerHTML='<tr><td colspan="6" class="empty">Catalogue search failed.</td></tr>';E("CatalogueCount").textContent="Search failed";toast(e.message,"danger");}finally{btn.disabled=false;btn.textContent="Search";}}
  async function activateCatalogueMedicine(globalId,btn){if(!globalId)return;const old=btn.textContent;btn.disabled=true;btn.textContent="Adding...";try{const {error}=await supabaseClient.rpc("activate_global_medicine_for_my_pharmacy",{p_global_medicine_id:globalId});if(error)throw error;toast("Medicine added to this pharmacy.");await load();btn.textContent="Added";btn.disabled=true;}catch(e){toast(e.message,"danger");btn.disabled=false;btn.textContent=old;}}

  E("New").onclick=openNew;
  E("Close").onclick=()=>{E("FormCard").hidden=true;editing=null;};
  E("Form").onsubmit=save;
  E("Refresh").onclick=async()=>{try{await load();toast("Medicines refreshed.");}catch(e){toast(e.message,"danger");}};
  E("Search").oninput=render;E("Status").onchange=render;
  E("PrevPage").onclick=async()=>{if(currentPage<=1)return;currentPage--;try{await load();}catch(e){currentPage++;toast(e.message,"danger");}};
  E("NextPage").onclick=async()=>{if(currentPage>=totalPages())return;currentPage++;try{await load();}catch(e){currentPage--;toast(e.message,"danger");}};
  E("Catalogue").onclick=openCatalogue;E("CatalogueClose").onclick=closeCatalogue;E("CatalogueSearchBtn").onclick=searchCatalogue;E("CatalogueSearch").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();searchCatalogue();}};

  try{await load();}catch(e){toast(`Medicines could not load: ${e.message}`,"danger");}
};
