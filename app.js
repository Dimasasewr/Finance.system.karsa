/* =========================================================
   KARSA FINANCE SYSTEM
   Supabase + Vercel
   ========================================================= */

let sb = null;
let user = null;

const state = {
  transactions: [],
  sales: [],
  purchases: [],
  ar: [],
  ap: [],
  products: [],
  journals: [],
  accounts: [],
  cashAccounts: []
};

const rupiah = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(Number(n || 0));

const today = () => {
  const d = new Date();
  return d.toISOString().slice(0, 10);
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

/* =========================================================
   ELEMENT
   ========================================================= */

const $ = (id) => document.getElementById(id);

/* =========================================================
   MESSAGE
   ========================================================= */

function msg(text, success = false) {
  let el = $("authMessage");

  if (!el) {
    el = document.createElement("div");
    el.id = "authMessage";
    el.className = "auth-message";
    
    const form = $("loginForm");
    if (form) form.prepend(el);
  }

  el.textContent = text;
  el.className = "auth-message " + (success ? "ok" : "error");
}

/* =========================================================
   LOADER
   ========================================================= */

function hideLoader() {
  const loader = $("loader");

  if (loader) {
    loader.style.opacity = "0";
    loader.style.pointerEvents = "none";

    setTimeout(() => {
      loader.style.display = "none";
    }, 500);
  }
}

/* =========================================================
   SCREEN
   ========================================================= */

function showLogin() {
  hideLoader();

  const auth = $("auth");
  const app = $("app");

  if (auth) {
    auth.classList.remove("hidden");
    auth.style.display = "";
  }

  if (app) {
    app.classList.add("hidden");
    app.style.display = "none";
  }
}

function showApp() {
  hideLoader();

  const auth = $("auth");
  const app = $("app");

  if (auth) {
    auth.classList.add("hidden");
    auth.style.display = "none";
  }

  if (app) {
    app.classList.remove("hidden");
    app.style.display = "";
  }

  renderAll();
}

/* =========================================================
   SUPABASE CONFIG
   ========================================================= */

function configured() {
  const url = window.KARSA_SUPABASE_URL;
  const key = window.KARSA_SUPABASE_ANON_KEY;

  return Boolean(
    url &&
    key &&
    url.includes("supabase.co") &&
    !url.includes("PASTE_") &&
    !key.includes("PASTE_")
  );
}

/* =========================================================
   DATABASE
   ========================================================= */

async function load(table, key, order = "created_at") {
  const result = await sb
    .from(table)
    .select("*")
    .order(order, { ascending: false });

  if (result.error) {
    console.error(`Supabase ${table}:`, result.error);
    throw result.error;
  }

  state[key] = result.data || [];
}

async function loadAll() {
  await Promise.all([
    load("transactions", "transactions"),
    load("sales", "sales"),
    load("purchases", "purchases"),
    load("accounts_receivable", "ar"),
    load("accounts_payable", "ap"),
    load("products", "products"),
    load("journal_headers", "journals"),
    load("accounts", "accounts"),
    load("cash_accounts", "cashAccounts")
  ]);

  window.KARSA_STATE = state;
}

/* =========================================================
   INSERT
   ========================================================= */

async function insert(table, row) {
  const payload = {
    ...row
  };

  if (user?.id) {
    payload.created_by = user.id;
  }

  const result = await sb
    .from(table)
    .insert(payload)
    .select()
    .single();

  if (result.error) {
    throw result.error;
  }

  return result.data;
}

/* =========================================================
   LOGIN
   ========================================================= */

async function login(email, password) {
  const result = await sb.auth.signInWithPassword({
    email,
    password
  });

  if (result.error) {
    throw result.error;
  }

  return result.data;
}

/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {
  if (!sb) return;

  const result = await sb.auth.signOut();

  if (result.error) {
    console.error(result.error);
    return;
  }

  user = null;
  showLogin();
}

/* =========================================================
   NUMBER GENERATOR
   ========================================================= */

function nextNo(prefix, rows, key) {
  let max = 0;

  for (const row of rows || []) {
    const match = String(row[key] || "").match(/(\d+)$/);

    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }

  return `${prefix}-${String(max + 1).padStart(5, "0")}`;
}

/* =========================================================
   CASH TRANSACTION
   ========================================================= */

async function saveCashTransaction({
  date,
  description,
  category,
  cashAccountId,
  inAmount = 0,
  outAmount = 0,
  sourceType = "other",
  referenceNo = "",
  pic = ""
}) {
  if (!description) {
    throw new Error("Deskripsi transaksi wajib diisi.");
  }

  const row = {
    transaction_no: nextNo(
      "TRX",
      state.transactions,
      "transaction_no"
    ),
    transaction_date: date || today(),
    source_type: sourceType,
    description,
    category,
    cash_account_id: cashAccountId || null,
    cash_in: Number(inAmount) || 0,
    cash_out: Number(outAmount) || 0,
    reference_no: referenceNo,
    pic,
    status: "posted"
  };

  const saved = await insert("transactions", row);

  await loadAll();
  renderAll();

  return saved;
}

/* =========================================================
   JOURNAL
   ========================================================= */

async function postJournal({
  type,
  date,
  description,
  sourceType,
  sourceId,
  lines
}) {
  const totalDebit = lines.reduce(
    (sum, item) => sum + (Number(item.debit) || 0),
    0
  );

  const totalCredit = lines.reduce(
    (sum, item) => sum + (Number(item.credit) || 0),
    0
  );

  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(
      "Jurnal tidak balance: Debit dan Kredit harus sama."
    );
  }

  const header = await insert("journal_headers", {
    journal_no: nextNo(
      "JRN",
      state.journals,
      "journal_no"
    ),
    journal_date: date || today(),
    journal_type: type,
    source_type: sourceType,
    source_id: sourceId || null,
    description,
    status: "posted"
  });

  const journalLines = lines.map((item, index) => ({
    journal_id: header.id,
    line_no: index + 1,
    account_id: item.account_id,
    description: item.description || description,
    debit: Number(item.debit) || 0,
    credit: Number(item.credit) || 0
  }));

  const result = await sb
    .from("journal_lines")
    .insert(journalLines);

  if (result.error) {
    throw result.error;
  }

  await loadAll();
  renderAll();

  return header;
}

