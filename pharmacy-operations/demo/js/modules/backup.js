window.initBackupModule=async function(){
  const UI=window.MedvikaUI;
  const $=id=>document.getElementById(id);
  const historyBody=document.querySelector("#backupHistoryTable tbody");
  const previewBody=document.querySelector("#restorePreviewTable tbody");
  const toast=(m,t="success")=>UI.toast(m,t==="danger"?"error":t);

  const VERSION="1.0";

  const groups={
    masters:[
      "medicines","manufacturers","suppliers","customers","doctors"
    ],
    transactions:[
      "purchase_invoices","purchase_items",
      "sales_invoices","sales_items",
      "sales_returns","sales_return_items",
      "purchase_return_memos","purchase_return_memo_items",
      "purchase_returns","purchase_return_items",
      "purchase_orders","purchase_order_items"
    ],
    stock:[
      "medicine_batches",
      "stock_audits","stock_audit_items",
      "stock_adjustments","stock_adjustment_items",
      "damage_expiry_register",
      "inventory_batch_action_history",
      "near_expiry_action_log"
    ],
    reports:[
      "expenses",
      "supplier_ledger_entries",
      "customer_ledger_entries"
    ]
  };

  const optionalTables=new Set([
    "customers","doctors",
    "purchase_orders","purchase_order_items",
    "stock_audits","stock_audit_items",
    "stock_adjustments","stock_adjustment_items",
    "damage_expiry_register",
    "inventory_batch_action_history",
    "near_expiry_action_log",
    "expenses",
    "supplier_ledger_entries",
    "customer_ledger_entries"
  ]);

  async function safeTable(table,pid){
    let query=supabaseClient.from(table).select("*").limit(50000);

    // Most transactional tables have pharmacy_id.
    // Masters without pharmacy_id are attempted globally under current RLS.
    if(!["medicines","manufacturers","suppliers","customers","doctors"].includes(table)){
      query=query.eq("pharmacy_id",pid);
    }

    const result=await query;

    if(result.error){
      if(optionalTables.has(table)){
        console.warn("Backup skipped optional table",table,result.error);
        return {table,rows:[],skipped:true,error:result.error.message};
      }
      throw new Error(`${table}: ${result.error.message}`);
    }

    return {table,rows:result.data||[],skipped:false};
  }

  function chosenTables(){
    const tables=[];

    if($("backupMasters").checked)tables.push(...groups.masters);
    if($("backupTransactions").checked)tables.push(...groups.transactions);
    if($("backupStock").checked)tables.push(...groups.stock);
    if($("backupReportsData").checked)tables.push(...groups.reports);

    return [...new Set(tables)];
  }

  function makeBackupId(){
    return `MVB-${new Date().toISOString().replace(/[-:.TZ]/g,"").slice(0,14)}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
  }

  async function createBackup(){
    const tables=chosenTables();

    if(!tables.length){
      toast("Select at least one backup category.","warning");
      return;
    }

    const pid=window.MedvikaAuth.profile?.pharmacy_id;
    const progress=$("backupProgress");
    progress.hidden=false;
    progress.textContent="Preparing backup...";

    try{
      const data={};
      const skipped=[];

      for(let i=0;i<tables.length;i++){
        const table=tables[i];
        progress.textContent=`Backing up ${table} (${i+1}/${tables.length})...`;

        const result=await safeTable(table,pid);

        if(result.skipped){
          skipped.push({
            table,
            reason:result.error
          });
        }else{
          data[table]=result.rows;
        }
      }

      const backupId=makeBackupId();
      const rowCount=Object.values(data)
        .reduce((sum,rows)=>sum+rows.length,0);

      const backup={
        format:"MEDVIKA_ERP_BACKUP",
        version:VERSION,
        backup_id:backupId,
        created_at:new Date().toISOString(),
        pharmacy_id:pid,
        table_count:Object.keys(data).length,
        row_count:rowCount,
        skipped_tables:skipped,
        data
      };

      const blob=new Blob(
        [JSON.stringify(backup,null,2)],
        {type:"application/json;charset=utf-8"}
      );

      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;
      a.download=`medvika-backup-${backupId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const log=await supabaseClient.rpc(
        "log_erp_backup_v1",
        {
          p_backup_id:backupId,
          p_backup_version:VERSION,
          p_table_count:Object.keys(data).length,
          p_row_count:rowCount
        }
      );

      if(log.error){
        console.warn("Backup history log failed",log.error);
      }

      progress.textContent=
        `Backup completed: ${Object.keys(data).length} tables, ${rowCount} rows.`+
        (skipped.length?` ${skipped.length} optional table(s) skipped.`:"");

      toast("Backup created successfully.");
      await loadHistory();

    }catch(error){
      progress.textContent=`Backup failed: ${error.message}`;
      toast(error.message,"danger");
    }
  }

  async function loadHistory(){
    const pid=window.MedvikaAuth.profile?.pharmacy_id;
    const {data,error}=await supabaseClient
      .from("erp_backup_history")
      .select("*")
      .eq("pharmacy_id",pid)
      .order("created_at",{ascending:false})
      .limit(100);

    if(error){
      historyBody.innerHTML=
        `<tr><td colspan="6" class="empty">${UI.safe(error.message)}</td></tr>`;
      return;
    }

    const rows=data||[];

    historyBody.innerHTML=rows.length
      ? rows.map(r=>`
        <tr>
          <td>${new Date(r.created_at).toLocaleString()}</td>
          <td><b>${UI.safe(r.backup_id)}</b></td>
          <td>${r.table_count}</td>
          <td>${r.row_count}</td>
          <td>${UI.safe(r.status)}</td>
          <td>${UI.safe(r.created_by||"User")}</td>
        </tr>
      `).join("")
      : '<tr><td colspan="6" class="empty">No backup history.</td></tr>';

    $("backupHistoryCount").textContent=
      `${rows.length} backup${rows.length===1?"":"s"}`;
  }

  function validateBackup(obj){
    const errors=[];

    if(!obj||typeof obj!=="object"){
      errors.push("Invalid JSON object");
      return errors;
    }

    if(obj.format!=="MEDVIKA_ERP_BACKUP"){
      errors.push("Not a Medvika ERP backup");
    }

    if(!obj.version){
      errors.push("Backup version missing");
    }

    if(!obj.created_at){
      errors.push("Created date missing");
    }

    if(!obj.data||typeof obj.data!=="object"||Array.isArray(obj.data)){
      errors.push("Backup data section missing");
    }

    if(obj.data){
      for(const [table,rows] of Object.entries(obj.data)){
        if(!Array.isArray(rows)){
          errors.push(`${table} is not a row array`);
        }
      }
    }

    return errors;
  }

  async function readRestoreFile(file){
    if(!file)return;

    try{
      const text=await file.text();
      const backup=JSON.parse(text);
      const errors=validateBackup(backup);

      const data=backup.data||{};
      const tableCount=Object.keys(data).length;
      const rowCount=Object.values(data)
        .filter(Array.isArray)
        .reduce((sum,rows)=>sum+rows.length,0);

      $("restoreValidationPanel").hidden=false;
      $("restoreSafetyNotice").hidden=false;

      $("restoreVersion").textContent=backup.version||"—";
      $("restoreCreatedAt").textContent=
        backup.created_at
          ? new Date(backup.created_at).toLocaleString()
          : "—";
      $("restoreTableCount").textContent=tableCount;
      $("restoreRowCount").textContent=rowCount;
      $("restoreValidationStatus").textContent=
        errors.length?"FAILED":"VALID";

      $("restoreValidationStatus").className=
        errors.length?"bad":"ok";

      previewBody.innerHTML=Object.keys(data).length
        ? Object.entries(data).map(([table,rows])=>{
            const firstRow=Array.isArray(rows)&&rows.length?rows[0]:{};
            const keys=Object.keys(firstRow).slice(0,6).join(", ");

            return `<tr>
              <td><b>${UI.safe(table)}</b></td>
              <td>${Array.isArray(rows)?rows.length:"Invalid"}</td>
              <td>${UI.safe(keys||"—")}</td>
            </tr>`;
          }).join("")
        : '<tr><td colspan="3" class="empty">No table data.</td></tr>';

      if(errors.length){
        toast(
          "Restore file validation failed: "+errors.join("; "),
          "danger"
        );
      }else{
        toast(
          "Backup file is valid. Preview only — nothing has been restored."
        );
      }

    }catch(error){
      $("restoreValidationPanel").hidden=false;
      $("restoreValidationStatus").textContent="FAILED";
      $("restoreValidationStatus").className="bad";

      previewBody.innerHTML=
        '<tr><td colspan="3" class="empty">Invalid JSON backup file.</td></tr>';

      toast("Restore file could not be read: "+error.message,"danger");
    }
  }

  $("createBackupButton").onclick=createBackup;
  $("restoreFileInput").onchange=e=>
    readRestoreFile(e.target.files?.[0]);

  $("refreshBackupButton").onclick=loadHistory;

  try{
    await loadHistory();
  }catch(error){
    toast("Backup module could not load: "+error.message,"danger");
  }
};