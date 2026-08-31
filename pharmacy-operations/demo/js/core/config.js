window.MedvikaConfig = {
  appName: "Medvika Pharmacy Operations Management Solution",
  version: "0.3",
  defaultRoute: "dashboard",

  routes: {
    // =========================================================
    // OVERVIEW
    // =========================================================
    dashboard: {
  title: "Dashboard",
  breadcrumb: "Home / Dashboard",
  file: "pages/dashboard.html?v=20260830-4",
  permission: "dashboard.view",
  script: "js/modules/dashboard.js?v=20260830-4",
  style: "css/modules/dashboard.css?v=20260830-4"
},

    // =========================================================
    // MASTERS
    // =========================================================
    medicines: {
      title: "Medicines",
      breadcrumb: "Masters / Medicines",
      file: "pages/medicines.html",
      permission: "masters.view",
      script: "js/modules/medicines.js",
      style: "css/modules/medicines.css"
    },

    manufacturers: {
      title: "Manufacturers",
      breadcrumb: "Masters / Manufacturers",
      file: "pages/manufacturers.html",
      permission: "masters.view",
      script: "js/modules/manufacturers.js",
      style: "css/modules/manufacturers.css"
    },

    suppliers: {
      title: "Suppliers",
      breadcrumb: "Masters / Suppliers",
      file: "pages/suppliers.html",
      permission: "masters.view",
      script: "js/modules/suppliers.js",
      style: "css/modules/suppliers.css"
    },

    customers: {
      title: "Customers",
      breadcrumb: "Masters / Customers",
      file: "pages/customers.html",
      permission: "masters.view",
      script: "js/modules/customers.js",
      style: "css/modules/customers.css"
    },

    doctors: {
      title: "Doctors",
      breadcrumb: "Masters / Doctors",
      file: "pages/doctors.html",
      permission: "masters.view",
      script: "js/modules/doctors.js",
      style: "css/modules/doctors.css"
    },

    // =========================================================
    // TRANSACTIONS
    // =========================================================
    sales: {
      title: "Sales Billing",
      breadcrumb: "Transactions / Sales Billing",
      file: "pages/sales.html?v=20260830-2",
      permission: "sales.view",
      script: "js/modules/sales.js?v=20260830-2",
      style: "css/modules/sales.css?v=20260830-2"
    },

    "sales-return": {
      title: "Sales Return",
      breadcrumb: "Transactions / Sales Return",
      file: "pages/sales-return.html",
      permission: "sales.view",
      script: "js/modules/sales-return.js",
      style: "css/modules/sales-return.css"
    },

    // Navigation uses "sales-cancelled", so keep this as the canonical key.
    "sales-cancelled": {
      title: "Cancelled Sales",
      breadcrumb: "Transactions / Cancelled Sales",
      file: "pages/cancelled-sales.html",
      permission: "sales.view",
      script: "js/modules/cancelled-sales.js",
      init: "initCancelledSalesModule",
      style: "css/modules/cancelled-sales.css"
    },

    purchase: {
      title: "Purchase",
      breadcrumb: "Transactions / Purchase",
      file: "pages/purchase.html",
      permission: "purchase.view",
      script: "js/modules/purchase.js",
      style: "css/modules/purchase.css?v=20260829-1"
    },

    "purchase-order": {
      title: "Purchase Order",
      breadcrumb: "Transactions / Purchase Order",
      file: "pages/purchase-order.html",
      permission: "purchase.view",
      script: "js/modules/purchase-order.js",
      style: "css/modules/purchase-order.css"
    },

    "purchase-return": {
      title: "Purchase Return",
      breadcrumb: "Transactions / Purchase Return",
      file: "pages/purchase-return.html",
      permission: "purchase.view",
      script: "js/modules/purchase-return.js",
      style: "css/modules/pr-memo.css"
    },

    "pr-memo": {
      title: "PR Memo",
      breadcrumb: "Transactions / PR Memo",
      file: "pages/pr-memo.html?v=20260829-1",
      permission: "purchase.view",
      script: "js/modules/pr-memo.js?v=20260829-1",
      style: "css/modules/pr-memo.css"
    },

    // =========================================================
    // STOCK
    // =========================================================
    inventory: {
      title: "Inventory & Batches",
      breadcrumb: "Stock / Inventory & Batches",
      file: "pages/inventory.html",
      permission: "inventory.view",
      script: "js/modules/inventory.js",
      style: "css/modules/inventory.css"
    },

    "organization-stock": {
      title: "Search Across Branches",
      breadcrumb: "Stock / Search Across Branches",
      file: "pages/organization-stock.html",
      permission: "inventory.organization_search",
      script: "js/modules/organization-stock.js",
      style: "css/modules/organization-stock.css"
    },

    "batch-stock": {
      title: "Batch Stock",
      breadcrumb: "Stock / Batch Stock",
      file: "pages/inventory.html",
      permission: "inventory.view",
      script: "js/modules/inventory.js",
      style: "css/modules/inventory.css"
    },

    "stock-transfer": {
      title: "Stock Transfer",
      breadcrumb: "Stock / Stock Transfer",
      file: "pages/stock-transfer.html",
      permission: "inventory.transfer",
      script: "js/modules/stock-transfer.js",
      style: "css/modules/stock-transfer.css"
    },

    "stock-adjustment": {
      title: "Stock Adjustment",
      breadcrumb: "Stock / Stock Adjustment",
      file: "pages/stock-adjustment.html?v=20260830-8",
      permission: "inventory.view",
      script: "js/modules/stock-adjustment.js?v=20260830-8",
      style: "css/modules/stock-adjustment.css?v=20260830-8"
    },

    "damage-expiry": {
      title: "Damage & Expiry",
      breadcrumb: "Stock / Damage & Expiry",
      file: "pages/damage-expiry.html?v=20260830-11",
      permission: "inventory.view",
      script: "js/modules/damage-expiry.js?v=20260830-11",
      style: "css/modules/damage-expiry.css?v=20260830-11"
    },

    "near-expiry": {
      title: "Near Expiry Automation",
      breadcrumb: "Stock / Near Expiry Automation",
      file: "pages/near-expiry.html?v=20260831-2",
      permission: "inventory.view",
      script: "js/modules/near-expiry.js?v=20260831-2",
      style: "css/modules/near-expiry.css?v=20260831-2"
    },

    "stock-audit": {
      title: "Physical Stock Verification",
      breadcrumb: "Stock / Physical Stock Verification",
      file: "pages/stock-audit.html",
      permission: "inventory.view",
      script: "js/modules/stock-audit.js",
      style: "css/modules/stock-audit.css"
    },

    // =========================================================
    // ACCOUNTS
    // =========================================================
    expenses: {
      title: "Expenses",
      breadcrumb: "Accounts / Expenses",
      file: "pages/expenses.html",
      permission: "expenses.view",
      script: "js/modules/expenses.js?v=20260828-1",
      style: "css/modules/expenses.css"
    },

    cashbook: {
      title: "Cash Book",
      breadcrumb: "Accounts / Cash Book",
      file: "pages/cashbook.html?v=20260828-2",
      permission: "expenses.view",
      script: "js/modules/cashbook.js?v=20260829-3",
      style: "css/modules/cashbook.css"
    },

    payments: {
      title: "Payments",
      breadcrumb: "Accounts / Payments",
      file: "pages/payments.html",
      permission: "expenses.view",
      script: "js/modules/payments.js?v=20260829-1",
      style: "css/modules/payments.css"
    },

    receipts: {
      title: "Receipts",
      breadcrumb: "Accounts / Receipts",
      file: "pages/receipts.html?v=20260829-1",
      permission: "expenses.view",
      script: "js/modules/receipts.js?v=20260829-1",
      style: "css/modules/receipts.css"
    },

    "supplier-ledger": {
      title: "Supplier Ledger",
      breadcrumb: "Accounts / Supplier Ledger",
      file: "pages/supplier-ledger.html",
      permission: "supplier.ledger",
      script: "js/modules/supplier-ledger.js?v=20260829-1",
      style: "css/modules/supplier-ledger.css"
    },

    "customer-ledger": {
      title: "Customer Ledger",
      breadcrumb: "Accounts / Customer Ledger",
      file: "pages/customer-ledger.html?v=20260829-1",
      permission: "sales.view",
      script: "js/modules/customer-ledger.js?v=20260829-1",
      style: "css/modules/customer-ledger.css"
    },

    // =========================================================
    // REPORTS
    // =========================================================
    "sales-report": {
      title: "Sales Report",
      breadcrumb: "Reports / Sales Report",
      file: "pages/sales-report.html",
      permission: "reports.view",
      script: "js/modules/sales-report.js?v=20260828-1",
      style: "css/modules/sales-report.css"
    },

    "purchase-report": {
      title: "Purchase Report",
      breadcrumb: "Reports / Purchase Report",
      file: "pages/purchase-report.html",
      permission: "reports.view",
      script: "js/modules/purchase-report.js?v=20260828-1",
      style: "css/modules/purchase-report.css"
    },

    "profit-report": {
      title: "Profit & Loss",
      breadcrumb: "Reports / Profit & Loss",
      file: "pages/profit-report.html?v=20260830-1",
      permission: "reports.view",
      script: "js/modules/profit-report.js?v=20260830-1",
      style: "css/modules/profit-report.css"
    },

    "margin-report": {
      title: "Margin Report",
      breadcrumb: "Reports / Margin Report",
      file: "pages/margin-report.html?v=20260830-1",
      permission: "reports.view",
      script: "js/modules/margin-report.js?v=20260830-1",
      style: "css/modules/margin-report.css"
    },

    "stock-report": {
      title: "Stock Summary & Valuation",
      breadcrumb: "Reports / Stock Summary & Valuation",
      file: "pages/stock-report.html",
      permission: "reports.view",
      script: "js/modules/stock-report.js?v=20260828-1",
      style: "css/modules/stock-report.css"
    },

    "expiry-report": {
      title: "Expiry Report",
      breadcrumb: "Reports / Expiry Report",
      file: "pages/expiry-report.html?v=20260829-1",
      permission: "reports.view",
      script: "js/modules/expiry-report.js?v=20260829-1",
      style: "css/modules/expiry-report.css"
    },

    "return-report": {
      title: "Return Report",
      breadcrumb: "Reports / Return Report",
      file: "pages/return-report.html",
      permission: "reports.view",
      script: "js/modules/return-report.js?v=20260828-1",
      style: "css/modules/return-report.css"
    },

    "bounce-report": {
      title: "Lost Sales / Bounce Report",
      breadcrumb: "Reports / Lost Sales / Bounce Report",
      file: "pages/bounce-report.html?v=20260829-1",
      permission: "reports.view",
      script: "js/modules/bounce-report.js?v=20260829-1",
      style: "css/modules/bounce-report.css"
    },

    // GST / TAX
    "gst-report": {
      title: "GST & Tax Reports",
      breadcrumb: "Reports / GST & Tax Reports",
      file: "pages/gst-report.html",
      permission: "reports.view",
      script: "js/modules/gst-report.js?v=20260828-1",
      style: "css/modules/gst-report.css?v=20260828-1"
    },

    gstr1: {
      title: "GSTR-1",
      breadcrumb: "Reports / GSTR-1",
      file: "pages/gstr1.html",
      permission: "reports.view",
      script: "js/modules/gstr1.js?v=20260828-4",
      style: "css/modules/gstr1.css"
    },

    gstr3b: {
      title: "GSTR-3B Working",
      breadcrumb: "Reports / GSTR-3B Working",
      file: "pages/gstr3b.html",
      permission: "reports.view",
      script: "js/modules/gstr3b.js?v=20260828-4",
      style: "css/modules/gstr3b.css"
    },

    "input-gst": {
      title: "GSTR-2B & Input GST / ITC",
      breadcrumb: "Reports / GSTR-2B & Input GST / ITC",
      file: "pages/input-gst.html?v=20260828-3",
      permission: "reports.view",
      script: "js/modules/input-gst.js?v=20260828-9",
      style: "css/modules/input-gst.css?v=20260828-4"
    },

    // Legacy alias: old accountant bookmarks now open the corrected Control Center.
    "accountant-gst": {
      title: "GST Control Center",
      breadcrumb: "Reports / GST Control Center",
      file: "pages/gst-control-center.html",
      permission: "reports.view",
      script: "js/modules/gst-control-center.js",
      init: "initGstControlCenterModule",
      style: "css/modules/gst-control-center.css"
    },

    "gst-control-center": {
      title: "GST Control Center",
      breadcrumb: "Reports / GST Control Center",
      file: "pages/gst-control-center.html",
      permission: "reports.view",
      script: "js/modules/gst-control-center.js?v=20260828-4",
      style: "css/modules/gst-control-center.css"
    },

    // Organization-wide branch comparison and invoice register.
    "chain-sales-report": {
      title: "Chain Sales Report",
      breadcrumb: "Reports / Chain Sales Report",
      file: "pages/chain-sales-report.html?v=20260829-1",
      permission: "reports.view",
      script: "js/modules/chain-sales-report.js?v=20260829-1",
      style: "css/modules/chain-sales-report.css"
    },

    "chain-stock-report": {
      title: "Chain Stock Report",
      breadcrumb: "Reports / Chain Stock Report",
      file: "pages/chain-stock-report.html",
      permission: "reports.view",
      script: "js/modules/chain-stock-report.js?v=20260829-1",
      style: "css/modules/chain-stock-report.css"
    },

    "branch-performance": {
      title: "Branch Performance",
      breadcrumb: "Reports / Branch Performance",
      file: "pages/branch-performance.html?v=20260829-1",
      permission: "reports.view",
      script: "js/modules/branch-performance.js?v=20260829-1",
      style: "css/modules/branch-performance.css"
    },

    // =========================================================
    // COMPLIANCE
    // =========================================================
    compliance: {
      title: "Registers",
      breadcrumb: "Compliance / Registers",
      file: "pages/registers.html",
      permission: "reports.view",
      script: "js/modules/registers.js",
      init: "initComplianceRegistersModule",
      style: "css/modules/compliance.css"
    },

    "h1-register": {
      title: "Schedule H1 Register",
      breadcrumb: "Compliance / Schedule H1 Register",
      file: "pages/schedule-h1-register.html",
      permission: "reports.view",
      script: "js/modules/compliance-register.js",
      init: "initComplianceRegisterModule",
      style: "css/modules/compliance.css"
    },

    "nrx-register": {
      title: "NRx Register",
      breadcrumb: "Compliance / NRx Register",
      file: "pages/nrx-register.html",
      permission: "reports.view",
      script: "js/modules/compliance-register.js",
      init: "initComplianceRegisterModule",
      style: "css/modules/compliance.css"
    },

    "controlled-drugs": {
      title: "Controlled Drugs",
      breadcrumb: "Compliance / Controlled Drugs",
      file: "pages/controlled-drugs.html",
      permission: "reports.view",
      script: "js/modules/compliance-register.js",
      init: "initComplianceRegisterModule",
      style: "css/modules/compliance.css"
    },

    "audit-log": {
      title: "Audit Log",
      breadcrumb: "Compliance / Audit Log",
      file: "pages/audit-log.html",
      permission: "reports.view",
      script: "js/modules/audit-log.js",
      init: "initComplianceAuditLogModule",
      style: "css/modules/compliance.css"
    },

    // =========================================================
    // ADMINISTRATION / CHAIN FOUNDATION
    // =========================================================

    /*
     * Canonical navigation route for Branches.
     * It reuses the existing Stores / Branches page and module so no
     * current chain functionality is lost.
     */
    branches: {
      title: "Branches",
      breadcrumb: "Administration / Branches",
      file: "pages/stores.html",
      permission: "settings.manage",
      script: "js/modules/stores.js",
      init: "initStoresModule",
      style: "css/modules/chain.css"
    },

    users: {
      title: "Users & Staff",
      breadcrumb: "Administration / Users & Staff",
      file: "pages/users.html",
      permission: "users.manage",
      script: "js/modules/users.js",
      style: "css/modules/users.css"
    },

    permissions: {
      title: "Roles & Permissions",
      breadcrumb: "Administration / Roles & Permissions",
      file: "pages/permissions.html",
      permission: "permissions.manage",
      script: "js/modules/permissions.js",
      style: "css/modules/permissions.css"
    },

    /*
     * Existing pharmacy-profile route retained because existing links may
     * already use it. It now represents Company / Organization settings.
     */
    "pharmacy-profile": {
      title: "Branch / Pharmacy Settings",
      breadcrumb: "Administration / Branch / Pharmacy Settings",
      file: "pages/company-settings.html",
      permission: "settings.manage",
      script: "js/modules/company-settings.js",
      style: "css/modules/company-settings.css"
    },

    /*
     * Existing settings route retained and relabelled as Configuration,
     * matching the reorganized navigation.
     */
    settings: {
      title: "ERP Configuration",
      breadcrumb: "Administration / ERP Configuration",
      file: "pages/erp-configuration.html",
      permission: "settings.manage",
      script: "js/modules/erp-configuration.js",
      init: "initErpConfigurationModule",
      style: "css/modules/chain.css"
    },

    /*
     * Chain settings currently reuse the existing Organization page.
     * When you build a dedicated chain-settings page later, only this
     * route needs to change.
     */
    "chain-settings": {
      title: "Chain Settings",
      breadcrumb: "Administration / Chain Settings",
      file: "pages/organization.html",
      permission: "settings.manage",
      script: "js/modules/organization.js",
      style: "css/modules/chain.css"
    },

    backup: {
      title: "Backup & Restore",
      breadcrumb: "Administration / Backup & Restore",
      file: "pages/backup.html",
      permission: "settings.manage",
      script: "js/modules/backup.js",
      style: "css/modules/backup.css"
    },

    // ---------------------------------------------------------
    // EXISTING CHAIN FOUNDATION ROUTES
    // Kept available even if they are not all displayed directly
    // in the sidebar. They may be opened from admin pages/buttons.
    // ---------------------------------------------------------
    organization: {
      title: "Organization",
      breadcrumb: "Administration / Organization",
      file: "pages/organization.html",
      permission: "settings.manage",
      script: "js/modules/organization.js",
      style: "css/modules/chain.css"
    },

    "new-organization": {
      title: "Create New Organization",
      breadcrumb: "Administration / Organization / Create New",
      file: "pages/new-organization.html",
      permission: "settings.manage",
      script: "js/modules/new-organization.js",
      style: "css/modules/chain.css"
    },

    stores: {
      title: "Stores / Branches",
      breadcrumb: "Administration / Stores",
      file: "pages/stores.html",
      permission: "settings.manage",
      script: "js/modules/stores.js",
      init: "initStoresModule",
      style: "css/modules/chain.css"
    },

    "user-store-assignment": {
      title: "User Store Assignment",
      breadcrumb: "Administration / User Store Assignment",
      file: "pages/user-store-assignment.html",
      permission: "users.manage",
      script: "js/modules/user-store-assignment.js",
      style: "css/modules/chain.css"
    },

    "username-accounts": {
      title: "Create Staff Login",
      breadcrumb: "Administration / Create Staff Login",
      file: "pages/username-accounts.html",
      permission: "users.manage",
      script: "js/modules/username-accounts.js",
      style: "css/modules/chain.css"
    },

    "store-switcher": {
      title: "Switch Store",
      breadcrumb: "Account / Switch Store",
      file: "pages/store-switcher.html",
      permission: "dashboard.view",
      script: "js/modules/store-switcher.js",
      style: "css/modules/chain.css"
    },

    profile: {
      title: "My Profile",
      breadcrumb: "Account / My Profile",
      file: "pages/profile.html",
      permission: "dashboard.view",
      script: "js/modules/profile.js",
      style: "css/modules/profile.css"
    },

    /*
     * Legacy alias for older links/bookmarks.
     * Keep temporarily while sales-cancelled becomes the canonical route.
     */
    "cancelled-sales": {
      title: "Cancelled Sales",
      breadcrumb: "Transactions / Cancelled Sales",
      file: "pages/cancelled-sales.html",
      permission: "sales.view",
      script: "js/modules/cancelled-sales.js",
      init: "initCancelledSalesModule",
      style: "css/modules/cancelled-sales.css"
    }
  }
};
