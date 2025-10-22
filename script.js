// Expense Tracker - JS logic

const STORAGE_KEY = 'expense_tracker_transactions_v1';

// DOM elements
const form = document.getElementById('transaction-form');
const descEl = document.getElementById('description');
const amountEl = document.getElementById('amount');
const categoryEl = document.getElementById('category');
const transListEl = document.getElementById('transactions-list');
const balanceEl = document.getElementById('balance');
const incomeEl = document.getElementById('income');
const expenseEl = document.getElementById('expense');
const submitBtn = document.getElementById('submit-btn');
const clearBtn = document.getElementById('clear-btn');
const transactionIdEl = document.getElementById('transaction-id');

let transactions = [];
let activeFilter = 'all';

// Utilities
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    console.error('Failed to load transactions:', e);
    return [];
  }
}

// Locale-aware currency formatter for Indian Rupee
const CURRENCY_FORMATTER = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

function formatCurrency(amount) {
  // Ensure numeric
  const num = Number(amount) || 0;
  return CURRENCY_FORMATTER.format(num);
}

// Rendering
function renderTransactions() {
  transListEl.innerHTML = '';
  const toRender = transactions.filter(tx => {
    if (activeFilter === 'all') return true;
    const m = (new Date(tx.createdAt)).toISOString().slice(0,7); // YYYY-MM
    return m === activeFilter;
  });
  toRender.forEach(tx => {
    const tr = document.createElement('tr');
    const descTd = document.createElement('td');
    descTd.textContent = tx.description;

  const catTd = document.createElement('td');
  // show category as a small badge for better scanning
  const badge = document.createElement('span');
  badge.className = 'badge-category';
  const catText = tx.category || 'General';
  badge.textContent = catText;
  badge.setAttribute('data-cat', catText);
  catTd.appendChild(badge);

    const amountTd = document.createElement('td');
    amountTd.className = 'text-end';
    amountTd.textContent = formatCurrency(tx.amount);
    amountTd.classList.add(tx.amount >= 0 ? 'amount-positive' : 'amount-negative');

    const actionsTd = document.createElement('td');
    actionsTd.className = 'text-end';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-sm btn-outline-primary me-2';
    editBtn.textContent = 'Edit';
    editBtn.onclick = () => startEdit(tx.id);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-outline-danger';
    delBtn.textContent = 'Delete';
    delBtn.onclick = () => deleteTransaction(tx.id);

    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(delBtn);

    tr.appendChild(descTd);
    tr.appendChild(catTd);
    tr.appendChild(amountTd);
    tr.appendChild(actionsTd);

    // add a short-lived class to trigger CSS entry animations when inserted
    tr.classList.add('entry-row');
    transListEl.appendChild(tr);
  });

  renderSummary();
}

// Populate month filter options from transactions (YYYY-MM)
function populateMonthFilter() {
  const monthSet = new Set();
  transactions.forEach(t => {
    if (!t.createdAt) return;
    const m = (new Date(t.createdAt)).toISOString().slice(0,7);
    monthSet.add(m);
  });
  const months = Array.from(monthSet).sort((a,b) => b.localeCompare(a));
  const sel = document.getElementById('month-filter');
  if (!sel) return;
  // clear existing except 'all'
  sel.querySelectorAll('option:not([value="all"])').forEach(o => o.remove());
  months.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    // format label e.g. 2025-10 -> Oct 2025
    const d = new Date(m + '-01');
    opt.textContent = d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
    sel.appendChild(opt);
  });
}

