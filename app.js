/* KARSA Finance — Supabase application layer */
const SB_URL=window.KARSA_SUPABASE_URL;
const SB_KEY=window.KARSA_SUPABASE_ANON_KEY;
let sb=null, user=null;
const state={transactions:[],sales:[],purchases:[],ar:[],ap:[],products:[],journals:[],accounts:[],cashAccounts:[]};

const rupiah=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const today=()=>new Date().toISOString().slice(0,10);

function configured(){return SB_URL&&!SB_KEY||false ? false : !!(SB_URL&&SB_KEY&&!SB_URL.includes('PASTE_')&&!SB_KEY.includes('PASTE_'))}
function msg(t,ok=false){const e=document.getElementById('authMessage');if(e){e.textContent=t;e.className='auth-message '+(ok?'ok':'error')}}
function showLogin(){const a=document.getElementById('authScreen'),s=document.getElementById('appShell');if(a)a.style.display='';if(s)s.style.display='none'}
function showApp(){const a=document.getElementById('authScreen'),s=document.getElementById('appShell');if(a)a.style.display='none';if(s)s.style.display='';if(window.renderAll)window.renderAll()}

async function load(table,key,order='created_at'){
  const {data,error}=await sb.from(table).select('*').order(order,{ascending:false});
  if(error)throw error; state[key]=data||[];
}
async function loadAll(){
  await Promise.all([
    load('transactions','transactions'),load('sales','sales'),load('purchases','purchases'),
    load('accounts_receivable','ar'),load('accounts_payable','ap'),
    load('products','products'),load('journal_headers','journals'),
    load('accounts','accounts'),load('cash_accounts','cashAccounts')
  ]);
  window.KARSA_STATE=state;
}

async function insert(table,row){const {data,error}=await sb.from(table).insert({...row,created_by:user.id}).select().single();if(error)throw error;return data}

async function login(e,p){const {error}=await sb.auth.signInWithPassword({email:e,password:p});if(error)throw error}
async function logout(){await sb.auth.signOut()}

function nextNo(prefix,rows,key){let max=0;for(const r of rows){const m=String(r[key]||'').match(/(\d+)$/);if(m)max=Math.max(max,+m[1])}return `${prefix}-${String(max+1).padStart(5,'0')}`}

async function saveCashTransaction({date,description,category,cashAccountId,inAmount=0,outAmount=0,sourceType='other',referenceNo='',pic=''}) {
  const row={transaction_no:nextNo('TRX',state.transactions,'transaction_no'),transaction_date:date||today(),source_type:sourceType,description,category,cash_account_id:cashAccountId,cash_in:+inAmount||0,cash_out:+outAmount||0,reference_no:referenceNo,pic,status:'posted'};
  const saved=await insert('transactions',row);
  await loadAll(); return saved;
}

/* Double-entry journal helper. Every posted source should create exactly balanced lines. */
async function postJournal({type,date,description,sourceType,sourceId,lines}){
  const totalD=lines.reduce((s,x)=>s+(+x.debit||0),0), totalC=lines.reduce((s,x)=>s+(+x.credit||0),0);
  if(Math.abs(totalD-totalC)>0.005) throw new Error('Jurnal tidak balance: Debit ≠ Kredit');
  const h=await insert('journal_headers',{journal_no:nextNo('JRN',state.journals,'journal_no'),journal_date:date||today(),journal_type:type,source_type:sourceType,source_id:sourceId,description,status:'posted'});
  const payload=lines.map((x,i)=>({journal_id:h.id,line_no:i+1,account_id:x.account_id,description:x.description||description,debit:+x.debit||0,credit:+x.credit||0}));
  const {error}=await sb.from('journal_lines').insert(payload);
  if(error)throw error;
  await loadAll(); return h;
}

/* Export helpers: CSV is formula-compatible; XLSX uses SheetJS when loaded by the page. */
function csvCell(v){const s=String(v??'');return `"${s.replace(/"/g,'""')}"`}
function downloadCSV(filename,rows){
  if(!rows.length)return;
  const headers=Object.keys(rows[0]);const text=[headers.map(csvCell).join(','),...rows.map(r=>headers.map(h=>csvCell(r[h])).join(','))].join('\r\n');
  const blob=new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=filename;a.click();URL.revokeObjectURL(a.href);
}
function exportJournalCSV(){
  const rows=state.journals.flatMap(h=>[]);
  downloadCSV(`karsa-jurnal-${today()}.csv`,rows);
}
function exportAllCSV(){
  downloadCSV(`karsa-transaksi-${today()}.csv`,state.transactions);
}
function exportWorkbook(){
  if(!window.XLSX){alert('Library Excel belum dimuat. Tambahkan SheetJS pada index.html.');return}
  const wb=XLSX.utils.book_new();
  const add=(name,rows)=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),name);
  add('Transaksi',state.transactions); add('Penjualan',state.sales); add('Pembelian',state.purchases);
  add('Piutang',state.ar); add('Hutang',state.ap); add('Produk',state.products); add('Jurnal',state.journals); add('Akun',state.accounts);
  XLSX.writeFile(wb,`KARSA-Finance-${today()}.xlsx`);
}

document.addEventListener('DOMContentLoaded',async()=>{
  const form=document.getElementById('loginForm');
  if(form)form.addEventListener('submit',async e=>{
    e.preventDefault();
    if(!configured())return msg('Isi config.js dengan Supabase URL dan anon key.');
    try{
      if(!sb)sb=window.supabase.createClient(SB_URL,SB_KEY);
      msg('Memeriksa akun…',true);
      await login(document.getElementById('loginEmail').value.trim(),document.getElementById('loginPassword').value);
    }catch(err){msg(err.message||'Login gagal')}
  });
  const out=document.getElementById('logoutBtn');if(out)out.addEventListener('click',logout);
  if(!configured()){showLogin();msg('Supabase belum dikonfigurasi.')}
  else{
    sb=window.supabase.createClient(SB_URL,SB_KEY);
    const {data:{session}}=await sb.auth.getSession();
    if(session){user=session.user;try{await loadAll();showApp()}catch(e){console.error(e)}}
    else showLogin();
    sb.auth.onAuthStateChange(async(_event,session)=>{
      user=session?.user||null;
      if(user){try{await loadAll();showApp()}catch(e){console.error(e)}}else showLogin();
    });
  }
});

/* Expose core functions for UI buttons/forms. */
window.KARSA={state,loadAll,insert,saveCashTransaction,postJournal,downloadCSV,exportAllCSV,exportWorkbook,rupiah};
