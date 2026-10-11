'use strict';

const STORAGE_KEY = 'xpflow_data_v1';

const ACCOUNT_TYPES = {
    savings: 'Savings',
    current: 'Current',
    credit: 'Credit card',
    cash: 'Cash',
    wallet: 'Wallet',
    fd: 'Fixed deposit'
};

const CATEGORIES = {
    expense: [
        { id: 'food', label: 'Food & Dining', emoji: '🍽️', color: '#8A3A2A' },
        { id: 'groceries', label: 'Groceries', emoji: '🛒', color: '#92661F' },
        { id: 'transport', label: 'Transport', emoji: '🚕', color: '#6B4226' },
        { id: 'shopping', label: 'Shopping', emoji: '🛍️', color: '#4A311D' },
        { id: 'bills', label: 'Bills & Utilities', emoji: '💡', color: '#A6653F' },
        { id: 'entertainment', label: 'Entertainment', emoji: '🎬', color: '#B98354' },
        { id: 'health', label: 'Health', emoji: '🩺', color: '#7A5230' },
        { id: 'education', label: 'Education', emoji: '📚', color: '#5A4023' },
        { id: 'travel', label: 'Travel', emoji: '✈️', color: '#9C6B3E' },
        { id: 'rent', label: 'Rent & Housing', emoji: '🏠', color: '#3F2A17' },
        { id: 'other_exp', label: 'Other', emoji: '🔖', color: '#8B7355' }
    ],
    income: [
        { id: 'salary', label: 'Salary', emoji: '💼', color: '#92661F' },
        { id: 'freelance', label: 'Freelance', emoji: '🧾', color: '#B08A3E' },
        { id: 'investment', label: 'Investment', emoji: '📈', color: '#7C8A4E' },
        { id: 'gift', label: 'Gift', emoji: '🎁', color: '#A6742C' },
        { id: 'other_inc', label: 'Other income', emoji: '🔖', color: '#C2A25E' }
    ]
};

const AMOUNT_RANGES = {
    food: [150, 1200], groceries: [300, 2500], transport: [50, 600],
    shopping: [400, 4000], bills: [500, 3500], entertainment: [200, 1500],
    health: [200, 3000], education: [500, 5000], travel: [1000, 8000],
    rent: [6000, 18000], other_exp: [100, 2000],
    salary: [25000, 60000], freelance: [2000, 15000], investment: [500, 8000],
    gift: [500, 5000], other_inc: [200, 3000]
};

const NOTES = {
    food: ['Dinner with friends', 'Coffee run', 'Lunch order'],
    groceries: ['Weekly groceries', 'Vegetable market', 'Supermarket run'],
    transport: ['Cab ride', 'Fuel top-up', 'Metro card recharge'],
    shopping: ['New shoes', 'Online order', 'Clothing store'],
    bills: ['Electricity bill', 'Mobile recharge', 'Internet bill'],
    entertainment: ['Movie tickets', 'Streaming subscription', 'Concert tickets'],
    health: ['Pharmacy', 'Doctor visit', 'Gym membership'],
    education: ['Course fee', 'Books', 'Workshop'],
    travel: ['Flight booking', 'Hotel stay', 'Weekend trip'],
    rent: ['Monthly rent'],
    other_exp: ['Miscellaneous', 'Small purchase'],
    salary: ['Monthly salary'],
    freelance: ['Freelance project', 'Client payment'],
    investment: ['Dividend payout', 'Interest credited'],
    gift: ['Birthday gift', 'Festival gift'],
    other_inc: ['Refund received', 'Cashback']
};

const CURRENCY_LOCALE = { '₹': 'en-IN', '$': 'en-US', '€': 'de-DE', '£': 'en-GB' };

/* ---------------- utilities ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];
const todayISO = () => new Date().toISOString().slice(0, 10);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function categoryById(id) {
    return CATEGORIES.expense.find(c => c.id === id) || CATEGORIES.income.find(c => c.id === id) || null;
}

function formatMoney(amount, opts = {}) {
    const prefDecimals = state.preferences ? state.preferences.decimals !== false : true;
    const decimals = opts.decimals !== undefined ? opts.decimals !== false : prefDecimals;
    const locale = CURRENCY_LOCALE[state.currency] || 'en-IN';
    const n = Number(amount) || 0;
    const formatted = n.toLocaleString(locale, {
        minimumFractionDigits: decimals ? 2 : 0,
        maximumFractionDigits: decimals ? 2 : 0
    });
    return `${state.currency}${formatted}`;
}

function formatDateShort(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function formatDateLong(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function monthKey(iso) { return iso.slice(0, 7); }

function maskAccount(acc) {
    if (acc.type === 'cash') return 'No card';
    return acc.last4 ? `•••• ${acc.last4}` : '•••• ••••';
}

/* ---------------- state ---------------- */
let state = loadState();
let currentModal = null;
let confirmCallback = null;
let reportMonthDate = new Date(); // day-of-month irrelevant, only y/m used

/* =========================================================
   APP LOGIN (Paytm / PhonePe / GPay / Bank / Gmail / UPI / PayPal)
   This is a pure sign-in feature for XpFlow itself — it is fully
   separate from "Accounts" (the financial accounts you track
   money against, added from the Accounts page). Logging in here
   never creates or edits a financial account, and it never
   touches state.accounts / state.transactions.
   ========================================================= */

let currentUser = JSON.parse(
    localStorage.getItem('currentUser') || 'null'
);

function saveCurrentUser(user) {
    currentUser = user;

    if (user) {
        localStorage.setItem(
            'currentUser',
            JSON.stringify(user)
        );
    } else {
        localStorage.removeItem('currentUser');
    }
}

function updateLoggedInAccountUI() {
    const title = document.getElementById('sidebarAccountTitle');
    const subtitle = document.getElementById('sidebarAccountSubtitle');
    const icon = document.getElementById('sidebarAccountIcon');
    const mTitle = document.getElementById('mobileAccountTitle');
    const mSubtitle = document.getElementById('mobileAccountSubtitle');
    const mIcon = document.getElementById('mobileAccountIcon');

    if (!currentUser) {
        if (title) title.textContent = 'Login';
        if (subtitle) subtitle.textContent = 'Paytm · PhonePe · GPay · more';
        if (icon) icon.innerHTML = '<span>+</span>';
        if (mTitle) mTitle.textContent = 'Login';
        if (mSubtitle) mSubtitle.textContent = 'Paytm · PhonePe · GPay · more';
        if (mIcon) mIcon.innerHTML = '<span>+</span>';
        return;
    }
    const name = currentUser.name || currentUser.identifier;
    const sub = `${currentUser.provider} · Logged in`;
    const iconHtml = `<span>${getProviderIcon(currentUser.provider)}</span>`;

    if (title) title.textContent = name;
    if (subtitle) subtitle.textContent = sub;
    if (icon) icon.innerHTML = iconHtml;
    if (mTitle) mTitle.textContent = name;
    if (mSubtitle) mSubtitle.textContent = sub;
    if (mIcon) mIcon.innerHTML = iconHtml;
}

function defaultProfile() {
    return { avatar: '', name: '', nickname: '', mobile: '', email: '' };
}

