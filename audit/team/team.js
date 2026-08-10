
const SUPABASE_URL="https://etevzodzxhsdwidtrmwv.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_iKWBOAxrWTZfU6Qb5PYd5Q_0y80GEOw";
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:false}});

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

let sessionToken=sessionStorage.getItem("medvika_team_token")||"";
let loginData=null;
let selectedStock=null;
let searchTimer=null;

function toast(message,type="ok"){
  const el=$("toast");el.textContent=message;el.className="toast show"+(type==="error"?" error":"");
  clearTimeout(window.__t);window.__t=setTimeout(()=>el.className="toast",2600);
}

function toNumber(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(String(v).replace(/,/g,"").trim());
  return Number.isFinite(n)?n:null;
}

function parsePharmacyQuantity(value,packSize=null){
  if(value===null||value===undefined||String(value).trim()==="") return null;
  const ps=Number(packSize||0);
  const raw=String(value).trim().toLowerCase().replace(/\+/g," ").replace(/,/g," ").replace(/\s+/g," ").trim();
  const direct=toNumber(value);
  if(direct!==null){
    if(ps>0 && Math.abs(direct*ps-Math.round(direct*ps))>1e-9) return null;
    return ps>0 ? Math.round(direct*ps)/ps : direct;
  }
  let packQty=0,looseQty=0,found=false,m;
  const tokenRe=/(\d+(?:\.\d+)?)\s*(strips?|packs?|boxes?|bottles?|vials?|amp(?:oules?)?|pieces?|pcs?|tabs?|tablets?|caps?|capsules?|units?)/gi;
  while((m=tokenRe.exec(raw))!==null){
    found=true;
    const qty=Number(m[1]),unit=m[2].toLowerCase();
    if(/^(strip|strips|pack|packs|box|boxes|bottle|bottles|vial|vials|amp|ampoule|ampoules)$/.test(unit)) packQty+=qty;
    else looseQty+=qty;
  }
  if(!found){
    const shortRe=/(\d+(?:\.\d+)?)\s*([sptcu])/gi;
    while((m=shortRe.exec(raw))!==null){
      found=true; const qty=Number(m[1]),unit=m[2].toLowerCase();
      if(unit==="s"||unit==="p") packQty+=qty; else looseQty+=qty;
    }
  }
  if(!found || !Number.isInteger(looseQty)) return null;
  if(looseQty>0){
    if(!(ps>0) || !Number.isInteger(ps)) return null;
    const units=packQty*ps+looseQty;
    if(Math.abs(units-Math.round(units))>1e-9) return null;
    return Math.round(units)/ps;
  }
  if(ps>0 && Math.abs(packQty*ps-Math.round(packQty*ps))>1e-9) return null;
  return packQty;
}

function formatPharmacyQuantity(qty,packSize,packUom="Pack"){
  const q=toNumber(qty),ps=toNumber(packSize);
  if(q===null) return "—";
  if(!(ps>0) || !Number.isInteger(ps)) return String(Number(q.toFixed(3)));
  const units=Math.round(q*ps),packs=Math.floor(units/ps),loose=units%ps;
  const u=String(packUom||"Pack").trim()||"Pack";
  return loose===0 ? `${packs} ${u}${packs===1?"":"s"}` : `${packs} ${u}${packs===1?"":"s"} ${loose} Unit${loose===1?"":"s"}`;
}
function monthToDate(v){
  if(!v) return null;
  const [y,m]=v.split("-").map(Number);
  return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
}

function dateToMonth(v){
  if(!v) return "";
  return String(v).slice(0,7);
}

