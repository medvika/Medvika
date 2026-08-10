function installStockAllocation(ctx){
  const {sb,esc,msg,getAuditId}=ctx;
  const $=id=>document.getElementById(id);
  let previewRows=[];

  function updateModeLabels(){
    const mode=$("allocationMode")?.value;
    const l1=$("allocationValue1Label"),l2=$("allocationValue2Label");
    const i1=$("allocationValue1"),i2=$("allocationValue2");
    if(!l1||!l2||!i1||!i2)return;
    l1.hidden=false;l2.hidden=false;i1.value="";i2.value="";
    if(mode==="alphabet"){l1.firstChild.textContent="From ";l2.firstChild.textContent="To ";i1.placeholder="A";i2.placeholder="M";}
    else if(mode==="category"){l1.firstChild.textContent="Category ";l2.hidden=true;i1.placeholder="e.g. Tablet";}
    else if(mode==="manufacturer"){l1.firstChild.textContent="Manufacturer ";l2.hidden=true;i1.placeholder="e.g. Sun Pharma";}
    else if(mode==="item_code_range"){l1.firstChild.textContent="From Item Code ";l2.firstChild.textContent="To Item Code ";i1.placeholder="1001";i2.placeholder="1999";}
    else {l1.hidden=true;l2.hidden=true;}
  }

  async function loadSummary(){
    const auditId=getAuditId(); if(!auditId)return;
    const box=$("allocationSummary");
    const {data,error}=await sb.rpc("medvika_allocation_summary",{p_audit_id:auditId});
    if(error){if(box)box.innerHTML=`<p class="muted">${esc(error.message)}</p>`;return;}
    const rows=data||[];
    if(box) box.innerHTML=rows.length?`<table><thead><tr><th>Zone</th><th>Team</th><th>Allocated Items</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc((r.zone_code||"")+" "+(r.zone_name||""))}</td><td>${esc((r.team_code||"")+" "+(r.team_name||""))}</td><td>${Number(r.allocated_items||0).toLocaleString("en-IN")}</td></tr>`).join("")}</tbody></table>`:'<p class="empty">No stock allocated yet.</p>';
  }

  async function preview(){
    const auditId=getAuditId(); if(!auditId)return;
    const zone=$("allocationZone")?.value||null,team=$("allocationTeam")?.value||null;
    const out=$("allocationPreview");
    if(!zone||!team){if(out)out.textContent="Select both Zone and Team.";return;}
    const {data,error}=await sb.rpc("medvika_allocation_candidates",{
      p_audit_id:auditId,p_mode:$("allocationMode").value,
      p_value1:$("allocationValue1").value||null,p_value2:$("allocationValue2").value||null,p_limit:5000
    });
    if(error){msg(error.message);return;}
    previewRows=data||[];
    const zoneText=$("allocationZone")?.selectedOptions?.[0]?.textContent||"Zone";
    const teamText=$("allocationTeam")?.selectedOptions?.[0]?.textContent||"Team";
    if(out)out.innerHTML=`<strong>${previewRows.length.toLocaleString("en-IN")} eligible stock lines</strong> → ${esc(zoneText)} / ${esc(teamText)}.`;
  }

  async function allocateBulk(){
    const auditId=getAuditId(); if(!auditId)return;
    const zone=$("allocationZone")?.value||null,team=$("allocationTeam")?.value||null;
    if(!zone||!team){msg("Select both Zone and Team.");return;}
    const btn=$("applyAllocation");
    try{
      if(btn){btn.disabled=true;btn.textContent="Allocating…";}
      const {data,error}=await sb.rpc("medvika_allocate_stock_bulk",{
        p_audit_id:auditId,p_zone_id:zone,p_team_id:team,p_mode:$("allocationMode").value,
        p_value1:$("allocationValue1").value||null,p_value2:$("allocationValue2").value||null
      });
      if(error){msg(error.message);return;}
      msg(`${Number(data||0).toLocaleString("en-IN")} stock rows allocated.`);
      const out=$("allocationPreview"); if(out)out.innerHTML=`<strong>${Number(data||0).toLocaleString("en-IN")} stock lines allocated.</strong> Existing allocation for matching rows was updated.`;
      await loadSummary();
    }finally{if(btn){btn.disabled=false;btn.textContent="Allocate Stock";}}
  }

  $("allocationMode")?.addEventListener("change",updateModeLabels);
  $("previewAllocation")?.addEventListener("click",preview);
  $("applyAllocation")?.addEventListener("click",allocateBulk);
  $("reloadAllocation")?.addEventListener("click",loadSummary);
  updateModeLabels();
  return {loadSummary,preview};
}