// Export helpers
function exportCSV(rows, filename = 'expense_report.csv') {
  const header = ['Description', 'Category', 'Amount', 'Date'];
  const csv = [header.join(',')].concat(rows.map(r => [escapeCsv(r.description), escapeCsv(r.category), r.amount, r.createdAt].join(','))).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(val) {
  if (val == null) return '';
  const s = String(val);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportPDF(rows, filename = 'expense_report.pdf') {
  // Use jsPDF autotable if available
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const head = [['Description', 'Category', 'Amount', 'Date']];
    const body = rows.map(r => [r.description, r.category, formatCurrency(r.amount), (new Date(r.createdAt)).toLocaleString()]);
    doc.autoTable({ head, body });
    doc.save(filename);
  } catch (e) {
    // fallback: simple print window
    const html = '<pre>' + rows.map(r => `${r.description}\t${r.category}\t${formatCurrency(r.amount)}\t${r.createdAt}`).join('\n') + '</pre>';
    const w = window.open('', '_blank');
    w.document.write(html); w.document.close();
    w.print();
  }
}

function renderSummary() {
  const amounts = transactions.map(t => Number(t.amount) || 0);
  const income = amounts.filter(a => a > 0).reduce((s, n) => s + n, 0);
  const expense = amounts.filter(a => a < 0).reduce((s, n) => s + n, 0);
  const balance = income + expense;

  balanceEl.textContent = formatCurrency(balance);
  incomeEl.textContent = formatCurrency(income);
  expenseEl.textContent = formatCurrency(expense);
  // color balance
  balanceEl.className = balance >= 0 ? 'text-success' : 'text-danger';
}

// CRUD
function addTransaction(tx) {
  transactions.push(tx);
  save();
  renderTransactions();
}

function updateTransaction(id, updated) {
  const idx = transactions.findIndex(t => t.id === id);
  if (idx === -1) return;
  transactions[idx] = { ...transactions[idx], ...updated };
  save();
  renderTransactions();
  populateMonthFilter();
}

function deleteTransaction(id) {
  if (!confirm('Delete this transaction?')) return;
  transactions = transactions.filter(t => t.id !== id);
  save();
  renderTransactions();
  populateMonthFilter();
}

function startEdit(id) {
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;
  descEl.value = tx.description;
  amountEl.value = tx.amount;
  categoryEl.value = tx.category || 'General';
  transactionIdEl.value = tx.id;
  submitBtn.textContent = 'Update Transaction';
}

function clearForm() {
  form.reset();
  transactionIdEl.value = '';
  submitBtn.textContent = 'Add Transaction';
}

function clearAll() {
  if (!confirm('Clear all transactions? This cannot be undone.')) return;
  transactions = [];
  save();
  renderTransactions();
  populateMonthFilter();
}

// Init
function init() {
  transactions = load();
  renderTransactions();
  populateMonthFilter();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const description = descEl.value.trim();
    const amount = parseFloat(amountEl.value);
    const category = categoryEl.value;
    if (!description || Number.isNaN(amount)) {
      alert('Please provide a valid description and amount.');
      return;
    }

    const existingId = transactionIdEl.value;
    if (existingId) {
      updateTransaction(existingId, { description, amount, category });
      clearForm();
      return;
    }

    const tx = {
      id: uid(),
      description,
      amount,
      category,
      createdAt: new Date().toISOString()
    };
    addTransaction(tx);
    clearForm();
    populateMonthFilter();
  });

  clearBtn.addEventListener('click', clearAll);

  // filter change
  const monthSel = document.getElementById('month-filter');
  if (monthSel) {
    monthSel.addEventListener('change', (e) => {
      activeFilter = e.target.value;
      renderTransactions();
    });
  }

  // export buttons
  const csvBtn = document.getElementById('export-csv');
  const pdfBtn = document.getElementById('export-pdf');
  if (csvBtn) csvBtn.addEventListener('click', () => {
    const rows = transactions.filter(t => activeFilter === 'all' ? true : (new Date(t.createdAt)).toISOString().slice(0,7) === activeFilter);
    exportCSV(rows);
  });
  if (pdfBtn) pdfBtn.addEventListener('click', () => {
    const rows = transactions.filter(t => activeFilter === 'all' ? true : (new Date(t.createdAt)).toISOString().slice(0,7) === activeFilter);
    exportPDF(rows);
  });
}

init();