/* =========================================================
   RENDER
   ========================================================= */

function renderAll() {
  renderDashboard();
  renderTransactions();
  renderSales();
  renderPurchases();
  renderAR();
  renderAP();
  renderStock();
  renderJournals();
  renderReports();
  renderCash();
}

/* =========================================================
   DASHBOARD
   ========================================================= */

function renderDashboard() {
  const transactions = state.transactions || [];

  const totalIn = transactions.reduce(
    (sum, r) => sum + Number(r.cash_in || 0),
    0
  );

  const totalOut = transactions.reduce(
    (sum, r) => sum + Number(r.cash_out || 0),
    0
  );

  const balance = totalIn - totalOut;

  const ar = state.ar.reduce(
    (sum, r) =>
      sum +
      Math.max(
        0,
        Number(r.amount || 0) -
        Number(r.paid_amount || 0)
      ),
    0
  );

  const ap = state.ap.reduce(
    (sum, r) =>
      sum +
      Math.max(
        0,
        Number(r.amount || 0) -
        Number(r.paid_amount || 0)
      ),
    0
  );

  if ($("heroBalance"))
    $("heroBalance").textContent = rupiah(balance);

  if ($("sBalance"))
    $("sBalance").textContent = rupiah(balance);

  if ($("sIn"))
    $("sIn").textContent = rupiah(totalIn);

  if ($("sOut"))
    $("sOut").textContent = rupiah(totalOut);

  if ($("sAR"))
    $("sAR").textContent = rupiah(ar);

  if ($("sAP"))
    $("sAP").textContent = rupiah(ap);

  if ($("recent")) {
    const rows = transactions.slice(0, 8);

    $("recent").innerHTML = table(
      ["Tanggal", "Deskripsi", "Masuk", "Keluar"],
      rows.map((r) => [
        r.transaction_date || "-",
        esc(r.description || "-"),
        rupiah(r.cash_in),
        rupiah(r.cash_out)
      ])
    );
  }

  if ($("controlList")) {
    $("controlList").innerHTML = `
      <div class="attention-item">
        <div class="bar"></div>
        <div>
          <strong>Database Supabase</strong>
          <small>${sb ? "Terhubung" : "Belum terhubung"}</small>
        </div>
      </div>

      <div class="attention-item">
        <div class="bar"></div>
        <div>
          <strong>Transaksi</strong>
          <small>${transactions.length} transaksi tersimpan</small>
        </div>
      </div>

      <div class="attention-item">
        <div class="bar"></div>
        <div>
          <strong>Jurnal</strong>
          <small>${state.journals.length} jurnal tercatat</small>
        </div>
      </div>
    `;
  }
}