function defaultPreferences() {
    return { accent: '#92661F', decimals: true };
}

function defaultNotifications() {
    return {
        tx: true,
        budget: true,
        weekly: true,
        lowBalance: true,
        tips: false,
        security: true
    };
}

function defaultSecurity() {
    return { sessions: {}, passwords: {} };
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.accounts) && Array.isArray(parsed.transactions)) {
                return {
                    currency: parsed.currency || '₹',
                    accounts: parsed.accounts,
                    transactions: parsed.transactions,
                    profile: Object.assign(defaultProfile(), parsed.profile || {}),
                    preferences: Object.assign(defaultPreferences(), parsed.preferences || {}),
                    notifications: Object.assign(defaultNotifications(), parsed.notifications || {}),
                    security: Object.assign(defaultSecurity(), parsed.security || {})
                };
            }
        }
    } catch (e) { /* fall through to empty state */ }
    return {
        currency: '₹',
        accounts: [],
        transactions: [],
        profile: defaultProfile(),
        preferences: defaultPreferences(),
        notifications: defaultNotifications(),
        security: defaultSecurity()
    };
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function makeTx(accountId, type, category, date, amount, note) {
    return { id: uid(), accountId, type, category, date, amount: Math.round(amount * 100) / 100, note, createdAt: Date.now() + Math.random() };
}

/* ---------------- DOM refs ---------------- */
const heroBalanceEl = $('#heroBalance');
const heroCaptionEl = $('#heroCaption');
const heroStampEl = $('#heroStamp');
const greetingEl = $('#greeting');
const todayLabelEl = $('#todayLabel');

/* ================================================================
   INIT
   ================================================================ */
document.addEventListener('DOMContentLoaded', init);

/* =========================================================
   LOGIN MODAL — provider grid + credentials form
   ========================================================= */

let currentSelectedProvider = '';

// Everything a provider needs to render its login field correctly.
const LOGIN_PROVIDERS = {
    'Google Pay': { icon: 'G', label: 'UPI ID or Mobile Number', placeholder: 'name@okaxis or 98765 43210' },
    'Paytm': { icon: 'P', label: 'Mobile Number or Paytm ID', placeholder: '98765 43210' },
    'PhonePe': { icon: 'पे', label: 'UPI ID or Mobile Number', placeholder: 'name@ybl or 98765 43210' },
    'Bank Account': { icon: '₹', label: 'Account Number or Customer ID', placeholder: 'e.g. 000123456789' },
    'Gmail': { icon: '@', label: 'Gmail address', placeholder: 'you@gmail.com' },
    'UPI': { icon: 'UPI', label: 'UPI ID', placeholder: 'name@upi' },
    'PayPal': { icon: 'PP', label: 'PayPal email', placeholder: 'you@example.com' }
};

const accountModal =
    document.getElementById('account-login-modal');

const sidebarLogin =
    document.getElementById('sidebarAccountLogin');

const closeAccountModal =
    document.getElementById('close-account-modal');

const providerBtns =
    document.querySelectorAll('.provider-btn');

const connectForm =
    document.getElementById('connect-provider-form');

const providerTitle =
    document.getElementById('selected-provider-title');


/* OPEN */

function openAccountLogin() {
    if (!accountModal) return;

    accountModal.classList.add('active');

    connectForm?.classList.add('hidden');

    providerBtns.forEach(btn =>
        btn.classList.remove('active')
    );
}


/* CLOSE */

function closeAccountLogin() {
    if (!accountModal) return;

    accountModal.classList.remove('active');

    connectForm?.classList.add('hidden');

    providerBtns.forEach(btn =>
        btn.classList.remove('active')
    );

    currentSelectedProvider = '';
}


/* SIDEBAR — open the login modal, or offer to log out if already signed in */

sidebarLogin?.addEventListener('click', () => {
    if (currentUser) {
        openConfirm(`Log out of ${currentUser.provider}?`, () => {
            saveCurrentUser(null);
            updateLoggedInAccountUI();
            showToast('Logged out.');
        });
        return;
    }
    openAccountLogin();
});


/* CLOSE BUTTON */

closeAccountModal?.addEventListener(
    'click',
    closeAccountLogin
);


/* CLICK OUTSIDE */

accountModal?.addEventListener('click', e => {
    if (e.target === accountModal) {
        closeAccountLogin();
    }
});


/* ESC */

document.addEventListener('keydown', e => {
    if (
        e.key === 'Escape' &&
        accountModal?.classList.contains('active')
    ) {
        closeAccountLogin();
    }
});


/* PROVIDERS — pick a provider, then reveal the right credential field for it */

providerBtns.forEach(btn => {

    btn.addEventListener('click', () => {

        providerBtns.forEach(b =>
            b.classList.remove('active')
        );

        btn.classList.add('active');

        currentSelectedProvider =
            btn.dataset.provider;

        const meta = LOGIN_PROVIDERS[currentSelectedProvider] || {};

        if (providerTitle) {
            providerTitle.textContent =
                `Login with ${currentSelectedProvider}`;
        }

        const idLabel = document.getElementById('provider-userid-label');
        const idInput = document.getElementById('provider-userid');
        if (idLabel) idLabel.textContent = meta.label || 'Login ID';
        if (idInput) idInput.placeholder = meta.placeholder || '';

        connectForm.classList.remove('hidden');

    });

});

/* =========================================================
   LOGIN SUBMIT — purely authenticates into XpFlow; never
   creates or edits a financial account.
   ========================================================= */

connectForm?.addEventListener('submit', async e => {
    e.preventDefault();

    if (!currentSelectedProvider) return;

    // Real Google OAuth login — bypasses the fake identifier/password fields
    if (currentSelectedProvider === 'Gmail') {
        try {
            const googleUser = await window.electronAPI.googleLogin();

            const user = {
                provider: 'Gmail',
                identifier: googleUser.email,
                name: googleUser.name || googleUser.email.split('@')[0],
                loggedInAt: Date.now()
            };

            saveCurrentUser(user);
            updateLoggedInAccountUI();
            connectForm.reset();
            closeAccountLogin();
            showToast(`Logged in as ${googleUser.email}.`);
        } catch (err) {
            console.error('Google login failed:', err);
            showToast('Google login failed. Please try again.');
        }
        return;
    }

    const identifierInput = document.getElementById('provider-userid');
    const passwordInput = document.getElementById('provider-password');

    const identifier = (identifierInput?.value || '').trim();
    const password = passwordInput?.value || '';

    const meta = LOGIN_PROVIDERS[currentSelectedProvider] || {};

    if (!identifier) {
        showToast(`Please enter your ${meta.label || 'login ID'}.`);
        return;
    }
    if (password.length < 4) {
        showToast('Please enter a password of at least 4 characters.');
        return;
    }

    const user = {
        provider: currentSelectedProvider,
        identifier,
        name: identifier.includes('@') ? identifier.split('@')[0] : identifier,
        loggedInAt: Date.now()
    };

    saveCurrentUser(user);
    updateLoggedInAccountUI();
    connectForm.reset();
    closeAccountLogin();
    showToast(`Logged in with ${currentSelectedProvider}.`);
});

