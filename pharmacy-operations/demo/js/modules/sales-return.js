window.initSalesReturnModule = async function initSalesReturnModule() {
  const UI = window.MedvikaUI;
  const $ = (id) => document.getElementById(id);

  const requiredIds = [
    "invoiceSearch",
    "searchInvoiceButton",
    "searchResults",
    "returnWorkspace",
    "returnItemsTable",
    "previousReturnsTable",
    "returnForm",
    "selectedInvoiceNumber",
    "selectedInvoiceStatus",
    "invoiceDateText",
    "customerText",
    "invoiceTotalText",
    "previousReturnText",
    "returnReason",
    "refundMode",
    "returnNotes",
    "selectedLinesText",
    "returnQuantityText",
    "refundTotalText",
    "saveReturnButton",
    "returnSuccess",
    "clearInvoiceButton"
  ];

  const missingIds = requiredIds.filter((id) => !$(id));

  if (missingIds.length) {
    throw new Error(
      "Sales Return page mismatch. Missing elements: " +
      missingIds.join(", ")
    );
  }

  const notify = (message, type = "success") =>
    UI.toast(message, type === "danger" ? "error" : type);

  const searchInput = $("invoiceSearch");
  const searchButton = $("searchInvoiceButton");
  const searchResults = $("searchResults");
  const workspace = $("returnWorkspace");
  const itemsBody = document.querySelector("#returnItemsTable tbody");
  const previousBody = document.querySelector("#previousReturnsTable tbody");
  const returnForm = $("returnForm");

  let selectedInvoice = null;
  let invoiceItems = [];
  let previousReturns = [];

  const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const cleanQty = (value) =>
    toNumber(value).toFixed(3).replace(/\.?0+$/, "");

  const wholeNumber = (value) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  };

  const unitsPerPack = (item) =>
    Math.max(1, wholeNumber(item?.medicines?.units_per_pack || 1));

  const toBaseUnits = (packEquivalent, item) =>
    Math.max(0, Math.round(toNumber(packEquivalent) * unitsPerPack(item)));

  const toPackEquivalent = (stripQty, tabQty, item) =>
    wholeNumber(stripQty) +
    wholeNumber(tabQty) / unitsPerPack(item);

  const splitQuantity = (packEquivalent, item) => {
    const units = toBaseUnits(packEquivalent, item);
    const perPack = unitsPerPack(item);

    return {
      strips: Math.floor(units / perPack),
      tabs: units % perPack,
      units
    };
  };

  const formatSplitQuantity = (packEquivalent, item) => {
    const medicine = item.medicines || {};
    const split = splitQuantity(packEquivalent, item);
    const packName = medicine.primary_pack_unit || "Strip";
    const looseName = medicine.loose_unit || "Tab";
    const looseAllowed = !!medicine.loose_sale_allowed && unitsPerPack(item) > 1;

    if (!looseAllowed) {
      return `${split.strips} ${packName}`;
    }

    if (split.strips && split.tabs) {
      return `${split.strips} ${packName} + ${split.tabs} ${looseName}`;
    }

    if (split.tabs) {
      return `${split.tabs} ${looseName}`;
    }

    return `${split.strips} ${packName}`;
  };

  const refreshReturnQuantity = (item) => {
    item.return_quantity = toPackEquivalent(
      item.return_strips,
      item.return_tabs,
      item
    );
  };

  const formatDate = (value) =>
    value ? new Date(value).toLocaleString() : "—";

  async function searchInvoices() {
    const query = searchInput.value.trim();

    if (query.length < 2) {
      notify("Enter at least two characters.", "warning");
      return;
    }

    searchButton.disabled = true;
    searchButton.textContent = "Searching...";

    try {
      const cleanQuery = query.replace(/[%_,()]/g, "");

      const { data, error } = await supabaseClient
        .from("sales_invoices")
        .select(`
          id,
          invoice_number,
          invoice_date,
          invoice_status,
          grand_total,
          patient_name,
          customers(full_name,mobile)
        `)
        .neq("invoice_status", "cancelled")
        .or(
          `invoice_number.ilike.%${cleanQuery}%,patient_name.ilike.%${cleanQuery}%`
        )
        .order("invoice_date", { ascending: false })
        .limit(20);

      if (error) throw error;

      const lower = query.toLowerCase();
      const rows = (data || []).filter((row) => {
        const text = [
          row.invoice_number,
          row.patient_name,
          row.customers?.full_name,
          row.customers?.mobile
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return text.includes(lower);
      });

      searchResults.innerHTML = rows.length
        ? rows
            .map(
              (row) => `
                <button
                  type="button"
                  class="search-result invoice-result"
                  data-id="${row.id}"
                >
                  <b>${UI.safe(row.invoice_number)}</b>
                  <small>${formatDate(row.invoice_date)}</small>
                  <small>${UI.safe(
                    row.customers?.full_name ||
                      row.patient_name ||
                      "Walk-in Customer"
                  )}</small>
                  <span class="erp-badge erp-badge-success">
                    ${UI.money(row.grand_total)}
                  </span>
                </button>
              `
            )
            .join("")
        : '<div class="search-result">No active invoice found.</div>';

      searchResults.classList.add("open");

      searchResults.querySelectorAll(".invoice-result").forEach((row) => {
        row.onclick = () => selectInvoice(row.dataset.id);
      });
    } catch (error) {
      notify(error.message, "danger");
    } finally {
      searchButton.disabled = false;
      searchButton.textContent = "Search Invoice";
    }
  }

  async function selectInvoice(invoiceId) {
    searchResults.classList.remove("open");

    try {
      const { data: invoice, error: invoiceError } = await supabaseClient
        .from("sales_invoices")
        .select(`
          id,
          invoice_number,
          invoice_date,
          invoice_status,
          grand_total,
          patient_name,
          pharmacy_id,
          customers(full_name,mobile)
        `)
        .eq("id", invoiceId)
        .single();

      if (invoiceError) throw invoiceError;

      if (String(invoice.invoice_status).toLowerCase() === "cancelled") {
        throw new Error("Cancelled invoices cannot be returned.");
      }

      const { data: items, error: itemsError } = await supabaseClient
        .from("sales_items")
        .select(`
          id,
          medicine_id,
          medicine_batch_id,
          batch_number,
          quantity,
          selling_rate,
          gst_percent,
          gst_amount,
          line_total,
          medicines(brand_name,generic_name,primary_pack_unit,loose_unit,units_per_pack,loose_sale_allowed)
        `)
        .eq("sales_invoice_id", invoiceId)
        .order("created_at", { ascending: true });

      if (itemsError) throw itemsError;

      const { data: returns, error: returnsError } = await supabaseClient
        .from("sales_returns")
        .select(
          "id,return_number,return_date,reason,refund_mode,refund_amount"
        )
        .eq("sales_invoice_id", invoiceId)
        .order("return_date", { ascending: false });

      if (returnsError) throw returnsError;

      let returnItems = [];

      if ((returns || []).length) {
        const returnIds = returns.map((row) => row.id);

        const { data, error } = await supabaseClient
          .from("sales_return_items")
          .select("sales_return_id,sales_item_id,return_quantity")
          .in("sales_return_id", returnIds);

        if (error) throw error;
        returnItems = data || [];
      }

      const returnedByItem = {};

      returnItems.forEach((row) => {
        returnedByItem[row.sales_item_id] =
          toNumber(returnedByItem[row.sales_item_id]) +
          toNumber(row.return_quantity);
      });

      selectedInvoice = invoice;
      previousReturns = returns || [];

      invoiceItems = (items || []).map((item) => {
        const sold = toNumber(item.quantity);
        const alreadyReturned = toNumber(returnedByItem[item.id]);

        return {
          ...item,
          sold_quantity: sold,
          already_returned: alreadyReturned,
          available_to_return: Math.max(0, sold - alreadyReturned),
          selected: false,
          return_strips: 0,
          return_tabs: 0,
          return_quantity: 0,
          stock_action: "RETURN_TO_STOCK"
        };
      });

      renderInvoice();
      renderItems();
      renderPreviousReturns();

      workspace.hidden = false;
      workspace.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      notify(error.message, "danger");
    }
  }

  function renderInvoice() {
    $("selectedInvoiceNumber").textContent = selectedInvoice.invoice_number;

    $("selectedInvoiceStatus").innerHTML = `
      <span class="erp-badge erp-badge-success">
        ${UI.safe(selectedInvoice.invoice_status)}
      </span>
    `;

    $("invoiceDateText").textContent = formatDate(
      selectedInvoice.invoice_date
    );

    $("customerText").textContent =
      selectedInvoice.customers?.full_name ||
      selectedInvoice.patient_name ||
      "Walk-in Customer";

    $("invoiceTotalText").textContent = UI.money(
      selectedInvoice.grand_total
    );

    $("previousReturnText").textContent = UI.money(
      previousReturns.reduce(
        (sum, row) => sum + toNumber(row.refund_amount),
        0
      )
    );
  }

  function renderItems() {
    if (!invoiceItems.length) {
      itemsBody.innerHTML =
        '<tr><td colspan="9" class="return-empty">No sale items found.</td></tr>';
      updateSummary();
      return;
    }

    itemsBody.innerHTML = invoiceItems
      .map((item, index) => {
        const medicine = item.medicines || {};
        const perPack = unitsPerPack(item);
        const looseAllowed =
          !!medicine.loose_sale_allowed && perPack > 1;

        const unitRefund =
          item.sold_quantity > 0
            ? toNumber(item.line_total) / item.sold_quantity
            : 0;

        const refund =
          unitRefund * toNumber(item.return_quantity);

        const unavailable = item.available_to_return <= 0;
        const availableSplit = splitQuantity(
          item.available_to_return,
          item
        );

        return `
          <tr>
            <td>
              <input
                class="return-select"
                data-index="${index}"
                type="checkbox"
                ${item.selected ? "checked" : ""}
                ${unavailable ? "disabled" : ""}
              >
            </td>

            <td>
              <b>${UI.safe(medicine.brand_name || "Medicine")}</b>
              <small>${UI.safe(medicine.generic_name || "")}</small>
              <small>Batch: ${UI.safe(item.batch_number || "—")}</small>
              ${
                looseAllowed
                  ? `<small>1 ${UI.safe(
                      medicine.primary_pack_unit || "Strip"
                    )} = ${perPack} ${UI.safe(
                      medicine.loose_unit || "Tab"
                    )}</small>`
                  : ""
              }
            </td>

            <td>${UI.safe(formatSplitQuantity(item.sold_quantity, item))}</td>
            <td>${UI.safe(formatSplitQuantity(item.already_returned, item))}</td>
            <td>${UI.safe(formatSplitQuantity(item.available_to_return, item))}</td>

            <td>
              <input
                class="return-strip-qty"
                data-index="${index}"
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                value="${item.return_strips || 0}"
                ${!item.selected || unavailable ? "disabled" : ""}
                style="min-width:72px"
              >
              <small>
                Max ${availableSplit.strips}
                ${UI.safe(medicine.primary_pack_unit || "Strip")}
              </small>
            </td>

            <td>
              ${
                looseAllowed
                  ? `
                    <input
                      class="return-tab-qty"
                      data-index="${index}"
                      type="number"
                      min="0"
                      step="1"
                      inputmode="numeric"
                      value="${item.return_tabs || 0}"
                      ${!item.selected || unavailable ? "disabled" : ""}
                      style="min-width:72px"
                    >
                    <small>
                      ${UI.safe(medicine.loose_unit || "Tab")}
                    </small>
                  `
                  : `<span class="erp-badge">N/A</span>`
              }
            </td>

            <td>
              <select
                class="stock-action"
                data-index="${index}"
                ${!item.selected || unavailable ? "disabled" : ""}
              >
                <option value="RETURN_TO_STOCK" ${
                  item.stock_action === "RETURN_TO_STOCK" ? "selected" : ""
                }>Return to Stock</option>
                <option value="DAMAGED" ${
                  item.stock_action === "DAMAGED" ? "selected" : ""
                }>Damaged</option>
                <option value="QUARANTINE" ${
                  item.stock_action === "QUARANTINE" ? "selected" : ""
                }>Quarantine</option>
              </select>
            </td>

            <td>${UI.money(refund)}</td>
          </tr>
        `;
      })
      .join("");

    document.querySelectorAll(".return-select").forEach((input) => {
      input.onchange = () => {
        const item = invoiceItems[toNumber(input.dataset.index)];
        item.selected = input.checked;

        if (!item.selected) {
          item.return_strips = 0;
          item.return_tabs = 0;
          item.return_quantity = 0;
        }

        renderItems();
      };
    });

    const handleQuantityChange = (input, field) => {
      const item = invoiceItems[toNumber(input.dataset.index)];
      const medicine = item.medicines || {};
      const perPack = unitsPerPack(item);

      if (
        input.value.includes(".") ||
        input.value.includes(",") ||
        Number(input.value) < 0
      ) {
        notify("Decimal quantities are not allowed.", "warning");
        input.value = item[field] || 0;
        return;
      }

      item[field] = wholeNumber(input.value);

      if (field === "return_tabs") {
        if (!medicine.loose_sale_allowed || perPack <= 1) {
          item.return_tabs = 0;
        } else if (item.return_tabs >= perPack) {
          item.return_strips += Math.floor(item.return_tabs / perPack);
          item.return_tabs %= perPack;
        }
      }

      refreshReturnQuantity(item);

      const requestedUnits = toBaseUnits(item.return_quantity, item);
      const availableUnits = toBaseUnits(item.available_to_return, item);

      if (requestedUnits > availableUnits) {
        const available = splitQuantity(item.available_to_return, item);
        item.return_strips = available.strips;
        item.return_tabs =
          medicine.loose_sale_allowed && perPack > 1
            ? available.tabs
            : 0;
        refreshReturnQuantity(item);

        notify(
          `Return cannot exceed ${formatSplitQuantity(
            item.available_to_return,
            item
          )}.`,
          "warning"
        );
      }

      renderItems();
    };

    document.querySelectorAll(".return-strip-qty").forEach((input) => {
      input.onkeydown = (event) => {
        if ([".", ",", "-", "e", "E", "+"].includes(event.key)) {
          event.preventDefault();
        }
      };

      input.onchange = () =>
        handleQuantityChange(input, "return_strips");
    });

    document.querySelectorAll(".return-tab-qty").forEach((input) => {
      input.onkeydown = (event) => {
        if ([".", ",", "-", "e", "E", "+"].includes(event.key)) {
          event.preventDefault();
        }
      };

      input.onchange = () =>
        handleQuantityChange(input, "return_tabs");
    });

    document.querySelectorAll(".stock-action").forEach((select) => {
      select.onchange = () => {
        invoiceItems[toNumber(select.dataset.index)].stock_action =
          select.value;
      };
    });

    updateSummary();
  }

  function renderPreviousReturns() {
    previousBody.innerHTML = previousReturns.length
      ? previousReturns
          .map(
            (row) => `
              <tr>
                <td><b>${UI.safe(row.return_number)}</b></td>
                <td>${formatDate(row.return_date)}</td>
                <td>${UI.safe(row.reason || "—")}</td>
                <td>${UI.safe(row.refund_mode || "—")}</td>
                <td>${UI.money(row.refund_amount)}</td>
              </tr>
            `
          )
          .join("")
      : '<tr><td colspan="5" class="return-empty">No previous returns.</td></tr>';
  }

  function selectedReturnItems() {
    return invoiceItems.filter(
      (item) =>
        item.selected &&
        toBaseUnits(item.return_quantity, item) > 0
    );
  }

  function updateSummary() {
    const selected = selectedReturnItems();

    let refund = 0;
    const quantityLabels = [];

    selected.forEach((item) => {
      const unitRefund =
        item.sold_quantity > 0
          ? toNumber(item.line_total) / item.sold_quantity
          : 0;

      refund += unitRefund * toNumber(item.return_quantity);
      quantityLabels.push(formatSplitQuantity(item.return_quantity, item));
    });

    $("selectedLinesText").textContent = selected.length;
    $("returnQuantityText").textContent =
      quantityLabels.length ? quantityLabels.join(", ") : "0";
    $("refundTotalText").textContent = UI.money(refund);
  }

  returnForm.onsubmit = async (event) => {
    event.preventDefault();

    if (!selectedInvoice) {
      notify("Select an invoice first.", "warning");
      return;
    }

    invoiceItems.forEach(refreshReturnQuantity);
    const selected = selectedReturnItems();

    if (!selected.length) {
      notify(
        "Select at least one item and enter return quantity.",
        "warning"
      );
      return;
    }

    const reason = $("returnReason").value;

    if (!reason) {
      notify("Select a return reason.", "warning");
      return;
    }

    for (const item of selected) {
      if (
        toBaseUnits(item.return_quantity, item) >
        toBaseUnits(item.available_to_return, item)
      ) {
        notify(
          `Return quantity exceeds the available quantity for ${
            item.medicines?.brand_name || "a medicine"
          }.`,
          "warning"
        );
        return;
      }
    }

    const button = $("saveReturnButton");
    button.disabled = true;
    button.textContent = "Processing Return...";

    try {
      const { data, error } = await supabaseClient.rpc(
        "create_sales_return",
        {
          p_sales_invoice_id: selectedInvoice.id,
          p_reason: reason,
          p_refund_mode: $("refundMode").value,
          p_notes: $("returnNotes").value.trim() || null,
          p_items: selected.map((item) => ({
            sales_item_id: item.id,
            quantity: Number(toNumber(item.return_quantity).toFixed(6)),
            primary_quantity: wholeNumber(item.return_strips),
            loose_quantity: wholeNumber(item.return_tabs),
            stock_action: item.stock_action
          }))
        }
      );

      if (error) throw error;

      $("returnSuccess").hidden = false;
      $("returnSuccess").innerHTML = `
        <b>Sales return completed.</b>
        <br>Return No.: ${UI.safe(data.return_number)}
        <br>Refund: ${UI.money(data.refund_amount)}
      `;

      notify(`Return ${data.return_number} saved successfully.`);

      await selectInvoice(selectedInvoice.id);
    } catch (error) {
      notify(error.message, "danger");
    } finally {
      button.disabled = false;
      button.textContent = "Confirm Sales Return";
    }
  };

  searchButton.onclick = searchInvoices;

  searchInput.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchInvoices();
    }
  };

  $("clearInvoiceButton").onclick = () => {
    selectedInvoice = null;
    invoiceItems = [];
    previousReturns = [];
    workspace.hidden = true;
    searchInput.value = "";
    searchInput.focus();
    searchResults.innerHTML = "";
    $("returnSuccess").hidden = true;
  };
};