/* =========================================================
   TABLE HELPER
   ========================================================= */

function table(headers, rows) {
  if (!rows.length) {
    return `
      <div class="notice">
        Belum ada data.
      </div>
    `;
  }

  return `
    <table>
      <thead>
        <tr>
          ${headers.map((h) => `<th>${h}</th>`).join("")}
        </tr>
      </thead>

      <tbody>
        ${rows.map(
          (row) => `
            <tr>
              ${row.map((cell) => `<td>${cell}</td>`).join("")}
            </tr>
          `
        ).join("")}
      </tbody>
    </table>
  `;
}

/* =========================================================
   TRANSACTIONS
   ========================================================= */

function renderTransactions() {
  const el = $("trxTable");
  if (!el) return;

  el.innerHTML = table(
    ["No", "Tanggal", "Deskripsi", "Kategori", "Masuk", "Keluar"],
    state.transactions.map((r) => [
      esc(r.transaction_no),
      esc(r.transaction_date),
      esc(r.description),
      esc(r.category),
      `<span class="money-in">${rupiah(r.cash_in)}</span>`,
      `<span class="money-out">${rupiah(r.cash_out)}</span>`
    ])
  );
}

/* =========================================================
   SALES
   ========================================================= */

function renderSales() {
  const el = $("salesTable");
  if (!el) return;

  el.innerHTML = table(
    ["No", "Tanggal", "Customer", "Total", "Status"],
    state.sales.map((r) => [
      esc(r.invoice_no || r.id || "-"),
      esc(r.sale_date || r.transaction_date || "-"),
      esc(r.customer_name || "-"),
      rupiah(r.total_amount || r.amount),
      esc(r.status || "-")
    ])
  );
}

/* =========================================================
   PURCHASE
   ========================================================= */

function renderPurchases() {
  const el = $("purchaseTable");
  if (!el) return;

  el.innerHTML = table(
    ["No", "Tanggal", "Supplier", "Total", "Status"],
    state.purchases.map((r) => [
      esc(r.invoice_no || r.id || "-"),
      esc(r.purchase_date || r.transaction_date || "-"),
      esc(r.supplier_name || "-"),
      rupiah(r.total_amount || r.amount),
      esc(r.status || "-")
    ])
  );
}

/* =========================================================
   AR
   ========================================================= */

function renderAR() {
  const el = $("arTable");
  if (!el) return;

  el.innerHTML = table(
    ["Customer", "Jumlah", "Dibayar", "Sisa", "Jatuh Tempo"],
    state.ar.map((r) => {
      const amount = Number(r.amount || 0);
      const paid = Number(r.paid_amount || 0);
      const remaining = Math.max(0, amount - paid);

      return [
        esc(r.customer_name || "-"),
        rupiah(amount),
        rupiah(paid),
        rupiah(remaining),
        esc(r.due_date || "-")
      ];
    })
  );
}

/* =========================================================
   AP
   ========================================================= */

function renderAP() {
  const el = $("apTable");
  if (!el) return;

  el.innerHTML = table(
    ["Supplier", "Jumlah", "Dibayar", "Sisa", "Jatuh Tempo"],
    state.ap.map((r) => {
      const amount = Number(r.amount || 0);
      const paid = Number(r.paid_amount || 0);
      const remaining = Math.max(0, amount - paid);

      return [
        esc(r.supplier_name || "-"),
        rupiah(amount),
        rupiah(paid),
        rupiah(remaining),
        esc(r.due_date || "-")
      ];
    })
  );
}