/* PROVIDER ICON */
function getProviderIcon(provider) {
    switch (provider) {
        case 'Google Pay':
            return 'G';
        case 'Paytm':
            return 'P';
        case 'PhonePe':
            return 'पे';
        case 'Bank Account':
            return '₹';
        case 'Gmail':
            return '@';
        case 'UPI':
            return 'UPI';
        case 'PayPal':
            return 'PP';
        default:
            return '+';
    }
}

function init() {
    $('#currencySelect').value = state.currency;
    $('#heroCurrency').textContent = state.currency;

    applyAccentColor(state.preferences.accent);
    setGreeting();
    bindNav();
    bindModals();
    bindForms();
    bindTableEvents();
    bindSettings();
    bindSettingsTabs();
    bindProfileSettings();
    bindGeneralSettings();
    bindDataSettings();
    bindPrivacySettings();
    bindNotificationSettings();
    bindReportNav();
    bindStickyHeader();
    bindMobileMenu();
    renderAll();
    renderProfileSettings();
    renderDataSummary();
    renderLoginAccounts();
    renderNotificationSettings();
    /* RESTORE LOGGED-IN ACCOUNT */
    updateLoggedInAccountUI();
}

function bindStickyHeader() {
    const onScroll = () => {
        const scrolled = window.scrollY > 8;
        $all('.view-head').forEach(h => h.classList.toggle('is-scrolled', scrolled));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
}

function setGreeting() {
    const h = new Date().getHours();
    const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const nickname = state.profile && state.profile.nickname ? state.profile.nickname.trim() : '';
    greetingEl.textContent = nickname ? `${g}, ${nickname}` : g;
    todayLabelEl.textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/* ================================================================
   NAVIGATION
   ================================================================ */
function bindNav() {
    $all('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
    $all('[data-goto-view]').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.gotoView));
    });
}

function switchView(view) {
    $all('.view').forEach(v => v.classList.toggle('is-active', v.id === `view-${view}`));
    $all('.nav-item').forEach(n => n.classList.toggle('is-active', n.dataset.view === view));
    $all('.mobile-nav-item').forEach(n => n.classList.toggle('is-active', n.dataset.view === view));
    if (view === 'reports') renderReports();
    if (view === 'settings') {
        renderDataSummary();
        renderLoginAccounts();
    }
}

/* ================================================================
   MODALS
   ================================================================ */
function bindModals() {
    $all('[data-open-modal]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.openModal;
            if (id === 'modal-transaction') {
                openTransactionModal(null, btn.dataset.txType || 'expense');
                return;
            }
            if (id === 'modal-account') openAccountModal(null);
        });
    });

    $all('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModal));

    $all('.modal-backdrop').forEach(bd => {
        bd.addEventListener('click', (e) => { if (e.target === bd) closeModal(); });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && currentModal) closeModal();
    });
}

function openModal(id) {
    const el = $('#' + id);
    el.hidden = false;
    currentModal = id;
    const firstField = el.querySelector('input, select');
    if (firstField) setTimeout(() => firstField.focus(), 30);
}

function closeModal() {
    if (!currentModal) return;
    $('#' + currentModal).hidden = true;
    currentModal = null;
}

function openConfirm(message, onConfirm) {
    $('#confirmMessage').textContent = message;
    confirmCallback = onConfirm;
    openModal('modal-confirm');
}

/* ================================================================
   TOASTS
   ================================================================ */
function showToast(message) {
    const stack = $('#toastStack');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
        el.style.transition = 'opacity .25s ease, transform .25s ease';
        el.style.opacity = '0';
        el.style.transform = 'translateY(6px)';
        setTimeout(() => el.remove(), 260);
    }, 3200);
}

/* ================================================================
   ACCOUNT MODAL + FORM  (financial accounts — separate from Login)
   ================================================================ */
function openAccountModal(account) {
    const form = $('#accountForm');
    form.reset();
    $('#accountId').value = account ? account.id : '';
    $('#accountModalTitle').textContent = account ? 'Edit account' : 'Connect an account';
    $('#accountSubmitBtn').textContent = account ? 'Save changes' : 'Connect account';
    $('label[for="accountBalance"]').textContent = account ? 'Current balance' : 'Opening balance';

    if (account) {
        $('#accountNickname').value = account.nickname;
        $('#accountInstitution').value = account.institution;
        $('#accountType').value = account.type;
        $('#accountLast4').value = account.last4 || '';
        $('#accountBalance').value = account.balance;
    }
    openModal('modal-account');
}

function bindForms() {
    $('#accountForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = $('#accountId').value;
        const payload = {
            nickname: $('#accountNickname').value.trim() || 'Untitled account',
            institution: $('#accountInstitution').value.trim() || 'Unnamed institution',
            type: $('#accountType').value,
            last4: $('#accountLast4').value.replace(/\D/g, '').slice(0, 4),
            balance: parseFloat($('#accountBalance').value) || 0
        };

        if (id) {
            const acc = state.accounts.find(a => a.id === id);
            Object.assign(acc, payload);
            saveState();
            renderAll();
            closeModal();
            showToast(`${acc.nickname} updated.`);
            return;
        }

        const acc = { id: uid(), createdAt: Date.now(), ...payload };

        state.accounts.push(acc);
        saveState();
        renderAll();
        closeModal();

        showToast(`${acc.nickname} connected.`);
    });

    $('#transactionForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = $('#txId').value;
        const type = $('.type-opt.is-active').dataset.type;
        const payload = {
            type,
            accountId: $('#txAccount').value,
            category: $('#txCategory').value,
            date: $('#txDate').value || todayISO(),
            amount: Math.abs(parseFloat($('#txAmount').value)) || 0,
            note: $('#txNote').value.trim()
        };

        if (id) {
            const tx = state.transactions.find(t => t.id === id);
            revertBalance(tx);
            Object.assign(tx, payload);
            applyBalance(tx);
            showToast('Entry updated.');
        } else {
            const tx = { id: uid(), createdAt: Date.now(), ...payload };
            state.transactions.push(tx);
            applyBalance(tx);
            showToast('Entry added.');
        }
        saveState();
        renderAll();
        closeModal();
    });

    $all('.type-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            $all('.type-opt').forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            populateCategorySelect($('#txCategory'), btn.dataset.type);
        });
    });

    $('#confirmActionBtn').addEventListener('click', () => {
        if (confirmCallback) confirmCallback();
        closeModal();
    });
}

function applyBalance(tx) {
    const acc = state.accounts.find(a => a.id === tx.accountId);
    if (!acc) return;
    acc.balance += tx.type === 'income' ? tx.amount : -tx.amount;
    acc.balance = Math.round(acc.balance * 100) / 100;
}
function revertBalance(tx) {
    const acc = state.accounts.find(a => a.id === tx.accountId);
    if (!acc) return;
    acc.balance -= tx.type === 'income' ? tx.amount : -tx.amount;
    acc.balance = Math.round(acc.balance * 100) / 100;
}

