window.initSalesManagementModule =
async function initSalesManagementModule() {

const UI = window.MedvikaUI;
const recentSalesBody =
  document.querySelector("#recentSalesTable tbody");

const showCancelledSales =
  document.getElementById("showCancelledSales");

let recentSales = [];

async function loadManagedSales() {
  const { data, error } = await supabaseClient
    .from("sales_invoices")
    .select(`
      id,
      invoice_number,
      invoice_date,
      grand_total,
      amount_paid,
      payment_status,
      invoice_status,
      cancellation_reason,
      customers ( full_name )
    `)
    .order("invoice_date", { ascending: false })
    .limit(100);

  if (error) {
    UI.alert("Sales history could not be loaded: " + error.message, "danger");
    return;
  }

  recentSales = data || [];
  renderManagedSales();
}

function renderManagedSales() {
  const includeCancelled = showCancelledSales?.checked;

  recentSalesBody.innerHTML = "";

  recentSales
    .filter((invoice) =>
      includeCancelled || invoice.invoice_status !== "cancelled"
    )
    .forEach((invoice) => {
      const actions = invoice.invoice_status === "posted"
        ? `
          <button type="button" class="print-sale" data-id="${invoice.id}" style="background:#0b3c5d">
            Print
          </button>
          <button type="button" class="cancel-sale" data-id="${invoice.id}" data-number="${UI.safe(invoice.invoice_number)}" style="background:#dc2626">
            Cancel
          </button>
        `
        : `
          <button type="button" class="print-sale" data-id="${invoice.id}" style="background:#0b3c5d">
            View
          </button>
        `;

      recentSalesBody.insertAdjacentHTML("beforeend", `
        <tr>
          <td><b>${UI.safe(invoice.invoice_number)}</b></td>
          <td>${new Date(invoice.invoice_date).toLocaleString()}</td>
          <td>${UI.safe(invoice.customers?.full_name || "Walk-in")}</td>
          <td>${UI.money(invoice.grand_total)}</td>
          <td>${UI.money(invoice.amount_paid)}</td>
          <td>${UI.safe(invoice.payment_status)} / ${UI.safe(invoice.invoice_status)}</td>
          <td>
            <div style="display:flex;gap:7px;flex-wrap:wrap">
              ${actions}
            </div>
          </td>
        </tr>
      `);
    });

  document.querySelectorAll(".print-sale").forEach((button) => {
    button.onclick = () => {
      window.open(
        `sales-print.html?id=${encodeURIComponent(button.dataset.id)}`,
        "_blank"
      );
    };
  });

  document.querySelectorAll(".cancel-sale").forEach((button) => {
    button.onclick = () =>
      cancelSale(button.dataset.id, button.dataset.number);
  });
}

async function cancelSale(id, invoiceNumber) {
  const reason = window.prompt(
    `Cancel sales invoice "${invoiceNumber}"?\n\nEnter cancellation reason:`
  );

  if (reason === null) return;

  const confirmed = window.confirm(
    "The invoice will be cancelled and all sold quantities will be restored to their original batches. Continue?"
  );

  if (!confirmed) return;

  const { error } = await supabaseClient.rpc("cancel_sales_invoice", {
    p_sales_invoice_id: id,
    p_reason: reason.trim() || null
  });

  if (error) {
    UI.alert("Sale could not be cancelled: " + error.message, "danger");
    return;
  }

  UI.alert("Sale cancelled and stock restored successfully.");
  await loadManagedSales();

  if (typeof loadMedicines === "function") {
    await loadMedicines();
  }
}

if (showCancelledSales) {
  showCancelledSales.addEventListener("change", renderManagedSales);
}
await loadManagedSales();

};
