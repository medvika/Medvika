window.initPrMemoModule = async function initPrMemoModule() {
  const UI = window.MedvikaUI;
  const $ = (id) => document.getElementById(id);
  const notify = (message, type = "success") =>
    UI.toast(message, type === "danger" ? "error" : type);

  const itemsBody = document.querySelector("#prMemoItemsTable tbody");
  const recentBody = document.querySelector("#recentPrMemosTable tbody");

  let suppliers = [];
  let medicines = [];
  let batches = [];
  let purchaseInvoices = [];
  let purchaseItems = [];
  let memoItems = [];
  let memos = [];
  let activeDamageExpiryCaseId = null;

  let allSupplierStock = [];
  let supplierStock = [];

  const number = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const cleanQty = (value) =>
    number(value).toFixed(3).replace(/\.?0+$/, "");

  const supplierName = (row) =>
    row?.supplier_name ||
    row?.name ||
    row?.company_name ||
    row?.full_name ||
    row?.trade_name ||
    "Supplier";

  function nowInput() {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  function expectedValue(item) {
    const paidQty = number(item.memo_paid_quantity);
    const originalPaidQty = Math.max(1, number(item.quantity));
    const netUnitTaxable =
      number(item.taxable_amount) / originalPaidQty;

    const taxableBeforeDeduction =
      paidQty * netUnitTaxable;

    const expectedDeduction =
      taxableBeforeDeduction *
      number(item.expected_deduction_percent) /
      100;

    const taxableAfterDeduction =
      Math.max(0, taxableBeforeDeduction - expectedDeduction);

    const gst =
      taxableAfterDeduction *
      number(item.gst_percent) /
      100;

    return taxableAfterDeduction + gst;
  }

  async function loadBaseData() {
    const [
      suppliersResult,
      medicinesResult,
      batchesResult,
      invoicesResult,
      itemsResult,
      memosResult,
      memoItemsResult
    ] = await Promise.all([
      supabaseClient.from("suppliers").select("*").limit(1000),
      supabaseClient.from("medicines").select("*").limit(5000),
      supabaseClient.from("medicine_batches").select("*").limit(10000),
      supabaseClient.from("purchase_invoices").select("*").limit(5000),
      supabaseClient.from("purchase_items").select("*").limit(10000),
      supabaseClient.from("purchase_return_memos").select("*").limit(5000),
      supabaseClient.from("purchase_return_memo_items").select("*").limit(10000)
    ]);

    const results = [
      suppliersResult,
      medicinesResult,
      batchesResult,
      invoicesResult,
      itemsResult,
      memosResult,
      memoItemsResult
    ];

    const firstError = results.find((result) => result.error)?.error;
    if (firstError) throw firstError;

    suppliers = suppliersResult.data || [];
    medicines = medicinesResult.data || [];
    batches = batchesResult.data || [];
    purchaseInvoices = invoicesResult.data || [];
    purchaseItems = itemsResult.data || [];
    memos = memosResult.data || [];
    memoItems = memoItemsResult.data || [];
  }

  function populateSuppliers() {
    $("prSupplierId").innerHTML =
      '<option value="">Select supplier</option>' +
      suppliers
        .filter((row) => row.is_active !== false)
        .sort((a, b) =>
          supplierName(a).localeCompare(supplierName(b))
        )
        .map((row) => `
          <option value="${row.id}">
            ${UI.safe(supplierName(row))}
          </option>
        `)
        .join("");
  }

  function buildSupplierStock() {
    const supplierId = $("prSupplierId").value;
    const filter = $("prStockFilter").value;

    if (!supplierId) {
      notify("Select a supplier.", "warning");
      return;
    }

    const invoiceMap = new Map(
      purchaseInvoices.map((row) => [row.id, row])
    );

    const medicineMap = new Map(
      medicines.map((row) => [row.id, row])
    );

    const batchMap = new Map(
      batches.map((row) => [row.id, row])
    );

    const memoMap = new Map(
      memos.map((row) => [row.id, row])
    );

    const memoedByPurchaseItem = {};

    memoItems.forEach((row) => {
      const memo = memoMap.get(row.purchase_return_memo_id);

      if (!memo || ["CANCELLED", "REJECTED"].includes(memo.status)) {
        return;
      }

      const current = memoedByPurchaseItem[row.purchase_item_id] || {
        paid: 0,
        free: 0
      };

      current.paid += number(row.memo_paid_quantity);
      current.free += number(row.memo_free_quantity);
      memoedByPurchaseItem[row.purchase_item_id] = current;
    });

    const today = new Date();
    const limit90 = new Date(today);
    limit90.setDate(limit90.getDate() + 90);

    const limit180 = new Date(today);
    limit180.setDate(limit180.getDate() + 180);

    allSupplierStock = purchaseItems
      .map((item) => {
        const invoice = invoiceMap.get(item.purchase_invoice_id);
        const medicine = medicineMap.get(item.medicine_id);
        const batch = batchMap.get(item.medicine_batch_id);
        const memoed = memoedByPurchaseItem[item.id] || {
          paid: 0,
          free: 0
        };

        return {
          ...item,
          purchase_invoices: invoice || null,
          medicines: medicine || null,
          medicine_batches: batch || null,
          already_memoed_paid: memoed.paid,
          already_memoed_free: memoed.free,
          available_paid: Math.max(
            0,
            number(item.quantity) - memoed.paid
          ),
          available_free: Math.max(
            0,
            number(item.free_quantity) - memoed.free
          ),
          current_stock: number(batch?.quantity_available),
          selected: false,
          memo_paid_quantity: 0,
          memo_free_quantity: 0,
          expected_deduction_percent: 0
        };
      })
      .filter((row) => {
        const invoice = row.purchase_invoices;
        const batch = row.medicine_batches;

        if (!invoice || invoice.supplier_id !== supplierId) {
          return false;
        }

        if (
          String(invoice.purchase_status || "").toLowerCase() ===
          "cancelled"
        ) {
          return false;
        }

        if (!batch || row.current_stock <= 0) {
          return false;
        }

        if (
          row.available_paid <= 0 &&
          row.available_free <= 0
        ) {
          return false;
        }

        const expiry = row.expiry_date
          ? new Date(row.expiry_date)
          : null;

        if (filter === "expired" && (!expiry || expiry >= today)) {
          return false;
        }

        if (
          filter === "near_expiry_90" &&
          (!expiry || expiry < today || expiry > limit90)
        ) {
          return false;
        }

        if (
          filter === "near_expiry_180" &&
          (!expiry || expiry < today || expiry > limit180)
        ) {
          return false;
        }

        if (filter === "damaged" && !batch.is_blocked) {
          return false;
        }

        return true;
      });

    applyMedicineFilter();
  }

  function applyMedicineFilter() {
    const query = $("prMedicineSearch").value
      .trim()
      .toLowerCase();

    supplierStock = allSupplierStock.filter((row) => {
      if (!query) return true;

      const invoice = row.purchase_invoices || {};
      const medicine = row.medicines || {};

      const searchable = [
        medicine.brand_name,
        medicine.generic_name,
        medicine.barcode,
        row.batch_number,
        row.expiry_date,
        invoice.supplier_invoice_number,
        invoice.purchase_number
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });

    renderSupplierStock();
  }

  function renderSupplierStock() {
    if (!supplierStock.length) {
      itemsBody.innerHTML = `
        <tr>
          <td colspan="15" class="pr-empty">
            No returnable stock found for this supplier.
          </td>
        </tr>
      `;
      updateSummary();
      return;
    }

    itemsBody.innerHTML = supplierStock
      .map((item, index) => {
        const medicine = item.medicines || {};
        const invoice = item.purchase_invoices || {};
        const expected = expectedValue(item);

        return `
          <tr>
            <td>
              <input
                class="pr-select"
                data-index="${index}"
                type="checkbox"
                ${item.selected ? "checked" : ""}
              >
            </td>

            <td>
              <b>${UI.safe(medicine.brand_name || "Medicine")}</b>
              <small>${UI.safe(medicine.generic_name || "")}</small>
              <small>Batch: ${UI.safe(item.batch_number || "—")}</small>
              <small>Expiry: ${UI.safe(item.expiry_date || "—")}</small>
            </td>

            <td>
              ${UI.safe(invoice.supplier_invoice_number || "—")}
              <small>${UI.safe(invoice.purchase_number || "")}</small>
            </td>

            <td>
              ${
                invoice.purchase_date
                  ? new Date(invoice.purchase_date).toLocaleDateString()
                  : "—"
              }
            </td>

            <td>${cleanQty(item.quantity)}</td>
            <td>${cleanQty(item.free_quantity)}</td>

            <td>
              Paid ${cleanQty(item.already_memoed_paid)}
              <small>Free ${cleanQty(item.already_memoed_free)}</small>
            </td>

            <td>${cleanQty(item.current_stock)}</td>

            <td>
              <input
                class="pr-paid-qty"
                data-index="${index}"
                type="number"
                min="0"
                step="0.001"
                max="${Math.min(item.available_paid, item.current_stock)}"
                value="${item.memo_paid_quantity || ""}"
                ${!item.selected ? "disabled" : ""}
              >
            </td>

            <td>
              <input
                class="pr-free-qty"
                data-index="${index}"
                type="number"
                min="0"
                step="0.001"
                max="${Math.min(item.available_free, item.current_stock)}"
                value="${item.memo_free_quantity || ""}"
                ${!item.selected ? "disabled" : ""}
              >
            </td>

            <td>${UI.money(item.purchase_rate)}</td>
            <td>${number(item.discount_percent).toFixed(2)}</td>
            <td>${number(item.gst_percent).toFixed(2)}</td>

            <td>
              <input
                class="pr-expected-deduction"
                data-index="${index}"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value="${item.expected_deduction_percent}"
                ${!item.selected ? "disabled" : ""}
              >
            </td>

            <td>${UI.money(expected)}</td>
          </tr>
        `;
      })
      .join("");

    document.querySelectorAll(".pr-select").forEach((input) => {
      input.onchange = () => {
        const item = supplierStock[number(input.dataset.index)];
        item.selected = input.checked;

        if (!item.selected) {
          item.memo_paid_quantity = 0;
          item.memo_free_quantity = 0;
        }

        renderSupplierStock();
      };
    });

    [
      [".pr-paid-qty", "memo_paid_quantity"],
      [".pr-free-qty", "memo_free_quantity"],
      [".pr-expected-deduction", "expected_deduction_percent"]
    ].forEach(([selector, field]) => {
      document.querySelectorAll(selector).forEach((input) => {
        input.oninput = () => {
          const item = supplierStock[number(input.dataset.index)];
          item[field] = Math.max(0, number(input.value));

          if (field === "memo_paid_quantity") {
            item[field] = Math.min(
              item[field],
              item.available_paid,
              item.current_stock - number(item.memo_free_quantity)
            );
          }

          if (field === "memo_free_quantity") {
            item[field] = Math.min(
              item[field],
              item.available_free,
              item.current_stock - number(item.memo_paid_quantity)
            );
          }

          if (field === "expected_deduction_percent") {
            item[field] = Math.min(100, item[field]);
          }

          input.value = item[field];

          input.closest("tr").lastElementChild.textContent =
            UI.money(expectedValue(item));

          updateSummary();
        };
      });
    });

    updateSummary();
  }

  function selectedItems() {
    return supplierStock.filter((item) =>
      item.selected &&
      (
        number(item.memo_paid_quantity) > 0 ||
        number(item.memo_free_quantity) > 0
      )
    );
  }

  function updateSummary() {
    const selected = selectedItems();

    const qty = selected.reduce(
      (sum, item) =>
        sum +
        number(item.memo_paid_quantity) +
        number(item.memo_free_quantity),
      0
    );

    const expected = selected.reduce(
      (sum, item) => sum + expectedValue(item),
      0
    );

    $("prSelectedLines").textContent = selected.length;
    $("prTotalReturnQty").textContent = cleanQty(qty);
    $("prExpectedClaim").textContent = UI.money(expected);
  }

  async function issuePrMemo() {
    const supplierId = $("prSupplierId").value;
    const selected = selectedItems();

    if (!supplierId) {
      notify("Select a supplier.", "warning");
      return;
    }

    if (!$("prReason").value) {
      notify("Select a return reason.", "warning");
      return;
    }

    if (!selected.length) {
      notify("Select at least one return item.", "warning");
      return;
    }

    const button = $("issuePrMemoButton");
    button.disabled = true;
    button.textContent = "Issuing PR Memo...";

    try {
      const rpcName = activeDamageExpiryCaseId
        ? "issue_damage_expiry_pr_memo_v1"
        : "issue_purchase_return_memo_v1";
      const rpcArgs = {
          p_supplier_id: supplierId,
          p_memo_date:
            new Date($("prMemoDate").value).toISOString(),
          p_reason: $("prReason").value,
          p_dispatch_reference:
            $("prDispatchReference").value.trim() || null,
          p_notes: $("prNotes").value.trim() || null,
          p_items: selected.map((item) => ({
            purchase_item_id: item.id,
            memo_paid_quantity: number(item.memo_paid_quantity),
            memo_free_quantity: number(item.memo_free_quantity),
            expected_deduction_percent:
              number(item.expected_deduction_percent)
          }))
        };
      if (activeDamageExpiryCaseId) {
        rpcArgs.p_damage_expiry_case_id = activeDamageExpiryCaseId;
      }
      const { data, error } = await supabaseClient.rpc(rpcName, rpcArgs);

      if (error) throw error;

      if (!data?.memo_id) {
        throw new Error(
          "PR Memo was created but its saved record was not returned."
        );
      }

      const { data: savedMemo, error: savedMemoError } =
        await supabaseClient
          .from("purchase_return_memos")
          .select("memo_number")
          .eq("id", data.memo_id)
          .single();

      if (savedMemoError) throw savedMemoError;

      if (!savedMemo?.memo_number) {
        throw new Error(
          "PR Memo was created but its saved number could not be verified."
        );
      }

      notify(
        `PR Memo ${savedMemo.memo_number} issued successfully.`
      );
      activeDamageExpiryCaseId = null;

      await loadBaseData();
      populateSuppliers();
      buildSupplierStock();
      renderRecentMemos();
    } catch (error) {
      notify(error.message, "danger");
    } finally {
      button.disabled = false;
      button.textContent = "Issue PR Memo";
    }
  }

  let selectedOperationsMemo = null;

  function memoAgeDays(memoDate) {
    if (!memoDate) return 0;
    const start = new Date(memoDate);
    const now = new Date();
    return Math.max(
      0,
      Math.floor((now - start) / 86400000)
    );
  }

  function memoCanCancel(memo) {
    return (
      ["ISSUED", "CN_PENDING"].includes(memo.status) &&
      number(memo.settled_claim_amount) === 0
    );
  }

  function renderRecentMemos() {
    const supplierMap = new Map(
      suppliers.map((row) => [row.id, row])
    );

    const lineCountMap = {};
    memoItems.forEach((row) => {
      lineCountMap[row.purchase_return_memo_id] =
        number(lineCountMap[row.purchase_return_memo_id]) + 1;
    });

    recentBody.innerHTML = memos
      .slice()
      .sort((a, b) =>
        String(b.memo_date).localeCompare(String(a.memo_date))
      )
      .slice(0, 50)
      .map((row) => {
        const age = memoAgeDays(row.memo_date);

        const dispatchText = row.dispatch_date
          ? `${new Date(row.dispatch_date).toLocaleDateString()}<br>
             <small>${UI.safe(row.courier_name || "")}
             ${UI.safe(row.docket_number || "")}</small>`
          : "Not dispatched";

        return `
          <tr>
            <td><b>${UI.safe(row.memo_number)}</b></td>
            <td>${new Date(row.memo_date).toLocaleString()}</td>
            <td>${UI.safe(supplierName(supplierMap.get(row.supplier_id)))}</td>
            <td>${lineCountMap[row.id] || 0}</td>
            <td>${UI.money(row.expected_claim_amount)}</td>
            <td>
              <span class="pr-status ${
                row.status === "SETTLED"
                  ? "pr-status-settled"
                  : row.status === "PARTIALLY_SETTLED"
                    ? "pr-status-partial"
                    : row.status === "CANCELLED"
                      ? "pr-status-cancelled"
                      : row.status === "DISPATCHED"
                        ? "pr-status-dispatched"
                        : "pr-status-cn-pending"
              }">
                ${UI.safe(row.status)}
              </span>
            </td>
            <td>
              ${age} day${age === 1 ? "" : "s"}
            </td>
            <td>${dispatchText}</td>
            <td>
              <button
                type="button"
                class="open-pr-operations"
                data-id="${row.id}"
              >
                Manage
              </button>

              ${
                !["SETTLED", "CANCELLED"].includes(row.status)
                  ? `<button
                       type="button"
                       class="open-settlement"
                       data-id="${row.id}"
                     >
                       Settle
                     </button>`
                  : ""
              }
            </td>
          </tr>
        `;
      })
      .join("") || `
        <tr>
          <td colspan="9" class="pr-empty">No PR memos found.</td>
        </tr>
      `;

    document.querySelectorAll(".open-settlement").forEach((button) => {
      button.onclick = () => {
        sessionStorage.setItem(
          "medvika_purchase_return_memo_id",
          button.dataset.id
        );
        window.MedvikaRouter.navigate("purchase-return");
      };
    });

    document.querySelectorAll(".open-pr-operations").forEach((button) => {
      button.onclick = () => openPrOperations(button.dataset.id);
    });
  }

  async function openPrOperations(memoId) {
    selectedOperationsMemo =
      memos.find((row) => row.id === memoId) || null;

    if (!selectedOperationsMemo) {
      notify("PR Memo not found.", "danger");
      return;
    }

    $("prMemoOperationsPanel").hidden = false;
    $("prOperationsMemoNumber").textContent =
      selectedOperationsMemo.memo_number;

    $("prOperationsMemoStatus").textContent =
      `Status: ${selectedOperationsMemo.status}`;

    $("prDispatchDate").value =
      selectedOperationsMemo.dispatch_date
        ? new Date(
            new Date(selectedOperationsMemo.dispatch_date).getTime() -
            new Date().getTimezoneOffset() * 60000
          ).toISOString().slice(0, 16)
        : nowInput();

    $("prCourierName").value =
      selectedOperationsMemo.courier_name || "";

    $("prDocketNumber").value =
      selectedOperationsMemo.docket_number || "";

    $("markPrDispatchedButton").disabled =
      ["SETTLED", "CANCELLED"].includes(
        selectedOperationsMemo.status
      );

    $("cancelPrMemoButton").disabled =
      !memoCanCancel(selectedOperationsMemo);

    await loadPrStatusHistory(memoId);

    $("prMemoOperationsPanel").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  async function loadPrStatusHistory(memoId) {
    const body = document.querySelector(
      "#prMemoStatusHistoryTable tbody"
    );

    const { data, error } = await supabaseClient
      .from("purchase_return_memo_status_history")
      .select("*")
      .eq("purchase_return_memo_id", memoId)
      .order("changed_at", { ascending: false });

    if (error) {
      body.innerHTML = `
        <tr>
          <td colspan="4" class="pr-empty">
            ${UI.safe(error.message)}
          </td>
        </tr>
      `;
      return;
    }

    body.innerHTML = (data || []).length
      ? data.map((row) => `
          <tr>
            <td>${new Date(row.changed_at).toLocaleString()}</td>
            <td>${UI.safe(row.from_status || "—")}</td>
            <td>${UI.safe(row.to_status || "—")}</td>
            <td>${UI.safe(row.remarks || "—")}</td>
          </tr>
        `).join("")
      : `
        <tr>
          <td colspan="4" class="pr-empty">
            No status history found.
          </td>
        </tr>
      `;
  }

  function printPrMemo() {
    if (!selectedOperationsMemo) {
      notify("Select a PR Memo.", "warning");
      return;
    }

    const supplierMap = new Map(
      suppliers.map((row) => [row.id, row])
    );

    const medicineMap = new Map(
      medicines.map((row) => [row.id, row])
    );

    const invoiceMap = new Map(
      purchaseInvoices.map((row) => [row.id, row])
    );

    const rows = memoItems
      .filter((row) =>
        row.purchase_return_memo_id === selectedOperationsMemo.id
      )
      .map((row, index) => {
        const medicine = medicineMap.get(row.medicine_id) || {};
        const invoice = invoiceMap.get(row.purchase_invoice_id) || {};

        return `
          <tr>
            <td>${index + 1}</td>
            <td>${UI.safe(medicine.brand_name || "Medicine")}</td>
            <td>${UI.safe(row.batch_number || "—")}</td>
            <td>${UI.safe(row.expiry_date || "—")}</td>
            <td>${UI.safe(invoice.supplier_invoice_number || "—")}</td>
            <td>${cleanQty(row.memo_paid_quantity)}</td>
            <td>${cleanQty(row.memo_free_quantity)}</td>
            <td>${UI.money(row.expected_claim_amount)}</td>
          </tr>
        `;
      })
      .join("");

    const supplier =
      supplierMap.get(selectedOperationsMemo.supplier_id);

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      notify("Allow pop-ups to print the PR Memo.", "warning");
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
      <head>
        <title>${UI.safe(selectedOperationsMemo.memo_number)}</title>
        <style>
          body{font-family:Arial,sans-serif;padding:24px;color:#111}
          h1{margin:0 0 6px}
          .meta{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:18px 0}
          table{width:100%;border-collapse:collapse;margin-top:18px}
          th,td{border:1px solid #bbb;padding:8px;text-align:left}
          th{background:#f3f4f6}
          .total{text-align:right;font-size:18px;font-weight:700;margin-top:16px}
          @media print{button{display:none}}
        </style>
      </head>
      <body>
        <h1>Purchase Return Memo</h1>
        <div><b>${UI.safe(selectedOperationsMemo.memo_number)}</b></div>

        <div class="meta">
          <div><b>Supplier:</b> ${UI.safe(supplierName(supplier))}</div>
          <div><b>Memo Date:</b> ${new Date(selectedOperationsMemo.memo_date).toLocaleString()}</div>
          <div><b>Reason:</b> ${UI.safe(selectedOperationsMemo.reason || "—")}</div>
          <div><b>Status:</b> ${UI.safe(selectedOperationsMemo.status)}</div>
          <div><b>Courier:</b> ${UI.safe(selectedOperationsMemo.courier_name || "—")}</div>
          <div><b>Docket/LR:</b> ${UI.safe(selectedOperationsMemo.docket_number || "—")}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Medicine</th>
              <th>Batch</th>
              <th>Expiry</th>
              <th>Supplier Invoice</th>
              <th>Paid Qty</th>
              <th>Free Qty</th>
              <th>Expected Claim</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="total">
          Expected Claim: ${UI.money(selectedOperationsMemo.expected_claim_amount)}
        </div>

        <script>
          window.onload = () => window.print();
        <\/script>
      </body>
      </html>
    `);

    printWindow.document.close();
  }

  async function markPrDispatched() {
    if (!selectedOperationsMemo) {
      notify("Select a PR Memo.", "warning");
      return;
    }

    const { data, error } = await supabaseClient.rpc(
      "mark_purchase_return_memo_dispatched_v1",
      {
        p_purchase_return_memo_id: selectedOperationsMemo.id,
        p_dispatch_date:
          new Date($("prDispatchDate").value).toISOString(),
        p_courier_name:
          $("prCourierName").value.trim() || null,
        p_docket_number:
          $("prDocketNumber").value.trim() || null
      }
    );

    if (error) {
      notify(error.message, "danger");
      return;
    }

    notify(`PR Memo ${data.memo_number} marked dispatched.`);
    await loadBaseData();
    renderRecentMemos();
    await openPrOperations(selectedOperationsMemo.id);
  }

  async function cancelPrMemo() {
    if (!selectedOperationsMemo) {
      notify("Select a PR Memo.", "warning");
      return;
    }

    if (!memoCanCancel(selectedOperationsMemo)) {
      notify(
        "Only unsettled ISSUED or CN_PENDING memos can be cancelled.",
        "warning"
      );
      return;
    }

    const reason = window.prompt(
      "Enter cancellation reason:"
    );

    if (!reason || !reason.trim()) {
      return;
    }

    const { data, error } = await supabaseClient.rpc(
      "cancel_purchase_return_memo_v1",
      {
        p_purchase_return_memo_id: selectedOperationsMemo.id,
        p_reason: reason.trim()
      }
    );

    if (error) {
      notify(error.message, "danger");
      return;
    }

    notify(
      `PR Memo ${data.memo_number} cancelled. Stock restored.`
    );

    $("prMemoOperationsPanel").hidden = true;
    selectedOperationsMemo = null;

    await loadBaseData();
    renderRecentMemos();
  }

  $("printPrMemoButton").onclick = printPrMemo;
  $("markPrDispatchedButton").onclick = markPrDispatched;
  $("cancelPrMemoButton").onclick = cancelPrMemo;

  $("closePrOperationsButton").onclick = () => {
    $("prMemoOperationsPanel").hidden = true;
    selectedOperationsMemo = null;
  };


  async function applyInventoryPrPrefill() {
    const raw = sessionStorage.getItem("medvika_pr_prefill");
    if (!raw) return;

    sessionStorage.removeItem("medvika_pr_prefill");

    let prefill;
    try {
      prefill = JSON.parse(raw);
    } catch {
      return;
    }

    if (!prefill?.supplier_id || !prefill?.purchase_item_id) {
      return;
    }

    $("prSupplierId").value = prefill.supplier_id;
    buildSupplierStock();

    const target = allSupplierStock.find(
      item => item.id === prefill.purchase_item_id
    );

    if (!target) {
      notify(
        `The selected lot ${prefill.brand_name || ""} ${prefill.batch_number || ""} is not currently returnable.`,
        "warning"
      );
      return;
    }

    const requestedQuantity = Math.min(
      number(prefill.quantity),
      target.current_stock,
      target.available_paid + target.available_free
    );
    const paidQuantity = Math.min(requestedQuantity, target.available_paid);
    const freeQuantity = Math.min(
      requestedQuantity - paidQuantity,
      target.available_free
    );

    if (requestedQuantity <= 0 || paidQuantity + freeQuantity !== requestedQuantity) {
      notify("The affected case quantity is no longer fully returnable.", "warning");
      return;
    }

    target.selected = true;
    target.memo_paid_quantity = paidQuantity;
    target.memo_free_quantity = freeQuantity;
    target.expected_deduction_percent =
      Math.min(100, Math.max(0, number(prefill.expected_deduction_percent)));
    activeDamageExpiryCaseId = prefill.damage_expiry_case_id || null;
    $("prReason").value = prefill.return_reason || "";
    $("prNotes").value = prefill.notes || "";

    applyMedicineFilter();

    notify(
      `${prefill.brand_name || "Medicine"} batch ${prefill.batch_number || ""} loaded with the full case quantity. Issue it as a single linked PR Memo.`,
      "success"
    );
  }

  $("loadSupplierStockButton").onclick = buildSupplierStock;

  $("prSupplierId").onchange = () => {
    allSupplierStock = [];
    supplierStock = [];
    $("prMedicineSearch").value = "";
    buildSupplierStock();
  };

  $("prStockFilter").onchange = () => {
    if ($("prSupplierId").value) {
      buildSupplierStock();
    }
  };

  $("prMedicineSearch").oninput = () => {
    if (allSupplierStock.length) {
      applyMedicineFilter();
    }
  };

  $("issuePrMemoButton").onclick = issuePrMemo;

  $("refreshPrMemosButton").onclick = async () => {
    await loadBaseData();
    renderRecentMemos();
  };

  $("prMemoDate").value = nowInput();

  try {
    await loadBaseData();
    populateSuppliers();
    renderRecentMemos();
    await applyInventoryPrPrefill();
  } catch (error) {
    notify(
      "PR Memo page could not load: " + error.message,
      "danger"
    );
  }
};
