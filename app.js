/* =========================================================
   KARSA FINANCE SYSTEM
   app.js — Supabase + Frontend Controller
   ========================================================= */

(() => {
  "use strict";

  /* =========================================================
     1. SUPABASE CONFIG
     ========================================================= */

  let SB_URL = "";
  let SB_KEY = "";

  try {
    SB_URL =
      window.SUPABASE_URL ||
      window.supabaseUrl ||
      window.SB_URL ||
      "";

    SB_KEY =
      window.SUPABASE_ANON_KEY ||
      window.SUPABASE_PUBLISHABLE_KEY ||
      window.supabaseAnonKey ||
      window.SB_KEY ||
      "";
  } catch (e) {
    console.error("Config error:", e);
  }

  function configured() {
    return !!(
      SB_URL &&
      SB_KEY &&
      !SB_URL.includes("PASTE_") &&
      !SB_KEY.includes("PASTE_")
    );
  }

  let client = null;

  if (configured()) {
    try {
      const { createClient } = window.supabase;
      client = createClient(SB_URL, SB_KEY);
      console.log("KARSA: Supabase connected");
    } catch (err) {
      console.error("KARSA: Supabase initialization failed", err);
    }
  } else {
    console.warn("KARSA: Supabase configuration belum tersedia.");
  }


  /* =========================================================
     2. GLOBAL STATE
     ========================================================= */

  const state = {
    user: null,
    profile: null,

    transactions: [],
    sales: [],
    purchases: [],
    receivables: [],
    payables: [],
    products: [],
    journals: [],
    accounts: [],
    cashAccounts: [],

    loading: false
  };


  /* =========================================================
     3. HELPERS
     ========================================================= */

  const $ = (selector) => document.querySelector(selector);

  const $$ = (selector) => [...document.querySelectorAll(selector)];

  function escapeHTML(value) {
    if (value === null || value === undefined) return "";

    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function money(value) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(number(value));
  }

  function dateID(value) {
    if (!value) return "-";

    try {
      return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }).format(new Date(value));
    } catch {
      return value;
    }
  }

  function today() {
    const d = new Date();

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return `${y}-${m}-${day}`;
  }

  function uid(prefix = "TRX") {
    return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
  }

  function showToast(message, type = "normal") {
    const toast = $("#toast");

    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast show ${type}`;

    clearTimeout(window.__toastTimer);

    window.__toastTimer = setTimeout(() => {
      toast.className = "toast";
    }, 3500);
  }

  function setLoading(loading) {
    state.loading = loading;
  }

  function hideLoader() {
    const loader = $("#loader");

    if (!loader) return;

    loader.classList.add("hide");

    setTimeout(() => {
      loader.classList.add("hidden");
    }, 700);
  }

  function showAuth() {
    $("#auth")?.classList.remove("hidden");
    $("#app")?.classList.add("hidden");
  }

  function showApp() {
    $("#auth")?.classList.add("hidden");
    $("#app")?.classList.remove("hidden");
  }

  function emptyState(text = "Belum ada data.") {
    return `
      <div class="empty-state">
        <div class="empty-icon">◌</div>
        <strong>${escapeHTML(text)}</strong>
      </div>
    `;
  }

  function errorText(error) {
    if (!error) return "Terjadi kesalahan.";

    return (
      error.message ||
      error.error_description ||
      error.details ||
      "Terjadi kesalahan."
    );
  }


  /* =========================================================
     4. SUPABASE DATABASE HELPERS
     ========================================================= */

  async function selectTable(table, options = {}) {
    if (!client) return [];

    let query = client.from(table).select(options.select || "*");

    if (options.order) {
      query = query.order(
        options.order.column,
        {
          ascending:
            options.order.ascending === undefined
              ? false
              : options.order.ascending
        }
      );
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.warn(`Table ${table}:`, error.message);
      return [];
    }

    return data || [];
  }

  async function insertRow(table, payload) {
    if (!client) {
      throw new Error("Supabase belum terhubung.");
    }

    const { data, error } = await client
      .from(table)
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    return data;
  }

  async function updateRow(table, id, payload) {
    if (!client) {
      throw new Error("Supabase belum terhubung.");
    }

    const { data, error } = await client
      .from(table)
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return data;
  }

  async function deleteRow(table, id) {
    if (!client) {
      throw new Error("Supabase belum terhubung.");
    }

    const { error } = await client
      .from(table)
      .delete()
      .eq("id", id);

    if (error) throw error;
  }


  /* =========================================================
     5. AUTH
     ========================================================= */

  async function getSession() {
    if (!client) return null;

    try {
      const { data, error } = await client.auth.getSession();

      if (error) {
        console.error("Session error:", error);
        return null;
      }

      return data?.session || null;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async function login(email, password) {
    if (!client) {
      throw new Error(
        "Supabase belum dikonfigurasi. Periksa config.js."
      );
    }

    const { data, error } = await client.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    state.user = data.user;

    await loadProfile();

    return data;
  }

  async function logout() {
    try {
      if (client) {
        await client.auth.signOut();
      }
    } catch (err) {
      console.error(err);
    }

    state.user = null;
    state.profile = null;

    showAuth();

    showToast("Berhasil keluar.");
  }


  /* =========================================================
     6. PROFILE
     ========================================================= */

  async function loadProfile() {
    if (!client || !state.user) return;

    try {
      const { data, error } = await client
        .from("profiles")
        .select("*")
        .eq("id", state.user.id)
        .maybeSingle();

      if (error) {
        console.warn("Profile:", error.message);
        return;
      }

      state.profile = data || null;

      updateProfileUI();
    } catch (err) {
      console.warn(err);
    }
  }

  function updateProfileUI() {
    const user = state.user;
    const profile = state.profile;

    const name =
      profile?.full_name ||
      profile?.name ||
      user?.user_metadata?.full_name ||
      user?.email?.split("@")[0] ||
      "Finance";

    const email =
      profile?.email ||
      user?.email ||
      "finance@karsa.id";

    const avatar =
      name
        .split(/\s+/)
        .map((x) => x.charAt(0))
        .join("")
        .substring(0, 2)
        .toUpperCase();

    if ($("#profileName")) {
      $("#profileName").textContent = name;
    }

    if ($("#profileEmail")) {
      $("#profileEmail").textContent = email;
    }

    if ($("#avatar")) {
      $("#avatar").textContent = avatar;
    }
  }


  /* =========================================================
     7. LOAD ALL DATA
     ========================================================= */

  async function loadData() {
    if (!client) return;

    setLoading(true);

    try {
      const [
        transactions,
        sales,
        purchases,
        receivables,
        payables,
        products,
        journals,
        accounts,
        cashAccounts
      ] = await Promise.all([
        selectTable("transactions", {
          order: {
            column: "created_at",
            ascending: false
          },
          limit: 500
        }),

        selectTable("sales", {
          order: {
            column: "created_at",
            ascending: false
          },
          limit: 500
        }),

        selectTable("purchases", {
          order: {
            column: "created_at",
            ascending: false
          },
          limit: 500
        }),

        selectTable("accounts_receivable", {
          order: {
            column: "created_at",
            ascending: false
          },
          limit: 500
        }),

        selectTable("accounts_payable", {
          order: {
            column: "created_at",
            ascending: false
          },
          limit: 500
        }),

        selectTable("products", {
          order: {
            column: "created_at",
            ascending: false
          },
          limit: 500
        }),

        selectTable("journal_headers", {
          order: {
            column: "created_at",
            ascending: false
          },
          limit: 500
        }),

        selectTable("accounts", {
          order: {
            column: "code",
            ascending: true
          }
        }),

        selectTable("cash_accounts", {
          order: {
            column: "created_at",
            ascending: false
          }
        })
      ]);

      state.transactions = transactions;
      state.sales = sales;
      state.purchases = purchases;
      state.receivables = receivables;
      state.payables = payables;
      state.products = products;
      state.journals = journals;
      state.accounts = accounts;
      state.cashAccounts = cashAccounts;

    } catch (err) {
      console.error("Load data error:", err);
    } finally {
      setLoading(false);
    }
  }


  /* =========================================================
     8. DASHBOARD CALCULATION
     ========================================================= */

  function totalIn() {
    return state.transactions.reduce(
      (sum, row) => sum + number(row.inflow),
      0
    );
  }

  function totalOut() {
    return state.transactions.reduce(
      (sum, row) => sum + number(row.outflow),
      0
    );
  }

  function balance() {
    return totalIn() - totalOut();
  }

  function totalAR() {
    return state.receivables.reduce((sum, row) => {
      const total = number(
        row.total_amount ??
        row.amount ??
        row.original_amount
      );

      const paid = number(
        row.paid_amount ??
        row.amount_paid ??
        0
      );

      return sum + Math.max(0, total - paid);
    }, 0);
  }

  function totalAP() {
    return state.payables.reduce((sum, row) => {
      const total = number(
        row.total_amount ??
        row.amount ??
        row.original_amount
      );

      const paid = number(
        row.paid_amount ??
        row.amount_paid ??
        0
      );

      return sum + Math.max(0, total - paid);
    }, 0);
  }


  /* =========================================================
     9. RENDER DASHBOARD
     ========================================================= */

  function renderDashboard() {
    const bal = balance();
    const incoming = totalIn();
    const outgoing = totalOut();
    const ar = totalAR();
    const ap = totalAP();

    if ($("#heroBalance")) {
      $("#heroBalance").textContent = money(bal);
    }

    if ($("#sBalance")) {
      $("#sBalance").textContent = money(bal);
    }

    if ($("#sIn")) {
      $("#sIn").textContent = money(incoming);
    }

    if ($("#sOut")) {
      $("#sOut").textContent = money(outgoing);
    }

    if ($("#sAR")) {
      $("#sAR").textContent = money(ar);
    }

    if ($("#sAP")) {
      $("#sAP").textContent = money(ap);
    }

    renderRecent();
    renderControl();
  }

  function renderRecent() {
    const el = $("#recent");

    if (!el) return;

    const rows = [...state.transactions]
      .sort((a, b) => {
        return (
          new Date(b.created_at || b.transaction_date || 0) -
          new Date(a.created_at || a.transaction_date || 0)
        );
      })
      .slice(0, 8);

    if (!rows.length) {
      el.innerHTML = emptyState("Belum ada transaksi.");
      return;
    }

    el.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Keterangan</th>
            <th>Kategori</th>
            <th>Masuk</th>
            <th>Keluar</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td>${dateID(row.transaction_date || row.created_at)}</td>
              <td>
                <strong>${escapeHTML(row.description || "-")}</strong>
                <small>${escapeHTML(row.reference_no || row.id || "")}</small>
              </td>
              <td>${escapeHTML(row.category || "-")}</td>
              <td class="money-in">
                ${number(row.inflow) ? money(row.inflow) : "-"}
              </td>
              <td class="money-out">
                ${number(row.outflow) ? money(row.outflow) : "-"}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function renderControl() {
    const el = $("#controlList");

    if (!el) return;

    const items = [];

    if (totalAR() > 0) {
      items.push(`
        <div class="attention-item">
          <span class="attention-dot"></span>
          <div>
            <strong>Piutang masih berjalan</strong>
            <small>${money(totalAR())} belum diterima</small>
          </div>
        </div>
      `);
    }

    if (totalAP() > 0) {
      items.push(`
        <div class="attention-item">
          <span class="attention-dot"></span>
          <div>
            <strong>Hutang masih berjalan</strong>
            <small>${money(totalAP())} belum dibayar</small>
          </div>
        </div>
      `);
    }

    if (!items.length) {
      items.push(`
        <div class="attention-item">
          <span class="attention-dot"></span>
          <div>
            <strong>Workspace terkendali</strong>
            <small>Tidak ada kewajiban yang terdeteksi.</small>
          </div>
        </div>
      `);
    }

    el.innerHTML = items.join("");
  }


  /* =========================================================
     10. CASH
     ========================================================= */

  function renderCash() {
    const cards = $("#cashCards");
    const table = $("#cashTable");

    if (cards) {
      cards.innerHTML = `
        <div class="stat-card">
          <span>Saldo Berjalan</span>
          <strong>${money(balance())}</strong>
          <small>Kas + bank berdasarkan transaksi</small>
        </div>

        <div class="stat-card">
          <span>Total Masuk</span>
          <strong>${money(totalIn())}</strong>
          <small>Seluruh penerimaan</small>
        </div>

        <div class="stat-card">
          <span>Total Keluar</span>
          <strong>${money(totalOut())}</strong>
          <small>Seluruh pengeluaran</small>
        </div>
      `;
    }

    if (!table) return;

    if (!state.transactions.length) {
      table.innerHTML = emptyState("Belum ada transaksi kas/bank.");
      return;
    }

    table.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Keterangan</th>
            <th>Metode</th>
            <th>Masuk</th>
            <th>Keluar</th>
            <th>Saldo</th>
          </tr>
        </thead>
        <tbody>
          ${buildCashRows()}
        </tbody>
      </table>
    `;
  }

  function buildCashRows() {
    const rows = [...state.transactions].sort(
      (a, b) =>
        new Date(a.transaction_date || a.created_at || 0) -
        new Date(b.transaction_date || b.created_at || 0)
    );

    let running = 0;

    return rows.map(row => {
      running += number(row.inflow) - number(row.outflow);

      return `
        <tr>
          <td>${dateID(row.transaction_date || row.created_at)}</td>
          <td>${escapeHTML(row.description || "-")}</td>
          <td>${escapeHTML(row.payment_method || "-")}</td>
          <td class="money-in">
            ${number(row.inflow) ? money(row.inflow) : "-"}
          </td>
          <td class="money-out">
            ${number(row.outflow) ? money(row.outflow) : "-"}
          </td>
          <td><strong>${money(running)}</strong></td>
        </tr>
      `;
    }).reverse();
  }


  /* =========================================================
     11. TRANSACTIONS
     ========================================================= */

  function renderTransactions() {
    const el = $("#trxTable");

    if (!el) return;

    if (!state.transactions.length) {
      el.innerHTML = emptyState("Belum ada transaksi.");
      return;
    }

    el.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Tanggal</th>
            <th>Keterangan</th>
            <th>Kategori</th>
            <th>Metode</th>
            <th>Masuk</th>
            <th>Keluar</th>
          </tr>
        </thead>

        <tbody>
          ${state.transactions.map(row => `
            <tr>
              <td><code>${escapeHTML(row.reference_no || row.id || "-")}</code></td>
              <td>${dateID(row.transaction_date || row.created_at)}</td>
              <td>${escapeHTML(row.description || "-")}</td>
              <td>${escapeHTML(row.category || "-")}</td>
              <td>${escapeHTML(row.payment_method || "-")}</td>
              <td class="money-in">
                ${number(row.inflow) ? money(row.inflow) : "-"}
              </td>
              <td class="money-out">
                ${number(row.outflow) ? money(row.outflow) : "-"}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }


  /* =========================================================
     12. SALES
     ========================================================= */

  function renderSales() {
    const el = $("#salesTable");

    if (!el) return;

    if (!state.sales.length) {
      el.innerHTML = emptyState("Belum ada data penjualan.");
      return;
    }

    el.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Pelanggan</th>
            <th>Invoice</th>
            <th>Total</th>
            <th>Status</th>
            <th>Metode</th>
          </tr>
        </thead>

        <tbody>
          ${state.sales.map(row => `
            <tr>
              <td>${dateID(row.sale_date || row.transaction_date || row.created_at)}</td>
              <td>${escapeHTML(row.customer_name || row.customer || "-")}</td>
              <td>${escapeHTML(row.invoice_no || row.reference_no || "-")}</td>
              <td><strong>${money(row.total_amount || row.amount)}</strong></td>
              <td>
                <span class="status-badge">
                  ${escapeHTML(row.payment_status || row.status || "Belum ada")}
                </span>
              </td>
              <td>${escapeHTML(row.payment_method || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }


  /* =========================================================
     13. PURCHASES
     ========================================================= */

  function renderPurchases() {
    const el = $("#purchaseTable");

    if (!el) return;

    if (!state.purchases.length) {
      el.innerHTML = emptyState("Belum ada data pembelian.");
      return;
    }

    el.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Supplier</th>
            <th>Invoice</th>
            <th>Total</th>
            <th>Status</th>
            <th>Metode</th>
          </tr>
        </thead>

        <tbody>
          ${state.purchases.map(row => `
            <tr>
              <td>${dateID(row.purchase_date || row.transaction_date || row.created_at)}</td>
              <td>${escapeHTML(row.supplier_name || row.supplier || "-")}</td>
              <td>${escapeHTML(row.invoice_no || row.reference_no || "-")}</td>
              <td><strong>${money(row.total_amount || row.amount)}</strong></td>
              <td>
                <span class="status-badge">
                  ${escapeHTML(row.payment_status || row.status || "Belum ada")}
                </span>
              </td>
              <td>${escapeHTML(row.payment_method || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }


  /* =========================================================
     14. RECEIVABLES
     ========================================================= */

  function renderAR() {
    const el = $("#arTable");

    if (!el) return;

    if (!state.receivables.length) {
      el.innerHTML = emptyState("Belum ada piutang.");
      return;
    }

    el.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Pelanggan</th>
            <th>Invoice</th>
            <th>Total</th>
            <th>Dibayar</th>
            <th>Sisa</th>
            <th>Jatuh Tempo</th>
          </tr>
        </thead>

        <tbody>
          ${state.receivables.map(row => {
            const total = number(
              row.total_amount ??
              row.amount ??
              row.original_amount
            );

            const paid = number(
              row.paid_amount ??
              row.amount_paid ??
              0
            );

            const remaining = Math.max(0, total - paid);

            return `
              <tr>
                <td>${escapeHTML(row.customer_name || row.customer || "-")}</td>
                <td>${escapeHTML(row.invoice_no || "-")}</td>
                <td>${money(total)}</td>
                <td>${money(paid)}</td>
                <td><strong>${money(remaining)}</strong></td>
                <td>${dateID(row.due_date)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
  }


  /* =========================================================
     15. PAYABLES
     ========================================================= */

  function renderAP() {
    const el = $("#apTable");

    if (!el) return;

    if (!state.payables.length) {
      el.innerHTML = emptyState("Belum ada hutang.");
      return;
    }

    el.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Supplier</th>
            <th>Invoice</th>
            <th>Total</th>
            <th>Dibayar</th>
            <th>Sisa</th>
            <th>Jatuh Tempo</th>
          </tr>
        </thead>

        <tbody>
          ${state.payables.map(row => {
            const total = number(
              row.total_amount ??
              row.amount ??
              row.original_amount
            );

            const paid = number(
              row.paid_amount ??
              row.amount_paid ??
              0
            );

            const remaining = Math.max(0, total - paid);

            return `
              <tr>
                <td>${escapeHTML(row.supplier_name || row.supplier || "-")}</td>
                <td>${escapeHTML(row.invoice_no || "-")}</td>
                <td>${money(total)}</td>
                <td>${money(paid)}</td>
                <td><strong>${money(remaining)}</strong></td>
                <td>${dateID(row.due_date)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
  }


  /* =========================================================
     16. STOCK & HPP
     ========================================================= */

  function renderStock() {
    const el = $("#stockTable");

    if (!el) return;

    if (!state.products.length) {
      el.innerHTML = emptyState("Belum ada produk.");
      return;
    }

    el.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Produk</th>
            <th>SKU</th>
            <th>Ukuran</th>
            <th>Kain</th>
            <th>Stok</th>
            <th>Harga Jual</th>
            <th>HPP</th>
            <th>Estimasi Laba</th>
          </tr>
        </thead>

        <tbody>
          ${state.products.map(row => {
            const hpp = number(
              row.hpp_per_unit ??
              row.unit_cost ??
              row.cost_price ??
              0
            );

            const selling = number(
              row.selling_price ??
              row.sale_price ??
              0
            );

            const profit = selling - hpp;

            return `
              <tr>
                <td><strong>${escapeHTML(row.name || "-")}</strong></td>
                <td>${escapeHTML(row.sku || "-")}</td>
                <td>${escapeHTML(row.size || "-")}</td>
                <td>${escapeHTML(row.fabric_type || row.fabric || "-")}</td>
                <td>${number(row.stock ?? row.quantity)}</td>
                <td>${money(selling)}</td>
                <td>${money(hpp)}</td>
                <td>${money(profit)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
  }


  /* =========================================================
     17. JOURNAL
     ========================================================= */

  function renderJournal() {
    const el = $("#journalTable");

    if (!el) return;

    if (!state.journals.length) {
      el.innerHTML = emptyState("Belum ada jurnal.");
      return;
    }

    el.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Nomor</th>
            <th>Jenis Jurnal</th>
            <th>Keterangan</th>
            <th>Reference</th>
          </tr>
        </thead>

        <tbody>
          ${state.journals.map(row => `
            <tr>
              <td>${dateID(row.journal_date || row.transaction_date || row.created_at)}</td>
              <td>
                <code>${escapeHTML(row.journal_no || row.id || "-")}</code>
              </td>
              <td>
                <span class="status-badge">
                  ${escapeHTML(row.journal_type || row.type || "general")}
                </span>
              </td>
              <td>${escapeHTML(row.description || row.memo || "-")}</td>
              <td>${escapeHTML(row.reference_no || row.source_id || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }


  /* =========================================================
     18. REPORT
     ========================================================= */

  function renderReports() {
    const cards = $("#reportCards");
    const table = $("#reportTable");

    const sales = state.sales.reduce(
      (sum, row) => sum + number(row.total_amount || row.amount),
      0
    );

    const purchases = state.purchases.reduce(
      (sum, row) => sum + number(row.total_amount || row.amount),
      0
    );

    const grossProfit = sales - purchases;

    if (cards) {
      cards.innerHTML = `
        <div class="stat-card">
          <span>Penjualan</span>
          <strong>${money(sales)}</strong>
          <small>Total penjualan</small>
        </div>

        <div class="stat-card">
          <span>Pembelian</span>
          <strong>${money(purchases)}</strong>
          <small>Total pembelian</small>
        </div>

        <div class="stat-card">
          <span>Selisih</span>
          <strong>${money(grossProfit)}</strong>
          <small>Penjualan − pembelian</small>
        </div>

        <div class="stat-card">
          <span>Kas Bersih</span>
          <strong>${money(balance())}</strong>
          <small>Uang masuk − uang keluar</small>
        </div>
      `;
    }

    if (table) {
      table.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Komponen</th>
              <th>Nilai</th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td>Penjualan</td>
              <td>${money(sales)}</td>
            </tr>

            <tr>
              <td>Pembelian</td>
              <td>${money(purchases)}</td>
            </tr>

            <tr>
              <td>Piutang</td>
              <td>${money(totalAR())}</td>
            </tr>

            <tr>
              <td>Hutang</td>
              <td>${money(totalAP())}</td>
            </tr>

            <tr>
              <td><strong>Saldo Kas & Bank</strong></td>
              <td><strong>${money(balance())}</strong></td>
            </tr>
          </tbody>
        </table>
      `;
    }
  }


  /* =========================================================
     19. TRANSACTION MODAL
     ========================================================= */

  function openModal(title, eyebrow, html, onSubmit) {
    const modal = $("#modal");
    const form = $("#modalForm");

    if (!modal || !form) return;

    $("#modalTitle").textContent = title;
    $("#modalEyebrow").textContent = eyebrow;

    form.innerHTML = html;

    modal.classList.remove("hidden");

    form.onsubmit = async (e) => {
      e.preventDefault();

      const button = form.querySelector(
        'button[type="submit"]'
      );

      if (button) {
        button.disabled = true;
        button.textContent = "Menyimpan...";
      }

      try {
        await onSubmit(new FormData(form));

        closeModal();

        await refresh();

        showToast("Data berhasil disimpan.", "success");
      } catch (err) {
        console.error(err);
        showToast(errorText(err), "error");

        if (button) {
          button.disabled = false;
          button.textContent = "Simpan";
        }
      }
    };
  }

  function closeModal() {
    $("#modal")?.classList.add("hidden");
  }


  /* =========================================================
     20. ADD TRANSACTION
     ========================================================= */

  function addTransactionModal() {
    openModal(
      "Tambah transaksi",
      "CASH MANAGEMENT",
      `
        <div class="form-grid">

          <label>
            Tanggal
            <input
              name="transaction_date"
              type="date"
              value="${today()}"
              required
            >
          </label>

          <label>
            Jenis
            <select name="flow_type" required>
              <option value="inflow">Uang Masuk</option>
              <option value="outflow">Uang Keluar</option>
            </select>
          </label>

          <label class="full">
            Keterangan
            <input
              name="description"
              placeholder="Contoh: Pembayaran penjualan"
              required
            >
          </label>

          <label>
            Kategori
            <select name="category">
              <option value="Penjualan">Penjualan</option>
              <option value="Pembelian">Pembelian</option>
              <option value="Pemasukan Lain">Pemasukan Lain</option>
              <option value="Pengeluaran">Pengeluaran</option>
              <option value="Modal">Modal</option>
              <option value="Penarikan Pemilik">Penarikan Pemilik</option>
              <option value="Operasional">Operasional</option>
              <option value="Lainnya">Lainnya</option>
            </select>
          </label>

          <label>
            Nominal
            <input
              name="amount"
              type="number"
              min="0"
              step="1"
              placeholder="0"
              required
            >
          </label>

          <label>
            Metode
            <select name="payment_method">
              <option value="cash">Kas</option>
              <option value="bank">Bank</option>
            </select>
          </label>

          <label>
            Reference
            <input
              name="reference_no"
              placeholder="INV-0001"
            >
          </label>

          <label class="full">
            PIC
            <input
              name="pic"
              placeholder="Nama PIC"
            >
          </label>

        </div>

        <div class="modal-actions">
          <button type="button" class="text-btn" id="cancelModal">
            Batal
          </button>

          <button type="submit" class="gold-btn">
            Simpan
          </button>
        </div>
      `,
      async (fd) => {
        const flow = fd.get("flow_type");
        const amount = number(fd.get("amount"));

        if (amount <= 0) {
          throw new Error("Nominal harus lebih dari 0.");
        }

        const payload = {
          transaction_date: fd.get("transaction_date"),
          description: fd.get("description"),
          category: fd.get("category"),
          inflow: flow === "inflow" ? amount : 0,
          outflow: flow === "outflow" ? amount : 0,
          payment_method: fd.get("payment_method"),
          reference_no:
            fd.get("reference_no") || uid("TRX"),
          pic: fd.get("pic") || null,
          status: "posted",
          created_by: state.user?.id || null
        };

        await insertRow("transactions", payload);
      }
    );

    setTimeout(() => {
      $("#cancelModal")?.addEventListener(
        "click",
        closeModal
      );
    }, 0);
  }


  /* =========================================================
     21. ADD SALE
     ========================================================= */

  function addSaleModal() {
    openModal(
      "Tambah penjualan",
      "SALES",
      `
        <div class="form-grid">

          <label>
            Tanggal
            <input
              name="sale_date"
              type="date"
              value="${today()}"
              required
            >
          </label>

          <label>
            Invoice
            <input
              name="invoice_no"
              value="${uid("SALE")}"
              required
            >
          </label>

          <label>
            Pelanggan
            <input
              name="customer_name"
              placeholder="Nama pelanggan"
              required
            >
          </label>

          <label>
            Total
            <input
              name="total_amount"
              type="number"
              min="0"
              step="1"
              required
            >
          </label>

          <label>
            Pembayaran
            <select name="payment_method">
              <option value="cash">Kas</option>
              <option value="bank">Bank</option>
              <option value="credit">Piutang</option>
            </select>
          </label>

          <label>
            Jatuh Tempo
            <input
              name="due_date"
              type="date"
            >
          </label>

        </div>

        <div class="modal-actions">
          <button type="button" class="text-btn" id="cancelModal">
            Batal
          </button>

          <button type="submit" class="gold-btn">
            Simpan Penjualan
          </button>
        </div>
      `,
      async (fd) => {
        const total = number(fd.get("total_amount"));

        if (total <= 0) {
          throw new Error("Total penjualan harus lebih dari 0.");
        }

        const paymentMethod = fd.get("payment_method");

        const sale = await insertRow("sales", {
          sale_date: fd.get("sale_date"),
          invoice_no: fd.get("invoice_no"),
          customer_name: fd.get("customer_name"),
          total_amount: total,
          payment_method: paymentMethod,
          payment_status:
            paymentMethod === "credit"
              ? "unpaid"
              : "paid",
          due_date:
            paymentMethod === "credit"
              ? fd.get("due_date") || null
              : null,
          created_by: state.user?.id || null
        });

        /*
          Buat transaksi kas otomatis untuk penjualan tunai/bank.
          Penjualan kredit masuk ke piutang.
        */

        if (paymentMethod !== "credit") {
          await insertRow("transactions", {
            transaction_date: fd.get("sale_date"),
            description: `Penjualan ${fd.get("invoice_no")}`,
            category: "Penjualan",
            inflow: total,
            outflow: 0,
            payment_method: paymentMethod,
            reference_no: fd.get("invoice_no"),
            status: "posted",
            created_by: state.user?.id || null
          });
        } else {
          await insertRow("accounts_receivable", {
            customer_name: fd.get("customer_name"),
            invoice_no: fd.get("invoice_no"),
            total_amount: total,
            paid_amount: 0,
            due_date: fd.get("due_date") || null,
            status: "unpaid",
            created_by: state.user?.id || null,
            sale_id: sale?.id || null
          });
        }
      }
    );

    setTimeout(() => {
      $("#cancelModal")?.addEventListener(
        "click",
        closeModal
      );
    }, 0);
  }


  /* =========================================================
     22. ADD PURCHASE
     ========================================================= */

  function addPurchaseModal() {
    openModal(
      "Tambah pembelian",
      "PURCHASES",
      `
        <div class="form-grid">

          <label>
            Tanggal
            <input
              name="purchase_date"
              type="date"
              value="${today()}"
              required
            >
          </label>

          <label>
            Invoice
            <input
              name="invoice_no"
              value="${uid("PUR")}"
              required
            >
          </label>

          <label>
            Supplier
            <input
              name="supplier_name"
              placeholder="Nama supplier"
              required
            >
          </label>

          <label>
            Total
            <input
              name="total_amount"
              type="number"
              min="0"
              step="1"
              required
            >
          </label>

          <label>
            Pembayaran
            <select name="payment_method">
              <option value="cash">Kas</option>
              <option value="bank">Bank</option>
              <option value="credit">Hutang</option>
            </select>
          </label>

          <label>
            Jatuh Tempo
            <input
              name="due_date"
              type="date"
            >
          </label>

        </div>

        <div class="modal-actions">
          <button type="button" class="text-btn" id="cancelModal">
            Batal
          </button>

          <button type="submit" class="gold-btn">
            Simpan Pembelian
          </button>
        </div>
      `,
      async (fd) => {
        const total = number(fd.get("total_amount"));

        if (total <= 0) {
          throw new Error("Total pembelian harus lebih dari 0.");
        }

        const paymentMethod = fd.get("payment_method");

        const purchase = await insertRow("purchases", {
          purchase_date: fd.get("purchase_date"),
          invoice_no: fd.get("invoice_no"),
          supplier_name: fd.get("supplier_name"),
          total_amount: total,
          payment_method: paymentMethod,
          payment_status:
            paymentMethod === "credit"
              ? "unpaid"
              : "paid",
          due_date:
            paymentMethod === "credit"
              ? fd.get("due_date") || null
              : null,
          created_by: state.user?.id || null
        });

        if (paymentMethod !== "credit") {
          await insertRow("transactions", {
            transaction_date: fd.get("purchase_date"),
            description: `Pembelian ${fd.get("invoice_no")}`,
            category: "Pembelian",
            inflow: 0,
            outflow: total,
            payment_method: paymentMethod,
            reference_no: fd.get("invoice_no"),
            status: "posted",
            created_by: state.user?.id || null
          });
        } else {
          await insertRow("accounts_payable", {
            supplier_name: fd.get("supplier_name"),
            invoice_no: fd.get("invoice_no"),
            total_amount: total,
            paid_amount: 0,
            due_date: fd.get("due_date") || null,
            status: "unpaid",
            created_by: state.user?.id || null,
            purchase_id: purchase?.id || null
          });
        }
      }
    );

    setTimeout(() => {
      $("#cancelModal")?.addEventListener(
        "click",
        closeModal
      );
    }, 0);
  }


  /* =========================================================
     23. ADD PRODUCT
     ========================================================= */

  function addProductModal() {
    openModal(
      "Tambah produk",
      "PRODUCT & HPP",
      `
        <div class="form-grid">

          <label>
            Nama Produk
            <input
              name="name"
              placeholder="Contoh: Karsa Dress"
              required
            >
          </label>

          <label>
            SKU
            <input
              name="sku"
              placeholder="KRS-001"
            >
          </label>

          <label>
            Ukuran
            <input
              name="size"
              placeholder="S / M / L / XL"
            >
          </label>

          <label>
            Jenis Kain
            <input
              name="fabric_type"
              placeholder="Cotton / Satin / dll"
            >
          </label>

          <label>
            Stok Awal
            <input
              name="stock"
              type="number"
              min="0"
              step="1"
              value="0"
            >
          </label>

          <label>
            Harga Jual
            <input
              name="selling_price"
              type="number"
              min="0"
              step="1"
              value="0"
            >
          </label>

          <label>
            HPP / Unit
            <input
              name="unit_cost"
              type="number"
              min="0"
              step="1"
              value="0"
            >
          </label>

        </div>

        <div class="notice">
          Untuk HPP lengkap, komponen seperti kain, satin,
          sticker, paper bag, thanks card, zip lock,
          resleting, handtag dan tali rami dapat dicatat
          melalui modul HPP.
        </div>

        <div class="modal-actions">
          <button type="button" class="text-btn" id="cancelModal">
            Batal
          </button>

          <button type="submit" class="gold-btn">
            Simpan Produk
          </button>
        </div>
      `,
      async (fd) => {
        await insertRow("products", {
          name: fd.get("name"),
          sku: fd.get("sku") || null,
          size: fd.get("size") || null,
          fabric_type: fd.get("fabric_type") || null,
          stock: number(fd.get("stock")),
          selling_price: number(fd.get("selling_price")),
          unit_cost: number(fd.get("unit_cost")),
          created_by: state.user?.id || null
        });
      }
    );

    setTimeout(() => {
      $("#cancelModal")?.addEventListener(
        "click",
        closeModal
      );
    }, 0);
  }


  /* =========================================================
     24. JOURNAL POSTING
     ========================================================= */

  async function postJournal({
    journalType = "general",
    date = today(),
    description = "",
    referenceNo = "",
    lines = []
  }) {
    if (!client) {
      throw new Error("Supabase belum terhubung.");
    }

    if (!lines.length) {
      throw new Error("Jurnal tidak memiliki baris.");
    }

    const debit = lines.reduce(
      (sum, line) => sum + number(line.debit),
      0
    );

    const credit = lines.reduce(
      (sum, line) => sum + number(line.credit),
      0
    );

    /*
      Double-entry validation.
    */

    if (Math.abs(debit - credit) > 0.01) {
      throw new Error(
        `Jurnal tidak balance. Debit ${money(debit)} / Kredit ${money(credit)}`
      );
    }

    const header = await insertRow("journal_headers", {
      journal_no: uid("JRN"),
      journal_date: date,
      journal_type: journalType,
      description,
      reference_no: referenceNo || null,
      created_by: state.user?.id || null
    });

    for (const line of lines) {
      await insertRow("journal_lines", {
        journal_id: header.id,
        account_id: line.account_id || null,
        account_code: line.account_code || null,
        account_name: line.account_name || null,
        description: line.description || description,
        debit: number(line.debit),
        credit: number(line.credit)
      });
    }

    return header;
  }


  /* =========================================================
     25. NAVIGATION
     ========================================================= */

  const pageTitles = {
    dashboard: "Dashboard",
    cash: "Kas & Bank",
    transactions: "Transaksi",
    sales: "Penjualan",
    purchases: "Pembelian",
    receivables: "Piutang",
    payables: "Hutang",
    stock: "Stok & HPP",
    journal: "Jurnal",
    reports: "Laporan",
    export: "Export"
  };

  function navigate(page) {
    $$(".nav-item").forEach(btn => {
      btn.classList.toggle(
        "active",
        btn.dataset.page === page
      );
    });

    $$(".view").forEach(view => {
      view.classList.toggle(
        "active",
        view.id === page
      );
    });

    if ($("#pageTitle")) {
      $("#pageTitle").textContent =
        pageTitles[page] || "Dashboard";
    }

    switch (page) {
      case "dashboard":
        renderDashboard();
        break;

      case "cash":
        renderCash();
        break;

      case "transactions":
        renderTransactions();
        break;

      case "sales":
        renderSales();
        break;

      case "purchases":
        renderPurchases();
        break;

      case "receivables":
        renderAR();
        break;

      case "payables":
        renderAP();
        break;

      case "stock":
        renderStock();
        break;

      case "journal":
        renderJournal();
        break;

      case "reports":
        renderReports();
        break;
    }
  }


  /* =========================================================
     26. EXPORT CSV
     ========================================================= */

  function csvEscape(value) {
    if (value === null || value === undefined) {
      return "";
    }

    const str = String(value);

    if (
      str.includes(",") ||
      str.includes('"') ||
      str.includes("\n")
    ) {
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  }

  function downloadCSV(filename, rows) {
    if (!rows || !rows.length) {
      showToast("Tidak ada data untuk diexport.", "error");
      return;
    }

    const headers = [
      ...new Set(
        rows.flatMap(row => Object.keys(row))
      )
    ];

    const csv = [
      headers.map(csvEscape).join(","),
      ...rows.map(row =>
        headers
          .map(header => csvEscape(row[header]))
          .join(",")
      )
    ].join("\n");

    const blob = new Blob(
      ["\ufeff" + csv],
      {
        type: "text/csv;charset=utf-8;"
      }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;
    a.download = filename;

    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);

    showToast(
      `${filename} berhasil dibuat.`,
      "success"
    );
  }


  /* =========================================================
     27. EXPORT EXCEL
     ========================================================= */

  function exportExcel() {
    if (!window.XLSX) {
      showToast(
        "Library Excel belum berhasil dimuat.",
        "error"
      );
      return;
    }

    const workbook = XLSX.utils.book_new();

    const sheets = [
      ["Transaksi", state.transactions],
      ["Penjualan", state.sales],
      ["Pembelian", state.purchases],
      ["Piutang", state.receivables],
      ["Hutang", state.payables],
      ["Produk_HPP", state.products],
      ["Jurnal", state.journals],
      ["COA", state.accounts]
    ];

    sheets.forEach(([name, data]) => {
      const rows =
        data && data.length
          ? data
          : [{ Keterangan: "Belum ada data" }];

      const ws =
        XLSX.utils.json_to_sheet(rows);

      XLSX.utils.book_append_sheet(
        workbook,
        ws,
        name.substring(0, 31)
      );
    });

    /*
      Ringkasan otomatis
    */

    const summary = [
      {
        Komponen: "Saldo Kas & Bank",
        Nilai: balance()
      },
      {
        Komponen: "Total Uang Masuk",
        Nilai: totalIn()
      },
      {
        Komponen: "Total Uang Keluar",
        Nilai: totalOut()
      },
      {
        Komponen: "Total Piutang",
        Nilai: totalAR()
      },
      {
        Komponen: "Total Hutang",
        Nilai: totalAP()
      }
    ];

    const summarySheet =
      XLSX.utils.json_to_sheet(summary);

    XLSX.utils.book_append_sheet(
      workbook,
      summarySheet,
      "Ringkasan"
    );

    XLSX.writeFile(
      workbook,
      `KARSA-Finance-${today()}.xlsx`
    );

    showToast(
      "File Excel berhasil dibuat.",
      "success"
    );
  }


  /* =========================================================
     28. EXPORT ROUTER
     ========================================================= */

  function exportData(type) {
    switch (type) {
      case "transactions":
        downloadCSV(
          "KARSA-Transactions.csv",
          state.transactions
        );
        break;

      case "journal":
        downloadCSV(
          "KARSA-Journal.csv",
          state.journals
        );
        break;

      case "sales":
        downloadCSV(
          "KARSA-Sales.csv",
          state.sales
        );
        break;

      case "purchases":
        downloadCSV(
          "KARSA-Purchases.csv",
          state.purchases
        );
        break;

      case "ar":
        downloadCSV(
          "KARSA-Piutang.csv",
          state.receivables
        );
        break;

      case "ap":
        downloadCSV(
          "KARSA-Hutang.csv",
          state.payables
        );
        break;

      case "stock":
        downloadCSV(
          "KARSA-Stok-HPP.csv",
          state.products
        );
        break;

      case "all":
        downloadCSV(
          "KARSA-All-Transactions.csv",
          state.transactions
        );
        break;

      default:
        exportExcel();
    }
  }


  /* =========================================================
     29. REFRESH
     ========================================================= */

  async function refresh() {
    await loadData();

    renderDashboard();
    renderCash();
    renderTransactions();
    renderSales();
    renderPurchases();
    renderAR();
    renderAP();
    renderStock();
    renderJournal();
    renderReports();
  }


  /* =========================================================
     30. EVENT LISTENERS
     ========================================================= */

  function bindEvents() {

    /*
      Navigation
    */

    $$(".nav-item").forEach(button => {
      button.addEventListener("click", () => {
        navigate(button.dataset.page);
      });
    });


    /*
      Login
    */

    $("#loginForm")?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const email =
          $("#loginEmail")?.value.trim();

        const password =
          $("#loginPass")?.value;

        if (!email || !password) {
          showToast(
            "Email dan password wajib diisi.",
            "error"
          );
          return;
        }

        const button =
          $("#loginForm button[type='submit']");

        if (button) {
          button.disabled = true;
          button.textContent = "Memeriksa...";
        }

        try {
          await login(email, password);

          showApp();

          await refresh();

          navigate("dashboard");

          showToast(
            "Login berhasil. Selamat datang di KARSA Finance.",
            "success"
          );

        } catch (err) {
          console.error(err);

          showToast(
            errorText(err),
            "error"
          );
        } finally {
          if (button) {
            button.disabled = false;
            button.textContent = "Masuk ke Finance";
          }
        }
      }
    );


    /*
      Logout
    */

    $("#logout")?.addEventListener(
      "click",
      logout
    );


    /*
      Modal close
    */

    $("#closeModal")?.addEventListener(
      "click",
      closeModal
    );

    $("#modal")?.addEventListener(
      "click",
      event => {
        if (event.target.id === "modal") {
          closeModal();
        }
      }
    );


    /*
      Quick transaction
    */

    $("#quickBtn")?.addEventListener(
      "click",
      addTransactionModal
    );

    $("#heroAdd")?.addEventListener(
      "click",
      addTransactionModal
    );

    $("#cashAdd")?.addEventListener(
      "click",
      addTransactionModal
    );

    $("#trxAdd")?.addEventListener(
      "click",
      addTransactionModal
    );


    /*
      Sales
    */

    $("#saleAdd")?.addEventListener(
      "click",
      addSaleModal
    );


    /*
      Purchases
    */

    $("#purchaseAdd")?.addEventListener(
      "click",
      addPurchaseModal
    );


    /*
      Products
    */

    $("#productAdd")?.addEventListener(
      "click",
      addProductModal
    );


    /*
      Export
    */

    $$(".export-card").forEach(button => {
      button.addEventListener(
        "click",
        () => {
          exportData(
            button.dataset.export
          );
        }
      );
    });


    /*
      Dashboard "Lihat semua"
    */

    $$("[data-go]").forEach(button => {
      button.addEventListener("click", () => {
        navigate(button.dataset.go);
      });
    });


    /*
      Auth tab
      Registrasi sengaja tidak digunakan.
      Akun dibuat melalui Supabase Auth/Admin.
    */

    $$(".auth-tabs .tab").forEach(tab => {
      tab.addEventListener("click", () => {

        $$(".auth-tabs .tab").forEach(x => {
          x.classList.remove("active");
        });

        tab.classList.add("active");

        if (tab.dataset.auth === "register") {
          showToast(
            "Pendaftaran akun dilakukan oleh Admin melalui Supabase.",
            "normal"
          );

          const loginTab =
            document.querySelector(
              '.auth-tabs .tab[data-auth="login"]'
            );

          loginTab?.click();
        }
      });
    });
  }


  /* =========================================================
     31. CLOCK
     ========================================================= */

  function startClock() {
    const el = $("#clock");

    if (!el) return;

    function update() {
      const now = new Date();

      el.textContent =
        now.toLocaleString("id-ID", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });
    }

    update();

    setInterval(update, 30000);
  }


  /* =========================================================
     32. SUPABASE AUTH STATE
     ========================================================= */

  function watchAuth() {
    if (!client) return;

    client.auth.onAuthStateChange(
      async (event, session) => {

        console.log(
          "Auth event:",
          event
        );

        if (session?.user) {
          state.user = session.user;

          await loadProfile();

          showApp();

          /*
            Jangan menjalankan refresh berat
            setiap perubahan token.
          */

          if (
            event === "SIGNED_IN" ||
            event === "INITIAL_SESSION"
          ) {
            await refresh();
          }

        } else {
          state.user = null;
          state.profile = null;

          showAuth();
        }
      }
    );
  }


  /* =========================================================
     33. APPLICATION START
     ========================================================= */

  async function boot() {

    /*
      Penting:
      Loader SELALU ditutup melalui finally.
      Jadi kalau database error, aplikasi tidak
      akan stuck selamanya di logo.
    */

    try {

      bindEvents();
      startClock();

      if (!configured()) {

        console.error(
          "SUPABASE CONFIGURATION MISSING"
        );

        showAuth();

        showToast(
          "Supabase belum dikonfigurasi. Periksa config.js.",
          "error"
        );

        return;
      }

      if (!client) {
        showAuth();

        showToast(
          "Supabase gagal diinisialisasi.",
          "error"
        );

        return;
      }

      watchAuth();

      const session = await getSession();

      if (session?.user) {

        state.user = session.user;

        await loadProfile();

        showApp();

        await refresh();

        navigate("dashboard");

      } else {

        showAuth();

      }

    } catch (err) {

      console.error(
        "KARSA BOOT ERROR:",
        err
      );

      showAuth();

      showToast(
        `Aplikasi gagal dimuat: ${errorText(err)}`,
        "error"
      );

    } finally {

      /*
        INI BAGIAN PENTING AGAR TIDAK LOADING TERUS.
      */

      hideLoader();
    }
  }


  /* =========================================================
     34. GLOBAL DEBUG
     ========================================================= */

  window.KARSA = {
    state,
    client,
    refresh,
    navigate,
    addTransactionModal,
    addSaleModal,
    addPurchaseModal,
    addProductModal,
    exportExcel,
    logout
  };


  /* =========================================================
     35. START
     ========================================================= */

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      boot
    );
  } else {
    boot();
  }

})();
