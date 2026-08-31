window.initManufacturersModule=async function(){
  const CFG={"init":"initManufacturersModule","prefix":"mfr","title":"Manufacturers","name":"Manufacturer","table":"manufacturers","order":"name","columns":[["Name","name"],["Short Name","short_name"],["Contact","contact_person"],["Mobile","mobile"],["GSTIN","gst_number"],["Status","is_active"]],"search":["name","short_name","contact_person","mobile","gst_number"],"fields":[["name","Manufacturer Name","text",true],["short_name","Short Name","text"],["contact_person","Contact Person","text"],["mobile","Mobile","text"],["email","Email","email"],["website","Website","text"],["gst_number","GST Number","text"],["address","Address","textarea"],["notes","Notes","textarea"],["is_active","Active","checkbox"]]};
  const UI=window.MedvikaUI,$=id=>document.getElementById(id),P=CFG.prefix;
  const toast=(m,t="success")=>UI.toast(m,t==="danger"?"error":t);
  const profile=window.MedvikaAuth?.profile||{},pid=profile.pharmacy_id,uid=profile.user_id||null;
  const safe=v=>UI.safe(v??"");
  let rows=[],editing=null;
  if(!pid){toast("Pharmacy profile not available.","danger");return;}
  const E=s=>$(P+s);
  const norm=v=>String(v||"").trim().replace(/\s+/g," ").toLowerCase();

  function display(v,key){if(key==="is_active")return v===false?"Inactive":"Active";if(v===null||v===undefined||v==="")return "—";return String(v)}
  async function load(){const {data,error}=await supabaseClient.from(CFG.table).select("*").eq("pharmacy_id",pid).order(CFG.order,{ascending:true}).limit(20000);if(error)throw error;rows=data||[];render()}
  function render(){const q=E("Search").value.trim().toLowerCase(),status=E("Status").value;const filtered=rows.filter(r=>{const txt=CFG.search.map(k=>r[k]).filter(v=>v!==null&&v!==undefined).join(" ").toLowerCase();const st=status==="active"?r.is_active!==false:status==="inactive"?r.is_active===false:true;return st&&(!q||txt.includes(q))});E("Count").textContent=`${filtered.length} record${filtered.length===1?"":"s"}`;E("Head").innerHTML="<tr>"+CFG.columns.map(c=>`<th>${safe(c[0])}</th>`).join("")+"<th>Actions</th></tr>";E("Body").innerHTML=filtered.length?filtered.map(r=>"<tr>"+CFG.columns.map(c=>`<td>${safe(display(r[c[1]],c[1]))}</td>`).join("")+`<td><button class="master-edit" data-id="${r.id}" type="button">Edit</button></td></tr>`).join(""):`<tr><td colspan="${CFG.columns.length+1}" class="empty">No records found.</td></tr>`;document.querySelectorAll(".master-edit").forEach(b=>b.onclick=()=>openEdit(b.dataset.id))}
  function inputHtml(f,row={}){const [key,label,type,required]=f,v=row[key];if(type==="checkbox")return `<label class="check-field"><input data-field="${key}" type="checkbox" ${v===false?"":"checked"}> ${safe(label)}</label>`;if(type==="textarea")return `<label>${safe(label)}${required?" *":""}<textarea data-field="${key}" rows="3" ${required?"required":""}>${safe(v??"")}</textarea></label>`;return `<label>${safe(label)}${required?" *":""}<input data-field="${key}" type="${type}" value="${safe(v??"")}" ${required?"required":""}></label>`}
  function openNew(){editing=null;E("FormTitle").textContent="New Manufacturer";E("Fields").innerHTML=CFG.fields.map(f=>inputHtml(f,{is_active:true})).join("");E("FormCard").hidden=false;E("FormCard").scrollIntoView({behavior:"smooth",block:"start"})}
  function openEdit(id){editing=rows.find(x=>x.id===id);if(!editing)return;E("FormTitle").textContent="Edit Manufacturer";E("Fields").innerHTML=CFG.fields.map(f=>inputHtml(f,editing)).join("");E("FormCard").hidden=false;E("FormCard").scrollIntoView({behavior:"smooth",block:"start"})}
  async function save(ev){
    ev.preventDefault();const payload={};CFG.fields.forEach(f=>{const [key,,type]=f,el=document.querySelector(`[data-field="${key}"]`);if(!el)return;payload[key]=type==="checkbox"?el.checked:(el.value===""?null:el.value.trim())});
    payload.name=String(payload.name||"").trim().replace(/\s+/g," ");if(!payload.name)throw new Error("Manufacturer Name is required.");
    if(payload.gst_number){payload.gst_number=String(payload.gst_number).trim().toUpperCase();if(!/^\d{2}[A-Z0-9]{13}$/.test(payload.gst_number))throw new Error("GST Number must be a valid 15-character GSTIN.")}
    const duplicate=rows.find(r=>r.id!==editing?.id&&norm(r.name)===norm(payload.name));if(duplicate)throw new Error(`Manufacturer '${payload.name}' already exists in this pharmacy.`);
    payload.pharmacy_id=pid;if(!editing&&uid)payload.created_by=uid;
    const btn=E("Save");btn.disabled=true;btn.textContent="Saving...";
    try{const q=editing?supabaseClient.from(CFG.table).update(payload).eq("id",editing.id).eq("pharmacy_id",pid):supabaseClient.from(CFG.table).insert(payload);const {error}=await q;if(error)throw error;toast(`Manufacturer ${editing?"updated":"created"}.`);E("FormCard").hidden=true;editing=null;await load()}catch(e){toast(e.message,"danger")}finally{btn.disabled=false;btn.textContent="Save"}
  }
  E("New").onclick=openNew;E("Close").onclick=()=>{E("FormCard").hidden=true;editing=null};E("Form").onsubmit=save;E("Refresh").onclick=async()=>{try{await load();toast("Manufacturers refreshed.")}catch(e){toast(e.message,"danger")}};E("Search").oninput=render;E("Status").onchange=render;
  try{await load()}catch(e){toast(`Manufacturers could not load: ${e.message}`,"danger")}
};