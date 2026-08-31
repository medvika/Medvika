window.initExpensesModule=async function(){
  const UI=window.MedvikaUI;
  const $=id=>document.getElementById(id);
  const toast=(m,t="success")=>UI.toast(m,t==="danger"?"error":t);
  const pid=window.MedvikaAuth.profile?.pharmacy_id;
  let expenses=[],categories=[],editing=null;

  const safe=v=>UI.safe(v??"");
  const money=v=>UI.money(Number(v||0));
  const categoryOf=r=>r.expense_categories?.name||"Uncategorised";
  const dateKey=value=>{
    if(!value)return "";
    const raw=String(value);
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
    const d=value instanceof Date?value:new Date(value);
    if(Number.isNaN(d.getTime()))return "";
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  };
  const displayDate=value=>{
    const key=dateKey(value);if(!key)return "—";
    const [y,m,d]=key.split("-");return `${d}/${m}/${y}`;
  };
  const localInput=v=>{
    const d=v?new Date(v):new Date();
    return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  };

  if(!pid){toast("Pharmacy profile not available.","danger");return;}

  async function load(){
    const [c,e]=await Promise.all([
      supabaseClient.from("expense_categories").select("*").eq("pharmacy_id",pid).eq("is_active",true).order("name"),
      supabaseClient.from("expenses").select("*,expense_categories(name)").eq("pharmacy_id",pid).order("expense_date",{ascending:false}).limit(5000)
    ]);
    const err=[c,e].find(x=>x.error)?.error;
    if(err)throw err;
    categories=c.data||[];
    expenses=e.data||[];
    fillCategories();
    summary();
    apply();
  }

  function fillCategories(){
    const opts=categories.map(c=>`<option value="${c.id}">${safe(c.name)}</option>`).join("");
    $("expenseCategory").innerHTML='<option value="">Uncategorised</option>'+opts;
    $("expenseCategoryFilter").innerHTML='<option value="">All Categories</option>'+opts;
  }

  function summary(){
    const posted=expenses.filter(x=>x.expense_status==="posted");
    const now=new Date(), y=now.getFullYear(), m=now.getMonth(), d=now.getDate();
    const today=posted.filter(x=>{const z=new Date(x.expense_date);return z.getFullYear()===y&&z.getMonth()===m&&z.getDate()===d;}).reduce((s,x)=>s+Number(x.amount||0),0);
    const month=posted.filter(x=>{const z=new Date(x.expense_date);return z.getFullYear()===y&&z.getMonth()===m;}).reduce((s,x)=>s+Number(x.amount||0),0);
    $("expenseToday").textContent=money(today);
    $("expenseMonth").textContent=money(month);
    $("expensePostedCount").textContent=posted.length;
    $("expenseRecurringCount").textContent=posted.filter(x=>x.is_recurring).length;
  }

  function apply(){
    const q=$("expenseSearch").value.trim().toLowerCase();
    const cat=$("expenseCategoryFilter").value;
    const status=$("expenseStatusFilter").value;
    const from=$("expenseFromDate").value,to=$("expenseToDate").value;
    const rows=expenses.filter(r=>{
      const date=dateKey(r.expense_date);
      const text=[r.expense_number,r.payee_name,r.description,r.transaction_reference,categoryOf(r),r.payment_method].filter(Boolean).join(" ").toLowerCase();
      return (!q||text.includes(q))&&(!cat||r.category_id===cat)&&(!status||r.expense_status===status)&&(!from||date>=from)&&(!to||date<=to);
    });
    render(rows);
  }

  function render(rows){
    $("expenseTableBody").innerHTML=rows.length?rows.map(r=>`
      <tr>
        <td>${displayDate(r.expense_date)}</td>
        <td><b>${safe(r.expense_number||"—")}</b></td>
        <td>${safe(categoryOf(r))}</td>
        <td>${safe(r.payee_name||"—")}</td>
        <td>${safe(r.description||"—")}</td>
        <td>${safe(String(r.payment_method||"—").replaceAll("_"," ").toUpperCase())}</td>
        <td><b>${money(r.amount)}</b></td>
        <td>${safe(String(r.expense_status||"posted").toUpperCase())}</td>
        <td>${r.expense_status==="posted"?`<button class="expense-edit" data-id="${r.id}">Edit</button> <button class="expense-cancel" data-id="${r.id}">Cancel</button>`:"—"}</td>
      </tr>`).join(""):'<tr><td colspan="9" class="empty">No expenses found.</td></tr>';

    document.querySelectorAll(".expense-edit").forEach(b=>b.onclick=()=>openEdit(b.dataset.id));
    document.querySelectorAll(".expense-cancel").forEach(b=>b.onclick=()=>cancelExpense(b.dataset.id));
  }

  function reset(){
    editing=null;
    $("expenseFormTitle").textContent="New Expense";
    $("expenseDate").value=localInput();
    $("expenseCategory").value="";
    $("expensePayee").value="";
    $("expenseAmount").value="";
    $("expensePaymentMethod").value="cash";
    $("expenseReference").value="";
    $("expenseDescription").value="";
    $("expenseRecurring").checked=false;
    $("expenseFrequency").value="";
    $("expenseFrequency").disabled=true;
    $("expenseNotes").value="";
    $("expenseEditReason").value="";
    $("expenseEditReasonWrap").hidden=true;
  }

  function openNew(){
    reset();
    $("expenseFormPanel").hidden=false;
    $("expenseFormPanel").scrollIntoView({behavior:"smooth",block:"start"});
  }

  function openEdit(id){
    const r=expenses.find(x=>x.id===id); if(!r)return;
    editing=r;
    $("expenseFormTitle").textContent=`Edit ${r.expense_number||"Expense"}`;
    $("expenseDate").value=localInput(r.expense_date);
    $("expenseCategory").value=r.category_id||"";
    $("expensePayee").value=r.payee_name||"";
    $("expenseAmount").value=r.amount||"";
    $("expensePaymentMethod").value=r.payment_method||"cash";
    $("expenseReference").value=r.transaction_reference||"";
    $("expenseDescription").value=r.description||"";
    $("expenseRecurring").checked=!!r.is_recurring;
    $("expenseFrequency").disabled=!r.is_recurring;
    $("expenseFrequency").value=r.recurrence_frequency||"";
    $("expenseNotes").value=r.notes||"";
    $("expenseEditReason").value="";
    $("expenseEditReasonWrap").hidden=false;
    $("expenseFormPanel").hidden=false;
    $("expenseFormPanel").scrollIntoView({behavior:"smooth",block:"start"});
  }

  async function save(){
    const description=$("expenseDescription").value.trim();
    const amount=Number($("expenseAmount").value);
    if(!description){toast("Expense description is required.","warning");return;}
    if(!Number.isFinite(amount)||amount<=0){toast("Enter a valid expense amount.","warning");return;}
    if(editing&&!$("expenseEditReason").value.trim()){toast("Edit reason is required.","warning");return;}
    if($("expenseRecurring").checked&&!$("expenseFrequency").value){toast("Select recurring frequency.","warning");return;}

    const btn=$("saveExpenseButton");btn.disabled=true;btn.textContent="Saving...";
    try{
      const {error}=await supabaseClient.rpc("save_expense",{
        p_expense_id:editing?.id||null,
        p_category_id:$("expenseCategory").value||null,
        p_expense_number:editing?.expense_number||`EXP-${Date.now()}`,
        p_expense_date:new Date($("expenseDate").value).toISOString(),
        p_payee_name:$("expensePayee").value.trim()||null,
        p_description:description,
        p_amount:amount,
        p_payment_method:$("expensePaymentMethod").value,
        p_transaction_reference:$("expenseReference").value.trim()||null,
        p_is_recurring:$("expenseRecurring").checked,
        p_recurrence_frequency:$("expenseRecurring").checked?$("expenseFrequency").value:null,
        p_notes:$("expenseNotes").value.trim()||null,
        p_edit_reason:editing?$("expenseEditReason").value.trim():null
      });
      if(error)throw error;
      toast(editing?"Expense updated.":"Expense recorded.");
      $("expenseFormPanel").hidden=true;
      reset();
      await load();
    }catch(e){toast(e.message||"Expense could not be saved.","danger");}
    finally{btn.disabled=false;btn.textContent="Save Expense";}
  }

  async function cancelExpense(id){
    const reason=prompt("Reason for cancelling this expense:");
    if(!reason?.trim())return;
    const {error}=await supabaseClient.rpc("cancel_expense",{p_expense_id:id,p_reason:reason.trim()});
    if(error){toast(error.message,"danger");return;}
    toast("Expense cancelled.");
    await load();
  }

  $("newExpenseButton").onclick=openNew;
  $("closeExpenseForm").onclick=()=>{$("expenseFormPanel").hidden=true;reset();};
  $("saveExpenseButton").onclick=save;
  $("expenseRecurring").onchange=e=>{$("expenseFrequency").disabled=!e.target.checked;if(!e.target.checked)$("expenseFrequency").value="";};
  ["expenseSearch","expenseCategoryFilter","expenseStatusFilter","expenseFromDate","expenseToDate"].forEach(id=>{
    $(id).oninput=apply;$(id).onchange=apply;
  });

  try{reset();await load();}
  catch(e){toast("Expenses module could not load: "+e.message,"danger");}
};
