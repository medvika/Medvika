
// Medvika Unified Audit Importer
function installUnifiedImporter(ctx){
  const {sb,esc,msg,getAuditId,getCustomerId,reloadAfterImport,zoneProvider,teamProvider}=ctx;
  let sysRows=[],phyRows=[];
  const $=id=>document.getElementById(id);

  const ALIASES={
    item_name:["item name","medicine","medicine name","product","product name","description"],
    item_code:["item code","code","sku","sku code","product code"],
    barcode:["barcode","bar code","ean","gtin"],
    batch_no:["batch","batch no","batch no.","batch number"],
    expiry_date:["expiry","expiry date","exp date","exp"],
    system_qty:["system qty","current qty","stock qty","quantity","qty","closing qty","current stock"],
    physical_qty:["physical qty","count qty","physical quantity","counted qty","qty"],
    pack_uom:["pack/uom","uom","pack","unit","pack type"],
    pack_size:["pack size","conversion","units per pack","strip size"],
    qty_basis:["qty basis","quantity basis"],
    category:["category","section","group"],
    manufacturer:["manufacturer","company","mfr"],
    mrp:["mrp"],
    purchase_rate:["purchase rate ex-gst","purchase rate","rate ex-gst","cost rate","rate"],
    gst_percent:["gst %","gst","gst rate","tax %"],
    condition:["condition","damage","status"],
    full_pack_qty:["full pack qty","full packs","pack qty"],
    loose_qty:["loose qty","loose quantity","loose"]
  };
  const norm=s=>String(s??"").trim().toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ");
  const detect=(headers,key)=>{const a=ALIASES[key]||[];for(const x of a){const i=headers.map(norm).indexOf(norm(x));if(i>=0)return headers[i];}return "";};
  const num=v=>{if(v===null||v===undefined||v==="")return null;const n=Number(String(v).replace(/,/g,"").trim());return Number.isFinite(n)?n:null;};
  const iso=v=>{
    if(v===null||v===undefined||v==="")return "";
    if(typeof v==="number" && v>20000){const d=new Date(Math.round((v-25569)*86400*1000));return isNaN(d)? "":d.toISOString().slice(0,10);}
    const d=new Date(v);return isNaN(d)?"":d.toISOString().slice(0,10);
  };
  const qtyText=(v,packSize=null)=>{
    if(v===null||v===undefined||v==="")return null;
    const raw=String(v).trim();
    const n=num(raw);
    if(n!==null)return n;

    // Supports: 2Strip5Tab, 02 Strip 5 Tab, 2strip10tab, 2Pack5Loose.
    const m=raw.match(/^\s*(\d+(?:\.\d+)?)\s*(?:strip|strips|pack|packs|box|boxes|bottle|bottles)\s*(\d+(?:\.\d+)?)?\s*(?:tab|tabs|tablet|tablets|loose|unit|units|piece|pieces|pc|pcs)?\s*$/i);
    if(m){
      const packs=Number(m[1]||0), loose=Number(m[2]||0);
      const ps=Number(packSize||0);
      if(loose>0 && ps<=0) return null;
      return ps>0 ? packs + (loose/ps) : packs;
    }
    return null;
  };
  async function parse(file){
    if(!file) throw new Error("Choose CSV or Excel first.");
    const ext=(file.name.split(".").pop()||"").toLowerCase();
    if(ext==="csv"){
      return new Promise((res,rej)=>Papa.parse(file,{header:true,skipEmptyLines:true,dynamicTyping:false,complete:r=>res(r.data||[]),error:rej}));
    }
    if(["xlsx","xls"].includes(ext)){
      const buf=await file.arrayBuffer();const b=XLSX.read(buf,{type:"array"});return XLSX.utils.sheet_to_json(b.Sheets[b.SheetNames[0]],{defval:"",raw:true});
    }
    throw new Error("Only CSV, XLSX and XLS are supported.");
  }
  function field(label,key,headers,required=false){
    const d=detect(headers,key);
    return `<label>${esc(label)}${required?" *":""}<select data-map="${key}"><option value="">-- Not mapped --</option>${headers.map(h=>`<option value="${esc(h)}"${h===d?" selected":""}>${esc(h)}</option>`).join("")}</select></label>`;
  }
  function render(area,rows,type){
    const headers=Object.keys(rows[0]||{});
    if(!headers.length){area.innerHTML='<p class="muted">No rows detected.</p>';return;}
    const isSys=type==="system";
    const defs=isSys
      ? [["Item Name","item_name",1],["Item Code","item_code"],["Barcode","barcode"],["Batch No.","batch_no"],["Expiry Date","expiry_date"],["System Qty","system_qty",1],["Pack/UOM","pack_uom"],["Pack Size","pack_size"],["Qty Basis","qty_basis"],["Category","category"],["Manufacturer","manufacturer"],["MRP","mrp"],["Purchase Rate Ex-GST","purchase_rate"],["GST %","gst_percent"]]
      : [["Item Name","item_name",1],["Item Code","item_code"],["Barcode","barcode"],["Batch No.","batch_no"],["Expiry Date","expiry_date"],["Physical Qty","physical_qty",1],["Pack/UOM","pack_uom"],["Pack Size","pack_size"],["Full Pack Qty","full_pack_qty"],["Loose Qty","loose_qty"],["Qty Basis","qty_basis"],["Category","category"],["Condition","condition"]];
    area.innerHTML=`<div class="mapping-card"><h4>Column Mapping</h4><p class="muted">${rows.length.toLocaleString("en-IN")} rows detected.</p><div class="mapping-grid">${defs.map(d=>field(d[0],d[1],headers,!!d[2])).join("")}</div><div class="table-wrap"><table><thead><tr>${headers.slice(0,8).map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0,5).map(r=>`<tr>${headers.slice(0,8).map(h=>`<td>${esc(r[h])}</td>`).join("")}</tr>`).join("")}</tbody></table></div><button class="btn primary do-import">${isSys?"Import Current Stock":"Import Physical Counts"}</button><p class="import-progress muted"></p></div>`;
    area.querySelector(".do-import").onclick=()=>isSys?doSystem(area,rows):doPhysical(area,rows);
  }
  function mapOf(area){const o={};area.querySelectorAll("[data-map]").forEach(x=>o[x.dataset.map]=x.value);return o;}
  async function start(type,file,mode,total){
    const {data,error}=await sb.rpc("medvika_start_import_job",{p_audit_id:getAuditId(),p_import_type:type,p_file_name:file?.name||"",p_file_type:(file?.name?.split(".").pop()||"").toLowerCase(),p_mode:mode,p_total_rows:total});
    if(error)throw error;return data;
  }
  async function finish(id,i,m,u,f,e=null){
    const {error}=await sb.rpc("medvika_finish_import_job",{p_job_id:id,p_inserted:i,p_matched:m,p_unmatched:u,p_failed:f,p_error:e});
    if(error)throw error;
  }
  async function doSystem(area,rows){
    const map=mapOf(area),file=$("unifiedSystemFile").files[0],mode=$("unifiedSystemMode").value,pr=area.querySelector(".import-progress");
    if(!map.item_name||!map.system_qty){pr.textContent="Map Item Name and System Qty.";return;}
    let job=null,inserted=0,failed=0;
    try{
      pr.textContent="Preparing import…";job=await start("system_stock",file,mode,rows.length);
      const recs=[];
      rows.forEach((r,idx)=>{
        const name=String(r[map.item_name]??"").trim();
        const ps=map.pack_size?num(r[map.pack_size]):null;
        const q=qtyText(r[map.system_qty],ps);
        if(!name||q===null){failed++;return;}
        recs.push({source_row_no:idx+2,item_name:name,item_code:map.item_code?String(r[map.item_code]??"").trim():"",barcode:map.barcode?String(r[map.barcode]??"").trim():"",batch_no:map.batch_no?String(r[map.batch_no]??"").trim():"",expiry_date:map.expiry_date?iso(r[map.expiry_date]):"",system_qty:q,pack_uom:map.pack_uom?String(r[map.pack_uom]??"").trim():"",pack_size:ps,qty_basis:"decimal",category:map.category?String(r[map.category]??"").trim():"",manufacturer:map.manufacturer?String(r[map.manufacturer]??"").trim():"",mrp:map.mrp?num(r[map.mrp]):null,purchase_rate:map.purchase_rate?num(r[map.purchase_rate]):null,gst_percent:map.gst_percent?num(r[map.gst_percent]):null});
      });
      for(let i=0;i<recs.length;i+=300){
        pr.textContent=`Uploading ${Math.min(i+300,recs.length).toLocaleString("en-IN")} / ${recs.length.toLocaleString("en-IN")}…`;
        const {data,error}=await sb.rpc("medvika_import_system_stock_batch",{p_audit_id:getAuditId(),p_job_id:job,p_rows:recs.slice(i,i+300)});
        if(error)throw error;inserted+=Number(data||0);
      }
      await finish(job,inserted,0,0,failed,null);pr.textContent=`Completed: ${inserted.toLocaleString("en-IN")} Current Stock rows imported${failed?`, ${failed} skipped`:""}.`;msg("Current Stock import completed.");await history();if(reloadAfterImport)await reloadAfterImport();
    }catch(e){if(job)try{await finish(job,inserted,0,0,rows.length-inserted,e.message)}catch{} pr.textContent=e.message;msg(e.message);}
  }
  async function doPhysical(area,rows){
    const map=mapOf(area),file=$("unifiedPhysicalFile").files[0],pr=area.querySelector(".import-progress");
    if(!map.item_name||!map.physical_qty){pr.textContent="Map Item Name and Physical Qty.";return;}
    const zone=$("unifiedPhysicalZone")?.value||null,team=$("unifiedPhysicalTeam")?.value||null;
    let job=null,inserted=0,matched=0,unlisted=0,failed=0;
    try{
      job=await start("physical_count",file,$("unifiedPhysicalMode").value,rows.length);
      const recs=[];
      rows.forEach(r=>{
        const name=String(r[map.item_name]??"").trim();
        const ps=map.pack_size?num(r[map.pack_size]):null;
        const q=qtyText(r[map.physical_qty],ps);
        if(!name||q===null){failed++;return;}
        recs.push({item_name:name,item_code:map.item_code?String(r[map.item_code]??"").trim():"",barcode:map.barcode?String(r[map.barcode]??"").trim():"",batch_no:map.batch_no?String(r[map.batch_no]??"").trim():"",expiry_date:map.expiry_date?iso(r[map.expiry_date]):"",physical_qty:q,pack_uom:map.pack_uom?String(r[map.pack_uom]??"").trim():"",pack_size:ps,full_pack_qty:map.full_pack_qty?num(r[map.full_pack_qty]):null,loose_qty:map.loose_qty?num(r[map.loose_qty]):null,qty_basis:"decimal",category:map.category?String(r[map.category]??"").trim():"",condition:map.condition?String(r[map.condition]??"").trim().toLowerCase():"saleable"});
      });
      for(let i=0;i<recs.length;i+=250){
        pr.textContent=`Matching ${Math.min(i+250,recs.length).toLocaleString("en-IN")} / ${recs.length.toLocaleString("en-IN")}…`;
        const {data,error}=await sb.rpc("medvika_import_physical_count_batch",{p_audit_id:getAuditId(),p_job_id:job,p_zone_id:zone||null,p_team_id:team||null,p_rows:recs.slice(i,i+250)});
        if(error)throw error;const r=data?.[0]||{};inserted+=Number(r.inserted||0);matched+=Number(r.matched||0);unlisted+=Number(r.unlisted||0);
      }
      await finish(job,inserted,matched,unlisted,failed,null);pr.textContent=`Completed: ${inserted} counts • ${matched} matched • ${unlisted} unlisted excess${failed?` • ${failed} skipped`:""}.`;msg("Physical Count import completed.");await history();if(reloadAfterImport)await reloadAfterImport();
    }catch(e){if(job)try{await finish(job,inserted,matched,unlisted,rows.length-inserted,e.message)}catch{} pr.textContent=e.message;msg(e.message);}
  }
  async function history(){
    if(!$("unifiedImportHistory")||!getAuditId())return;
    const {data,error}=await sb.rpc("medvika_import_history",{p_audit_id:getAuditId()});
    if(error){$("unifiedImportHistory").innerHTML=`<p class="muted">${esc(error.message)}</p>`;return;}
    const rs=data||[];$("unifiedImportHistory").innerHTML=rs.length?`<div class="table-wrap"><table><thead><tr><th>Time</th><th>Type</th><th>File</th><th>Rows</th><th>Inserted</th><th>Matched</th><th>Unlisted</th><th>Status</th></tr></thead><tbody>${rs.map(r=>`<tr><td>${esc(new Date(r.created_at).toLocaleString("en-IN"))}</td><td>${esc(r.import_type)}</td><td>${esc(r.file_name||"")}</td><td>${r.total_rows}</td><td>${r.inserted_rows}</td><td>${r.matched_rows}</td><td>${r.unmatched_rows}</td><td>${esc(r.status)}</td></tr>`).join("")}</tbody></table></div>`:'<p class="muted">No imports yet.</p>';
  }

  $("previewUnifiedSystem")?.addEventListener("click",async()=>{try{sysRows=await parse($("unifiedSystemFile").files[0]);render($("unifiedSystemArea"),sysRows,"system");}catch(e){msg(e.message);}});
  $("previewUnifiedPhysical")?.addEventListener("click",async()=>{try{phyRows=await parse($("unifiedPhysicalFile").files[0]);render($("unifiedPhysicalArea"),phyRows,"physical");}catch(e){msg(e.message);}});
  $("reloadUnifiedImports")?.addEventListener("click",history);

  return {history};
}