/* =========================================================
   STOCK
   ========================================================= */

function renderStock() {
  const el = $("stockTable");
  if (!el) return;

  el.innerHTML = table(
    ["Produk", "SKU", "Harga Jual", "Stok"],
    state.products.map((r) => [
      esc(r.name || "-"),
      esc(r.sku || "-"),
      rupiah(r.selling_price),
      Number(r.stock || 0)
    ])
  );
}

/* =========================================================
   JOURNAL
   ========================================================= */

function renderJournals() {
  const el = $("journalTable");
  if (!el) return;

  el.innerHTML = table(
    ["No", "Tanggal", "Jenis", "Deskripsi", "Status"],
    state.journals.map((r) => [
      esc(r.journal_no || "-"),
      esc(r.journal_date || "-"),
      esc(r.journal_type || "-"),
      esc(r.description || "-"),
      esc(r.status || "-")
    ])
  );
}

/* =========================================================
   CASH
   ========================================================= */

function renderCash() {
  const el = $("cashTable");
  if (!el) return;

  el.innerHTML = table(
    ["Tanggal", "Deskripsi", "Masuk", "Keluar"],
    state.transactions.map((r) => [
      esc(r.transaction_date),
      esc(r.description),
      rupiah(r.cash_in),
      rupiah(r.cash_out)
    ])
  );
}

/* =========================================================
   REPORT
   ========================================================= */

function renderReports() {
  const el = $("reportTable");
  if (!el) return;

  const totalSales = state.sales.reduce(
    (sum, r) =>
      sum + Number(r.total_amount || r.amount || 0),
    0
  );

  const totalPurchase = state.purchases.reduce(
    (sum, r) =>
      sum + Number(r.total_amount || r.amount || 0),
    0
  );

  el.innerHTML = table(
    ["Laporan", "Nilai"],
    [
      ["Total Penjualan", rupiah(totalSales)],
      ["Total Pembelian", rupiah(totalPurchase)],
      ["Uang Masuk", rupiah(
        state.transactions.reduce(
          (s, r) => s + Number(r.cash_in || 0),
          0
        )
      )],
      ["Uang Keluar", rupiah(
        state.transactions.reduce(
          (s, r) => s + Number(r.cash_out || 0),
          0
        )
      )]
    ]
  );
}

/* =========================================================
   EXPORT CSV
   ========================================================= */

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCSV(filename, rows) {
  if (!rows || !rows.length) {
    alert("Tidak ada data untuk diekspor.");
    return;
  }

  const headers = Object.keys(rows[0]);

  const content = [
    headers.map(csvCell).join(","),
    ...rows.map((row) =>
      headers.map((h) => csvCell(row[h])).join(",")
    )
  ].join("\r\n");

  const blob = new Blob(
    ["\ufeff" + content],
    {
      type: "text/csv;charset=utf-8"
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
}

function exportAllCSV() {
  downloadCSV(
    `KARSA-Transaksi-${today()}.csv`,
    state.transactions
  );
}

function exportJournalCSV() {
  downloadCSV(
    `KARSA-Jurnal-${today()}.csv`,
    state.journals
  );
}

function exportWorkbook() {
  if (!window.XLSX) {
    alert("Library Excel belum tersedia.");
    return;
  }

  const wb = XLSX.utils.book_new();

  const addSheet = (name, rows) => {
    const safeRows = rows?.length ? rows : [{}];

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(safeRows),
      name
    );
  };

  addSheet("Transaksi", state.transactions);
  addSheet("Penjualan", state.sales);
  addSheet("Pembelian", state.purchases);
  addSheet("Piutang", state.ar);
  addSheet("Hutang", state.ap);
  addSheet("Produk", state.products);
  addSheet("Jurnal", state.journals);
  addSheet("Akun", state.accounts);

  XLSX.writeFile(
    wb,
    `KARSA-Finance-${today()}.xlsx`
  );
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      const page = button.dataset.page;
      if (!page) return;

      document.querySelectorAll(".nav-item")
        .forEach((x) => x.classList.remove("active"));

      button.classList.add("active");

      document.querySelectorAll(".view")
        .forEach((view) => {
          view.classList.remove("active");
        });

      const target = $(page);

      if (target) {
        target.classList.add("active");
      }

      const title = $("pageTitle");

      if (title) {
        title.textContent =
          button.textContent.trim() || "Dashboard";
      }
    });
  });
}