function openTransactionModal(tx, defaultType) {
    const form = $('#transactionForm');
    form.reset();
    populateAccountSelect($('#txAccount'));

    const type = tx ? tx.type : defaultType;
    $all('.type-opt').forEach(b => b.classList.toggle('is-active', b.dataset.type === type));
    populateCategorySelect($('#txCategory'), type);

    $('#txModalTitle').textContent = tx ? 'Edit entry' : 'Add entry';
    $('#txId').value = tx ? tx.id : '';
    $('#txAmount').value = tx ? tx.amount : '';
    $('#txDate').value = tx ? tx.date : todayISO();
    $('#txAccount').value = tx ? tx.accountId : (state.accounts[0] && state.accounts[0].id) || '';
    $('#txCategory').value = tx
        ? tx.category
        : CATEGORIES[type][0].id;
    $('#txNote').value = tx ? tx.note : '';

    openModal('modal-transaction');
}

function populateAccountSelect(select) {
    /* NO ACCOUNT */
    if (!state.accounts.length) {
        select.innerHTML = `
            <option value="">
                No account connected
            </option>
        `;
        return;
    }
    /* SHOW CONNECTED ACCOUNTS */
    select.innerHTML =
        state.accounts
            .map(a => `
                <option value="${a.id}">
                    ${escapeHtml(a.nickname)}
                </option>
            `)
            .join('');
}
function populateCategorySelect(select, type) {
    select.innerHTML = CATEGORIES[type].map(c => `<option value="${c.id}">${c.emoji} ${c.label}</option>`).join('');
}

/* ================================================================
   TABLE / CARD ACTION DELEGATION
   ================================================================ */
function bindTableEvents() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;

        if (action === 'connect-account') openAccountModal(null);
        if (action === 'edit-account') openAccountModal(state.accounts.find(a => a.id === id));
        if (action === 'remove-account') {
            const acc = state.accounts.find(a => a.id === id);
            const linked = state.transactions.filter(t => t.accountId === id).length;
            openConfirm(`Remove "${acc.nickname}"? This also deletes ${linked} linked ${linked === 1 ? 'entry' : 'entries'}.`, () => {
                state.transactions = state.transactions.filter(t => t.accountId !== id);
                state.accounts = state.accounts.filter(a => a.id !== id);
                saveState(); renderAll();
                showToast(`${acc.nickname} removed.`);
            });
        }
        if (action === 'sync-account') syncAccount(id);
        if (action === 'edit-tx') openTransactionModal(state.transactions.find(t => t.id === id));
        if (action === 'delete-tx') {
            const tx = state.transactions.find(t => t.id === id);
            openConfirm('Delete this entry? This can\'t be undone.', () => {
                revertBalance(tx);
                state.transactions = state.transactions.filter(t => t.id !== id);
                saveState(); renderAll();
                showToast('Entry deleted.');
            });
        }
    });

    ['filterSearch', 'filterAccount', 'filterCategory', 'filterType'].forEach(id => {
        $('#' + id).addEventListener('input', renderTransactionsTable);
    });

    document.addEventListener('click', (e) => {
        const resetBtn = e.target.closest('#resetFilters');
        if (!resetBtn) return;

        const search = $('#filterSearch');
        const account = $('#filterAccount');
        const category = $('#filterCategory');
        const type = $('#filterType');

        if (search) search.value = '';
        if (account) account.value = '';
        if (category) category.value = '';
        if (type) type.value = '';

        renderTransactionsTable();

        if (!state.transactions.length) {
            showToast('There\'s no transaction history to reset.');
            return;
        }

        openConfirm('Reset all transactions? Every ledger entry will be permanently removed.', () => {
            state.transactions.forEach(tx => revertBalance(tx));
            state.transactions = [];
            saveState();
            renderAll();
            showToast('All transactions have been reset.');
        });
    });
}

function syncAccount(accountId) {
    const acc = state.accounts.find(a => a.id === accountId);
    if (!acc) return;
    const count = randomInt(1, 4);
    for (let i = 0; i < count; i++) {
        const isIncome = Math.random() < 0.12;
        const type = isIncome ? 'income' : 'expense';
        const catId = isIncome ? randomFrom(CATEGORIES.income).id : randomFrom(CATEGORIES.expense).id;
        const daysAgo = randomInt(0, 3);
        const d = new Date(); d.setDate(d.getDate() - daysAgo);
        const tx = makeTx(accountId, type, catId, d.toISOString().slice(0, 10), randomInt(...AMOUNT_RANGES[catId]), randomFrom(NOTES[catId]));
        state.transactions.push(tx);
        applyBalance(tx);
    }
    saveState();
    renderAll();
    showToast(`Synced — ${count} new ${count === 1 ? 'entry' : 'entries'} imported from ${acc.nickname}.`);
}

/* ================================================================
   RENDER: master
   ================================================================ */
function renderAll() {
    renderHero();
    renderStats();
    renderRecent();
    renderCategoryChart();
    renderAccountsStrip();
    renderAccountsGrid();
    renderFilterOptions();
    renderTransactionsTable();
    if ($('#view-reports').classList.contains('is-active')) renderReports();
}

function totalBalance() {
    const connectedAccountIds = new Set(state.accounts.map(a => a.id));
    let total = state.accounts.reduce(
        (sum, acc) => sum + (Number(acc.balance) || 0),
        0
    );
    const orphanTransactionsTotal = state.transactions
        .filter(tx => !connectedAccountIds.has(tx.accountId))
        .reduce((sum, tx) => {
            const amount = Number(tx.amount) || 0;
            return sum + (tx.type === 'income' ? amount : -amount);
        }, 0);
    return Math.round((total + orphanTransactionsTotal) * 100) / 100;
}

