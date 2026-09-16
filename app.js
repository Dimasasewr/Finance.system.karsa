/* =========================================================
   KARSA FINANCE SYSTEM
   app.js
   ========================================================= */

"use strict";

/* =========================================================
   GLOBAL
   ========================================================= */

let sb = null;
let currentUser = null;

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

const $ = (id) => document.getElementById(id);

const rupiah = (value) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
};

const today = () => {
  return new Date().toISOString().slice(0, 10);
};

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, function (char) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char];
  });
}

/* =========================================================
   LOADING SCREEN
   ========================================================= */

function hideLoader() {
  const loader = $("loader");

  if (!loader) return;

  loader.style.opacity = "0";
  loader.style.visibility = "hidden";
  loader.style.pointerEvents = "none";
  loader.style.display = "none";
}

function showLoader() {
  const loader = $("loader");

  if (!loader) return;

  loader.style.display = "";
  loader.style.visibility = "visible";
  loader.style.opacity = "1";
  loader.style.pointerEvents = "auto";
}

/*
   PENTING:
   Loader tidak boleh menggantung.
   Setelah 1.5 detik dipastikan hilang.
*/
setTimeout(function () {
  hideLoader();
}, 1500);

/* =========================================================
   CONFIG
   ========================================================= */

function getConfig() {
  const config = window.KARSA_CONFIG || {};

  return {
    url: config.url || "",
    publishableKey: config.publishableKey || ""
  };
}

function isConfigured() {
  const config = getConfig();

  return Boolean(
    config.url &&
    config.publishableKey &&
    config.url.includes("supabase.co") &&
    !config.url.includes("PASTE_") &&
    !config.publishableKey.includes("PASTE_")
  );
}

/* =========================================================
   MESSAGE
   ========================================================= */

