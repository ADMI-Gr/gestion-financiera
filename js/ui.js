// ==================== UI COMPARTIDA ====================

// ---------- TOAST ----------
function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast ${type} active`;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('active'), 3000);
}

// ---------- MODAL ----------
function openModal(title, bodyHTML) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHTML;
    document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
});

// ---------- CONFIRMACIÓN ----------
let confirmCallback = null;

function showConfirm(msg, callback, okLabel = 'Eliminar') {
    document.getElementById('confirmMessage').textContent = msg;
    document.getElementById('confirmOk').textContent = okLabel;
    document.getElementById('confirmOverlay').classList.add('active');
    confirmCallback = callback;
}

document.getElementById('confirmOk').addEventListener('click', () => {
    document.getElementById('confirmOverlay').classList.remove('active');
    const cb = confirmCallback;
    confirmCallback = null;
    if (cb) cb();
});

document.getElementById('confirmCancel').addEventListener('click', () => {
    document.getElementById('confirmOverlay').classList.remove('active');
    confirmCallback = null;
});

// ---------- GRÁFICAS ----------
const charts = {};

function createChart(canvasId, config) {
    if (charts[canvasId]) { charts[canvasId].destroy(); delete charts[canvasId]; }
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') return null;
    charts[canvasId] = new Chart(ctx, config);
    return charts[canvasId];
}

const CHART_COLORS = ['#EF4444', '#F59E0B', '#8B5CF6', '#3B82F6', '#10B981', '#EC4899',
                      '#06B6D4', '#F97316', '#6366F1', '#14B8A6', '#A855F7'];

// ---------- MES ACTIVO ----------
// El Dashboard y Compromisos ya no están clavados al mes actual.
const viewMonth = { month: currentMonth(), year: currentYear() };

function setViewMonth(delta) {
    const { month, year } = shiftMonth(viewMonth.month, viewMonth.year, delta);
    viewMonth.month = month;
    viewMonth.year = year;
    refreshAll();
}

function resetViewMonth() {
    viewMonth.month = currentMonth();
    viewMonth.year = currentYear();
    refreshAll();
}

const isCurrentViewMonth = () =>
    viewMonth.month === currentMonth() && viewMonth.year === currentYear();

function monthNavHTML() {
    return `
        <div class="month-nav">
            <button class="btn-icon" onclick="setViewMonth(-1)" title="Mes anterior">
                <i class="fas fa-chevron-left"></i>
            </button>
            <span class="month-nav-label">${MONTHS[viewMonth.month]} ${viewMonth.year}</span>
            <button class="btn-icon" onclick="setViewMonth(1)" title="Mes siguiente">
                <i class="fas fa-chevron-right"></i>
            </button>
            ${!isCurrentViewMonth()
                ? `<button class="btn btn-secondary btn-sm" onclick="resetViewMonth()">Hoy</button>`
                : ''}
        </div>
    `;
}

// ---------- NAVEGACIÓN ----------
const PAGE_TITLES = {
    dashboard: 'Dashboard',
    accounts: 'Cuentas',
    cards: 'Tarjetas',
    transactions: 'Transacciones',
    commitments: 'Compromisos',
    budgets: 'Presupuestos',
    reports: 'Reportes'
};

const RENDERERS = {
    dashboard: () => renderDashboard(),
    accounts: () => renderAccounts(),
    cards: () => renderCards(),
    transactions: () => renderTransactions(),
    commitments: () => renderCommitments(),
    budgets: () => renderBudgets(),
    reports: () => renderReports()
};

let currentView = 'dashboard';

function navigate(view) {
    if (!RENDERERS[view]) return;
    currentView = view;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
    const link = document.querySelector(`.nav-link[data-view="${view}"]`);
    if (link) link.classList.add('active');
    document.getElementById('pageTitle').textContent = PAGE_TITLES[view];
    document.getElementById('sidebar').classList.remove('open');
    RENDERERS[view]();
}

// Cualquier acción que toque los datos llama aquí. Se acabó el botón "Pagar"
// del Dashboard que actualizaba otra vista.
function refreshAll() {
    RENDERERS[currentView]();
}

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
        e.preventDefault();
        navigate(link.dataset.view);
    });
});

document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

// ---------- FRAGMENTOS REUTILIZABLES ----------

// Selector de cuenta. `kinds`: 'cash' (excluye tarjetas de crédito) | 'all' | 'credit'
function accountSelectHTML(id, selectedId = '', { kinds = 'cash', required = false, placeholder = '— Seleccionar cuenta —' } = {}) {
    let list = DB.accounts;
    if (kinds === 'cash') list = list.filter(a => !isCredit(a));
    if (kinds === 'credit') list = list.filter(isCredit);
    if (list.length === 0) return '';
    return `
        <select class="form-control" id="${id}" ${required ? 'required' : ''}>
            ${required ? '' : `<option value="">${esc(placeholder)}</option>`}
            ${list.map(a => `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>
                ${esc(a.name)} (${fmt(accountBalance(a.id))})
            </option>`).join('')}
        </select>
    `;
}

function emptyStateHTML(icon, title, text, actionHTML = '') {
    return `
        <div class="card"><div class="card-body">
            <div class="empty-state">
                <i class="fas ${icon}"></i>
                <h4>${esc(title)}</h4>
                <p>${esc(text)}</p>
                ${actionHTML}
            </div>
        </div></div>
    `;
}

// Etiqueta visual de un movimiento según su tipo
function txBadge(type) {
    const map = {
        income:     { cls: 'badge-income',   label: 'Ingreso' },
        expense:    { cls: 'badge-expense',  label: 'Gasto' },
        transfer:   { cls: 'badge-transfer', label: 'Transferencia' },
        adjustment: { cls: 'badge-adjust',   label: 'Ajuste' }
    };
    const b = map[type] || map.expense;
    return `<span class="badge ${b.cls}">${b.label}</span>`;
}

// Monto con signo y color según el tipo
function txAmountHTML(t) {
    if (t.type === 'income')  return `<span class="amount-income">+${fmt(t.amount)}</span>`;
    if (t.type === 'expense') return `<span class="amount-expense">-${fmt(t.amount)}</span>`;
    if (t.type === 'transfer') return `<span class="amount-transfer">${fmt(t.amount)}</span>`;
    return `<span class="amount-adjust">${t.amount >= 0 ? '+' : ''}${fmt(t.amount)}</span>`;
}