function animateCount(el, to) {
    const from = parseFloat(el.dataset.raw || '0');
    const start = performance.now();
    const dur = 700;
    function step(now) {
        const p = clamp((now - start) / dur, 0, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = from + (to - from) * eased;
        el.textContent = Math.round(val).toLocaleString(CURRENCY_LOCALE[state.currency] || 'en-IN');
        if (p < 1) requestAnimationFrame(step); else el.dataset.raw = String(to);
    }
    requestAnimationFrame(step);
}

function renderHero() {
    const total = totalBalance();
    animateCount(heroBalanceEl, total);
    heroCaptionEl.textContent = state.accounts.length === 0
        ? 'Connect an account to get started.'
        : `Across ${state.accounts.length} account${state.accounts.length === 1 ? '' : 's'}`;
    $('#heroCurrency').textContent = state.currency;
    if (state.accounts.length > 0) {
        heroStampEl.classList.add('is-visible');
        $('#stampDate').textContent = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();
    } else {
        heroStampEl.classList.remove('is-visible');
    }
}

function monthTx(dateObj) {
    const key = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
    return state.transactions.filter(t => monthKey(t.date) === key);
}

function renderStats() {
    const txs = monthTx(new Date());
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    $('#statIncome').textContent = formatMoney(income, { decimals: false });
    $('#statExpense').textContent = formatMoney(expense, { decimals: false });
    const net = income - expense;
    const netEl = $('#statNet');
    netEl.textContent = formatMoney(net, { decimals: false });
    netEl.className = 'stat-amount ' + (net >= 0 ? 'stat-positive' : 'stat-negative');
}

function seqMap() {
    const sorted = [...state.transactions].sort((a, b) => (a.date + a.createdAt) < (b.date + b.createdAt) ? -1 : 1);
    const map = new Map();
    sorted.forEach((t, i) => map.set(t.id, i + 1));
    return map;
}

function renderRecent() {
    const list = $('#recentList');
    const map = seqMap();
    const recent = [...state.transactions].sort((a, b) => (a.date + a.createdAt < b.date + b.createdAt) ? 1 : -1).slice(0, 6);

    if (recent.length === 0) {
        list.innerHTML = '<li class="empty-note">No entries yet — add one to start the ledger.</li>';
        return;
    }

    list.innerHTML = recent.map(t => {
        const cat = categoryById(t.category);
        const acc = state.accounts.find(a => a.id === t.accountId);
        const sign = t.type === 'income' ? '+' : '−';
        const cls = t.type === 'income' ? 'stat-positive' : 'stat-negative';
        return `<li>
      <span class="entry-no">${String(map.get(t.id)).padStart(3, '0')}</span>
      <span class="entry-main">
        <span class="entry-desc">${cat ? cat.emoji + ' ' : ''}${escapeHtml(t.note || cat?.label || 'Entry')}</span>
        <span class="entry-meta">${formatDateShort(t.date)} · ${escapeHtml(acc ? acc.nickname : 'Removed account')}</span>
      </span>
      <span class="entry-amount ${cls}">${sign}${formatMoney(t.amount, { decimals: false })}</span>
    </li>`;
    }).join('');
}

function renderCategoryChart() {
    const txs = monthTx(new Date()).filter(t => t.type === 'expense');
    const totals = {};
    txs.forEach(t => { totals[t.category] = (totals[t.category] || 0) + t.amount; });
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);

    $('#categoryMonthLabel').textContent = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    drawDonut($('#categoryChart'), entries.map(([id, val], i) => ({
        value: val, color: chartColor(i)
    })));

    const legend = $('#categoryLegend');
    if (entries.length === 0) {
        legend.innerHTML = '<li class="empty-note">No expenses logged this month yet.</li>';
        return;
    }
    legend.innerHTML = entries.slice(0, 6).map(([id, val], i) => {
        const cat = categoryById(id);
        return `<li><span class="swatch" style="background:${chartColor(i)}"></span>${cat.emoji} ${cat.label} · ${formatMoney(val, { decimals: false })}</li>`;
    }).join('');
}

function renderAccountsStrip() {
    const strip = $('#accountsStrip');
    const cards = state.accounts.map(a => `
    <div class="mini-account">
      <div class="mini-inst">${escapeHtml(a.institution)}</div>
      <div class="mini-nick">${escapeHtml(a.nickname)}</div>
      <div class="mini-balance">${formatMoney(a.balance, { decimals: false })}</div>
    </div>`).join('');
    strip.innerHTML = cards + `<button class="strip-add" data-open-modal="modal-account" type="button">+ Connect account</button>`;
    // re-bind the newly injected open-modal button
    const btn = strip.querySelector('.strip-add');
    btn.addEventListener('click', () => openAccountModal(null));
}

function renderAccountsGrid() {
    const grid = $('#accountsGrid');
    if (state.accounts.length === 0) {
        grid.innerHTML = `<div class="empty-state">
      <h3>No accounts connected yet</h3>
      <p>Add a savings, current, card or cash account to start logging entries against it.</p>
      <button class="btn btn-primary" data-action="connect-account" type="button">+ Connect account</button>
    </div>`;
        return;
    }
    grid.innerHTML = state.accounts.map(a => `
    <div class="passbook">
      <div class="passbook-top">
        <div>
          <div class="passbook-inst">${escapeHtml(a.institution)}</div>
          <div class="passbook-nick">${escapeHtml(a.nickname)}</div>
        </div>
        <span class="type-pill">${ACCOUNT_TYPES[a.type] || a.type}</span>
      </div>
      <div class="passbook-body">
        <div class="passbook-number">${maskAccount(a)}</div>
        <div class="passbook-balance">${formatMoney(a.balance)}</div>
      </div>
      <div class="passbook-foot">
        <button data-action="sync-account" data-id="${a.id}" type="button">Sync</button>
        <button data-action="edit-account" data-id="${a.id}" type="button">Edit</button>
        <button class="danger-hover" data-action="remove-account" data-id="${a.id}" type="button">Remove</button>
      </div>
    </div>`).join('');
}

function renderFilterOptions() {
    const accSel = $('#filterAccount');
    const current = accSel.value;
    accSel.innerHTML = '<option value="">All accounts</option>' + state.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.nickname)}</option>`).join('');
    accSel.value = current;

    const catSel = $('#filterCategory');
    const currentCat = catSel.value;
    const allCats = [...CATEGORIES.expense, ...CATEGORIES.income];
    catSel.innerHTML = '<option value="">All categories</option>' + allCats.map(c => `<option value="${c.id}">${c.emoji} ${c.label}</option>`).join('');
    catSel.value = currentCat;
}

function renderTransactionsTable() {
    const map = seqMap();
    const search = $('#filterSearch').value.trim().toLowerCase();
    const accFilter = $('#filterAccount').value;
    const catFilter = $('#filterCategory').value;
    const typeFilter = $('#filterType').value;

    let rows = [...state.transactions];
    if (search) {
        rows = rows.filter(t => {
            const category = categoryById(t.category);
            const account = state.accounts.find(a => a.id === t.accountId);
            const searchableText = [
                t.note,
                category?.label,
                t.category,
                account?.nickname,
                t.date,
                t.type,
                t.amount
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return searchableText.includes(search);
        });
    }
    if (accFilter) rows = rows.filter(t => t.accountId === accFilter);
    if (catFilter) rows = rows.filter(t => t.category === catFilter);
    if (typeFilter) rows = rows.filter(t => t.type === typeFilter);
    rows.sort((a, b) => (a.date + a.createdAt < b.date + b.createdAt) ? 1 : -1);

    const body = $('#transactionsBody');
    $('#txEmptyState').hidden = rows.length !== 0;

    body.innerHTML = rows.map(t => {
        const cat = categoryById(t.category);
        const acc = state.accounts.find(a => a.id === t.accountId);
        const sign = t.type === 'income' ? '+' : '−';
        const cls = t.type === 'income' ? 'stat-positive' : 'stat-negative';
        return `<tr>
      <td class="row-no">${String(map.get(t.id)).padStart(3, '0')}</td>
      <td>${formatDateLong(t.date)}</td>
      <td class="desc-cell"><strong>${escapeHtml(t.note || cat?.label || 'Entry')}</strong><span>${cat ? cat.emoji + ' ' + cat.label : ''}</span></td>
      <td>${escapeHtml(acc ? acc.nickname : 'Removed account')}</td>
      <td><span class="cat-tag">${cat ? cat.emoji + ' ' + cat.label : '—'}</span></td>
      <td class="amount-cell ${cls}">${sign}${formatMoney(t.amount)}</td>
      <td class="col-actions">
        <div class="row-actions">
          <button data-action="edit-tx" data-id="${t.id}" type="button" aria-label="Edit">✎</button>
          <button data-action="delete-tx" data-id="${t.id}" type="button" aria-label="Delete">🗑</button>
        </div>
      </td>
    </tr>`;
    }).join('');
}

/* ================================================================
   REPORTS
   ================================================================ */
function bindReportNav() {
    $('#monthPrev').addEventListener('click', () => { reportMonthDate.setMonth(reportMonthDate.getMonth() - 1); renderReports(); });
    $('#monthNext').addEventListener('click', () => { reportMonthDate.setMonth(reportMonthDate.getMonth() + 1); renderReports(); });
}

function renderReports() {
    $('#monthLabel').textContent = reportMonthDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const txs = monthTx(reportMonthDate);

    // category bars — income + expenses
    const incomeTotals = {};
    const expenseTotals = {};

    txs.forEach(t => {
        const target = t.type === 'income' ? incomeTotals : expenseTotals;
        target[t.category] = (target[t.category] || 0) + t.amount;
    });

    const incomeEntries = Object.entries(incomeTotals).sort((a, b) => b[1] - a[1]);
    const expenseEntries = Object.entries(expenseTotals).sort((a, b) => b[1] - a[1]);
    const incomeMax = incomeEntries.length ? incomeEntries[0][1] : 1;
    const expenseMax = expenseEntries.length ? expenseEntries[0][1] : 1;
    const barList = $('#reportBars');
    const renderCategoryRows = (entries, max, type) => {
        if (!entries.length) {
            return `<li class="empty-note">No ${type} logged for this month.</li>`;
        }
        return entries.map(([id, val]) => {
            const cat = categoryById(id);
            return `<li class="bar-row">
            <div class="bar-row-top">
                <strong>${cat.emoji} ${cat.label}</strong>
                <span>${formatMoney(val, { decimals: false })}</span>
            </div>
            <div class="bar-track">
                <div class="bar-fill"
                    style="width:${(val / max * 100).toFixed(1)}%; background:${type === 'income' ? 'var(--gold)' : 'var(--rust)'}">
                </div>
            </div>
        </li>`;
        }).join('');
    };
    barList.innerHTML = `
    <li style="
        font-weight:600;
        margin-bottom:8px;
        color:var(--gold);
    ">
        Income
    </li>
    ${renderCategoryRows(incomeEntries, incomeMax, 'income')}
    <li style="
        font-weight:600;
        margin-top:20px;
        margin-bottom:8px;
        color:var(--rust);
    ">
        Spend
    </li>
    ${renderCategoryRows(expenseEntries, expenseMax, 'expenses')}
