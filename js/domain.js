// ==================== DOMINIO ====================
// Constantes y funciones puras. Sin DOM, sin localStorage.

const SCHEMA_VERSION = 2;

const uuid = () => (crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
        const r = Math.random() * 16 | 0;
        return (ch === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      }));

const round2 = n => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

// Tolerancia para comparar dinero (evita que 0.00000001 cuente como saldo pendiente)
const EPS = 0.005;
const isZero = n => Math.abs(n) < EPS;

// Escapa texto del usuario antes de interpolarlo en innerHTML
function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, ch =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

// ==================== CATEGORÍAS ====================
const CATEGORIES = {
    income: [
        { id: 'salary', name: 'Salario', icon: 'fa-briefcase' },
        { id: 'freelance', name: 'Freelance', icon: 'fa-laptop-code' },
        { id: 'investments', name: 'Inversiones', icon: 'fa-chart-line' },
        { id: 'sales', name: 'Ventas', icon: 'fa-store' },
        { id: 'gifts', name: 'Regalos', icon: 'fa-gift' },
        { id: 'other_income', name: 'Otros Ingresos', icon: 'fa-plus-circle' }
    ],
    expense: [
        { id: 'food', name: 'Alimentación', icon: 'fa-utensils' },
        { id: 'transport', name: 'Transporte', icon: 'fa-car' },
        { id: 'housing', name: 'Vivienda', icon: 'fa-home' },
        { id: 'services', name: 'Servicios', icon: 'fa-bolt' },
        { id: 'health', name: 'Salud', icon: 'fa-heartbeat' },
        { id: 'education', name: 'Educación', icon: 'fa-graduation-cap' },
        { id: 'entertainment', name: 'Entretenimiento', icon: 'fa-gamepad' },
        { id: 'clothing', name: 'Ropa', icon: 'fa-tshirt' },
        { id: 'tech', name: 'Tecnología', icon: 'fa-microchip' },
        { id: 'personal', name: 'Cuidado Personal', icon: 'fa-spa' },
        { id: 'other_expense', name: 'Otros Gastos', icon: 'fa-receipt' }
    ]
};

// Categorías internas: movimientos que NO son ingreso ni gasto
const SPECIAL_CATEGORIES = {
    _transfer:   { id: '_transfer',   name: 'Transferencia',  icon: 'fa-exchange-alt' },
    _adjustment: { id: '_adjustment', name: 'Ajuste de saldo', icon: 'fa-sliders-h' }
};

function getCategory(id) {
    if (SPECIAL_CATEGORIES[id]) return SPECIAL_CATEGORIES[id];
    return [...CATEGORIES.income, ...CATEGORIES.expense].find(c => c.id === id)
        || { id, name: id || '—', icon: 'fa-circle' };
}
const getCategoryName = id => getCategory(id).name;
const getCategoryIcon = id => getCategory(id).icon;

// ==================== TIPOS DE CUENTA ====================
// 'credit' = tarjeta de crédito: su saldo es negativo y representa deuda.
const ACCOUNT_KINDS = [
    { id: 'wallet',        name: 'Cartera / Efectivo',   icon: 'fa-wallet',      color: '#10B981' },
    { id: 'debit',         name: 'Tarjeta de Débito',    icon: 'fa-credit-card', color: '#3B82F6' },
    { id: 'savings',       name: 'Cuenta de Ahorro',     icon: 'fa-piggy-bank',  color: '#F59E0B' },
    { id: 'bank',          name: 'Cuenta Bancaria',      icon: 'fa-university',  color: '#8B5CF6' },
    { id: 'digital',       name: 'Billetera Digital',    icon: 'fa-mobile-alt',  color: '#06B6D4' },
    { id: 'credit',        name: 'Tarjeta de Crédito',   icon: 'fa-credit-card', color: '#EC4899' },
    { id: 'other_account', name: 'Otro',                 icon: 'fa-box',         color: '#64748B' }
];
const getAccountKind = id =>
    ACCOUNT_KINDS.find(k => k.id === id) || ACCOUNT_KINDS[ACCOUNT_KINDS.length - 1];

const isCredit = acc => !!acc && acc.kind === 'credit';

// ==================== COMPROMISOS ====================
// Un compromiso es "algo que debo y que pago periódicamente".
// Tres modos que antes eran tres módulos separados (Pagos Mensuales, Deudas, Tarjetas).
const COMMITMENT_MODES = [
    {
        id: 'fixed', name: 'Pago fijo mensual', icon: 'fa-calendar-check',
        hint: 'Monto fijo que se repite todos los meses y no termina (renta, internet, suscripciones).'
    },
    {
        id: 'debt', name: 'Deuda / Cuotas', icon: 'fa-file-invoice-dollar',
        hint: 'Un monto total que se salda con pagos. Desaparece al llegar a cero.'
    },
    {
        id: 'card', name: 'Tarjeta de crédito', icon: 'fa-credit-card',
        hint: 'Monto variable según el saldo de la tarjeta. Desaparece cuando la saldas por completo.'
    }
];
const getCommitmentMode = id =>
    COMMITMENT_MODES.find(m => m.id === id) || COMMITMENT_MODES[0];