/* =========================================================
   EXPORT BUTTONS
   ========================================================= */

function setupExports() {
  document.querySelectorAll("[data-export]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const type = button.dataset.export;

        if (type === "transactions" || type === "all") {
          downloadCSV(
            `KARSA-Transaksi-${today()}.csv`,
            state.transactions
          );
        }

        if (type === "journal") {
          exportJournalCSV();
        }

        if (type === "sales") {
          downloadCSV(
            `KARSA-Penjualan-${today()}.csv`,
            state.sales
          );
        }

        if (type === "purchases") {
          downloadCSV(
            `KARSA-Pembelian-${today()}.csv`,
            state.purchases
          );
        }

        if (type === "ar") {
          downloadCSV(
            `KARSA-Piutang-${today()}.csv`,
            state.ar
          );
        }

        if (type === "ap") {
          downloadCSV(
            `KARSA-Hutang-${today()}.csv`,
            state.ap
          );
        }

        if (type === "stock") {
          downloadCSV(
            `KARSA-Stok-${today()}.csv`,
            state.products
          );
        }
      });
    });
}

/* =========================================================
   AUTH INIT
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {

  /* Loader maksimal 3 detik */
  setTimeout(hideLoader, 3000);

  setupNavigation();
  setupExports();

  /* LOGIN */
  const form = $("loginForm");

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!configured()) {
        msg(
          "Supabase belum dikonfigurasi. Periksa config.js."
        );
        return;
      }

      const email = $("loginEmail")?.value.trim();
      const password = $("loginPass")?.value;

      if (!email || !password) {
        msg("Email dan password wajib diisi.");
        return;
      }

      try {
        msg("Memeriksa akun...", true);

        await login(email, password);

      } catch (error) {
        console.error(error);

        msg(
          error?.message ||
          "Login gagal. Periksa email dan password."
        );
      }
    });
  }

  /* LOGOUT */
  const logoutButton = $("logout");

  if (logoutButton) {
    logoutButton.addEventListener(
      "click",
      logout
    );
  }

  /* SUPABASE */
  if (!configured()) {
    console.warn(
      "Supabase belum dikonfigurasi."
    );

    showLogin();
    msg(
      "Supabase belum dikonfigurasi."
    );

    return;
  }

  try {
    sb = window.supabase.createClient(
      window.KARSA_SUPABASE_URL,
      window.KARSA_SUPABASE_ANON_KEY
    );

    const sessionResult =
      await sb.auth.getSession();

    const session =
      sessionResult?.data?.session;

    if (session) {
      user = session.user;

      try {
        await loadAll();
        showApp();
      } catch (error) {
        console.error(
          "Gagal mengambil database:",
          error
        );

        showLogin();

        msg(
          "Login ada, tetapi database belum bisa dibaca. Cek RLS Supabase."
        );
      }
    } else {
      showLogin();
    }

    sb.auth.onAuthStateChange(
      async (_event, session) => {

        user = session?.user || null;

        if (!user) {
          showLogin();
          return;
        }

        try {
          await loadAll();
          showApp();
        } catch (error) {
          console.error(error);

          msg(
            "Berhasil login, tetapi data Finance belum bisa dimuat."
          );
        }
      }
    );

  } catch (error) {

    console.error(
      "Supabase initialization error:",
      error
    );

    showLogin();

    msg(
      "Gagal menghubungkan ke Supabase."
    );
  }
});

/* =========================================================
   GLOBAL API
   ========================================================= */

window.KARSA = {
  state,
  loadAll,
  insert,
  saveCashTransaction,
  postJournal,
  downloadCSV,
  exportAllCSV,
  exportJournalCSV,
  exportWorkbook,
  rupiah
};

window.KARSA_STATE = state;