`;

    // income vs expense
    const income = txs
        .filter(t => t.type === 'income')
        .reduce((s, t) => s + t.amount, 0);

    const expense = txs
        .filter(t => t.type === 'expense')
        .reduce((s, t) => s + t.amount, 0);

    drawTwoBar($('#ieChart'), income, expense);

    // six month trend
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(
            reportMonthDate.getFullYear(),
            reportMonthDate.getMonth() - i,
            1
        );

        const t = monthTx(d);
        months.push({
            label: d.toLocaleDateString('en-GB', {
                month: 'short'
            }),

            income: t
                .filter(x => x.type === 'income')
                .reduce((s, x) => s + x.amount, 0),

            expense: t
                .filter(x => x.type === 'expense')
                .reduce((s, x) => s + x.amount, 0)
        });
    }

    drawTrend($('#trendChart'), months);
}

/* ================================================================
   CANVAS CHARTS (no external libraries)
   ================================================================ */
function setupCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
}

function drawDonut(canvas, data) {
    const { ctx, w, h } = setupCanvas(canvas);
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 14, thickness = 26;
    const total = data.reduce((s, d) => s + d.value, 0);

    if (total === 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = '#E4D6BC';
        ctx.lineWidth = thickness;
        ctx.stroke();
        ctx.fillStyle = '#9C8A70';
        ctx.font = '13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data yet', cx, cy + 4);
        return;
    }

    let start = -Math.PI / 2;
    data.forEach(d => {
        const slice = (d.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, start, start + slice);
        ctx.strokeStyle = d.color;
        ctx.lineWidth = thickness;
        ctx.lineCap = data.length === 1 ? 'butt' : 'round';
        ctx.stroke();
        start += slice;
    });

    ctx.fillStyle = '#2A1C11';
    ctx.font = '600 15px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(formatMoney(total, { decimals: false }), cx, cy + 5);
}

function drawTwoBar(canvas, income, expense) {
    const { ctx, w, h } = setupCanvas(canvas);
    const max = Math.max(income, expense, 1);
    const barW = 90, gap = 70, baseY = h - 46, top = 30;
    const cx = w / 2;

    [{ label: 'Income', val: income, color: cssVar('--gold', '#92661F'), x: cx - gap / 2 - barW }, { label: 'Expense', val: expense, color: cssVar('--rust', '#8A3A2A'), x: cx + gap / 2 }].forEach(b => {
        const bh = Math.max(4, (b.val / max) * (baseY - top));
        const y = baseY - bh;
        ctx.fillStyle = b.color;
        roundRectPath(ctx, b.x, y, barW, bh, 10);
        ctx.fill();
        ctx.fillStyle = '#2A1C11';
        ctx.font = '600 13px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(formatMoney(b.val, { decimals: false }), b.x + barW / 2, y - 10);
        ctx.fillStyle = '#6B5942';
        ctx.font = '12px Inter, sans-serif';
        ctx.fillText(b.label, b.x + barW / 2, baseY + 20);
    });
}

function drawTrend(canvas, months) {
    const { ctx, w, h } = setupCanvas(canvas);
    const padL = 44, padR = 20, padT = 20, padB = 34;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const max = Math.max(1, ...months.map(m => Math.max(m.income, m.expense)));
    const groupW = plotW / months.length;
    const barW = Math.min(26, groupW / 3.2);

    // gridlines
    ctx.strokeStyle = '#E4D6BC';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padT + (plotH / 4) * i;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
        const val = max - (max / 4) * i;
        ctx.fillStyle = '#9C8A70';
        ctx.font = '10px "IBM Plex Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(val).toLocaleString(), padL - 8, y + 3);
    }

    months.forEach((m, i) => {
        const groupX = padL + i * groupW + groupW / 2;
        const ih = (m.income / max) * plotH;
        const eh = (m.expense / max) * plotH;
        ctx.fillStyle = cssVar('--gold', '#92661F');
        roundRectPath(ctx, groupX - barW - 3, padT + plotH - ih, barW, ih, 4); ctx.fill();
        ctx.fillStyle = cssVar('--rust', '#8A3A2A');
        roundRectPath(ctx, groupX + 3, padT + plotH - eh, barW, eh, 4); ctx.fill();

        ctx.fillStyle = '#6B5942';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(m.label, groupX, h - 12);
    });
}

function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, Math.max(h, 1) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

/* ================================================================
   SETTINGS — TABS
   ================================================================ */
function bindSettingsTabs() {
    $all('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.settingsTab;
            $all('.settings-tab').forEach(t => t.classList.toggle('is-active', t === tab));
            $all('.settings-pane').forEach(p => p.classList.toggle('is-active', p.dataset.settingsPane === target));
        });
    });
}

/* ================================================================
   SETTINGS — PROFILE
   ================================================================ */
function renderProfileSettings() {
    const p = state.profile || defaultProfile();
    $('#profileName').value = p.name || '';
    $('#profileNickname').value = p.nickname || '';
    $('#profileMobile').value = p.mobile || '';
    $('#profileEmail').value = p.email || '';
    renderProfileAvatar();
}

function renderProfileAvatar() {
    const preview = $('#profileAvatarPreview');
    const p = state.profile || defaultProfile();
    if (p.avatar) {
        preview.innerHTML = `<img src="${p.avatar}" alt="Profile photo">`;
    } else {
        const initial = (p.nickname || p.name || 'XpFlow').trim().charAt(0).toUpperCase() || 'X';
        preview.innerHTML = `<span id="profileAvatarInitial">${escapeHtml(initial)}</span>`;
    }
}

function bindProfileSettings() {
    $('#profileForm').addEventListener('submit', (e) => {
        e.preventDefault();
        state.profile.name = $('#profileName').value.trim();
        state.profile.nickname = $('#profileNickname').value.trim();
        state.profile.mobile = $('#profileMobile').value.trim();
        state.profile.email = $('#profileEmail').value.trim();
        saveState();
        setGreeting();
        renderProfileAvatar();
        showToast('Profile saved.');
    });

    $('#profileAvatarInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast('Please choose an image file.');
            e.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            state.profile.avatar = reader.result;
            saveState();
            renderProfileAvatar();
            showToast('Profile photo updated.');
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    });

    $('#profileAvatarRemove').addEventListener('click', () => {
        if (!state.profile.avatar) return;
        state.profile.avatar = '';
        saveState();
        renderProfileAvatar();
        showToast('Profile photo removed.');
    });
}

/* ================================================================
   SETTINGS — GENERAL
   ================================================================ */
const CHART_PALETTE_VARS = ['--gold', '--rust', '--brown-500', '--brown-700', '--brown-400'];
function chartColor(index) {
    return cssVar(CHART_PALETTE_VARS[index % CHART_PALETTE_VARS.length], '#8B7355');
}

function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
}

function applyAccentColor(hex) {
    if (!hex) return;
    const hsl = hexToHsl(hex);
    document.documentElement.style.setProperty('--gold', hex);
    document.documentElement.style.setProperty('--gold-soft', hslToHex(hsl.h, Math.min(hsl.s, 45), 88));
    document.documentElement.style.setProperty('--brown-900', hslToHex(hsl.h, Math.min(hsl.s + 8, 70), 10));
    document.documentElement.style.setProperty('--brown-800', hslToHex(hsl.h, Math.min(hsl.s + 6, 65), 15));
    document.documentElement.style.setProperty('--brown-700', hslToHex(hsl.h, Math.min(hsl.s + 4, 60), 22));
    document.documentElement.style.setProperty('--brown-500', hslToHex(hsl.h, Math.min(hsl.s + 2, 55), 33));
    document.documentElement.style.setProperty('--brown-400', hslToHex(hsl.h, hsl.s, 43));
    document.documentElement.style.setProperty('--rust', hslToHex((hsl.h + 20) % 360, Math.min(hsl.s + 5, 65), 38));
    document.documentElement.style.setProperty('--rust-soft', hslToHex((hsl.h + 20) % 360, Math.min(hsl.s, 50), 90));
    document.documentElement.style.setProperty('--line', hslToHex(hsl.h, Math.min(hsl.s, 30), 80));
    document.documentElement.style.setProperty('--line-strong', hslToHex(hsl.h, Math.min(hsl.s, 35), 70));
    $all('#accentSwatches .swatch').forEach(s => s.classList.toggle('is-active', s.dataset.accent.toLowerCase() === hex.toLowerCase()));
}

function hexToHsl(hex) {
    const n = hex.replace('#', '');
    let r = parseInt(n.substring(0, 2), 16) / 255;
    let g = parseInt(n.substring(2, 4), 16) / 255;
    let b = parseInt(n.substring(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            default: h = (r - g) / d + 4;
        }
        h *= 60;
    }
    return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = c => Math.round(c * 255).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function bindGeneralSettings() {
    $('#prefDecimals').checked = state.preferences.decimals !== false;

    $all('#accentSwatches .swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            const accent = swatch.dataset.accent;

            state.preferences.accent = accent;
            saveState();
            applyAccentColor(accent);

            renderCategoryChart();
            renderReports();

            showToast('Accent color updated.');
        });
    });

    $('#prefDecimals').addEventListener('change', (e) => {
        state.preferences.decimals = e.target.checked;
        saveState();
        renderAll();
    });
}

/* ================================================================
   SETTINGS — DATA CONTROL
   ================================================================ */
function renderDataSummary() {
    const el = $('#dataSummary');
    if (!el) return;
    let sizeKb = 0;
    try {
        sizeKb = Math.round((new Blob([JSON.stringify(state)]).size / 1024) * 10) / 10;
    } catch (e) { /* ignore */ }
    el.innerHTML = `
        <li><span class="summary-num">${state.accounts.length}</span><span class="summary-label">Accounts</span></li>
        <li><span class="summary-num">${state.transactions.length}</span><span class="summary-label">Transactions</span></li>
        <li><span class="summary-num">${sizeKb} KB</span><span class="summary-label">Stored on device</span></li>
    `;
}

function bindDataSettings() {
    $('#clearTxBtn').addEventListener('click', () => {
        if (!state.transactions.length) {
            showToast('There\'s no transaction history to clear.');
            return;
        }
        openConfirm('Clear transaction history? Every ledger entry will be removed, but your accounts stay connected.', () => {
            state.transactions = [];
            saveState();
            renderAll();
            renderDataSummary();
            showToast('Transaction history cleared.');
        });
    });
}

/* ================================================================
   SETTINGS — PRIVACY / LOGIN ACCOUNTS  (financial accounts)
   ================================================================ */
function isAccountActive(id) {
    return state.security.sessions[id] !== false;
}

function renderLoginAccounts() {
    const list = $('#loginAccountList');
    const empty = $('#loginAccountEmpty');
    if (!list) return;
    if (!state.accounts.length) {
        list.innerHTML = '';
        if (empty) empty.hidden = false;
        return;
    }
    if (empty) empty.hidden = true;

    list.innerHTML = state.accounts.map(acc => {
        const active = isAccountActive(acc.id);
        const hasPassword = !!state.security.passwords[acc.id];
        const icon = (acc.institution || acc.nickname || '?').charAt(0).toUpperCase();
        return `
            <li class="login-account-item" data-account-id="${acc.id}">
                <div class="login-account-icon">${escapeHtml(icon)}</div>
                <div class="login-account-info">
                    <strong>${escapeHtml(acc.nickname)}</strong>
                    <span>${escapeHtml(acc.institution)} · ${escapeHtml(maskAccount(acc))}${hasPassword ? ' · Password set' : ''}</span>
                </div>
                <span class="login-account-badge ${active ? '' : 'is-off'}">${active ? 'Active' : 'Logged out'}</span>
                <div class="login-account-actions">
                    <button type="button" class="btn btn-ghost" data-privacy-action="password" data-id="${acc.id}">${hasPassword ? 'Change password' : 'Add password'}</button>
                    <button type="button" class="btn btn-ghost" data-privacy-action="logout" data-id="${acc.id}" ${active ? '' : 'disabled'}>Log out</button>
                </div>
            </li>
        `;
    }).join('');
}

function logoutAccount(id) {
    state.security.sessions[id] = false;
    saveState();
    renderLoginAccounts();
}

function bindPrivacySettings() {
    $('#loginAccountList').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-privacy-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        const acc = state.accounts.find(a => a.id === id);
        if (!acc) return;

        if (btn.dataset.privacyAction === 'logout') {
            logoutAccount(id);
            showToast(`Logged out of ${acc.nickname}.`);
        }
        if (btn.dataset.privacyAction === 'password') {
            openPasswordModal(acc);
        }
    });

    $('#logoutAllBtn').addEventListener('click', () => {
        if (!state.accounts.length) {
            showToast('No accounts to log out of.');
            return;
        }
        openConfirm('Log out from every connected account on this device?', () => {
            state.accounts.forEach(a => { state.security.sessions[a.id] = false; });
            saveState();
            renderLoginAccounts();
            showToast('Logged out from every account.');
        });
    });

    $('#passwordForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = $('#passwordAccountId').value;
        const pass = $('#passwordNew').value;
        const confirmPass = $('#passwordConfirm').value;
        if (pass.length < 4) {
            showToast('Password should be at least 4 characters.');
            return;
        }
        if (pass !== confirmPass) {
            showToast('Passwords don\'t match.');
            return;
        }
        state.security.passwords[id] = true;
        saveState();
        closeModal();
        renderLoginAccounts();
        showToast('Password saved for this account.');
    });
}

function openPasswordModal(acc) {
    $('#passwordForm').reset();
    $('#passwordAccountId').value = acc.id;
    $('#passwordModalTitle').textContent = state.security.passwords[acc.id] ? 'Change account password' : 'Set account password';
    $('#passwordAccountLabel').textContent = `Adding a password for ${acc.nickname} (${acc.institution}).`;
    openModal('modal-password');
}

/* ================================================================
   SETTINGS — NOTIFICATIONS
   ================================================================ */
const NOTIFICATION_DEFS = [
    { id: 'tx', label: 'Transaction alerts', desc: 'A note whenever a new entry is added to the ledger.' },
    { id: 'budget', label: 'Budget alerts', desc: 'Heads-up when a category is close to its usual spend.' },
    { id: 'weekly', label: 'Weekly summary', desc: 'A digest of income, expenses and net saved each week.' },
    { id: 'lowBalance', label: 'Low balance warnings', desc: 'Alert when an account balance drops low.' },
    { id: 'tips', label: 'Tips & product updates', desc: 'Occasional suggestions on getting more from XpFlow.' },
    { id: 'security', label: 'Security alerts', desc: 'Notify on password changes and account logouts.' }
];

function renderNotificationSettings() {
    const list = $('#notifList');
    if (!list) return;
    list.innerHTML = NOTIFICATION_DEFS.map(def => `
        <li class="notif-item">
            <div class="notif-item-text">
                <strong>${escapeHtml(def.label)}</strong>
                <span>${escapeHtml(def.desc)}</span>
            </div>
            <span class="switch"><input type="checkbox" data-notif-id="${def.id}" ${state.notifications[def.id] ? 'checked' : ''}></span>
        </li>
    `).join('');
}

function bindNotificationSettings() {
    $('#notifList').addEventListener('change', (e) => {
        const input = e.target.closest('[data-notif-id]');
        if (!input) return;
        state.notifications[input.dataset.notifId] = input.checked;
        saveState();
        showToast('Notification preferences updated.');
    });
}

/* ================================================================
   SETTINGS — CURRENCY / EXPORT / IMPORT / CLEAR ALL
   ================================================================ */
function bindSettings() {
    $('#currencySelect').addEventListener('change', (e) => {
        state.currency = e.target.value;
        saveState();
        renderAll();
    });

    $('#exportBtn').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `xpflow-export-${todayISO()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Export downloaded.');
    });

    $('#importInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                if (!Array.isArray(parsed.accounts) || !Array.isArray(parsed.transactions)) throw new Error('bad shape');
                state = {
                    currency: parsed.currency || '₹',
                    accounts: parsed.accounts,
                    transactions: parsed.transactions,
                    profile: Object.assign(defaultProfile(), parsed.profile || {}),
                    preferences: Object.assign(defaultPreferences(), parsed.preferences || {}),
                    notifications: Object.assign(defaultNotifications(), parsed.notifications || {}),
                    security: Object.assign(defaultSecurity(), parsed.security || {})
                };
                saveState();
                $('#currencySelect').value = state.currency;
                applyAccentColor(state.preferences.accent);
                $('#prefDecimals').checked = state.preferences.decimals !== false;
                renderAll();
                renderProfileSettings();
                renderDataSummary();
                renderLoginAccounts();
                renderNotificationSettings();
                setGreeting();
                showToast('Data imported.');
            } catch (err) {
                showToast('That file doesn\'t look like a valid XpFlow export.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    $('#clearBtn').addEventListener('click', () => {
        openConfirm('Clear all data? This removes every account, entry, profile detail and preference from this browser. This can\'t be undone.', () => {
            state = {
                currency: state.currency,
                accounts: [],
                transactions: [],
                profile: defaultProfile(),
                preferences: defaultPreferences(),
                notifications: defaultNotifications(),
                security: defaultSecurity()
            };
            saveState();
            renderAll();
            renderProfileSettings();
            renderDataSummary();
            renderLoginAccounts();
            renderNotificationSettings();
            applyAccentColor(state.preferences.accent);
            $('#prefDecimals').checked = true;
            setGreeting();
            updateLoggedInAccountUI();
            showToast('All data cleared.');
        });
    });
}

