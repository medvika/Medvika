
function installStockAllocation(ctx){
  const {sb,esc,msg,getAuditId}=ctx;
  const $=id=>document.getElementById(id);
  let previewRows=[];

  function updateModeLabels(){
    const mode=$("allocationMode").value;
    const l1=$("allocationValue1Label"),l2=$("allocationValue2Label");
    const i1=$("allocationValue1"),i2=$("allocationValue2");

    l1.hidden=false;l2.hidden=false;i1.value="";i2.value="";
    if(mode==="alphabet"){l1.firstChild.textContent="From ";l2.firstChild.textContent="To ";i1.placeholder="A";i2.placeholder="M";}
    else if(mode==="category"){l1.firstChild.textContent="Category ";l2.hidden=true;i1.placeholder="e.g. Tablet";}
    else if(mode==="manufacturer"){l1.firstChild.textContent="Manufacturer ";l2.hidden=true;i1.placeholder="e.g. Sun Pharma";}
    else if(mode==="item_code_range"){l1.firstChild.textContent="From Item Code ";l2.firstChild.textContent="To Item Code ";i1.placeholder="1001";i2.placeholder="1999";}
    else {l1.hidden=true;l2.hidden=true;}
  }

  async function loadSummary(){
    const auditId=getAuditId(); if(!auditId)return;
    const {data,error}=await sb.rpc("medvika_allocation_summary",{p_audit_id:auditId});
    if(error){$("allocationSummary").innerHTML=`<p class="muted">${esc(error.message)}</p>`;return;}
    const rows=data||[];
    $("allocationSummary").innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Zone</th><th>Team</th><th>Allocated Items</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc((r.zone_code||"")+" "+(r.zone_name||""))}</td><td>${esc((r.team_code||"")+" "+(r.team_name||""))}</td><td>${r.allocated_items}</td></tr>`).join("")}</tbody></table></div>`:'<p class="muted">No stock allocated yet.</p>';
  }

  async function preview(){
    const auditId=getAuditId(); if(!auditId)return;
    const mode=$("allocationMode").value;
    const {data,error}=await sb.rpc("medvika_allocation_candidates",{
      p_audit_id:auditId,
      p_mode:mode,
      p_value1:$("allocationValue1").value||null,
      p_value2:$("allocationValue2").value||null,
      p_limit:5000
    });
    if(error){msg(error.message);return;}
    previewRows=data||[];
    $("allocationPreview").innerHTML=previewRows.length?`
      <p class="muted">${previewRows.length.toLocaleString("en-IN")} items matched.</p>
      <div class="table-wrap allocation-preview-table"><table><thead><tr><th>Select</th><th>Item</th><th>Code</th><th>Batch</th><th>Category</th><th>Manufacturer</th></tr></thead><tbody>
      ${previewRows.slice(0,1000).map(r=>`<tr><td><input type="checkbox" class="alloc-row" value="${r.stock_id}" checked></td><td>${esc(r.item_name)}</td><td>${esc(r.item_code||"")}</td><td>${esc(r.batch_no||"")}</td><td>${esc(r.category||"")}</td><td>${esc(r.manufacturer||"")}</td></tr>`).join("")}
      </tbody></table></div>
      ${previewRows.length>1000?'<p class="muted">Preview shows first 1,000 rows. Bulk allocation can still apply to all matching rows.</p>':""}
      <button id="allocateSelectedRows" class="btn secondary">Allocate Selected Preview Rows</button>`:'<p class="muted">No items match this rule.</p>';

    const b=$("allocateSelectedRows");
    if(b)b.onclick=allocateSelected;
  }

  async function allocateBulk(){
    const auditId=getAuditId(); if(!auditId)return;
    const zone=$("allocationZone").value||null;
    const team=$("allocationTeam").value||null;
    if(!zone && !team){msg("Select a zone or team.");return;}
    const {data,error}=await sb.rpc("medvika_allocate_stock_bulk",{
      p_audit_id:auditId,p_zone_id:zone,p_team_id:team,
      p_mode:$("allocationMode").value,
      p_value1:$("allocationValue1").value||null,
      p_value2:$("allocationValue2").value||null
    });
    if(error){msg(error.message);return;}
    msg(`${data||0} stock rows allocated.`);
    await Promise.all([preview(),loadSummary()]);
  }

  async function allocateSelected(){
    const ids=[...document.querySelectorAll(".alloc-row:checked")].map(x=>x.value);
    if(!ids.length){msg("Select at least one item.");return;}
    const zone=$("allocationZone").value||null;
    const team=$("allocationTeam").value||null;
    const {data,error}=await sb.rpc("medvika_allocate_stock_selected",{
      p_audit_id:getAuditId(),p_zone_id:zone,p_team_id:team,p_stock_ids:ids
    });
    if(error){msg(error.message);return;}
    msg(`${data||0} selected stock rows allocated.`);
    await Promise.all([preview(),loadSummary()]);
  }

  $("allocationMode")?.addEventListener("change",updateModeLabels);
  $("previewAllocation")?.addEventListener("click",preview);
  $("applyAllocation")?.addEventListener("click",allocateBulk);
  $("reloadAllocation")?.addEventListener("click",loadSummary);
  updateModeLabels();

  return {loadSummary,preview};
}