function showPortal(){
  const login=$("loginView"), portal=$("portal");
  login.hidden=true;
  login.style.display="none";
  portal.hidden=false;
  portal.style.display="block";
  window.scrollTo({top:0,left:0,behavior:"auto"});
}
function showLogin(){
  const login=$("loginView"), portal=$("portal");
  portal.hidden=true;
  portal.style.display="none";
  login.hidden=false;
  login.style.display="grid";
  window.scrollTo({top:0,left:0,behavior:"auto"});
}

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const btn=$("loginButton"),msg=$("loginMessage");
  btn.disabled=true;btn.textContent="Signing in...";msg.textContent="";
  try{
    const {data,error}=await sb.rpc("medvika_team_login",{
      p_login_code:$("teamCode").value.trim(),
      p_pin:$("teamPin").value.trim()
    });
    if(error) throw error;
    const row=data?.[0];
    if(!row) throw new Error("Unable to open team portal.");
    sessionToken=row.session_token;
    loginData=row;
    sessionStorage.setItem("medvika_team_token",sessionToken);
    sessionStorage.setItem("medvika_team_meta",JSON.stringify(row));
    applyMeta(row);
    showPortal();
    await loadRecent();
  }catch(err){
    msg.textContent=err.message||"Unable to sign in.";
  }finally{
    btn.disabled=false;btn.textContent="Open Counting Portal";
  }
});

function applyMeta(r){
  $("teamHeading").textContent=`${r.team_code||"Team"} — Blind Count`;
  $("teamName").textContent=r.team_name||r.team_code||"Counting Team";
  $("zoneName").textContent=r.zone_name ? `${r.zone_code||""} — ${r.zone_name}` : "Assigned by supervisor";
  $("projectMeta").textContent=`${r.project_code||""} • ${r.location||""} • ${r.audit_date||""}`;
}

$("logoutButton").addEventListener("click",async()=>{
  try{if(sessionToken) await sb.rpc("medvika_team_logout",{p_token:sessionToken});}catch(e){}
  sessionStorage.removeItem("medvika_team_token");
  sessionStorage.removeItem("medvika_team_meta");
  sessionToken="";loginData=null;showLogin();
});

function clearSelected(){
  selectedStock=null;
  $("selectedItem").className="selected-item empty";
  $("selectedItem").textContent="No item selected.";
  ["itemName","itemCode","barcode","batchNo","expiryDate","packUom","packSize"].forEach(id=>$(id).value="");
  updateQtyPreview();
}
$("clearItemButton").addEventListener("click",clearSelected);

$("itemSearch").addEventListener("input",()=>{
  clearTimeout(searchTimer);
  searchTimer=setTimeout(searchItems,250);
});

async function searchItems(){
  const q=$("itemSearch").value.trim();
  if(!q){$("searchResults").innerHTML='<div class="empty">Start typing to find an item.</div>';return;}
  $("searchResults").innerHTML='<div class="empty">Searching...</div>';
  try{
    const {data,error}=await sb.rpc("medvika_team_search_items",{p_token:sessionToken,p_query:q,p_limit:30});
    if(error) throw error;
    const rows=data||[];
    $("searchResults").innerHTML=rows.length?rows.map((r,i)=>`
      <div class="result" data-i="${i}">
        <strong>${esc(r.item_name)}</strong>
        <span>${esc(r.item_code||"No code")} • Batch ${esc(r.batch_no||"—")} • Exp ${esc(r.expiry_date||"—")} • ${esc(r.pack_uom||"")}${r.pack_size?` • Pack ${esc(r.pack_size)}`:""}</span>
      </div>`).join(""):'<div class="empty">No system item found. You may enter an unlisted item manually if authorised.</div>';
    $("searchResults").querySelectorAll(".result").forEach(el=>{
      el.addEventListener("click",()=>selectItem(rows[Number(el.dataset.i)]));
    });
  }catch(err){
    $("searchResults").innerHTML=`<div class="empty">${esc(err.message)}</div>`;
    if(/session expired/i.test(err.message||"")) forceLogout();
  }
}

function selectItem(r){
  selectedStock=r;
  $("selectedItem").className="selected-item";
  $("selectedItem").innerHTML=`<strong>${esc(r.item_name)}</strong><br><span>${esc(r.item_code||"No code")} • Batch ${esc(r.batch_no||"—")} • Exp ${esc(r.expiry_date||"—")}</span>`;
  $("itemName").value=r.item_name||"";
  $("itemCode").value=r.item_code||"";
  $("barcode").value=r.barcode||"";
  $("batchNo").value=r.batch_no||"";
  $("expiryDate").value=dateToMonth(r.expiry_date);
  $("packUom").value=r.pack_uom||"";
  $("packSize").value=r.pack_size??"";
  $("physicalQty").focus();
  updateQtyPreview();
}