function showMessage(message, type = "error") {
  let box = $("authMessage");

  if (!box) {
    box = document.createElement("div");
    box.id = "authMessage";

    const form = $("loginForm");

    if (form) {
      form.prepend(box);
    } else {
      document.body.prepend(box);
    }
  }

  box.textContent = message;
  box.className = "auth-message " + type;
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
   SUPABASE INITIALIZATION
   ========================================================= */

function initializeSupabase() {
  if (!isConfigured()) {
    console.error("KARSA: Supabase config belum tersedia.");
    return false;
  }

  if (!window.supabase) {
    console.error(
      "KARSA: Supabase JavaScript library belum dimuat."
    );

    return false;
  }

  const config = getConfig();

  try {
    sb = window.supabase.createClient(
      config.url,
      config.publishableKey
    );

    console.log("KARSA: Supabase berhasil diinisialisasi.");

    return true;
  } catch (error) {
    console.error(
      "KARSA: Gagal initialize Supabase:",
      error
    );

    return false;
  }
}

/* =========================================================
   DATABASE LOAD
   ========================================================= */

async function loadTable(tableName, stateKey) {
  if (!sb) {
    throw new Error("Supabase belum terhubung.");
  }

  const result = await sb
    .from(tableName)
    .select("*");

  if (result.error) {
    console.error(
      `KARSA: Error table ${tableName}:`,
      result.error
    );

    throw result.error;
  }

  state[stateKey] = result.data || [];

  return state[stateKey];
}

async function loadAll() {
  if (!sb) {
    throw new Error("Supabase belum terhubung.");
  }

  /*
    Kita load satu per satu supaya kalau salah satu tabel
    bermasalah, error-nya mudah diketahui.
  */

  const tables = [
    ["transactions", "transactions"],
    ["sales", "sales"],
    ["purchases", "purchases"],
    ["accounts_receivable", "ar"],
    ["accounts_payable", "ap"],
    ["products", "products"],
    ["journal_headers", "journals"],
    ["accounts", "accounts"],
    ["cash_accounts", "cashAccounts"]
  ];

  for (const [tableName, stateKey] of tables) {
    try {
      await loadTable(tableName, stateKey);
    } catch (error) {
      console.warn(
        `KARSA: Tidak dapat membaca ${tableName}.`,
        error
      );

      /*
        Jangan bikin aplikasi stuck.
        Kalau sebuah tabel gagal, kita tetap lanjut.
      */

      state[stateKey] = [];
    }
  }

  window.KARSA_STATE = state;

  return state;
}

/* =========================================================
   GENERIC INSERT
   ========================================================= */

async function insert(tableName, data) {
  if (!sb) {
    throw new Error("Supabase belum terhubung.");
  }

  const payload = {
    ...data
  };

  /*
    created_by hanya ditambahkan jika tersedia.
  */

  if (currentUser?.id) {
    payload.created_by = currentUser.id;
  }

  const result = await sb
    .from(tableName)
    .insert(payload)
    .select()
    .single();

  if (result.error) {
    throw result.error;
  }

  return result.data;
}

/* =========================================================
   UPDATE
   ========================================================= */

async function update(tableName, id, data) {
  if (!sb) {
    throw new Error("Supabase belum terhubung.");
  }

  const result = await sb
    .from(tableName)
    .update(data)
    .eq("id", id)
    .select()
    .single();

  if (result.error) {
    throw result.error;
  }

  return result.data;
}

/* =========================================================
   DELETE
   ========================================================= */

async function remove(tableName, id) {
  if (!sb) {
    throw new Error("Supabase belum terhubung.");
  }

  const result = await sb
    .from(tableName)
    .delete()
    .eq("id", id);

  if (result.error) {
    throw result.error;
  }

  return true;
}

/* =========================================================
   LOGIN
   ========================================================= */

async function login(email, password) {
  if (!sb) {
    throw new Error("Supabase belum terhubung.");
  }

  const result = await sb.auth.signInWithPassword({
    email: email,
    password: password
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
  if (!sb) {
    showLogin();
    return;
  }

  try {
    const result = await sb.auth.signOut();

    if (result.error) {
      throw result.error;
    }

    currentUser = null;

    showLogin();

  } catch (error) {
    console.error("Logout error:", error);
  }
}

/* =========================================================
   NUMBER GENERATOR
   ========================================================= */

function generateNumber(prefix, rows, field) {
  let max = 0;

  for (const row of rows || []) {
    const value = String(row[field] || "");

    const match = value.match(/(\d+)$/);

    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }

  return (
    prefix +
    "-" +
    String(max + 1).padStart(5, "0")
  );
}

/* =========================================================
   CASH TRANSACTION
   ========================================================= */

async function saveCashTransaction(options = {}) {

  const data = {
    transaction_no: generateNumber(
      "TRX",
      state.transactions,
      "transaction_no"
    ),

    transaction_date:
      options.date || today(),

    source_type:
      options.sourceType || "other",

    description:
      options.description || "",

    category:
      options.category || "",

    cash_account_id:
      options.cashAccountId || null,

    cash_in:
      Number(options.inAmount || 0),

    cash_out:
      Number(options.outAmount || 0),

    reference_no:
      options.referenceNo || "",

    pic:
      options.pic || "",

    status:
      options.status || "posted"
  };

  if (!data.description) {
    throw new Error(
      "Deskripsi transaksi wajib diisi."
    );
  }

  const saved = await insert(
    "transactions",
    data
  );

  await loadAll();
  renderAll();

  return saved;
}

/* =========================================================
   JOURNAL
   ========================================================= */

async function postJournal(options = {}) {

  const lines = Array.isArray(options.lines)
    ? options.lines
    : [];

  if (!lines.length) {
    throw new Error(
      "Jurnal harus memiliki minimal satu baris."
    );
  }

  const totalDebit = lines.reduce(
    (total, line) =>
      total + Number(line.debit || 0),
    0
  );

  const totalCredit = lines.reduce(
    (total, line) =>
      total + Number(line.credit || 0),
    0
  );

  if (
    Math.abs(
      totalDebit - totalCredit
    ) > 0.005
  ) {
    throw new Error(
      "Jurnal tidak balance. Total Debit harus sama dengan Total Kredit."
    );
  }

  const header = await insert(
    "journal_headers",
    {
      journal_no: generateNumber(
        "JRN",
        state.journals,
        "journal_no"
      ),

      journal_date:
        options.date || today(),

      journal_type:
        options.type || "general",

      source_type:
        options.sourceType || "manual",

      source_id:
        options.sourceId || null,

      description:
        options.description || "",

      status:
        options.status || "posted"
    }
  );

  const journalLines = lines.map(
    (line, index) => ({
      journal_id: header.id,

      line_no: index + 1,

      account_id:
        line.account_id || null,

      description:
        line.description ||
        options.description ||
        "",

      debit:
        Number(line.debit || 0),

      credit:
        Number(line.credit || 0)
    })
  );

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
   TABLE
   ========================================================= */

function createTable(headers, rows) {

  if (!rows || !rows.length) {
    return `
      <div class="notice">
        Belum ada data.
      </div>
    `;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${headers
              .map(
                (header) =>
                  `<th>${escapeHTML(header)}</th>`
              )
              .join("")}
          </tr>
        </thead>

        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  ${row
                    .map(
                      (cell) =>
                        `<td>${cell}</td>`
                    )
                    .join("")}
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

/* =========================================================
   DASHBOARD
   ========================================================= */

function renderDashboard() {

  const transactions =
    state.transactions || [];

  const totalIn =
    transactions.reduce(
      (sum, row) =>
        sum +
        Number(row.cash_in || 0),
      0
    );

  const totalOut =
    transactions.reduce(
      (sum, row) =>
        sum +
        Number(row.cash_out || 0),
      0
    );

  const balance =
    totalIn - totalOut;

  const totalAR =
    state.ar.reduce(
      (sum, row) =>
        sum +
        Math.max(
          0,
          Number(row.amount || 0) -
          Number(row.paid_amount || 0)
        ),
      0
    );

  const totalAP =
    state.ap.reduce(
      (sum, row) =>
        sum +
        Math.max(
          0,
          Number(row.amount || 0) -
          Number(row.paid_amount || 0)
        ),
      0
    );

  if ($("heroBalance")) {
    $("heroBalance").textContent =
      rupiah(balance);
  }

  if ($("sBalance")) {
    $("sBalance").textContent =
      rupiah(balance);
  }

  if ($("sIn")) {
    $("sIn").textContent =
      rupiah(totalIn);
  }

  if ($("sOut")) {
    $("sOut").textContent =
      rupiah(totalOut);
  }

  if ($("sAR")) {
    $("sAR").textContent =
      rupiah(totalAR);
  }

  if ($("sAP")) {
    $("sAP").textContent =
      rupiah(totalAP);
  }

  if ($("recent")) {

    const rows =
      [...transactions]
        .sort(
          (a, b) =>
            String(
              b.transaction_date || ""
            ).localeCompare(
              String(
                a.transaction_date || ""
              )
            )
        )
        .slice(0, 10);

    $("recent").innerHTML =
      createTable(
        [
          "Tanggal",
          "Deskripsi",
          "Masuk",
          "Keluar"
        ],
        rows.map((row) => [
          escapeHTML(
            row.transaction_date || "-"
          ),

          escapeHTML(
            row.description || "-"
          ),

          `<span class="money-in">
            ${rupiah(row.cash_in)}
          </span>`,

          `<span class="money-out">
            ${rupiah(row.cash_out)}
          </span>`
        ])
      );
  }

  if ($("controlList")) {

    $("controlList").innerHTML = `

      <div class="attention-item">
        <div class="bar"></div>

        <div>
          <strong>
            Supabase
          </strong>

          <small>
            ${sb
              ? "Terhubung"
              : "Tidak terhubung"}
          </small>
        </div>
      </div>

      <div class="attention-item">
        <div class="bar"></div>

        <div>
          <strong>
            Transaksi
          </strong>

          <small>
            ${transactions.length}
            transaksi
          </small>
        </div>
      </div>

      <div class="attention-item">
        <div class="bar"></div>

        <div>
          <strong>
            Jurnal
          </strong>

          <small>
            ${state.journals.length}
            jurnal
          </small>
        </div>
      </div>

    `;
  }
}

/* =========================================================
   TRANSACTIONS
   ========================================================= */

function renderTransactions() {

  const element =
    $("trxTable");

  if (!element) return;

  element.innerHTML =
    createTable(
      [
        "No",
        "Tanggal",
        "Deskripsi",
        "Kategori",
        "Masuk",
        "Keluar"
      ],

      state.transactions.map(
        (row) => [
          escapeHTML(
            row.transaction_no || "-"
          ),

          escapeHTML(
            row.transaction_date || "-"
          ),

          escapeHTML(
            row.description || "-"
          ),

          escapeHTML(
            row.category || "-"
          ),

          `<span class="money-in">
            ${rupiah(row.cash_in)}
          </span>`,

          `<span class="money-out">
            ${rupiah(row.cash_out)}
          </span>`
        ]
      )
    );
}

/* =========================================================
   SALES
   ========================================================= */

function renderSales() {

  const element =
    $("salesTable");

  if (!element) return;

  element.innerHTML =
    createTable(
      [
        "No",
        "Tanggal",
        "Customer",
        "Total",
        "Status"
      ],

      state.sales.map(
        (row) => [
          escapeHTML(
            row.invoice_no ||
            row.sale_no ||
            row.id ||
            "-"
          ),

          escapeHTML(
            row.sale_date ||
            row.transaction_date ||
            "-"
          ),

          escapeHTML(
            row.customer_name ||
            "-"
          ),

          rupiah(
            row.total_amount ||
            row.amount ||
            0
          ),

          escapeHTML(
            row.status ||
            "-"
          )
        ]
      )
    );
}

/* =========================================================
   PURCHASES
   ========================================================= */

function renderPurchases() {

  const element =
    $("purchaseTable");

  if (!element) return;

  element.innerHTML =
    createTable(
      [
        "No",
        "Tanggal",
        "Supplier",
        "Total",
        "Status"
      ],

      state.purchases.map(
        (row) => [
          escapeHTML(
            row.invoice_no ||
            row.purchase_no ||
            row.id ||
            "-"
          ),

          escapeHTML(
            row.purchase_date ||
            row.transaction_date ||
            "-"
          ),

          escapeHTML(
            row.supplier_name ||
            "-"
          ),

          rupiah(
            row.total_amount ||
            row.amount ||
            0
          ),

          escapeHTML(
            row.status ||
            "-"
          )
        ]
      )
    );
}

/* =========================================================
   PIUTANG
   ========================================================= */

function renderAR() {

  const element =
    $("arTable");

  if (!element) return;

  element.innerHTML =
    createTable(
      [
        "Customer",
        "Jumlah",
        "Dibayar",
        "Sisa",
        "Jatuh Tempo"
      ],

      state.ar.map(
        (row) => {

          const amount =
            Number(row.amount || 0);

          const paid =
            Number(
              row.paid_amount || 0
            );

          const remaining =
            Math.max(
              0,
              amount - paid
            );

          return [
            escapeHTML(
              row.customer_name ||
              "-"
            ),

            rupiah(amount),

            rupiah(paid),

            rupiah(remaining),

            escapeHTML(
              row.due_date ||
              "-"
            )
          ];
        }
      )
    );
}

/* =========================================================
   HUTANG
   ========================================================= */

function renderAP() {

  const element =
    $("apTable");

  if (!element) return;

  element.innerHTML =
    createTable(
      [
        "Supplier",
        "Jumlah",
        "Dibayar",
        "Sisa",
        "Jatuh Tempo"
      ],

      state.ap.map(
        (row) => {

          const amount =
            Number(row.amount || 0);

          const paid =
            Number(
              row.paid_amount || 0
            );

          const remaining =
            Math.max(
              0,
              amount - paid
            );

          return [
            escapeHTML(
              row.supplier_name ||
              "-"
            ),

            rupiah(amount),

            rupiah(paid),

            rupiah(remaining),

            escapeHTML(
              row.due_date ||
              "-"
            )
          ];
        }
      )
    );
}

/* =========================================================
   STOCK
   ========================================================= */

function renderStock() {

  const element =
    $("stockTable");

  if (!element) return;

  element.innerHTML =
    createTable(
      [
        "Produk",
        "SKU",
        "Harga Jual",
        "Stok"
      ],

      state.products.map(
        (row) => [
          escapeHTML(
            row.name || "-"
          ),

          escapeHTML(
            row.sku || "-"
          ),

          rupiah(
            row.selling_price || 0
          ),

          Number(
            row.stock || 0
          )
        ]
      )
    );
}

/* =========================================================
   JOURNALS
   ========================================================= */

function renderJournals() {

  const element =
    $("journalTable");

  if (!element) return;

  element.innerHTML =
    createTable(
      [
        "No",
        "Tanggal",
        "Jenis",
        "Deskripsi",
        "Status"
      ],

      state.journals.map(
        (row) => [
          escapeHTML(
            row.journal_no ||
            "-"
          ),

          escapeHTML(
            row.journal_date ||
            "-"
          ),

          escapeHTML(
            row.journal_type ||
            "-"
          ),

          escapeHTML(
            row.description ||
            "-"
          ),

          escapeHTML(
            row.status ||
            "-"
          )
        ]
      )
    );
}

/* =========================================================
   CASH
   ========================================================= */

function renderCash() {

  const element =
    $("cashTable");

  if (!element) return;

  element.innerHTML =
    createTable(
      [
        "Tanggal",
        "Deskripsi",
        "Masuk",
        "Keluar"
      ],

      state.transactions.map(
        (row) => [
          escapeHTML(
            row.transaction_date ||
            "-"
          ),

          escapeHTML(
            row.description ||
            "-"
          ),

          rupiah(
            row.cash_in
          ),

          rupiah(
            row.cash_out
          )
        ]
      )
    );
}

/* =========================================================
   REPORT
   ========================================================= */

function renderReports() {

  const element =
    $("reportTable");

  if (!element) return;

  const totalSales =
    state.sales.reduce(
      (sum, row) =>
        sum +
        Number(
          row.total_amount ||
          row.amount ||
          0
        ),
      0
    );

  const totalPurchases =
    state.purchases.reduce(
      (sum, row) =>
        sum +
        Number(
          row.total_amount ||
          row.amount ||
          0
        ),
      0
    );

  const totalIn =
    state.transactions.reduce(
      (sum, row) =>
        sum +
        Number(
          row.cash_in || 0
        ),
      0
    );

  const totalOut =
    state.transactions.reduce(
      (sum, row) =>
        sum +
        Number(
          row.cash_out || 0
        ),
      0
    );

  element.innerHTML =
    createTable(
      [
        "Laporan",
        "Nilai"
      ],

      [
        [
          "Total Penjualan",
          rupiah(totalSales)
        ],

        [
          "Total Pembelian",
          rupiah(totalPurchases)
        ],

        [
          "Total Uang Masuk",
          rupiah(totalIn)
        ],

        [
          "Total Uang Keluar",
          rupiah(totalOut)
        ],

        [
          "Saldo Bersih",
          rupiah(
            totalIn - totalOut
          )
        ]
      ]
    );
}

/* =========================================================
   RENDER ALL
   ========================================================= */

function renderAll() {

  try {
    renderDashboard();
  } catch (error) {
    console.error(
      "Dashboard render error:",
      error
    );
  }

  try {
    renderTransactions();
  } catch (error) {
    console.error(error);
  }

  try {
    renderSales();
  } catch (error) {
    console.error(error);
  }

  try {
    renderPurchases();
  } catch (error) {
    console.error(error);
  }

  try {
    renderAR();
  } catch (error) {
    console.error(error);
  }

  try {
    renderAP();
  } catch (error) {
    console.error(error);
  }

  try {
    renderStock();
  } catch (error) {
    console.error(error);
  }

  try {
    renderJournals();
  } catch (error) {
    console.error(error);
  }

  try {
    renderCash();
  } catch (error) {
    console.error(error);
  }

  try {
    renderReports();
  } catch (error) {
    console.error(error);
  }
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {

  document
    .querySelectorAll(".nav-item")
    .forEach((button) => {

      button.addEventListener(
        "click",
        function () {

          const page =
            this.dataset.page;

          if (!page) return;

          document
            .querySelectorAll(".nav-item")
            .forEach(
              (item) =>
                item.classList.remove(
                  "active"
                )
            );

          this.classList.add(
            "active"
          );

          document
            .querySelectorAll(".view")
            .forEach(
              (view) =>
                view.classList.remove(
                  "active"
                )
            );

          const target =
            $(page);

          if (target) {
            target.classList.add(
              "active"
            );
          }

          const title =
            $("pageTitle");

          if (title) {
            title.textContent =
              this.textContent.trim() ||
              "Dashboard";
          }
        }
      );
    });
}

/* =========================================================
   EXPORT CSV
   ========================================================= */

function csvCell(value) {

  return (
    '"' +
    String(value ?? "")
      .replace(/"/g, '""') +
    '"'
  );
}

function downloadCSV(
  filename,
  rows
) {

  if (
    !rows ||
    !rows.length
  ) {
    alert(
      "Tidak ada data untuk diekspor."
    );

    return;
  }

  const headers =
    Object.keys(rows[0]);

  const csv = [
    headers
      .map(csvCell)
      .join(","),

    ...rows.map(
      (row) =>
        headers
          .map(
            (header) =>
              csvCell(
                row[header]
              )
          )
          .join(",")
    )
  ].join("\r\n");

  const blob =
    new Blob(
      ["\ufeff" + csv],
      {
        type:
          "text/csv;charset=utf-8;"
      }
    );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(
    link
  );

  link.click();

  link.remove();

  URL.revokeObjectURL(url);
}

/* =========================================================
   EXPORT EXCEL
   ========================================================= */

function exportWorkbook() {

  if (!window.XLSX) {
    alert(
      "Library Excel belum tersedia."
    );

    return;
  }

  const workbook =
    XLSX.utils.book_new();

  function addSheet(
    name,
    rows
  ) {

    const data =
      rows && rows.length
        ? rows
        : [{}];

    const sheet =
      XLSX.utils.json_to_sheet(
        data
      );

    XLSX.utils.book_append_sheet(
      workbook,
      sheet,
      name
    );
  }

  addSheet(
    "Transaksi",
    state.transactions
  );

  addSheet(
    "Penjualan",
    state.sales
  );

  addSheet(
    "Pembelian",
    state.purchases
  );

  addSheet(
    "Piutang",
    state.ar
  );

  addSheet(
    "Hutang",
    state.ap
  );

  addSheet(
    "Produk",
    state.products
  );

  addSheet(
    "Jurnal",
    state.journals
  );

  addSheet(
    "Akun",
    state.accounts
  );

  XLSX.writeFile(
    workbook,
    "KARSA-Finance-" +
      today() +
      ".xlsx"
  );
}

/* =========================================================
   EXPORT BUTTON
   ========================================================= */

function setupExportButtons() {

  document
    .querySelectorAll(
      "[data-export]"
    )
    .forEach((button) => {

      button.addEventListener(
        "click",
        function () {

          const type =
            this.dataset.export;

          if (
            type ===
              "transactions" ||
            type === "all"
          ) {

            downloadCSV(
              "KARSA-Transaksi-" +
                today() +
                ".csv",

              state.transactions
            );

            return;
          }

          if (type === "journal") {

            downloadCSV(
              "KARSA-Jurnal-" +
                today() +
                ".csv",

              state.journals
            );

            return;
          }

          if (type === "sales") {

            downloadCSV(
              "KARSA-Penjualan-" +
                today() +
                ".csv",

              state.sales
            );

            return;
          }

          if (type === "purchases") {

            downloadCSV(
              "KARSA-Pembelian-" +
                today() +
                ".csv",

              state.purchases
            );

            return;
          }

          if (type === "ar") {

            downloadCSV(
              "KARSA-Piutang-" +
                today() +
                ".csv",

              state.ar
            );

            return;
          }

          if (type === "ap") {

            downloadCSV(
              "KARSA-Hutang-" +
                today() +
                ".csv",

              state.ap
            );

            return;
          }

          if (type === "stock") {

            downloadCSV(
              "KARSA-Stok-" +
                today() +
                ".csv",

              state.products
            );

            return;
          }

          if (type === "excel") {
            exportWorkbook();
          }
        }
      );
    });
}

/* =========================================================
   LOGIN FORM
   ========================================================= */

function setupLogin() {

  const form =
    $("loginForm");

  if (!form) {
    console.warn(
      "KARSA: loginForm tidak ditemukan."
    );

    return;
  }

  form.addEventListener(
    "submit",
    async function (event) {

      event.preventDefault();

      const emailElement =
        $("loginEmail");

      const passwordElement =
        $("loginPass");

      const email =
        emailElement
          ? emailElement.value.trim()
          : "";

      const password =
        passwordElement
          ? passwordElement.value
          : "";

      if (!email) {
        showMessage(
          "Email wajib diisi."
        );

        return;
      }

      if (!password) {
        showMessage(
          "Password wajib diisi."
        );

        return;
      }

      if (!sb) {
        showMessage(
          "Supabase belum terhubung."
        );

        return;
      }

      const button =
        form.querySelector(
          'button[type="submit"]'
        );

      if (button) {
        button.disabled = true;
        button.dataset.originalText =
          button.textContent;

        button.textContent =
          "Memeriksa...";
      }

      try {

        showMessage(
          "Menghubungkan ke akun...",
          "info"
        );

        const result =
          await login(
            email,
            password
          );

        currentUser =
          result.user;

        showMessage(
          "Login berhasil.",
          "success"
        );

        /*
          Tidak menunggu database
          terlalu lama.
        */

        try {
          await loadAll();
        } catch (error) {
          console.warn(
            "Database load:",
            error
          );
        }

        showApp();

      } catch (error) {

        console.error(
          "Login error:",
          error
        );

        showMessage(
          error?.message ||
          "Login gagal. Periksa email dan password."
        );

      } finally {

        if (button) {
          button.disabled =
            false;

          button.textContent =
            button.dataset
              .originalText ||
            "Masuk";
        }
      }
    }
  );
}

/* =========================================================
   LOGOUT BUTTON
   ========================================================= */

function setupLogout() {

  const button =
    $("logout");

  if (!button) {
    console.warn(
      "KARSA: tombol logout tidak ditemukan."
    );

    return;
  }

  button.addEventListener(
    "click",
    async function () {
      await logout();
    }
  );
}

/* =========================================================
   AUTH SESSION
   ========================================================= */

async function checkSession() {

  if (!sb) {
    showLogin();

    return;
  }

  try {

    const result =
      await sb.auth.getSession();

    if (result.error) {
      throw result.error;
    }

    const session =
      result.data?.session;

    if (
      session &&
      session.user
    ) {

      currentUser =
        session.user;

      /*
        Tampilkan aplikasi segera.
        Jangan membuat user terjebak
        di loading hanya karena query
        database bermasalah.
      */

      showApp();

      loadAll()
        .then(() => {
          renderAll();
        })
        .catch((error) => {
          console.warn(
            "KARSA database:",
            error
          );
        });

    } else {

      showLogin();
    }

  } catch (error) {

    console.error(
      "Session error:",
      error
    );

    showLogin();
  }
}

/* =========================================================
   AUTH STATE CHANGE
   ========================================================= */

function setupAuthListener() {

  if (!sb) return;

  sb.auth.onAuthStateChange(
    function (_event, session) {

      if (
        session &&
        session.user
      ) {

        currentUser =
          session.user;

        showApp();

        /*
          Jalankan load di luar callback
          secara aman.
        */

        setTimeout(
          function () {
            loadAll()
              .then(renderAll)
              .catch(
                console.warn
              );
          },
          0
        );

      } else {

        currentUser =
          null;

        showLogin();
      }
    }
  );
}

/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

window.KARSA = {

  get state() {
    return state;
  },

  get user() {
    return currentUser;
  },

  loadAll,

  insert,

  update,

  remove,

  login,

  logout,

  saveCashTransaction,

  postJournal,

  downloadCSV,

  exportWorkbook,

  rupiah,

  renderAll
};

window.KARSA_STATE =
  state;

/* =========================================================
   START APPLICATION
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  async function () {

    console.log(
      "KARSA Finance starting..."
    );

    /*
      Loader langsung diberi batas.
    */

    setTimeout(
      hideLoader,
      1500
    );

    /*
      Setup UI dahulu.
    */

    setupNavigation();
    setupExportButtons();
    setupLogin();
    setupLogout();

    /*
      Cek konfigurasi.
    */

    if (!isConfigured()) {

      console.error(
        "KARSA: konfigurasi Supabase tidak ditemukan."
      );

      hideLoader();

      showLogin();

      showMessage(
        "Supabase belum dikonfigurasi. Periksa config.js."
      );

      return;
    }

    /*
      Initialize Supabase.
    */

    const initialized =
      initializeSupabase();

    if (!initialized) {

      hideLoader();

      showLogin();

      showMessage(
        "Supabase gagal diinisialisasi. Periksa config.js dan koneksi."
      );

      return;
    }

    /*
      Loader selesai.
    */

    hideLoader();

    /*
      Cek login.
    */

    await checkSession();

    /*
      Pantau perubahan login/logout.
    */

    setupAuthListener();

    console.log(
      "KARSA Finance ready."
    );
  }
);
