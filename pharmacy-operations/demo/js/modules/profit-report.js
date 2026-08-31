window.initProfitReportModule=async function(){
  const UI=window.MedvikaUI;
  const $=id=>document.getElementById(id);
  const table=document.getElementById("profitDetailTable");
  const thead=table.querySelector("thead");
  const tbody=table.querySelector("tbody");
  const expenseBody=document.querySelector("#expenseBreakdownTable tbody");
  const toast=(m,t="success")=>UI.toast(m,t==="danger"?"error":t);

  let medicines=[],batches=[],sales=[],salesItems=[],salesReturns=[],salesReturnItems=[],expenses=[],stockAdjustments=[],stockAdjustmentItems=[];
  let saleRows=[],periodRows=[],visibleRows=[];

  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const money=v=>UI.money(n(v));

  function fyStart(){
    const now=new Date();
    const y=now.getMonth()>=3?now.getFullYear():now.getFullYear()-1;
    return `${y}-04-01`;
  }

  function dateKey(value){
    if(!value)return "";
    const raw=String(value);
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return "";
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,"0");
    const day=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }

  function displayDate(value){
    const key=dateKey(value);
    if(!key)return "";
    const [y,m,d]=key.split("-");
    return `${d}/${m}/${y}`;
  }

  function today(){
    return dateKey(new Date());
  }

  function first(row,names,def=null){
    for(const name of names){
      if(row&&row[name]!==undefined&&row[name]!==null&&row[name]!==""){
        return row[name];
      }
    }
    return def;
  }

  function correctedInclusiveLine(item){
    const qty=n(first(item,["quantity","sold_quantity"],0));
    const rate=n(first(item,["selling_rate","sale_rate","rate"],0));
    const discountPercent=n(first(item,["discount_percent"],0));

    const rateBasedGross=qty*rate;
    const rateBasedNet=rateBasedGross*(1-(discountPercent/100));

    const storedLine=n(first(item,["line_total","net_amount","total_amount","amount"],0));

    /*
     * line_total is the saved GST-inclusive transaction value. In older
     * rows selling_rate may be taxable, so quantity × rate can be lower
     * than the billed value. Preserve the posted accounting amount.
     */
    if(storedLine>0){
      return Math.max(0,storedLine);
    }

    return Math.max(0,rateBasedNet);
  }

  async function safe(table,filterPid=true){
    let q=supabaseClient.from(table).select("*").limit(20000);

    if(filterPid){
      const pid=window.MedvikaAuth.profile?.pharmacy_id;
      q=q.eq("pharmacy_id",pid);
    }

    const r=await q;

    if(r.error){
      console.warn(table,r.error);
      return [];
    }

    return r.data||[];
  }

  async function load(){
    [
      medicines,batches,
      sales,salesItems,
      salesReturns,salesReturnItems,
      expenses,stockAdjustments,stockAdjustmentItems
    ]=await Promise.all([
      safe("medicines",false),
      safe("medicine_batches"),
      safe("sales_invoices"),
      safe("sales_items"),
      safe("sales_returns"),
      safe("sales_return_items"),
      safe("expenses"),
      safe("stock_adjustments"),
      safe("stock_adjustment_items")
    ]);

    buildSaleRows();
    apply();
  }

  function medicine(id){
    return medicines.find(x=>x.id===id)||{};
  }

  function batch(id){
    return batches.find(x=>x.id===id)||{};
  }

  function buildSaleRows(){
    const invoiceMap=new Map(sales.map(x=>[x.id,x]));
    const itemMap=new Map(salesItems.map(x=>[x.id,x]));
    const returnMap=new Map(salesReturns.map(x=>[x.id,x]));

    const invoiceLineTotals=new Map();

    salesItems.forEach(item=>{
      const invoiceId=first(item,["sales_invoice_id","invoice_id"]);
      const qty=n(first(item,["quantity","sold_quantity"],0));

      const billedValue=
        correctedInclusiveLine(item);

      invoiceLineTotals.set(
        invoiceId,
        n(invoiceLineTotals.get(invoiceId))+billedValue
      );
    });

    saleRows=[];

    salesItems.forEach(item=>{
      const invoiceId=first(item,["sales_invoice_id","invoice_id"]);
      const parent=invoiceMap.get(invoiceId);

      if(!parent)return;
      if(String(first(parent,["invoice_status","status"],"")).toLowerCase()==="cancelled")return;

      const med=medicine(first(item,["medicine_id"]));
      const b=batch(first(item,["medicine_batch_id"]));

      const qty=n(first(item,["quantity","sold_quantity"],0));

      const billedValue=
        correctedInclusiveLine(item);

      /* Allocate invoice-level discount proportionately to item billed value. */
      const invoiceDiscount=n(first(parent,["invoice_discount_amount"],0));
      const invoiceLines=n(invoiceLineTotals.get(invoiceId));

      const allocatedInvoiceDiscount=
        invoiceLines>0
          ? invoiceDiscount*(billedValue/invoiceLines)
          : 0;

      const inclusiveNetSales=Math.max(
        0,
        billedValue-allocatedInvoiceDiscount
      );

      /*
       * Retail selling value is GST-inclusive.
       * Compare like-for-like with GST-exclusive purchase cost by
       * removing GST from the actual billed selling value first.
       */
      const gstRate=n(
        first(
          item,
          ["gst_percent"],
          first(b,["gst_percent"],first(med,["gst_percent"],0))
        )
      );

      const taxableNetSales=
        gstRate>0
          ? inclusiveNetSales/(1+(gstRate/100))
          : inclusiveNetSales;

      const unitCost=n(
        first(
          item,
          ["purchase_rate","cost_rate"],
          first(b,["purchase_rate"],0)
        )
      );

      const cogs=qty*unitCost;

      saleRows.push({
        date:first(parent,["invoice_date","sale_date","created_at"]),
        type:"SALE",
        document:first(parent,["invoice_number","sale_number"],"Sale"),
        medicine_id:first(item,["medicine_id"]),
        medicine_name:first(med,["brand_name","name","medicine_name"],"Medicine"),
        quantity:qty,
        sales_value:taxableNetSales,
        cogs:cogs,
        gross_profit:taxableNetSales-cogs
      });
    });

    salesReturnItems.forEach(returnItem=>{
      const parent=returnMap.get(
        first(returnItem,["sales_return_id","return_id"])
      );

      if(!parent)return;
      if(String(first(parent,["return_status","status"],"")).toLowerCase()==="cancelled")return;

      /*
       * Current sales-return rows reference the original sales item.
       * Use that original item so revenue, GST and cost are reversed
       * on exactly the same basis as the sale.
       */
      const originalItem=itemMap.get(
        first(returnItem,["sales_item_id"])
      );

      if(!originalItem)return;

      const invoiceId=first(
        originalItem,
        ["sales_invoice_id","invoice_id"]
      );

      const invoice=invoiceMap.get(invoiceId)||{};
      const med=medicine(first(originalItem,["medicine_id"]));
      const b=batch(first(originalItem,["medicine_batch_id"]));

      const soldQty=n(
        first(originalItem,["quantity","sold_quantity"],0)
      );

      const returnQty=n(
        first(returnItem,["return_quantity","quantity"],0)
      );

      if(soldQty<=0 || returnQty<=0)return;

      const originalBilledValue=
        correctedInclusiveLine(originalItem);

      const invoiceDiscount=n(
        first(invoice,["invoice_discount_amount"],0)
      );

      const invoiceLines=n(invoiceLineTotals.get(invoiceId));

      const itemInvoiceDiscount=
        invoiceLines>0
          ? invoiceDiscount*(originalBilledValue/invoiceLines)
          : 0;

      const originalInclusiveNet=Math.max(
        0,
        originalBilledValue-itemInvoiceDiscount
      );

      const gstRate=n(
        first(
          originalItem,
          ["gst_percent"],
          first(b,["gst_percent"],first(med,["gst_percent"],0))
        )
      );

      const originalTaxableNet=
        gstRate>0
          ? originalInclusiveNet/(1+(gstRate/100))
          : originalInclusiveNet;

      const returnRatio=Math.min(
        1,
        returnQty/soldQty
      );

      const reversedSales=
        originalTaxableNet*returnRatio;

      const unitCost=n(
        first(
          originalItem,
          ["purchase_rate","cost_rate"],
          first(b,["purchase_rate"],0)
        )
      );

      const reversedCost=
        returnQty*unitCost;

      saleRows.push({
        date:first(parent,["return_date","created_at"]),
        type:"SALES_RETURN",
        document:first(parent,["return_number","sales_return_number"],"Sales Return"),
        medicine_id:first(originalItem,["medicine_id"]),
        medicine_name:first(med,["brand_name","name","medicine_name"],"Medicine"),
        quantity:-returnQty,
        sales_value:-reversedSales,
        cogs:-reversedCost,
        gross_profit:-(reversedSales-reversedCost)
      });
    });

    saleRows=saleRows.filter(x=>x.date);
  }

  function inRange(date,from,to){
    const key=dateKey(date);
    if(!key)return false;
    if(from&&key<from)return false;
    if(to&&key>to)return false;
    return true;
  }

  function expenseInRange(row,from,to){
    const status=String(first(row,["expense_status","status"],"posted")).toLowerCase();
    if(status!=="posted")return false;

    const date=first(row,["expense_date","date","created_at"]);
    return date&&inRange(date,from,to);
  }

  function expenseAmount(row){
    return n(first(row,["amount","expense_amount","total_amount"],0));
  }

  function expenseCategory(row){
    return first(row,["category","expense_category","category_name","expense_type"],"Other");
  }

  function apply(){
    const from=$("profitFromDate").value;
    const to=$("profitToDate").value;
    const search=$("profitSearch").value.trim().toLowerCase();

    periodRows=saleRows.filter(x=>inRange(x.date,from,to));

    visibleRows=periodRows
      .filter(x=>!search||[x.medicine_name,x.document].join(" ").toLowerCase().includes(search))
      .sort((a,b)=>dateKey(b.date).localeCompare(dateKey(a.date)));

    renderSummary(from,to);
    renderDetail();
    renderExpenses(from,to);
  }

  function totals(){
    const grossSales=periodRows
      .filter(x=>x.type==="SALE")
      .reduce((s,x)=>s+n(x.sales_value),0);

    const salesReturns=Math.abs(
      periodRows
        .filter(x=>x.type==="SALES_RETURN")
        .reduce((s,x)=>s+n(x.sales_value),0)
    );

    const netSales=periodRows.reduce((s,x)=>s+n(x.sales_value),0);
    const cogs=periodRows.reduce((s,x)=>s+n(x.cogs),0);
    const grossProfit=netSales-cogs;

    return {grossSales,salesReturns,netSales,cogs,grossProfit};
  }

  function inventoryAdjustmentsInRange(from,to){
    const headers=new Map(stockAdjustments
      .filter(x=>String(x.status||"POSTED").toUpperCase()==="POSTED"&&inRange(x.adjustment_date,from,to))
      .map(x=>[x.id,x]));
    const rows=stockAdjustmentItems.filter(x=>headers.has(x.stock_adjustment_id));
    const losses=rows.reduce((sum,x)=>sum+Math.max(0,-n(x.difference_value)),0);
    const gains=rows.reduce((sum,x)=>sum+Math.max(0,n(x.difference_value)),0);
    return {rows,losses,gains,net:gains-losses};
  }

  function renderSummary(from,to){
    const t=totals();

    const operatingExpenses=expenses
      .filter(x=>expenseInRange(x,from,to))
      .reduce((s,x)=>s+expenseAmount(x),0);

    const inventory=inventoryAdjustmentsInRange(from,to);
    const adjustedGrossProfit=t.grossProfit+inventory.net;
    const operatingProfit=adjustedGrossProfit-operatingExpenses;
    const grossMargin=t.netSales ? (t.grossProfit/t.netSales)*100 : 0;
    const operatingMargin=t.netSales ? (operatingProfit/t.netSales)*100 : 0;

    $("plGrossSales").textContent=money(t.grossSales);
    $("plSalesReturns").textContent=money(t.salesReturns);
    $("plNetSales").textContent=money(t.netSales);
    $("plCogs").textContent=money(t.cogs);
    $("plGrossProfit").textContent=money(t.grossProfit);
    $("plGrossMargin").textContent=`${grossMargin.toFixed(2)}%`;
    $("plInventoryLosses").textContent=money(inventory.losses);
    $("plInventoryGains").textContent=money(inventory.gains);
    $("plAdjustedGrossProfit").textContent=money(adjustedGrossProfit);
    $("plExpenses").textContent=money(operatingExpenses);
    $("plOperatingProfit").textContent=money(operatingProfit);
    $("plOperatingMargin").textContent=`${operatingMargin.toFixed(2)}%`;

    $("plGrossProfit").className=t.grossProfit>=0?"positive":"negative";
    $("plAdjustedGrossProfit").className=adjustedGrossProfit>=0?"positive":"negative";
    $("plOperatingProfit").className=operatingProfit>=0?"positive":"negative";
  }

  function groupMedicine(){
    const map=new Map();

    visibleRows.forEach(x=>{
      if(!map.has(x.medicine_id)){
        map.set(x.medicine_id,{
          medicine:x.medicine_name,
          qty:0,
          sales:0,
          cogs:0,
          profit:0
        });
      }

      const g=map.get(x.medicine_id);
      g.qty+=n(x.quantity);
      g.sales+=n(x.sales_value);
      g.cogs+=n(x.cogs);
      g.profit+=n(x.sales_value)-n(x.cogs);
    });

    return [...map.values()];
  }

  function groupDaily(){
    const map=new Map();

    visibleRows.forEach(x=>{
      const key=dateKey(x.date);

      if(!map.has(key)){
        map.set(key,{date:key,sales:0,cogs:0,profit:0});
      }

      const g=map.get(key);
      g.sales+=n(x.sales_value);
      g.cogs+=n(x.cogs);
      g.profit+=n(x.sales_value)-n(x.cogs);
    });

    return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
  }

  function renderDetail(){
    const mode=$("profitViewMode").value;

    if(mode==="DAILY"){
      $("profitDetailTitle").textContent="Daily Profitability";
      const rows=groupDaily();

      thead.innerHTML="<tr><th>Date</th><th>Net Sales</th><th>COGS</th><th>Gross Profit</th><th>Margin</th></tr>";
      tbody.innerHTML=rows.length
        ? rows.map(r=>`
          <tr>
            <td>${r.date}</td>
            <td>${money(r.sales)}</td>
            <td>${money(r.cogs)}</td>
            <td class="${r.profit>=0?"positive":"negative"}">${money(r.profit)}</td>
            <td>${r.sales?((r.profit/r.sales)*100).toFixed(2):"0.00"}%</td>
          </tr>
        `).join("")
        : '<tr><td colspan="5" class="empty">No profitability data.</td></tr>';

      $("profitDetailCount").textContent=`${rows.length} records`;
      return;
    }

    if(mode==="SUMMARY"){
      $("profitDetailTitle").textContent="Transaction Profitability";

      thead.innerHTML="<tr><th>Date</th><th>Document</th><th>Medicine</th><th>Type</th><th>Qty</th><th>Sales Value</th><th>COGS</th><th>Gross Profit</th></tr>";

      tbody.innerHTML=visibleRows.length
        ? visibleRows.map(r=>`
          <tr>
            <td>${displayDate(r.date)}</td>
            <td>${UI.safe(r.document)}</td>
            <td>${UI.safe(r.medicine_name)}</td>
            <td>${UI.safe(r.type)}</td>
            <td>${r.quantity.toFixed(3).replace(/\.?0+$/,"")}</td>
            <td>${money(r.sales_value)}</td>
            <td>${money(r.cogs)}</td>
            <td class="${r.gross_profit>=0?"positive":"negative"}">${money(r.gross_profit)}</td>
          </tr>
        `).join("")
        : '<tr><td colspan="8" class="empty">No profitability data.</td></tr>';

      $("profitDetailCount").textContent=`${visibleRows.length} records`;
      return;
    }

    $("profitDetailTitle").textContent="Medicine-wise Profitability";
    const rows=groupMedicine();

    thead.innerHTML="<tr><th>Medicine</th><th>Net Qty</th><th>Net Sales</th><th>COGS</th><th>Gross Profit</th><th>Margin</th></tr>";

    tbody.innerHTML=rows.length
      ? rows.map(r=>`
        <tr>
          <td><b>${UI.safe(r.medicine)}</b></td>
          <td>${r.qty.toFixed(3).replace(/\.?0+$/,"")}</td>
          <td>${money(r.sales)}</td>
          <td>${money(r.cogs)}</td>
          <td class="${r.profit>=0?"positive":"negative"}">${money(r.profit)}</td>
          <td>${r.sales?((r.profit/r.sales)*100).toFixed(2):"0.00"}%</td>
        </tr>
      `).join("")
      : '<tr><td colspan="6" class="empty">No profitability data.</td></tr>';

    $("profitDetailCount").textContent=`${rows.length} records`;
  }

  function renderExpenses(from,to){
    const rows=expenses.filter(x=>expenseInRange(x,from,to));
    const map=new Map();
    const netSales=totals().netSales;

    rows.forEach(x=>{
      const key=expenseCategory(x);
      map.set(key,(map.get(key)||0)+expenseAmount(x));
    });

    const inventory=inventoryAdjustmentsInRange(from,to);
    if(inventory.losses)map.set("Inventory write-offs / shortages",(map.get("Inventory write-offs / shortages")||0)+inventory.losses);
    if(inventory.gains)map.set("Inventory gains / excess",(map.get("Inventory gains / excess")||0)-inventory.gains);

    const grouped=[...map.entries()]
      .map(([category,amount])=>({category,amount}))
      .sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount));

    expenseBody.innerHTML=grouped.length
      ? grouped.map(r=>`
        <tr>
          <td>${UI.safe(r.category)}</td>
          <td>${money(r.amount)}</td>
          <td>${netSales?((r.amount/netSales)*100).toFixed(2):"0.00"}%</td>
        </tr>
      `).join("")
      : '<tr><td colspan="3" class="empty">No expense data for this period.</td></tr>';

    $("expenseBreakdownCount").textContent=`${rows.length} expense records • ${inventory.rows.length} inventory adjustment lines`;
  }

  function csvEscape(v){
    return `"${String(v??"").replace(/"/g,'""')}"`;
  }

  function exportCsv(){
    const headers=[
      "Date","Document","Medicine","Type","Quantity",
      "Sales Value","COGS","Gross Profit"
    ];

    const rows=visibleRows.map(r=>[
      new Date(r.date).toLocaleDateString(),
      r.document,
      r.medicine_name,
      r.type,
      r.quantity,
      r.sales_value,
      r.cogs,
      r.gross_profit
    ]);

    const csv=[
      headers.map(csvEscape).join(","),
      ...rows.map(r=>r.map(csvEscape).join(","))
    ].join("\n");

    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=`medvika-profit-report-${$("profitFromDate").value}-to-${$("profitToDate").value}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function printReport(){
    const w=window.open("","_blank");

    if(!w){
      toast("Allow pop-ups to print.","warning");
      return;
    }

    w.document.write(`<!doctype html>
    <html>
    <head>
      <title>Profit & Loss Report</title>
      <style>
        body{font-family:Arial;padding:20px}
        table{width:100%;border-collapse:collapse;font-size:10px}
        th,td{border:1px solid #777;padding:5px;text-align:left}
      </style>
    </head>
    <body>
      <h1>Profit & Loss / Financial Report</h1>
      <p>${$("profitFromDate").value} to ${$("profitToDate").value}</p>
      ${document.querySelector(".summary-grid").outerHTML}
      <h2>${$("profitDetailTitle").textContent}</h2>
      ${document.getElementById("profitDetailTable").outerHTML}
      <h2>Expense Breakdown</h2>
      ${document.getElementById("expenseBreakdownTable").outerHTML}
      <script>window.onload=()=>window.print();<\/script>
    </body>
    </html>`);

    w.document.close();
  }

  $("profitFromDate").value=fyStart();
  $("profitToDate").value=today();

  [
    "profitFromDate",
    "profitToDate",
    "profitViewMode",
    "profitSearch"
  ].forEach(id=>{
    $(id).oninput=apply;
    $(id).onchange=apply;
  });

  $("exportProfitCsvButton").onclick=exportCsv;
  $("printProfitReportButton").onclick=printReport;
  $("refreshProfitReportButton").onclick=load;

  try{
    await load();
  }catch(error){
    toast("Profit Report could not load: "+error.message,"danger");
  }
};