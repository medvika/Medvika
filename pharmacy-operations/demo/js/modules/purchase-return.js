window.initPurchaseReturnModule = async function initPurchaseReturnModule() {
  const UI = window.MedvikaUI;
  const $ = (id) => document.getElementById(id);
  const notify = (message, type = "success") =>
    UI.toast(message, type === "danger" ? "error" : type);

  const memoBody = document.querySelector("#pendingPrMemosTable tbody");
  const workspace = $("purchaseReturnMemoWorkspace");
  const itemsBody = document.querySelector(
    "#purchaseReturnSettlementItemsTable tbody"
  );

  let suppliers = [];
  let medicines = [];
  let purchaseInvoices = [];
  let purchaseItems = [];
  let memos = [];
  let memoItems = [];

  let allMemos = [];
  let selectedMemo = null;
  let selectedMemoItems = [];

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

  function reasonGroup(reason) {
    const text = String(reason || "").toLowerCase();
    if (text.includes("expir")) return "EXPIRY";
    if (text.includes("damag")) return "DAMAGE";
    if (text.includes("wrong")) return "WRONG";
    return "OTHER";
  }

  async function loadBaseData() {
    const [
      suppliersResult,
      medicinesResult,
      invoicesResult,
      purchaseItemsResult,
      memosResult,
      memoItemsResult
    ] = await Promise.all([
      supabaseClient.from("suppliers").select("*").limit(1000),
      supabaseClient.from("medicines").select("*").limit(5000),
      supabaseClient.from("purchase_invoices").select("*").limit(5000),
      supabaseClient.from("purchase_items").select("*").limit(10000),
      supabaseClient.from("purchase_return_memos").select("*").limit(5000),
      supabaseClient
        .from("purchase_return_memo_items")
        .select("*")
        .limit(10000)
    ]);

    const results = [
      suppliersResult,
      medicinesResult,
      invoicesResult,
      purchaseItemsResult,
      memosResult,
      memoItemsResult
    ];

    const firstError = results.find((result) => result.error)?.error;
    if (firstError) throw firstError;

    suppliers = suppliersResult.data || [];
    medicines = medicinesResult.data || [];
    purchaseInvoices = invoicesResult.data || [];
    purchaseItems = purchaseItemsResult.data || [];
    memos = memosResult.data || [];
    memoItems = memoItemsResult.data || [];

    buildMergedMemos();
  }

  function buildMergedMemos() {
    const supplierMap = new Map(
      suppliers.map((row) => [row.id, row])
    );

    const medicineMap = new Map(
      medicines.map((row) => [row.id, row])
    );

    const purchaseItemMap = new Map(
      purchaseItems.map((row) => [row.id, row])
    );

    const invoiceMap = new Map(
      purchaseInvoices.map((row) => [row.id, row])
    );

    const itemsByMemo = {};

    memoItems.forEach((row) => {
      const purchaseItem = purchaseItemMap.get(row.purchase_item_id);
      const invoice = invoiceMap.get(row.purchase_invoice_id);

      const merged = {
        ...row,
        medicines: medicineMap.get(row.medicine_id) || null,
        purchase_items: purchaseItem || null,
        purchase_invoices: invoice || null
      };

      if (!itemsByMemo[row.purchase_return_memo_id]) {
        itemsByMemo[row.purchase_return_memo_id] = [];
      }

      itemsByMemo[row.purchase_return_memo_id].push(merged);
    });

    allMemos = memos.map((memo) => ({
      ...memo,
      suppliers: supplierMap.get(memo.supplier_id) || null,
      purchase_return_memo_items: itemsByMemo[memo.id] || []
    }));
  }

  function populateSupplierFilter() {
    const current = $("pendingMemoSupplierFilter").value || "ALL";
    const supplierMap = new Map();

    allMemos.forEach((memo) => {
      supplierMap.set(
        memo.supplier_id,
        supplierName(memo.suppliers)
      );
    });

    $("pendingMemoSupplierFilter").innerHTML =
      '<option value="ALL">All Suppliers</option>' +
      [...supplierMap.entries()]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([id, name]) =>
          `<option value="${id}">${UI.safe(name)}</option>`
        )
        .join("");

    $("pendingMemoSupplierFilter").value =
      supplierMap.has(current) ? current : "ALL";
  }

  function renderStatistics() {
    const openStatuses = [
      "ISSUED",
      "CN_PENDING",
      "PARTIALLY_SETTLED"
    ];

    const open = allMemos.filter((row) =>
      openStatuses.includes(row.status)
    );

    $("memoCountOpen").textContent = open.length;
    $("memoCountExpiry").textContent =
      open.filter((row) =>
        reasonGroup(row.reason) === "EXPIRY"
      ).length;

    $("memoCountDamage").textContent =
      open.filter((row) =>
        reasonGroup(row.reason) === "DAMAGE"
      ).length;

    $("memoCountPartial").textContent =
      allMemos.filter((row) =>
        row.status === "PARTIALLY_SETTLED"
      ).length;

    $("memoCountSettled").textContent =
      allMemos.filter((row) =>
        row.status === "SETTLED"
      ).length;

    const pendingClaim = open.reduce(
      (sum, row) =>
        sum +
        Math.max(
          0,
          number(row.expected_claim_amount) -
          number(row.settled_claim_amount)
        ),
      0
    );

    $("memoPendingClaim").textContent = UI.money(pendingClaim);
  }

  function applyMemoFilters() {
    const search = $("pendingMemoSearch").value
      .trim()
      .toLowerCase();

    const status = $("pendingMemoStatusFilter").value;
    const reason = $("pendingMemoReasonFilter").value;
    const supplier = $("pendingMemoSupplierFilter").value;

    const openStatuses = [
      "ISSUED",
      "CN_PENDING",
      "PARTIALLY_SETTLED"
    ];

    const filtered = allMemos.filter((memo) => {
      if (
        status === "OPEN" &&
        !openStatuses.includes(memo.status)
      ) {
        return false;
      }

      if (
        !["OPEN", "ALL"].includes(status) &&
        memo.status !== status
      ) {
        return false;
      }

      if (
        reason !== "ALL" &&
        reasonGroup(memo.reason) !== reason
      ) {
        return false;
      }

      if (
        supplier !== "ALL" &&
        memo.supplier_id !== supplier
      ) {
        return false;
      }

      if (search) {
        const itemText =
          memo.purchase_return_memo_items
            .map((item) => [
              item.batch_number,
              item.supplier_invoice_number,
              item.medicines?.brand_name,
              item.medicines?.generic_name
            ]
              .filter(Boolean)
              .join(" ")
            )
            .join(" ");

        const searchable = [
          memo.memo_number,
          memo.reason,
          supplierName(memo.suppliers),
          itemText
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!searchable.includes(search)) {
          return false;
        }
      }

      return true;
    });

    renderMemoTable(filtered);
  }

  function renderMemoTable(rows) {
    memoBody.innerHTML = rows.length
      ? rows.map((memo) => {
          const pending = Math.max(
            0,
            number(memo.expected_claim_amount) -
            number(memo.settled_claim_amount)
          );

          const itemNames =
            memo.purchase_return_memo_items
              .slice(0, 3)
              .map((item) =>
                `${item.medicines?.brand_name || "Medicine"} / ${item.batch_number || "—"}`
              )
              .join("<br>");

          return `
            <tr>
              <td><b>${UI.safe(memo.memo_number)}</b></td>
              <td>${new Date(memo.memo_date).toLocaleString()}</td>
              <td>${UI.safe(supplierName(memo.suppliers))}</td>
              <td>${UI.safe(memo.reason || "—")}</td>
              <td>${itemNames || "—"}</td>
              <td>${UI.money(memo.expected_claim_amount)}</td>
              <td>${UI.money(memo.settled_claim_amount)}</td>
              <td>${UI.money(pending)}</td>
              <td>
                <span class="pr-status ${
                  memo.status === "SETTLED"
                    ? "pr-status-settled"
                    : memo.status === "PARTIALLY_SETTLED"
                      ? "pr-status-partial"
                      : "pr-status-cn-pending"
                }">
                  ${UI.safe(memo.status)}
                </span>
              </td>
              <td>
                ${
                  memo.status === "SETTLED"
                    ? "Completed"
                    : `<button
                         type="button"
                         class="settle-memo"
                         data-id="${memo.id}"
                       >
                         Settle
                       </button>`
                }
              </td>
            </tr>
          `;
        }).join("")
      : `
        <tr>
          <td colspan="10" class="cn-empty">
            No matching PR Memo found.
          </td>
        </tr>
      `;

    document.querySelectorAll(".settle-memo").forEach((button) => {
      button.onclick = () => openMemo(button.dataset.id);
    });
  }

  function openMemo(memoId) {
    const memo = allMemos.find((row) => row.id === memoId);

    if (!memo) {
      notify("PR Memo not found.", "danger");
      return;
    }

    selectedMemo = memo;

    selectedMemoItems =
      memo.purchase_return_memo_items.map((item) => ({
        ...item,
        accepted_paid_quantity: Math.max(
          0,
          number(item.memo_paid_quantity) -
          number(item.settled_paid_quantity)
        ),
        accepted_free_quantity: Math.max(
          0,
          number(item.memo_free_quantity) -
          number(item.settled_free_quantity)
        ),
        actual_credit_value: Math.max(
          0,
          number(item.expected_claim_amount) -
          number(item.settled_credit_amount)
        )
      }));

    renderSelectedMemo();
    renderSettlementItems();
    updateSettlementSummary();

    workspace.hidden = false;
    workspace.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function renderSelectedMemo() {
    $("selectedPrMemoNumber").textContent =
      selectedMemo.memo_number;

    $("selectedPrMemoStatus").innerHTML = `
      <span class="pr-status ${
        selectedMemo.status === "PARTIALLY_SETTLED"
          ? "pr-status-partial"
          : "pr-status-cn-pending"
      }">
        ${UI.safe(selectedMemo.status)}
      </span>
    `;

    $("prMemoSupplierText").textContent =
      supplierName(selectedMemo.suppliers);

    $("prMemoDateText").textContent =
      new Date(selectedMemo.memo_date).toLocaleString();

    $("prMemoReasonText").textContent =
      selectedMemo.reason || "—";

    $("prMemoExpectedClaimText").textContent =
      UI.money(selectedMemo.expected_claim_amount);

    $("settlementExpectedClaim").textContent =
      UI.money(
        Math.max(
          0,
          number(selectedMemo.expected_claim_amount) -
          number(selectedMemo.settled_claim_amount)
        )
      );

    $("supplierCreditTotalValue").value = "";
  }

  function renderSettlementItems() {
    itemsBody.innerHTML = selectedMemoItems
      .map((item, index) => {
        const medicine = item.medicines || {};
        const invoice = item.purchase_invoices || {};

        const remainingPaid =
          number(item.memo_paid_quantity) -
          number(item.settled_paid_quantity);

        const remainingFree =
          number(item.memo_free_quantity) -
          number(item.settled_free_quantity);

        const rejected = Math.max(
          0,
          remainingPaid +
          remainingFree -
          number(item.accepted_paid_quantity) -
          number(item.accepted_free_quantity)
        );

        return `
          <tr>
            <td>
              <b>${UI.safe(medicine.brand_name || "Medicine")}</b>
              <small>${UI.safe(medicine.generic_name || "")}</small>
              <small>Batch: ${UI.safe(item.batch_number || "—")}</small>
            </td>

            <td>
              ${UI.safe(invoice.supplier_invoice_number || "—")}
              <small>${UI.safe(invoice.purchase_number || "")}</small>
            </td>

            <td>${cleanQty(item.memo_paid_quantity)}</td>
            <td>${cleanQty(item.memo_free_quantity)}</td>
            <td>${cleanQty(item.settled_paid_quantity)}</td>
            <td>${cleanQty(item.settled_free_quantity)}</td>

            <td>
              <input
                class="settle-paid-qty"
                data-index="${index}"
                type="number"
                min="0"
                max="${remainingPaid}"
                step="0.001"
                value="${item.accepted_paid_quantity}"
              >
            </td>

            <td>
              <input
                class="settle-free-qty"
                data-index="${index}"
                type="number"
                min="0"
                max="${remainingFree}"
                step="0.001"
                value="${item.accepted_free_quantity}"
              >
            </td>

            <td>${cleanQty(rejected)}</td>
            <td>${UI.money(item.expected_claim_amount)}</td>

            <td>
              <input
                class="settle-actual-credit"
                data-index="${index}"
                type="number"
                min="0"
                step="0.01"
                value="${item.actual_credit_value}"
              >
            </td>
          </tr>
        `;
      })
      .join("");

    [
      [".settle-paid-qty", "accepted_paid_quantity"],
      [".settle-free-qty", "accepted_free_quantity"],
      [".settle-actual-credit", "actual_credit_value"]
    ].forEach(([selector, field]) => {
      document.querySelectorAll(selector).forEach((input) => {
        input.oninput = () => {
          const item =
            selectedMemoItems[number(input.dataset.index)];

          item[field] = Math.max(0, number(input.value));

          if (field === "accepted_paid_quantity") {
            item[field] = Math.min(
              item[field],
              number(item.memo_paid_quantity) -
              number(item.settled_paid_quantity)
            );
          }

          if (field === "accepted_free_quantity") {
            item[field] = Math.min(
              item[field],
              number(item.memo_free_quantity) -
              number(item.settled_free_quantity)
            );
          }

          input.value = item[field];
          renderSettlementItems();
          updateSettlementSummary();
        };
      });
    });
  }

  function updateSettlementSummary() {
    const actual = selectedMemoItems.reduce(
      (sum, item) =>
        sum + number(item.actual_credit_value),
      0
    );

    const accepted = selectedMemoItems.reduce(
      (sum, item) =>
        sum +
        number(item.accepted_paid_quantity) +
        number(item.accepted_free_quantity),
      0
    );

    const expected = Math.max(
      0,
      number(selectedMemo?.expected_claim_amount) -
      number(selectedMemo?.settled_claim_amount)
    );

    $("settlementActualCredit").textContent =
      UI.money(actual);

    $("settlementShortCredit").textContent =
      UI.money(Math.max(0, expected - actual));

    $("settlementAcceptedQuantity").textContent =
      cleanQty(accepted);

    if (!$("supplierCreditTotalValue").value) {
      $("supplierCreditTotalValue").value =
        actual.toFixed(2);
    }
  }

  async function postPurchaseReturn() {
    if (!selectedMemo) {
      notify("Select a PR Memo.", "warning");
      return;
    }

    if (!$("supplierCreditNoteNumber").value.trim()) {
      notify("Supplier CN number is required.", "warning");
      return;
    }

    if (!$("supplierCreditNoteDate").value) {
      notify("Supplier CN date is required.", "warning");
      return;
    }

    const selectedItems = selectedMemoItems.filter((item) =>
      number(item.accepted_paid_quantity) > 0 ||
      number(item.accepted_free_quantity) > 0
    );

    if (!selectedItems.length) {
      notify("Enter accepted quantity.", "warning");
      return;
    }

    const button = $("postPurchaseReturnSettlementButton");
    button.disabled = true;
    button.textContent = "Posting Purchase Return...";

    try {
      const { data, error } = await supabaseClient.rpc(
        "settle_pr_memo_as_purchase_return_v2",
        {
          p_purchase_return_memo_id: selectedMemo.id,
          p_supplier_cn_number:
            $("supplierCreditNoteNumber").value.trim(),
          p_supplier_cn_date:
            $("supplierCreditNoteDate").value,
          p_settlement_type:
            $("purchaseReturnSettlementType").value,
          p_supplier_taxable_value:
            number($("supplierCreditTaxableValue").value),
          p_supplier_gst_value:
            number($("supplierCreditGstValue").value),
          p_supplier_total_credit:
            number($("supplierCreditTotalValue").value),
          p_short_credit_reason:
            $("purchaseReturnShortCreditReason").value || null,
          p_notes:
            $("purchaseReturnSettlementNotes").value.trim() || null,
          p_items: selectedItems.map((item) => ({
            memo_item_id: item.id,
            accepted_paid_quantity:
              number(item.accepted_paid_quantity),
            accepted_free_quantity:
              number(item.accepted_free_quantity),
            actual_credit_value:
              number(item.actual_credit_value)
          }))
        }
      );

      if (error) throw error;

      if (!data?.purchase_return_id) {
        throw new Error(
          "Purchase Return was posted but its saved record was not returned."
        );
      }

      const { data: savedReturn, error: savedReturnError } =
        await supabaseClient
          .from("purchase_returns")
          .select("return_number")
          .eq("id", data.purchase_return_id)
          .single();

      if (savedReturnError) throw savedReturnError;

      if (!savedReturn?.return_number) {
        throw new Error(
          "Purchase Return was posted but its saved number could not be verified."
        );
      }

      notify(
        `Purchase Return ${savedReturn.return_number} posted successfully.`
      );

      workspace.hidden = true;
      selectedMemo = null;
      selectedMemoItems = [];

      await loadBaseData();
      populateSupplierFilter();
      renderStatistics();
      applyMemoFilters();
    } catch (error) {
      notify(error.message, "danger");
    } finally {
      button.disabled = false;
      button.textContent = "Confirm Purchase Return";
    }
  }

  [
    "pendingMemoSearch",
    "pendingMemoStatusFilter",
    "pendingMemoReasonFilter",
    "pendingMemoSupplierFilter"
  ].forEach((id) => {
    $(id).oninput = applyMemoFilters;
    $(id).onchange = applyMemoFilters;
  });

  $("refreshPendingMemosButton").onclick = async () => {
    await loadBaseData();
    populateSupplierFilter();
    renderStatistics();
    applyMemoFilters();
  };

  $("changePrMemoButton").onclick = () => {
    workspace.hidden = true;
    selectedMemo = null;
    selectedMemoItems = [];
  };

  $("postPurchaseReturnSettlementButton").onclick =
    postPurchaseReturn;

  try {
    await loadBaseData();
    populateSupplierFilter();
    renderStatistics();
    applyMemoFilters();

    const storedMemoId =
      sessionStorage.getItem(
        "medvika_purchase_return_memo_id"
      );

    if (storedMemoId) {
      sessionStorage.removeItem(
        "medvika_purchase_return_memo_id"
      );
      openMemo(storedMemoId);
    }
  } catch (error) {
    notify(
      "Purchase Return page could not load: " +
      error.message,
      "danger"
    );
  }
};
