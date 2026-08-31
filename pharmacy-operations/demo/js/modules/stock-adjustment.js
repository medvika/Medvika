window.initStockAdjustmentModule = async function () {
  const UI = window.MedvikaUI;
  const $ = (id) => document.getElementById(id);
  const toast = (message, type = "success") =>
    UI.toast(message, type === "danger" ? "error" : type);

  const registerBody = document.querySelector("#stockAdjustmentsTable tbody");
  const detailBody = document.querySelector("#adjustmentDetailTable tbody");
  const composerBody = document.querySelector("#adjustmentComposerTable tbody");

  let adjustments = [];
  let adjustmentItems = [];
  let lots = [];
  let batches = [];
  let filtered = [];
  let stagedLines = [];
  let selectedAdjustment = null;
  let posting = false;
  let dispositionCaseId = null;

  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const quantity = (value) => number(value).toFixed(3).replace(/\.?0+$/, "");

  function dateKey(value) {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function localDateTimeInput() {
    const date = new Date();
    return `${dateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function monthStart() {
    const date = new Date();
    date.setDate(1);
    return dateKey(date);
  }

  function batchFor(id) {
    return batches.find((row) => row.id === id) || {};
  }

  function representativeLots() {
    const result = new Map();
    lots
      .slice()
      .sort((a, b) => String(b.purchase_date || "").localeCompare(String(a.purchase_date || "")))
      .forEach((lot) => {
        if (!result.has(lot.medicine_batch_id)) result.set(lot.medicine_batch_id, lot);
      });
    return [...result.values()];
  }

  function currentQuantity(lot) {
    const batch = batchFor(lot.medicine_batch_id);
    return number(batch.quantity_available ?? lot.batch_quantity_available);
  }

  function effectiveCost(lot) {
    const batch = batchFor(lot.medicine_batch_id);
    return number(batch.cost_rate ?? lot.cost_rate ?? lot.purchase_rate);
  }

  async function load() {
    const pharmacyId = window.MedvikaAuth.profile?.pharmacy_id;
    const [adjustmentResult, itemResult, lotResult, batchResult] = await Promise.all([
      supabaseClient
        .from("stock_adjustments")
        .select("*")
        .eq("pharmacy_id", pharmacyId)
        .order("adjustment_date", { ascending: false }),
      supabaseClient
        .from("stock_adjustment_items")
        .select("*")
        .eq("pharmacy_id", pharmacyId),
      supabaseClient
        .from("near_expiry_inventory_v1")
        .select("*")
        .eq("pharmacy_id", pharmacyId),
      supabaseClient
        .from("medicine_batches")
        .select("id,quantity_available,cost_rate,purchase_rate")
        .eq("pharmacy_id", pharmacyId)
    ]);

    const error = [adjustmentResult, itemResult, lotResult, batchResult]
      .find((result) => result.error)?.error;
    if (error) throw error;

    adjustments = adjustmentResult.data || [];
    adjustmentItems = itemResult.data || [];
    lots = lotResult.data || [];
    batches = batchResult.data || [];
    applyFilters();
    renderComposer();
  }

  function itemsFor(adjustmentId) {
    return adjustmentItems.filter((row) => row.stock_adjustment_id === adjustmentId);
  }

  function applyFilters() {
    const search = $("stockAdjustmentSearch").value.trim().toLowerCase();
    const source = $("stockAdjustmentSourceFilter").value;
    const from = $("stockAdjustmentFromDate").value;
    const to = $("stockAdjustmentToDate").value;

    filtered = adjustments.filter((adjustment) => {
      const text = [
        adjustment.adjustment_number,
        adjustment.source_type,
        adjustment.adjustment_type,
        adjustment.notes,
        ...itemsFor(adjustment.id).map((item) => {
          const lot = lots.find((row) => row.medicine_batch_id === item.medicine_batch_id) || {};
          return [lot.brand_name, lot.batch_number, lot.supplier_name].join(" ");
        })
      ].join(" ").toLowerCase();
      const date = new Date(adjustment.adjustment_date);

      return (!search || text.includes(search)) &&
        (source === "ALL" || adjustment.source_type === source) &&
        (!from || date >= new Date(from + "T00:00:00")) &&
        (!to || date <= new Date(to + "T23:59:59"));
    });

    renderRegister();
    renderSummary();
  }

  function renderRegister() {
    registerBody.innerHTML = filtered.length
      ? filtered.map((adjustment) => {
          const items = itemsFor(adjustment.id);
          const quantityChange = adjustment.total_quantity_change ??
            items.reduce((sum, item) => sum + number(item.difference_quantity), 0);
          const valueChange = adjustment.total_value_change ??
            items.reduce((sum, item) => sum + number(item.difference_value), 0);

          return `<tr>
            <td><b>${UI.safe(adjustment.adjustment_number)}</b></td>
            <td>${new Date(adjustment.adjustment_date).toLocaleString("en-IN")}</td>
            <td>${UI.safe(adjustment.source_type || "—")}</td>
            <td>${adjustment.total_lines || items.length}</td>
            <td class="${quantityChange < 0 ? "negative" : "positive"}">${quantity(quantityChange)}</td>
            <td class="${valueChange < 0 ? "negative" : "positive"}">${UI.money(valueChange)}</td>
            <td><button class="view-adjustment" data-id="${adjustment.id}">View</button></td>
          </tr>`;
        }).join("")
      : '<tr><td colspan="7" class="empty">No matching adjustments.</td></tr>';

    $("stockAdjustmentResultCount").textContent = `${filtered.length} records`;
    document.querySelectorAll(".view-adjustment").forEach((button) => {
      button.onclick = () => openDetail(button.dataset.id);
    });
  }

  function renderSummary() {
    const items = filtered.flatMap((adjustment) => itemsFor(adjustment.id));
    const netQuantity = items.reduce((sum, item) => sum + number(item.difference_quantity), 0);
    const netValue = items.reduce((sum, item) => sum + number(item.difference_value), 0);

    $("adjustmentDocumentCount").textContent = filtered.length;
    $("adjustmentLineCount").textContent = items.length;
    $("adjustmentShortageQty").textContent = quantity(
      items.reduce((sum, item) => sum + Math.max(0, -number(item.difference_quantity)), 0)
    );
    $("adjustmentExcessQty").textContent = quantity(
      items.reduce((sum, item) => sum + Math.max(0, number(item.difference_quantity)), 0)
    );
    $("adjustmentNetQty").textContent = quantity(netQuantity);
    $("adjustmentNetValue").textContent = UI.money(netValue);
  }

  function searchLots() {
    const search = $("manualAdjustmentSearch").value.trim().toLowerCase();
    const box = $("manualAdjustmentSearchResults");

    if (!search) {
      box.classList.remove("open");
      return;
    }

    const results = representativeLots()
      .filter((lot) =>
        [
          lot.brand_name,
          lot.generic_name,
          lot.batch_number,
          lot.supplier_name,
          lot.supplier_invoice_number,
          lot.purchase_number
        ].filter(Boolean).join(" ").toLowerCase().includes(search)
      )
      .slice(0, 50);

    box.innerHTML = results.length
      ? results.map((lot) => {
          const alreadyAdded = stagedLines.some(
            (line) => line.medicine_batch_id === lot.medicine_batch_id
          );
          return `<button class="search-result-row" data-id="${lot.medicine_batch_id}" ${alreadyAdded ? "disabled" : ""}>
            <span><b>${UI.safe(lot.brand_name || "Medicine")}</b><small>${UI.safe(lot.generic_name || "")}</small></span>
            <span>${UI.safe(lot.supplier_name || "—")}</span>
            <span>${UI.safe(lot.batch_number || "—")}</span>
            <span>Stock ${quantity(currentQuantity(lot))}</span>
            <span>${alreadyAdded ? "Added" : "Add"}</span>
          </button>`;
        }).join("")
      : '<div class="search-result-row">No batch found.</div>';

    box.classList.add("open");
    box.querySelectorAll("button:not([disabled])").forEach((button) => {
      button.onclick = () => addBatch(button.dataset.id, "MANUAL");
    });
  }

  function addBatch(batchId, source, imported = {}) {
    if (stagedLines.some((line) => line.medicine_batch_id === batchId)) {
      toast("This batch is already in the adjustment.", "warning");
      return;
    }

    const lot = representativeLots().find((row) => row.medicine_batch_id === batchId);
    if (!lot) {
      toast("The selected batch is no longer available.", "danger");
      return;
    }

    const systemQuantity = currentQuantity(lot);
    stagedLines.push({
      medicine_batch_id: lot.medicine_batch_id,
      purchase_item_id: lot.purchase_item_id,
      brand_name: lot.brand_name || "Medicine",
      generic_name: lot.generic_name || "",
      batch_number: lot.batch_number || "—",
      supplier_name: lot.supplier_name || "—",
      expected_quantity: systemQuantity,
      new_quantity: imported.new_quantity ?? systemQuantity,
      cost: effectiveCost(lot),
      reason: imported.reason || "",
      notes: imported.notes || "",
      source,
      damage_expiry_case_id: imported.damage_expiry_case_id || null
    });

    $("manualAdjustmentSearch").value = "";
    $("manualAdjustmentSearchResults").classList.remove("open");
    renderComposer();
  }

  function reasonOptions(selected) {
    const options = [
      ["", "Use document reason"],
      ["COUNT_CORRECTION", "Count correction"],
      ["DAMAGE_WRITE_OFF", "Damage write-off"],
      ["EXPIRY_WRITE_OFF", "Expiry write-off"],
      ["BREAKAGE", "Breakage"],
      ["THEFT_SHRINKAGE", "Theft / shrinkage"],
      ["UNRECORDED_RECEIPT", "Unrecorded receipt"],
      ["DATA_CORRECTION", "Data correction"],
      ["OTHER", "Other"]
    ];
    return options.map(([value, label]) =>
      `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`
    ).join("");
  }

  function differenceFor(line) {
    if (line.new_quantity === null || !Number.isFinite(Number(line.new_quantity))) return 0;
    return number(line.new_quantity) - number(line.expected_quantity);
  }

  function renderComposer() {
    composerBody.innerHTML = stagedLines.length
      ? stagedLines.map((line, index) => {
          const difference = differenceFor(line);
          const value = difference * number(line.cost);
          return `<tr>
            <td><b>${UI.safe(line.brand_name)}</b><small>${UI.safe(line.generic_name)}</small></td>
            <td>${UI.safe(line.batch_number)}</td>
            <td>${UI.safe(line.supplier_name)}</td>
            <td>${quantity(line.expected_quantity)}</td>
            <td><input class="composer-counted" data-index="${index}" type="number" min="0" step="0.001" value="${line.new_quantity ?? ""}" ${line.damage_expiry_case_id ? "disabled title=\"Controlled by the Damage & Expiry case\"" : ""}></td>
            <td class="${difference < 0 ? "negative" : difference > 0 ? "positive" : ""}">${quantity(difference)}</td>
            <td>${UI.money(line.cost)}</td>
            <td class="${value < 0 ? "negative" : value > 0 ? "positive" : ""}">${UI.money(value)}</td>
            <td><select class="composer-reason" data-index="${index}">${reasonOptions(line.reason)}</select></td>
            <td><input class="composer-notes" data-index="${index}" value="${UI.safe(line.notes)}" placeholder="Optional line note"></td>
            <td><button class="remove-composer-line" data-index="${index}" type="button">Remove</button></td>
          </tr>`;
        }).join("")
      : '<tr><td colspan="11" class="empty">Add batches manually or import a completed stock-count file.</td></tr>';

    document.querySelectorAll(".composer-counted").forEach((input) => {
      input.onchange = () => {
        const line = stagedLines[Number(input.dataset.index)];
        line.new_quantity = input.value === "" ? null : Number(input.value);
        renderComposer();
      };
    });
    document.querySelectorAll(".composer-reason").forEach((select) => {
      select.onchange = () => {
        stagedLines[Number(select.dataset.index)].reason = select.value;
      };
    });
    document.querySelectorAll(".composer-notes").forEach((input) => {
      input.oninput = () => {
        stagedLines[Number(input.dataset.index)].notes = input.value;
      };
    });
    document.querySelectorAll(".remove-composer-line").forEach((button) => {
      button.onclick = () => {
        stagedLines.splice(Number(button.dataset.index), 1);
        renderComposer();
      };
    });

    const changed = stagedLines.filter((line) => Math.abs(differenceFor(line)) >= 0.0005);
    const netQuantity = changed.reduce((sum, line) => sum + differenceFor(line), 0);
    const netValue = changed.reduce(
      (sum, line) => sum + differenceFor(line) * number(line.cost),
      0
    );

    $("composerLineCount").textContent = changed.length;
    $("composerNetQuantity").textContent = quantity(netQuantity);
    $("composerNetValue").textContent = UI.money(netValue);
    $("postManualAdjustmentButton").disabled = posting || changed.length === 0;
  }

  function downloadTemplate() {
    if (!window.XLSX) {
      toast("Spreadsheet library is not available.", "danger");
      return;
    }

    const rows = representativeLots().map((lot) => ({
      "Purchase Lot ID": lot.purchase_item_id,
      "Medicine Batch ID": lot.medicine_batch_id,
      "Medicine": lot.brand_name || "Medicine",
      "Generic": lot.generic_name || "",
      "Batch": lot.batch_number || "",
      "Expiry": lot.expiry_date || "",
      "Supplier": lot.supplier_name || "",
      "Supplier Invoice": lot.supplier_invoice_number || "",
      "System Quantity": currentQuantity(lot),
      "Counted Quantity": "",
      "Reason": "",
      "Notes": ""
    }));

    const workbook = XLSX.utils.book_new();
    const instructions = XLSX.utils.aoa_to_sheet([
      ["Medvika Stock-count Import"],
      ["Fill only Counted Quantity for batches physically checked."],
      ["Do not edit Medicine Batch ID or System Quantity. Purchase Lot ID may be blank for valid opening/manual batches."],
      ["Optional Reason values:", "COUNT_CORRECTION, DAMAGE_WRITE_OFF, EXPIRY_WRITE_OFF, BREAKAGE, THEFT_SHRINKAGE, UNRECORDED_RECEIPT, DATA_CORRECTION, OTHER"],
      ["Rows with blank Counted Quantity are ignored. Rows with unchanged quantity are skipped."],
      ["The complete adjustment is rejected if stock changed after this file was downloaded."],
      ["Template generated", new Date().toLocaleString("en-IN")]
    ]);
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [
      { wch: 38 }, { wch: 38 }, { wch: 24 }, { wch: 24 },
      { wch: 16 }, { wch: 12 }, { wch: 24 }, { wch: 20 },
      { wch: 16 }, { wch: 16 }, { wch: 24 }, { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(workbook, instructions, "Instructions");
    XLSX.utils.book_append_sheet(workbook, sheet, "Stock Count");
    XLSX.writeFile(workbook, `Medvika_Stock_Count_${dateKey(new Date())}.xlsx`);
  }

  function normalizedRow(row) {
    const normalized = {};
    Object.entries(row).forEach(([key, value]) => {
      normalized[String(key).toLowerCase().replace(/[^a-z0-9]/g, "")] = value;
    });
    return normalized;
  }

  async function importFile(file) {
    if (!file) return;
    if (!window.XLSX) {
      toast("Spreadsheet library is not available.", "danger");
      return;
    }

    const status = $("adjustmentImportStatus");
    status.hidden = false;
    status.className = "import-status";
    status.textContent = "Validating file...";

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const preferred = workbook.SheetNames.includes("Stock Count")
        ? "Stock Count"
        : workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[preferred], { defval: "" });
      if (!rows.length) {
        throw new Error("The selected sheet has no stock-count rows.");
      }
      const firstRow = normalizedRow(rows[0]);
      const requiredColumns = [
        "purchaselotid",
        "medicinebatchid",
        "systemquantity",
        "countedquantity"
      ];
      if (!requiredColumns.every((column) => Object.prototype.hasOwnProperty.call(firstRow, column))) {
        throw new Error("Use the Medvika stock-count template; required ID and quantity columns are missing.");
      }
      const allowedReasons = new Set([
        "",
        "COUNT_CORRECTION",
        "DAMAGE_WRITE_OFF",
        "EXPIRY_WRITE_OFF",
        "BREAKAGE",
        "THEFT_SHRINKAGE",
        "UNRECORDED_RECEIPT",
        "DATA_CORRECTION",
        "OTHER"
      ]);
      const availableLots = representativeLots();
      const imported = [];
      const errors = [];
      let skippedBlank = 0;
      let skippedUnchanged = 0;

      rows.forEach((raw, index) => {
        const row = normalizedRow(raw);
        const rowNumber = index + 2;
        const countedRaw = row.countedquantity;

        if (countedRaw === "" || countedRaw === null || countedRaw === undefined) {
          skippedBlank += 1;
          return;
        }

        const batchId = String(row.medicinebatchid || "").trim();
        const purchaseItemId = String(row.purchaselotid || "").trim();
        const lot = availableLots.find((candidate) =>
          candidate.medicine_batch_id === batchId &&
          String(candidate.purchase_item_id || "") === purchaseItemId
        );

        if (!lot) {
          errors.push(`Row ${rowNumber}: batch/purchase-lot ID was not found.`);
          return;
        }

        const fileSystemQuantity = Number(row.systemquantity);
        const liveQuantity = currentQuantity(lot);
        const counted = Number(countedRaw);

        if (!Number.isFinite(fileSystemQuantity) || Math.abs(fileSystemQuantity - liveQuantity) >= 0.0005) {
          errors.push(`Row ${rowNumber}: stock for batch ${lot.batch_number || batchId} changed after export.`);
          return;
        }
        if (!Number.isFinite(counted) || counted < 0) {
          errors.push(`Row ${rowNumber}: Counted Quantity must be zero or greater.`);
          return;
        }
        if (imported.some((line) => line.medicine_batch_id === batchId) ||
            stagedLines.some((line) => line.medicine_batch_id === batchId)) {
          errors.push(`Row ${rowNumber}: batch ${lot.batch_number || batchId} is duplicated.`);
          return;
        }
        if (Math.abs(counted - liveQuantity) < 0.0005) {
          skippedUnchanged += 1;
          return;
        }

        const importedReason = String(row.reason || "").trim().toUpperCase();
        if (!allowedReasons.has(importedReason)) {
          errors.push(`Row ${rowNumber}: Reason is not a supported adjustment reason.`);
          return;
        }

        imported.push({
          medicine_batch_id: lot.medicine_batch_id,
          purchase_item_id: lot.purchase_item_id,
          brand_name: lot.brand_name || "Medicine",
          generic_name: lot.generic_name || "",
          batch_number: lot.batch_number || "—",
          supplier_name: lot.supplier_name || "—",
          expected_quantity: liveQuantity,
          new_quantity: counted,
          cost: effectiveCost(lot),
          reason: importedReason,
          notes: String(row.notes || "").trim(),
          source: "IMPORT"
        });
      });

      if (errors.length) {
        status.className = "import-status import-error";
        status.innerHTML =
          `<b>Import blocked: ${errors.length} issue(s).</b><br>` +
          errors.slice(0, 12).map((error) => UI.safe(error)).join("<br>") +
          (errors.length > 12 ? `<br>…and ${errors.length - 12} more.` : "");
        return;
      }

      if (!imported.length) {
        status.className = "import-status import-warning";
        status.textContent = "No changed rows found. Fill Counted Quantity for at least one batch.";
        return;
      }

      stagedLines.push(...imported);
      status.className = "import-status import-success";
      status.textContent =
        `${imported.length} changed batch(es) added. ${skippedBlank} blank and ${skippedUnchanged} unchanged row(s) skipped.`;
      renderComposer();
    } catch (error) {
      status.className = "import-status import-error";
      status.textContent = "File could not be read: " + error.message;
    } finally {
      $("adjustmentImportFile").value = "";
    }
  }

  async function postAdjustment() {
    if (posting) return;

    const documentReason = $("manualAdjustmentReason").value;
    const documentNotes = $("manualAdjustmentNotes").value.trim();
    const changed = stagedLines.filter((line) => Math.abs(differenceFor(line)) >= 0.0005);

    if (!documentNotes) {
      toast("Document notes are required.", "warning");
      return;
    }
    if (!changed.length) {
      toast("Enter at least one changed physical quantity.", "warning");
      return;
    }

    for (const line of changed) {
      if (line.new_quantity === null || !Number.isFinite(Number(line.new_quantity)) ||
          number(line.new_quantity) < 0) {
        toast(`Enter a valid counted quantity for ${line.brand_name} batch ${line.batch_number}.`, "warning");
        return;
      }
      if (!(line.reason || documentReason)) {
        toast(`Select a reason for ${line.brand_name} batch ${line.batch_number}.`, "warning");
        return;
      }
    }

    if (!window.confirm(
      `Post one permanent adjustment document for ${changed.length} changed batch(es)?`
    )) return;

    posting = true;
    renderComposer();
    const button = $("postManualAdjustmentButton");
    button.textContent = "Posting...";

    try {
      const source = changed.some((line) => line.source === "IMPORT")
        ? "BULK_IMPORT"
        : "MANUAL";
      const dateValue = $("manualAdjustmentDate").value;
      const caseLine = changed.find((line) => line.damage_expiry_case_id);
      if (caseLine && (changed.length !== 1 || stagedLines.length !== 1)) {
        throw new Error("Post the Damage & Expiry disposition separately from other adjustments.");
      }
      const rpcName = caseLine ? "post_damage_expiry_stock_adjustment_v1" : "post_stock_adjustment_v2";
      const rpcParams = caseLine
        ? {
            p_case_id: caseLine.damage_expiry_case_id,
            p_adjustment_date: new Date(dateValue).toISOString(),
            p_notes: documentNotes
          }
        : {
            p_adjustment_date: new Date(dateValue).toISOString(),
            p_source_type: source,
            p_default_reason: documentReason || null,
            p_notes: documentNotes,
            p_items: changed.map((line) => ({
              medicine_batch_id: line.medicine_batch_id,
              purchase_item_id: line.purchase_item_id || null,
              expected_quantity: number(line.expected_quantity),
              new_quantity: number(line.new_quantity),
              reason: line.reason || null,
              notes: line.notes || null
            }))
          };
      const { data, error } = await supabaseClient.rpc(rpcName, rpcParams);
      if (error) throw error;

      toast(caseLine
        ? `Internal disposition posted and case closed under ${data.adjustment_number}.`
        : `Adjustment ${data.adjustment_number} posted with ${data.total_lines} lines.`);
      stagedLines = [];
      dispositionCaseId = null;
      $("manualAdjustmentReason").value = "";
      $("manualAdjustmentNotes").value = "";
      $("adjustmentImportStatus").hidden = true;
      await load();
    } catch (error) {
      toast(error.message, "danger");
    } finally {
      posting = false;
      button.textContent = "Post Adjustment Document";
      renderComposer();
    }
  }

  function openDetail(id) {
    selectedAdjustment = adjustments.find((row) => row.id === id) || null;
    if (!selectedAdjustment) return;

    const items = itemsFor(id);
    $("adjustmentDetailPanel").hidden = false;
    $("adjustmentDetailTitle").textContent = selectedAdjustment.adjustment_number;
    $("adjustmentDetailSubTitle").textContent =
      `${selectedAdjustment.source_type} • ${new Date(selectedAdjustment.adjustment_date).toLocaleString("en-IN")}`;

    detailBody.innerHTML = items.length
      ? items.map((item) => {
          const lot = lots.find((row) => row.medicine_batch_id === item.medicine_batch_id) || {};
          return `<tr>
            <td><b>${UI.safe(lot.brand_name || "Medicine")}</b></td>
            <td>${UI.safe(lot.batch_number || "—")}</td>
            <td>${quantity(item.previous_quantity)}</td>
            <td>${quantity(item.adjusted_quantity)}</td>
            <td>${quantity(item.difference_quantity)}</td>
            <td>${UI.money(item.purchase_rate)}</td>
            <td>${UI.money(item.difference_value)}</td>
            <td>${UI.safe(item.reason || "—")}</td>
            <td>${UI.safe(item.notes || "—")}</td>
          </tr>`;
        }).join("")
      : '<tr><td colspan="9" class="empty">No items.</td></tr>';

    $("adjustmentDetailPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function printDetail() {
    if (!selectedAdjustment) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast("Allow pop-ups to print the adjustment.", "warning");
      return;
    }
    printWindow.document.write(`<!doctype html><html><head><title>${selectedAdjustment.adjustment_number}</title><style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #888;padding:7px}</style></head><body><h1>Stock Adjustment</h1><p>${selectedAdjustment.adjustment_number}</p>${document.getElementById("adjustmentDetailTable").outerHTML}<script>window.onload=()=>window.print();<\/script></body></html>`);
    printWindow.document.close();
  }

  $("stockAdjustmentFromDate").value = monthStart();
  $("stockAdjustmentToDate").value = dateKey(new Date());
  $("manualAdjustmentDate").value = localDateTimeInput();

  ["stockAdjustmentSearch", "stockAdjustmentSourceFilter", "stockAdjustmentFromDate", "stockAdjustmentToDate"]
    .forEach((id) => {
      $(id).oninput = applyFilters;
      $(id).onchange = applyFilters;
    });

  $("manualAdjustmentSearch").oninput = searchLots;
  $("downloadAdjustmentTemplateButton").onclick = downloadTemplate;
  $("chooseAdjustmentImportButton").onclick = () => $("adjustmentImportFile").click();
  $("adjustmentImportFile").onchange = (event) => importFile(event.target.files?.[0]);
  $("postManualAdjustmentButton").onclick = postAdjustment;
  $("clearAdjustmentLinesButton").onclick = () => {
    if (stagedLines.length && !window.confirm("Clear all unposted adjustment lines?")) return;
    stagedLines = [];
    $("adjustmentImportStatus").hidden = true;
    renderComposer();
  };
  $("refreshStockAdjustmentsButton").onclick = load;
  $("closeAdjustmentDetailButton").onclick = () => {
    $("adjustmentDetailPanel").hidden = true;
    selectedAdjustment = null;
  };
  $("printAdjustmentButton").onclick = printDetail;

  async function consumeDamageExpiryPrefill() {
    const raw = sessionStorage.getItem("medvika_stock_adjustment_prefill");
    if (!raw) return;
    sessionStorage.removeItem("medvika_stock_adjustment_prefill");
    let prefill;
    try { prefill = JSON.parse(raw); } catch (_) { return; }
    const lot = representativeLots().find((row) => row.medicine_batch_id === prefill.medicine_batch_id);
    if (!lot || !prefill.damage_expiry_case_id) {
      toast("The disposition batch is no longer available.", "warning");
      return;
    }
    const expected = currentQuantity(lot);
    const affected = Math.max(0, number(prefill.affected_quantity));
    const target = Math.max(0, Number((expected - affected).toFixed(3)));
    dispositionCaseId = prefill.damage_expiry_case_id;
    addBatch(lot.medicine_batch_id, "DAMAGE_EXPIRY", {
      new_quantity: target,
      reason: prefill.reason || "EXPIRY_WRITE_OFF",
      notes: prefill.notes || "Damage & Expiry internal disposition",
      damage_expiry_case_id: dispositionCaseId
    });
    $("manualAdjustmentReason").value = prefill.reason || "EXPIRY_WRITE_OFF";
    $("manualAdjustmentNotes").value = prefill.notes || "Damage & Expiry internal disposition";
    toast("Disposition loaded. Review the controlled quantity and post the adjustment.", "success");
  }

  try {
    await load();
    await consumeDamageExpiryPrefill();
  } catch (error) {
    toast("Stock Adjustment Register could not load: " + error.message, "danger");
  }
};