function updateQtyPreview(){
  const qty=parsePharmacyQuantity($("physicalQty").value,toNumber($("packSize").value));
  $("normalizedQty").textContent=qty===null?"Invalid quantity":formatPharmacyQuantity(qty,toNumber($("packSize").value),$("packUom").value);
}
$("physicalQty").addEventListener("input",updateQtyPreview);
$("packSize").addEventListener("input",updateQtyPreview);

$("countForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const btn=$("saveCountButton");
  const qty=parsePharmacyQuantity($("physicalQty").value,toNumber($("packSize").value));
  if(qty===null){
    toast("Invalid quantity. Loose stock must resolve to a whole tablet/piece/unit. Example: 2Strip3Tablet.","error");
    return;
  }
  btn.disabled=true;btn.textContent="Saving...";
  try{
    const {data,error}=await sb.rpc("medvika_team_save_count",{
      p_token:sessionToken,
      p_stock_id:selectedStock?.stock_id||null,
      p_item_name:$("itemName").value.trim(),
      p_item_code:$("itemCode").value.trim()||null,
      p_barcode:$("barcode").value.trim()||null,
      p_batch_no:$("batchNo").value.trim()||null,
      p_expiry_date:monthToDate($("expiryDate").value),
      p_pack_uom:$("packUom").value.trim()||null,
      p_pack_size:toNumber($("packSize").value),
      p_physical_qty:qty,
      p_condition:$("condition").value,
      p_counted_by:$("countedBy").value.trim(),
      p_remarks:$("remarks").value.trim()||null
    });
    if(error) throw error;
    toast("Physical count saved");
    const counter=$("countedBy").value;
    clearSelected();
    $("physicalQty").value="";
    $("condition").value="saleable";
    $("remarks").value="";
    $("countedBy").value=counter;
    $("itemSearch").value="";
    $("searchResults").innerHTML='<div class="empty">Start typing to find an item.</div>';
    await loadRecent();
    $("itemSearch").focus();
  }catch(err){
    toast(err.message||"Unable to save count","error");
    if(/session expired/i.test(err.message||"")) forceLogout();
  }finally{
    btn.disabled=false;btn.textContent="Save Physical Count";
  }
});

async function loadRecent(){
  if(!sessionToken) return;
  try{
    const {data,error}=await sb.rpc("medvika_team_recent_counts",{p_token:sessionToken,p_limit:25});
    if(error) throw error;
    const rows=data||[];
    $("recentList").innerHTML=rows.length?rows.map(r=>`
      <div class="recent-item">
        <div class="head"><strong>${esc(r.item_name)}</strong><span class="qty">${esc(r.physical_qty)}</span></div>
        <p>${esc(r.item_code||"No code")} • Batch ${esc(r.batch_no||"—")} • ${esc(String(r.condition||"saleable").replaceAll("_"," "))} • ${esc(r.counted_by||"")}</p>
      </div>`).join(""):'<div class="empty">No entries from this team yet.</div>';
  }catch(err){
    $("recentList").innerHTML=`<div class="empty">${esc(err.message)}</div>`;
  }
}
$("reloadRecentButton").addEventListener("click",loadRecent);

function forceLogout(){
  sessionStorage.removeItem("medvika_team_token");
  sessionStorage.removeItem("medvika_team_meta");
  sessionToken="";loginData=null;showLogin();
}

(function restore(){
  if(!sessionToken){showLogin();return;}
  try{
    loginData=JSON.parse(sessionStorage.getItem("medvika_team_meta")||"null");
    if(loginData){applyMeta(loginData);showPortal();loadRecent();}
    else forceLogout();
  }catch(e){forceLogout();}
})();