/* ---------------- misc ---------------- */
function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Refresh the app when clicking specifically on the brand logo or name
document.querySelector('.brand-mark')?.addEventListener('click', () => {
    window.location.reload();
});

document.querySelector('.brand-text')?.addEventListener('click', () => {
    window.location.reload();
});

// Sidebar collapse toggle functionality
document.addEventListener('DOMContentLoaded', () => {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const appContainer = document.querySelector('.app');

    if (sidebarToggle && appContainer) {
        sidebarToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            appContainer.classList.toggle('sidebar-collapsed');
        });
    }
});

/* ================================================================
   MOBILE BURGER MENU
   ================================================================ */
function bindMobileMenu() {
    const toggle = document.getElementById('mobileMenuToggle');
    const overlay = document.getElementById('mobileMenuOverlay');
    const closeBtn = document.getElementById('mobileMenuClose');
    if (!toggle || !overlay) return;

    const openMobileMenu = () => {
        overlay.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        document.body.classList.add('mobile-menu-open');
    };
    const closeMobileMenu = () => {
        overlay.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('mobile-menu-open');
    };

    toggle.addEventListener('click', () => (overlay.hidden ? openMobileMenu() : closeMobileMenu()));
    closeBtn?.addEventListener('click', closeMobileMenu);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeMobileMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) closeMobileMenu(); });

    $all('.mobile-nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            switchView(btn.dataset.view);
            closeMobileMenu();
        });
    });

    document.getElementById('mobileAccountLogin')?.addEventListener('click', () => {
        closeMobileMenu();
        sidebarLogin?.click();
    });
}