window.initNearExpiryModule = async function () {
  const UI = window.MedvikaUI;
  const $ = (id) => document.getElementById(id);
  const body = document.querySelector("#nearExpiryTable tbody");
  const toast = (message, type = "success") => UI.toast(message, type === "danger" ? "error" : type);

  let lots = [];
  let visible = [];
  let sales = [];
  let salesItems = [];
  let velocityByBatch = new Map();
  let selected = new Set();
  let resolvedSellThroughCases = 0;
  let preventedExpiryValue = 0;
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const quantity = (value) => number(value).toFixed(3).replace(/\.?0+$/, "");

  function daysLeft(value) {
    if (!value) return null;
    const expiry = new Date(value + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((expiry - today) / 86400000);
  }

  function first(row, names, fallback = null) {
    for (const name of names) {
      if (row && row[name] !== undefined && row[name] !== null && row[name] !== "") return row[name];
    }
    return fallback;
  }

  function localDateKey(value) {
    if (!value) return "";
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return [date.getFullYear(), String(date.getMonth()+1).padStart(2,"0"), String(date.getDate()).padStart(2,"0")].join("-");
  }

  function buildSalesVelocity() {
    const cutoff = new Date();
    cutoff.setHours(0,0,0,0);
    cutoff.setDate(cutoff.getDate()-29);
    const validInvoices = new Set(sales.filter(invoice => {
      const status = String(first(invoice,["invoice_status","status"],"POSTED")).toUpperCase();
      const key = localDateKey(first(invoice,["invoice_date","sale_date","created_at"]));
      const date = key ? new Date(key+"T00:00:00") : null;
      return status !== "CANCELLED" && date && !Number.isNaN(date.getTime()) && date >= cutoff;
    }).map(invoice => invoice.id));
    velocityByBatch = new Map();
    salesItems.forEach(item => {
      const invoiceId = first(item,["sales_invoice_id","invoice_id"]);
      const batchId = first(item,["medicine_batch_id","batch_id"]);
      if (!batchId || !validInvoices.has(invoiceId)) return;
      velocityByBatch.set(batchId, number(velocityByBatch.get(batchId)) + number(first(item,["quantity","sold_quantity"],0)));
    });
  }

  function riskFor(lot) {
    const days = Math.max(0, daysLeft(lot.expiry_date) || 0);
    const sold30 = number(velocityByBatch.get(lot.medicine_batch_id));
    const daily = sold30 / 30;
    const projectedQty = Math.max(0, number(lot.available_quantity) - daily * days);
    const projectedValue = projectedQty * number(lot.purchase_rate);
    let action = "SELL THROUGH";
    if (projectedQty > 0.0005 && lot.claim_eligible) action = "SUPPLIER RETURN";
    else if (projectedQty > 0.0005 && days <= 7) action = "URGENT DISPOSITION";
    else if (projectedQty > 0.0005 && days <= 30) action = "PROMOTE / DISPOSE";
    else if (projectedQty > 0.0005) action = "TRANSFER / PROMOTE";
    return {sold30,daily,projectedQty,projectedValue,action};
  }

  function sourceLabel(lot) {
    if (lot.claim_eligible) return "Supplier claim";
    if (lot.reference_supplier_id) return "Supplier reference only";
    return "Internal stock";
  }

  function renderAutomationHealth(data, error) {
    const badge = $("nearExpiryAutomationHealth");
    if (!badge) return;
    if (error || !data) {
      badge.className = "automation-health overdue";
      badge.textContent = "Health unavailable";
      badge.title = error?.message || "The automation health check did not return data.";
      return;
    }

    const completed = data.completed_at ? new Date(data.completed_at) : null;
    const completedText = completed && !Number.isNaN(completed.getTime())
      ? completed.toLocaleString("en-IN", {dateStyle:"medium",timeStyle:"short"})
      : "No completed run";
    badge.className = `automation-health ${data.is_healthy ? "healthy" : "overdue"}`;
    badge.textContent = data.is_healthy
      ? `Healthy • Last completed ${completedText}`
      : `${data.status === "FAILED" ? "Failed" : "Overdue"} • ${completedText}`;
    badge.title = data.message || "";
  }

  async function load() {
    const pharmacyId = window.MedvikaAuth.profile?.pharmacy_id;
    const [lotResult, caseResult, salesResult, salesItemResult, healthResult] = await Promise.all([
      supabaseClient.from("near_expiry_inventory_v1").select("*").eq("pharmacy_id", pharmacyId).limit(20000),
      supabaseClient.from("damage_expiry_register").select("medicine_batch_id,status,forecast_value,resolution_type,resolved_at")
        .eq("pharmacy_id", pharmacyId).eq("register_type", "NEAR_EXPIRY"),
      supabaseClient.from("sales_invoices").select("*").eq("pharmacy_id", pharmacyId).limit(20000),
      supabaseClient.from("sales_items").select("*").eq("pharmacy_id", pharmacyId).limit(50000),
      supabaseClient.rpc("get_expiry_automation_health_v1")
    ]);
    renderAutomationHealth(healthResult.data, healthResult.error);
    if (lotResult.error) throw lotResult.error;
    if (caseResult.error) throw caseResult.error;
    if (salesResult.error) throw salesResult.error;
    if (salesItemResult.error) throw salesItemResult.error;
    sales = salesResult.data || [];
    salesItems = salesItemResult.data || [];
    buildSalesVelocity();

    const openBatches = new Set((caseResult.data || [])
      .filter((row) => !["SETTLED", "CLOSED", "CANCELLED"].includes(row.status))
      .map((row) => row.medicine_batch_id));

    const resolvedCases = (caseResult.data || []).filter(
      (row) => row.status === "CLOSED" && row.resolution_type === "AUTO_SELL_THROUGH"
    );
    resolvedSellThroughCases = resolvedCases.length;
    preventedExpiryValue = resolvedCases.reduce(
      (sum, row) => sum + number(row.forecast_value),
      0
    );

    lots = (lotResult.data || []).map((lot) => ({
      ...lot,
      has_open_case: openBatches.has(lot.medicine_batch_id)
    }));
    selected = new Set([...selected].filter((id) => lots.some((lot) => lot.medicine_batch_id === id && !lot.has_open_case)));
    fillSuppliers();
    apply();
  }

  function fillSuppliers() {
    const suppliers = new Map();
    lots.forEach((lot) => {
      if (lot.reference_supplier_id) suppliers.set(lot.reference_supplier_id, lot.supplier_name || "Supplier");
    });
    $("nearExpirySupplier").innerHTML =
      '<option value="ALL">All Suppliers</option>' +
      [...suppliers.entries()].sort((a, b) => a[1].localeCompare(b[1]))
        .map(([id, name]) => `<option value="${id}">${UI.safe(name)}</option>`).join("");
  }

  function apply() {
    const windowDays = number($("nearExpiryWindow").value);
    const supplier = $("nearExpirySupplier").value;
    const source = $("nearExpirySource").value;
    const minimum = number($("nearExpiryMinQty").value);
    const search = $("nearExpirySearch").value.trim().toLowerCase();

    visible = lots.filter((lot) => {
      const days = daysLeft(lot.expiry_date);
      const text = [lot.brand_name, lot.generic_name, lot.batch_number, lot.supplier_name,
        lot.supplier_invoice_number, lot.purchase_number].filter(Boolean).join(" ").toLowerCase();
      const sourceMatch = source === "ALL" ||
        (source === "LINKED" && lot.claim_eligible) ||
        (source === "INTERNAL" && !lot.claim_eligible);
      return number(lot.available_quantity) > minimum &&
        days !== null && days >= 0 && days <= windowDays &&
        (supplier === "ALL" || lot.reference_supplier_id === supplier) &&
        sourceMatch && (!search || text.includes(search));
    }).sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)) ||
      String(a.brand_name).localeCompare(String(b.brand_name)));

    render();
    summary();
  }

  function render() {
    body.innerHTML = visible.length ? visible.map((lot) => {
      const days = daysLeft(lot.expiry_date);
      const risk = riskFor(lot);
      const disabled = lot.has_open_case || risk.projectedQty <= 0.0005;
      const actionClass = risk.action === "SELL THROUGH" ? "risk-safe" : risk.action === "SUPPLIER RETURN" ? "risk-claim" : "risk-urgent";
      return `<tr>
        <td><input type="checkbox" class="near-expiry-select" data-id="${lot.medicine_batch_id}"
          ${selected.has(lot.medicine_batch_id) ? "checked" : ""} ${disabled ? "disabled" : ""}></td>
        <td><b>${UI.safe(lot.brand_name || "Medicine")}</b><small>${UI.safe(lot.generic_name || "")}</small></td>
        <td>${UI.safe(lot.supplier_name || "—")}<small>${UI.safe(lot.supplier_invoice_number || "No invoice link")}</small></td>
        <td><span class="traceability ${lot.claim_eligible ? "trace-linked" : "trace-internal"}">${sourceLabel(lot)}</span></td>
        <td>${UI.safe(lot.batch_number || "—")}</td>
        <td>${UI.safe(lot.expiry_date || "—")}</td>
        <td class="${days <= 30 ? "critical" : "warning"}">${days}</td>
        <td>${quantity(lot.available_quantity)}</td>
        <td>${UI.money(lot.purchase_rate)}</td>
        <td>${UI.money(lot.available_purchase_value)}</td>
        <td>${quantity(risk.sold30)}</td>
        <td>${quantity(risk.projectedQty)}<small>${UI.money(risk.projectedValue)}</small></td>
        <td><span class="risk-action ${actionClass}">${risk.action}</span><small>${disabled ? "Case open" : "Ready"}</small></td>
      </tr>`;
    }).join("") : '<tr><td colspan="13" class="empty">No near-expiry stock in this window.</td></tr>';

    $("nearExpiryResultCount").textContent = visible.length + " batches";
    document.querySelectorAll(".near-expiry-select").forEach((element) => {
      element.onchange = () => {
        if (element.checked) selected.add(element.dataset.id);
        else selected.delete(element.dataset.id);
        summary();
      };
    });
  }

  function summary() {
    const medicines = new Set(visible.map((lot) => lot.medicine_id));
    $("nearExpiryLotCount").textContent = visible.length;
    $("nearExpiryMedicineCount").textContent = medicines.size;
    $("nearExpiryLinkedCount").textContent = visible.filter((lot) => lot.claim_eligible).length;
    $("nearExpiryInternalCount").textContent = visible.filter((lot) => !lot.claim_eligible).length;
    $("nearExpiryQty").textContent = quantity(visible.reduce((sum, lot) => sum + number(lot.available_quantity), 0));
    $("nearExpiryExposureValue").textContent = UI.money(visible.reduce((sum, lot) => sum + number(lot.available_purchase_value), 0));
    $("nearExpiryAtRiskValue").textContent = UI.money(visible.reduce((sum, lot) => sum + riskFor(lot).projectedValue, 0));
    $("nearExpirySelectedValue").textContent = UI.money(visible.filter((lot) => selected.has(lot.medicine_batch_id))
      .reduce((sum, lot) => sum + riskFor(lot).projectedValue, 0));
    $("nearExpiryResolvedCount").textContent = resolvedSellThroughCases;
    $("nearExpiryPreventedValue").textContent = UI.money(preventedExpiryValue);
  }

  async function createCases() {
    const chosen = lots.filter((lot) =>
      selected.has(lot.medicine_batch_id) &&
      !lot.has_open_case &&
      riskFor(lot).projectedQty > 0.0005
    );
    if (!chosen.length) {
      toast("Select at least one batch with projected stock remaining at expiry.", "warning");
      return;
    }
    const payload = chosen.map((lot) => ({
      medicine_batch_id: lot.medicine_batch_id,
      purchase_item_id: lot.claim_eligible ? lot.purchase_item_id : null,
      quantity: Number(riskFor(lot).projectedQty.toFixed(3))
    }));
    const { data, error } = await supabaseClient.rpc("create_near_expiry_cases_v1", { p_items: payload });
    if (error) {
      toast(error.message, "danger");
      return;
    }
    const skipped = number(data?.skipped_cases);
    toast(`${number(data?.created_cases)} case(s) created${skipped ? `; ${skipped} already open or ineligible` : ""}.`);
    selected.clear();
    await load();
    window.MedvikaRouter.navigate("damage-expiry");
  }

  $("selectAllNearExpiryButton").onclick = () => {
    visible.filter((lot) => !lot.has_open_case && riskFor(lot).projectedQty > 0.0005)
      .forEach((lot) => selected.add(lot.medicine_batch_id));
    render(); summary();
  };
  $("clearNearExpirySelectionButton").onclick = () => { selected.clear(); render(); summary(); };
  $("createNearExpiryCasesButton").onclick = createCases;
  $("refreshNearExpiryButton").onclick = load;
  ["nearExpiryWindow", "nearExpirySupplier", "nearExpirySource", "nearExpiryMinQty", "nearExpirySearch"].forEach((id) => {
    $(id).oninput = apply;
    $(id).onchange = apply;
  });

  try { await load(); }
  catch (error) { toast("Near Expiry Automation could not load: " + error.message, "danger"); }
};