const RECURRING_CATEGORIES = [
    { id: 'water',           name: 'Agua',                icon: 'fa-tint',             color: '#06B6D4' },
    { id: 'electricity',     name: 'Electricidad',        icon: 'fa-bolt',             color: '#F59E0B' },
    { id: 'internet',        name: 'Internet',            icon: 'fa-wifi',             color: '#3B82F6' },
    { id: 'phone',           name: 'Teléfono',            icon: 'fa-mobile-alt',       color: '#8B5CF6' },
    { id: 'gas',             name: 'Gas',                 icon: 'fa-fire',             color: '#F97316' },
    { id: 'credit_card',     name: 'Tarjeta de Crédito',  icon: 'fa-credit-card',      color: '#EC4899' },
    { id: 'loan',            name: 'Préstamo / Deuda',    icon: 'fa-hand-holding-usd', color: '#EF4444' },
    { id: 'subscription',    name: 'Suscripción',         icon: 'fa-tv',               color: '#A855F7' },
    { id: 'insurance',       name: 'Seguro',              icon: 'fa-shield-alt',       color: '#14B8A6' },
    { id: 'rent',            name: 'Alquiler / Renta',    icon: 'fa-home',             color: '#6366F1' },
    { id: 'other_recurring', name: 'Otro',                icon: 'fa-redo',             color: '#64748B' }
];
const getRecurringCat = id =>
    RECURRING_CATEGORIES.find(c => c.id === id) || RECURRING_CATEGORIES[RECURRING_CATEGORIES.length - 1];

const FREQUENCY_LABELS = { monthly: 'Mensual', biweekly: 'Quincenal', weekly: 'Semanal' };
// Cuántas cuotas caen en un mes según la frecuencia
const FREQUENCY_PER_MONTH = { monthly: 1, biweekly: 2, weekly: 4 };

// ==================== FORMATO ====================
const fmt = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
    .format(round2(n));

const parseDate = d => new Date(d + 'T00:00:00');

const fmtDate = d => parseDate(d).toLocaleDateString('es-ES',
    { day: 'numeric', month: 'short', year: 'numeric' });

const fmtDateShort = d => parseDate(d).toLocaleDateString('es-ES',
    { day: 'numeric', month: 'short' });

const today = () => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

const currentMonth = () => new Date().getMonth();
const currentYear = () => new Date().getFullYear();

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const daysInMonth = (m, y) => new Date(y, m + 1, 0).getDate();
const clampDay = (day, m, y) => Math.min(Math.max(day || 1, 1), daysInMonth(m, y));

const dayOfDate = d => (d ? parseDate(d).getDate() : null);

// Devuelve {month, year} desplazado n meses
function shiftMonth(m, y, delta) {
    const total = y * 12 + m + delta;
    return { month: ((total % 12) + 12) % 12, year: Math.floor(total / 12) };
}

// ==================== CUENTA REGRESIVA ====================
// Un solo cálculo de "cuándo vence" para los tres modos de compromiso.
function buildCountdown(dueDay, m, y, isPaid) {
    let tm = m, ty = y;
    if (isPaid) ({ month: tm, year: ty } = shiftMonth(m, y, 1));

    const target = new Date(ty, tm, clampDay(dueDay, tm, ty));
    const now = new Date();
    const todayClean = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((target - todayClean) / 86400000);

    if (isPaid) {
        return diff <= 3
            ? { text: diff === 1 ? 'Próximo pago mañana' : `Próximo pago en ${diff} días`, icon: 'fa-clock', css: 'countdown-soon' }
            : { text: `Próximo pago en ${diff} días`, icon: 'fa-calendar-check', css: 'countdown-ok' };
    }
    if (diff < 0) {
        const a = Math.abs(diff);
        return { text: `Venció hace ${a} día${a !== 1 ? 's' : ''}`, icon: 'fa-exclamation-circle', css: 'countdown-overdue' };
    }
    if (diff === 0) return { text: 'Vence hoy', icon: 'fa-bell', css: 'countdown-today' };
    if (diff === 1) return { text: 'Vence mañana', icon: 'fa-bell', css: 'countdown-soon' };
    if (diff <= 5) return { text: `Vence en ${diff} días`, icon: 'fa-bell', css: 'countdown-soon' };
    return { text: `Vence en ${diff} días`, icon: 'fa-clock', css: 'countdown-normal' };
}

// ==================== PROYECCIÓN DE INTERESES ====================
// Cuánto tardas y cuánto pagas de más si solo abonas `monthlyPayment` al mes.
function projectPayoff(balance, annualRatePct, monthlyPayment) {
    if (balance <= EPS) return { months: 0, interest: 0, total: 0 };
    if (monthlyPayment <= EPS) return { never: true };

    const r = (Number(annualRatePct) || 0) / 100 / 12;
    if (r > 0 && monthlyPayment <= balance * r) return { never: true };

    let bal = balance, months = 0, interest = 0;
    while (bal > EPS && months < 600) {
        const i = bal * r;
        interest += i;
        bal = bal + i - monthlyPayment;
        months++;
    }
    return { months, interest: round2(interest), total: round2(balance + interest) };
}

function fmtMonths(n) {
    if (n < 12) return `${n} mes${n !== 1 ? 'es' : ''}`;
    const years = Math.floor(n / 12), rest = n % 12;
    return `${years} año${years !== 1 ? 's' : ''}${rest ? ` y ${rest} mes${rest !== 1 ? 'es' : ''}` : ''}`;
}
