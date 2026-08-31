window.initDamageExpiryModule = async function () {
  const UI = window.MedvikaUI;
  const $ = (id) => document.getElementById(id);
  const body = document.querySelector("#damageExpiryTable tbody");
  const toast = (message, type = "success") =>
    UI.toast(message, type === "danger" ? "error" : type);

  let cases = [];
  let lots = [];
  let selectedCase = null;
  let selectedLot = null;
  let followups = [];
  let suppliers = [];
  let busy = false;

  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const quantity = (value) => number(value).toFixed(3).replace(/\.?0+$/, "");

  function localDateKey(value) {
    if (!value) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function displayDate(value) {
    const key = localDateKey(value);
    if (!key) return "—";
    const [year, month, day] = key.split("-");
    return `${day}/${month}/${year}`;
  }

  const lotFor = (row) =>
    lots.find((lot) => lot.purchase_item_id === row.purchase_item_id) ||
    lots.find((lot) => lot.medicine_batch_id === row.medicine_batch_id) ||
    {};

  function isOpen(row) {
    return !["SETTLED", "CLOSED", "CANCELLED"].includes(row.status);
  }

  async function load() {
    const pharmacyId = window.MedvikaAuth.profile?.pharmacy_id;
    const [caseResult, lotResult, followupResult, supplierResult] = await Promise.all([
      supabaseClient
        .from("damage_expiry_register")
        .select("*")
        .eq("pharmacy_id", pharmacyId)
        .order("identified_date", { ascending: false }),
      supabaseClient
        .from("near_expiry_inventory_v1")
        .select("*")
        .eq("pharmacy_id", pharmacyId),
      supabaseClient
        .from("damage_expiry_followups")
        .select("*")
        .eq("pharmacy_id", pharmacyId)
        .order("followup_date", { ascending: false }),
      supabaseClient
        .from("suppliers")
        .select("id,name,contact_person,mobile,email")
        .eq("pharmacy_id", pharmacyId)
    ]);

    if (caseResult.error) throw caseResult.error;
    if (lotResult.error) throw lotResult.error;
    if (followupResult.error) throw followupResult.error;
    if (supplierResult.error) throw supplierResult.error;

    cases = caseResult.data || [];
    lots = lotResult.data || [];
    followups = followupResult.data || [];
    suppliers = supplierResult.data || [];
    addAutomaticCandidates();
    fillSuppliers();
    applyFilters();
  }

  function addAutomaticCandidates() {
    const existing = new Set(
      cases
        .filter(isOpen)
        .map((row) => `${row.medicine_batch_id}:${row.register_type}`)
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    lots.forEach((lot) => {
      if (number(lot.available_quantity) <= 0) return;

      const expiry = lot.expiry_date
        ? new Date(`${localDateKey(lot.expiry_date)}T00:00:00`)
        : null;
      const days = expiry ? Math.ceil((expiry - today) / 86400000) : null;
      let type = null;

      if (lot.expiry_status === "DAMAGED") type = "DAMAGED";
      else if (days !== null && days < 0) type = "EXPIRED";
      else if (
        lot.expiry_status === "NEAR_EXPIRY" ||
        (days !== null && days >= 0 && days <= 90)
      ) type = "NEAR_EXPIRY";

      const key = `${lot.medicine_batch_id}:${type}`;
      if (!type || existing.has(key)) return;

      cases.push({
        id: null,
        medicine_batch_id: lot.medicine_batch_id,
        purchase_item_id: lot.purchase_item_id,
        supplier_id: lot.claim_supplier_id,
        register_type: type,
        identified_date: localDateKey(new Date()),
        affected_quantity: number(lot.available_quantity),
        expected_claim_value: lot.claim_eligible ? number(lot.available_purchase_value) : 0,
        expected_deduction_percent: 0,
        settled_claim_value: 0,
        status: lot.is_blocked ? "BLOCKED" : "IDENTIFIED",
        _automatic: true
      });
      existing.add(key);
    });
  }

  function fillSuppliers() {
    const suppliers = new Map();
    lots.forEach((lot) => {
      if (lot.reference_supplier_id) suppliers.set(lot.reference_supplier_id, lot.supplier_name || "Supplier");
    });
    $("damageExpirySupplierFilter").innerHTML =
      '<option value="ALL">All Suppliers</option>' +
      [...suppliers]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([id, name]) => `<option value="${id}">${UI.safe(name)}</option>`)
        .join("");
  }

  function latestFollowup(row) {
    return followups.find((item) => item.damage_expiry_case_id === row.id) || null;
  }

  function supplierFor(lot) {
    return suppliers.find((supplier) => supplier.id === lot.claim_supplier_id) || null;
  }

  function isOverdue(row) {
    const latest = latestFollowup(row);
    return isOpen(row) && latest?.next_followup_date && latest.next_followup_date < localDateKey(new Date());
  }

  function isFollowupDue(row) {
    if (!isOpen(row) || !row.id) return false;
    const latest = latestFollowup(row);
    return !latest || !latest.next_followup_date || latest.next_followup_date <= localDateKey(new Date());
  }

  function renderFollowups() {
    if (!selectedCase?.id) {
      $("damageExpiryFollowupSection").hidden = true;
      return;
    }
    $("damageExpiryFollowupSection").hidden = false;
    const rows = followups.filter((item) => item.damage_expiry_case_id === selectedCase.id);
    $("damageExpiryFollowupHistory").innerHTML = rows.length ? rows.map((item) => `
      <article class="followup-item">
        <div><b>${UI.safe(item.followup_type.replaceAll("_", " "))}</b><span>${displayDate(item.followup_date)} • ${UI.safe(item.contact_method)}</span></div>
        <p>${UI.safe(item.notes)}</p>
        <small>${item.next_followup_date ? `Next: ${displayDate(item.next_followup_date)}` : "No next follow-up"}${item.promised_resolution_date ? ` • Promised: ${displayDate(item.promised_resolution_date)}` : ""}</small>
      </article>`).join("") : '<p class="empty">No follow-ups recorded.</p>';
  }

  function configureFollowupForm() {
    const linked = Boolean(selectedLot?.claim_eligible);
    $("deFollowupType").innerHTML = linked
      ? '<option value="SUPPLIER_CONTACTED">Supplier Contacted</option><option value="PICKUP_PROMISED">Pickup Promised</option><option value="CREDIT_PROMISED">Credit Promised</option><option value="REMINDER">Reminder</option><option value="NOTE">Note</option>'
      : '<option value="INTERNAL_ACTION">Internal Action</option><option value="NOTE">Note</option>';
    $("deContactMethod").innerHTML = linked
      ? '<option value="WHATSAPP">WhatsApp</option><option value="PHONE">Phone</option><option value="EMAIL">Email</option><option value="VISIT">Visit</option><option value="OTHER">Other</option>'
      : '<option value="INTERNAL">Internal</option>';
    $("deNextFollowup").value = "";
    $("dePromisedResolution").value = "";
    $("deFollowupNotes").value = "";
  }

  function applyFilters() {
    const search = $("damageExpirySearch").value.trim().toLowerCase();
    const type = $("damageExpiryTypeFilter").value;
    const status = $("damageExpiryStatusFilter").value;
    const supplier = $("damageExpirySupplierFilter").value;
    const openStatuses = ["IDENTIFIED", "BLOCKED", "PR_MEMO_CREATED", "PARTIALLY_SETTLED"];

    const filtered = cases.filter((row) => {
      const lot = lotFor(row);
      const text = [
        lot.brand_name,
        lot.generic_name,
        lot.batch_number,
        lot.supplier_name,
        lot.supplier_invoice_number
      ].filter(Boolean).join(" ").toLowerCase();

      return (!search || text.includes(search)) &&
        (type === "ALL" || row.register_type === type) &&
        (status === "ALL" || (status === "OPEN"
          ? openStatuses.includes(row.status)
          : status === "FOLLOWUP_DUE"
            ? isFollowupDue(row)
            : row.status === status)) &&
        (supplier === "ALL" || row.supplier_id === supplier || lot.reference_supplier_id === supplier);
    });

    render(filtered);
    renderSummary(filtered);
  }

  function render(rows) {
    body.innerHTML = rows.length
      ? rows.map((row) => {
          const lot = lotFor(row);
          const index = cases.indexOf(row);
          return `<tr>
            <td>${displayDate(row.identified_date)}</td>
            <td><b>${UI.safe(lot.brand_name || "Medicine")}</b><small>${UI.safe(lot.generic_name || "")}</small></td>
            <td>${UI.safe(lot.supplier_name || "Internal stock")}<small>${lot.claim_eligible ? "Purchase linked" : "No supplier claim"}</small></td>
            <td>${UI.safe(lot.supplier_invoice_number || "—")}</td>
            <td>${UI.safe(lot.batch_number || "—")}</td>
            <td>${displayDate(lot.expiry_date)}</td>
            <td>${UI.safe(row.register_type)}</td>
            <td>${quantity(row.affected_quantity)}</td>
            <td>${UI.money(row.expected_claim_value)}</td>
            <td class="${isOverdue(row) ? "overdue" : ""}">${latestFollowup(row)?.next_followup_date ? displayDate(latestFollowup(row).next_followup_date) : "—"}</td>
            <td><span class="status ${row.status === "SETTLED" ? "status-settled" : row.status === "CLOSED" ? "status-closed" : "status-open"}">${UI.safe(row.status)}</span></td>
            <td><button class="manage-case" data-index="${index}">${row._automatic ? "Review" : "Manage"}</button></td>
          </tr>`;
        }).join("")
      : '<tr><td colspan="12" class="empty">No matching cases.</td></tr>';

    $("damageExpiryResultCount").textContent = `${rows.length} records`;
    document.querySelectorAll(".manage-case").forEach((button) => {
      button.onclick = () => openCase(Number(button.dataset.index));
    });
  }

  function renderSummary(rows) {
    const open = rows.filter(isOpen);
    $("damageExpiryOpenCount").textContent = open.length;
    $("damageExpiryOverdueCount").textContent = open.filter(isOverdue).length;
    $("damageExpiryNearQty").textContent = quantity(
      rows.filter((row) => row.register_type === "NEAR_EXPIRY")
        .reduce((sum, row) => sum + number(row.affected_quantity), 0)
    );
    $("damageExpiryExpiredQty").textContent = quantity(
      rows.filter((row) => row.register_type === "EXPIRED")
        .reduce((sum, row) => sum + number(row.affected_quantity), 0)
    );
    $("damageExpiryDamagedQty").textContent = quantity(
      rows.filter((row) => row.register_type === "DAMAGED")
        .reduce((sum, row) => sum + number(row.affected_quantity), 0)
    );
    $("damageExpiryPendingValue").textContent = UI.money(
      open.reduce(
        (sum, row) =>
          sum + Math.max(0, number(row.expected_claim_value) - number(row.settled_claim_value)),
        0
      )
    );
    $("damageExpirySettledValue").textContent = UI.money(
      rows.reduce((sum, row) => sum + number(row.settled_claim_value), 0)
    );
  }

  function openCase(index) {
    selectedCase = cases[index];
    selectedLot = lotFor(selectedCase);
    const editable = !selectedCase.id || ["IDENTIFIED", "BLOCKED"].includes(selectedCase.status);

    $("damageExpiryActionPanel").hidden = false;
    $("damageExpiryActionTitle").textContent =
      `${selectedLot.brand_name || "Medicine"} — ${selectedLot.batch_number || "Batch"}`;
    $("damageExpiryActionSubTitle").textContent =
      `${selectedLot.claim_eligible ? (selectedLot.supplier_name || "Supplier") : "Internal action — no supplier claim"} • ${selectedCase.status}`;
    $("deMedicine").textContent =
      [selectedLot.brand_name, selectedLot.generic_name].filter(Boolean).join(" / ") || "—";
    $("deSupplier").textContent = selectedLot.claim_eligible ? (selectedLot.supplier_name || "—") : "Internal action";
    const supplier = supplierFor(selectedLot);
    $("deSupplierContact").textContent = supplier
      ? [supplier.contact_person, supplier.mobile, supplier.email].filter(Boolean).join(" • ") || "Not recorded"
      : "Not applicable";
    $("deBatch").textContent = selectedLot.batch_number || "—";
    $("deAvailableQty").textContent = quantity(selectedLot.available_quantity);
    $("deForecastQty").textContent = selectedCase.forecast_quantity == null ? "Not calculated" : quantity(selectedCase.forecast_quantity);
    $("deForecastValue").textContent = selectedCase.forecast_value == null ? "—" : UI.money(selectedCase.forecast_value);
    $("deForecastUpdated").textContent = selectedCase.forecast_updated_at
      ? new Date(selectedCase.forecast_updated_at).toLocaleString("en-IN")
      : "Not calculated";
    $("deRegisterType").value = selectedCase.register_type;
    $("deAffectedQty").value = selectedCase.affected_quantity || selectedLot.available_quantity || "";
    $("deExpectedDeduction").value = selectedCase.expected_deduction_percent || 0;
    $("deExpectedClaimValue").value =
      selectedCase.expected_claim_value || (selectedLot.claim_eligible ? selectedLot.available_purchase_value : 0) || 0;
    $("deNotes").value = selectedCase.notes || "";

    ["deRegisterType", "deAffectedQty", "deNotes"]
      .forEach((id) => { $(id).disabled = !editable; });
    ["deExpectedDeduction", "deExpectedClaimValue"]
      .forEach((id) => { $(id).disabled = !editable || !selectedLot.claim_eligible; });
    $("saveDamageExpiryCaseButton").disabled = !editable;
    const forecastReviewable = selectedCase.id && editable && selectedCase.register_type === "NEAR_EXPIRY"
      && !selectedCase.purchase_return_memo_id && !selectedCase.stock_adjustment_id;
    $("refreshCaseForecastButton").disabled = !forecastReviewable;
    $("applyCaseForecastButton").disabled = !forecastReviewable || number(selectedCase.forecast_quantity) <= 0;
    $("createPrMemoFromCaseButton").disabled =
      !selectedCase.id || !editable || !selectedLot.claim_eligible || !selectedLot.purchase_item_id;
    $("createInternalWriteoffButton").disabled =
      !selectedCase.id || !editable || selectedLot.claim_eligible;
    const supplierContact = supplierFor(selectedLot);
    $("openSupplierWhatsAppButton").disabled =
      !selectedCase.id || !selectedLot.claim_eligible || !normalizedWhatsAppNumber(supplierContact?.mobile);
    $("copySupplierClaimButton").disabled = !selectedCase.id || !selectedLot.claim_eligible;
    $("closeDamageExpiryCaseButton").disabled = !selectedCase.id || !editable;
    $("addDamageExpiryFollowupButton").disabled = !selectedCase.id || !isOpen(selectedCase);
    configureFollowupForm();
    renderFollowups();
    $("damageExpiryActionPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function reviewForecast(applyToCase) {
    if (busy || !selectedCase?.id) return;
    if (applyToCase && !window.confirm(
      `Replace affected quantity ${quantity(selectedCase.affected_quantity)} with forecast ${quantity(selectedCase.forecast_quantity)}?`
    )) return;

    const caseId = selectedCase.id;
    busy = true;
    $("refreshCaseForecastButton").disabled = true;
    $("applyCaseForecastButton").disabled = true;
    try {
      const { data, error } = await supabaseClient.rpc("review_near_expiry_case_forecast_v1", {
        p_case_id: caseId,
        p_apply_to_case: applyToCase
      });
      if (error) throw error;
      toast(applyToCase
        ? `Forecast ${quantity(data.forecast_quantity)} applied to the case.`
        : `Forecast refreshed to ${quantity(data.forecast_quantity)}.`);
      await load();
      const index = cases.findIndex((row) => row.id === caseId);
      if (index >= 0) openCase(index);
    } catch (error) {
      toast(error.message, "danger");
    } finally {
      busy = false;
    }
  }

  async function saveCase() {
    if (busy || !selectedLot) return;

    const affected = number($("deAffectedQty").value);
    if (affected <= 0 || affected > number(selectedLot.available_quantity)) {
      toast(`Affected quantity must be between 0 and ${quantity(selectedLot.available_quantity)}.`, "warning");
      return;
    }

    busy = true;
    $("saveDamageExpiryCaseButton").disabled = true;
    try {
      const { error } = await supabaseClient.rpc("upsert_damage_expiry_case_v1", {
        p_case_id: selectedCase?.id || null,
        p_medicine_batch_id: selectedLot.medicine_batch_id,
        p_purchase_item_id: selectedLot.purchase_item_id,
        p_register_type: $("deRegisterType").value,
        p_affected_quantity: affected,
        p_expected_deduction_percent: number($("deExpectedDeduction").value),
        p_expected_claim_value: number($("deExpectedClaimValue").value),
        p_notes: $("deNotes").value.trim() || null
      });
      if (error) throw error;

      toast(
        ["EXPIRED", "DAMAGED"].includes($("deRegisterType").value)
          ? "Case saved and batch quarantined."
          : "Case saved."
      );
      $("damageExpiryActionPanel").hidden = true;
      await load();
    } catch (error) {
      toast(error.message, "danger");
    } finally {
      busy = false;
    }
  }

  function openNearExpiryInSales() {
    if (!selectedCase?.id || !selectedLot?.medicine_batch_id) {
      toast("Select a saved near-expiry case first.", "warning");
      return;
    }
    if (selectedCase.register_type !== "NEAR_EXPIRY") {
      toast("Only near-expiry stock can be handed to priority sales.", "warning");
      return;
    }
    if (Number(selectedLot.quantity_available || 0) <= 0 || selectedLot.is_blocked) {
      toast("This batch is not currently saleable.", "warning");
      return;
    }

    sessionStorage.setItem("medvikaNearExpirySalesHandoff", JSON.stringify({
      case_id: selectedCase.id,
      medicine_id: selectedCase.medicine_id || selectedLot.medicine_id,
      medicine_batch_id: selectedLot.medicine_batch_id,
      brand_name: selectedLot.brand_name || "",
      batch_number: selectedLot.batch_number || ""
    }));
    location.hash = "sales";
  }

  async function addFollowup() {
    if (busy || !selectedCase?.id) {
      toast("Save the case before adding a follow-up.", "warning");
      return;
    }
    const notes = $("deFollowupNotes").value.trim();
    if (!notes) {
      toast("Enter follow-up notes.", "warning");
      return;
    }
    busy = true;
    $("addDamageExpiryFollowupButton").disabled = true;
    try {
      const { error } = await supabaseClient.rpc("add_damage_expiry_followup_v1", {
        p_case_id: selectedCase.id,
        p_followup_type: $("deFollowupType").value,
        p_contact_method: $("deContactMethod").value,
        p_next_followup_date: $("deNextFollowup").value || null,
        p_promised_resolution_date: $("dePromisedResolution").value || null,
        p_notes: notes
      });
      if (error) throw error;
      toast("Follow-up recorded.");
      await load();
      const index = cases.findIndex((row) => row.id === selectedCase.id);
      if (index >= 0) openCase(index);
    } catch (error) {
      toast(error.message, "danger");
    } finally {
      busy = false;
    }
  }

  function supplierClaimMessage() {
    if (!selectedCase?.id || !selectedLot?.claim_eligible) return "";
    const supplier = supplierFor(selectedLot) || {};
    const contact = supplier.contact_person || supplier.name || selectedLot.supplier_name || "Supplier";
    const type = String(selectedCase.register_type || "NEAR_EXPIRY").replaceAll("_", " ").toLowerCase();
    const invoice = selectedLot.supplier_invoice_number || selectedLot.purchase_number || "linked purchase invoice";
    return [
      `Dear ${contact},`,
      "",
      `Please review the following ${type} stock supplied against ${invoice}:`,
      `Medicine: ${selectedLot.brand_name || "Medicine"}`,
      `Batch: ${selectedLot.batch_number || "—"}`,
      `Expiry: ${displayDate(selectedLot.expiry_date)}`,
      `Quantity: ${quantity(selectedCase.affected_quantity)}`,
      `Expected claim value: ${UI.money(selectedCase.expected_claim_value)}`,
      "",
      "Kindly confirm pickup/return acceptance and expected credit-note date.",
      `Reference: Damage & Expiry case ${selectedCase.id.slice(0, 8).toUpperCase()}`
    ].join("\n");
  }

  function normalizedWhatsAppNumber(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    if (digits.length === 10) digits = "91" + digits;
    return /^91[6-9]\d{9}$/.test(digits) ? digits : "";
  }

  function prepareContactFollowup(method, note) {
    if (!$("damageExpiryFollowupSection").hidden) {
      $("deFollowupType").value = "SUPPLIER_CONTACTED";
      $("deContactMethod").value = method;
      $("deFollowupNotes").value = note;
    }
  }

  function openSupplierWhatsApp() {
    const supplier = supplierFor(selectedLot);
    const mobile = normalizedWhatsAppNumber(supplier?.mobile);
    const message = supplierClaimMessage();
    if (!message || !mobile) {
      toast("A valid Indian supplier mobile number and purchase-linked case are required.", "warning");
      return;
    }
    prepareContactFollowup("WHATSAPP", "WhatsApp claim message prepared; confirm after sending.");
    window.open(`https://wa.me/${mobile}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  async function copySupplierClaim() {
    const message = supplierClaimMessage();
    if (!message) {
      toast("Supplier claim message is available only for purchase-linked cases.", "warning");
      return;
    }
    try {
      await navigator.clipboard.writeText(message);
    } catch (_) {
      const area = document.createElement("textarea");
      area.value = message; area.style.position = "fixed"; area.style.opacity = "0";
      document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
    }
    prepareContactFollowup("OTHER", "Supplier claim message copied; record the actual communication method after sending.");
    toast("Supplier claim message copied.");
  }

  function createMemo() {
    if (!selectedCase?.id) {
      toast("Save the case before creating a PR Memo.", "warning");
      return;
    }
    if (!selectedLot.claim_eligible || !selectedLot.purchase_item_id) {
      toast("This is an internal action because no purchase invoice is linked. Close it with resolution notes instead.", "warning");
      return;
    }

    sessionStorage.setItem("medvika_pr_prefill", JSON.stringify({
      supplier_id: selectedLot.claim_supplier_id,
      purchase_item_id: selectedLot.purchase_item_id,
      medicine_batch_id: selectedLot.medicine_batch_id,
      brand_name: selectedLot.brand_name,
      batch_number: selectedLot.batch_number,
      return_reason: selectedCase.register_type === "DAMAGED"
        ? "Damaged stock"
        : selectedCase.register_type === "EXPIRED"
          ? "Expired stock"
          : "Near expiry stock",
      quantity: number($("deAffectedQty").value),
      expected_deduction_percent: number($("deExpectedDeduction").value),
      notes: $("deNotes").value.trim() || null,
      damage_expiry_case_id: selectedCase.id
    }));
    window.MedvikaRouter.navigate("pr-memo");
  }

  function createInternalWriteoff() {
    if (!selectedCase?.id || !selectedLot?.medicine_batch_id) {
      toast("Save the case before creating an internal write-off.", "warning");
      return;
    }
    if (selectedLot.claim_eligible) {
      toast("This purchase-linked case should use the supplier PR Memo workflow.", "warning");
      return;
    }
    const affected = number(selectedCase.affected_quantity);
    if (affected <= 0 || affected > number(selectedLot.available_quantity)) {
      toast("Review the affected quantity before creating the write-off.", "warning");
      return;
    }
    const reason = selectedCase.register_type === "DAMAGED"
      ? "DAMAGE_WRITE_OFF"
      : "EXPIRY_WRITE_OFF";
    sessionStorage.setItem("medvika_stock_adjustment_prefill", JSON.stringify({
      damage_expiry_case_id: selectedCase.id,
      medicine_batch_id: selectedLot.medicine_batch_id,
      affected_quantity: affected,
      reason,
      notes: `Internal disposition for ${selectedCase.register_type.replaceAll("_", " ").toLowerCase()} case ${selectedCase.id.slice(0,8).toUpperCase()}`
    }));
    window.MedvikaRouter.navigate("stock-adjustment");
  }

  async function closeCase() {
    if (busy || !selectedCase?.id) {
      toast("Save the case before closing.", "warning");
      return;
    }

    const notes = $("deNotes").value.trim();
    if (!notes) {
      toast("Enter closure notes explaining how the case was resolved.", "warning");
      return;
    }
    if (!window.confirm("Close this case without creating a PR Memo?")) return;

    busy = true;
    $("closeDamageExpiryCaseButton").disabled = true;
    try {
      const { error } = await supabaseClient.rpc("close_damage_expiry_case_v1", {
        p_case_id: selectedCase.id,
        p_notes: notes
      });
      if (error) throw error;
      toast("Case closed.");
      $("damageExpiryActionPanel").hidden = true;
      await load();
    } catch (error) {
      toast(error.message, "danger");
    } finally {
      busy = false;
    }
  }

  ["damageExpirySearch", "damageExpiryTypeFilter", "damageExpiryStatusFilter", "damageExpirySupplierFilter"]
    .forEach((id) => {
      $(id).oninput = applyFilters;
      $(id).onchange = applyFilters;
    });

  $("refreshDamageExpiryButton").onclick = load;
  $("saveDamageExpiryCaseButton").onclick = saveCase;
  $("refreshCaseForecastButton").onclick = () => reviewForecast(false);
  $("applyCaseForecastButton").onclick = () => reviewForecast(true);
  $("createPrMemoFromCaseButton").onclick = createMemo;
  $("createInternalWriteoffButton").onclick = createInternalWriteoff;
  $("closeDamageExpiryCaseButton").onclick = closeCase;
  $("addDamageExpiryFollowupButton").onclick = addFollowup;
  $("openNearExpiryInSalesButton").onclick = openNearExpiryInSales;
  $("openSupplierWhatsAppButton").onclick = openSupplierWhatsApp;
  $("copySupplierClaimButton").onclick = copySupplierClaim;
  $("closeDamageExpiryPanelButton").onclick = () => {
    $("damageExpiryActionPanel").hidden = true;
  };

  const incomingFilter = sessionStorage.getItem("medvikaDashboardFilter:damage-expiry");
  if (incomingFilter === "followup-due") {
    $("damageExpiryStatusFilter").value = "FOLLOWUP_DUE";
    sessionStorage.removeItem("medvikaDashboardFilter:damage-expiry");
  }

  try {
    await load();
  } catch (error) {
    toast("Damage & Expiry Register could not load: " + error.message, "danger");
  }
};
