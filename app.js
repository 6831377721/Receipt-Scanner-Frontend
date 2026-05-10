// ==========================================
// frontend/app.js — Smart Receipt Scanner
// Features: Dark Mode, Month Filter, Delete, Receipt List
// ==========================================

// const API_URL = 'http://localhost:5001/api';
const API_URL = 'https://receipt-scanner-ahp5.onrender.com/api';
let expenseChartInstance = null;
let allReceipts = [];          // Cache for all receipts
let pendingDeleteId = null;    // Receipt ID pending deletion
let currentMonthFilter = 'all';
let currentChartType = 'bar';

// ==========================================
// DOM Elements
// ==========================================
const authSection       = document.getElementById('auth-section');
const dashboardSection  = document.getElementById('dashboard-section');
const loginForm         = document.getElementById('login-form');
const registerForm      = document.getElementById('register-form');
const uploadForm        = document.getElementById('upload-form');
const welcomeMessage    = document.getElementById('welcome-message');
const uploadStatus      = document.getElementById('upload-status');
const uploadBtn         = document.getElementById('upload-btn');
const fileInput         = document.getElementById('receipt-file');
const monthFilter       = document.getElementById('month-filter');
const chartTypeSelect   = document.getElementById('chart-type');
const receiptsList      = document.getElementById('receipts-list');
const deleteModal       = document.getElementById('delete-modal');
const themeToggle       = document.getElementById('theme-toggle');
const themeIcon         = document.getElementById('theme-icon');

// ==========================================
// 1. Theme (Dark / Light Mode)
// ==========================================

function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    applyTheme(saved);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('theme', theme);
}

themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
    // Redraw chart to match new theme colors
    if (allReceipts.length > 0) renderChartFromCache();
});

// ==========================================
// 2. Auth Navigation
// ==========================================

document.getElementById('show-register').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-form-container').classList.add('hidden');
    document.getElementById('register-form-container').classList.remove('hidden');
});

document.getElementById('show-login').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('register-form-container').classList.add('hidden');
    document.getElementById('login-form-container').classList.remove('hidden');
});

function checkAuth() {
    const token = localStorage.getItem('token');
    const user   = JSON.parse(localStorage.getItem('user') || 'null');

    if (token && user) {
        authSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');
        welcomeMessage.innerText = `👋 สวัสดีคุณ ${user.username}`;
        fetchReceiptsAndRender();
    } else {
        authSection.classList.remove('hidden');
        dashboardSection.classList.add('hidden');
    }
}

// ==========================================
// 3. Authentication
// ==========================================

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;

    if (password.length < 6) { showMessage('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error'); return; }

    try {
        showMessage('กำลังสมัครสมาชิก...', 'loading');
        const res  = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        const data = await res.json();
        if (res.ok) {
            showMessage('✅ สมัครสมาชิกสำเร็จ! กำลังเปลี่ยนไปหน้าเข้าสู่ระบบ...', 'success');
            setTimeout(() => document.getElementById('show-login').click(), 1500);
        } else {
            showMessage(`❌ ${data.message}`, 'error');
        }
    } catch {
        showMessage('❌ เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่', 'error');
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    try {
        showMessage('กำลังเข้าสู่ระบบ...', 'loading');
        const res  = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            showMessage('✅ เข้าสู่ระบบสำเร็จ!', 'success');
            setTimeout(() => checkAuth(), 500);
        } else {
            showMessage(`❌ ${data.message}`, 'error');
        }
    } catch {
        showMessage('❌ เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
    }
});

document.getElementById('logout-btn').addEventListener('click', () => {
    if (confirm('คุณต้องการออกจากระบบใช่หรือไม่?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        allReceipts = [];
        checkAuth();
    }
});

// ==========================================
// 4. File Upload
// ==========================================

fileInput.addEventListener('change', (e) => {
    const name = e.target.files[0]?.name || '📁 เลือกไฟล์รูปภาพ';
    document.querySelector('.file-label span').textContent = name;
});

uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!fileInput.files.length) {
        showUploadStatus('❌ กรุณาเลือกไฟล์รูปภาพก่อน', 'error'); return;
    }

    const file = fileInput.files[0];
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
        showUploadStatus('❌ รองรับเฉพาะไฟล์ JPG, PNG, WebP เท่านั้น', 'error'); return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showUploadStatus('❌ ไฟล์มีขนาดใหญ่เกิน 5MB', 'error'); return;
    }

    const formData = new FormData();
    formData.append('receiptImage', file);
    const token = localStorage.getItem('token');

    uploadBtn.disabled = true;
    uploadBtn.textContent = '⏳ กำลังวิเคราะห์...';
    showUploadStatus('🤖 AI กำลังวิเคราะห์ใบเสร็จ... (อาจใช้เวลา 3-10 วินาที)', 'loading');

    try {
        const res  = await fetch(`${API_URL}/receipts/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();

        if (res.ok) {
            const r = data.data;
            showUploadStatus(
                `✅ วิเคราะห์สำเร็จ!\n📋 ร้าน: ${r.store}\n💰 ยอดรวม: ฿${r.total.toLocaleString()}\n📦 จำนวนรายการ: ${r.items} รายการ\n🏷️ หมวดหมู่: ${r.category}`,
                'success'
            );
            fileInput.value = '';
            document.querySelector('.file-label span').textContent = '📁 เลือกไฟล์รูปภาพ';
            setTimeout(() => fetchReceiptsAndRender(), 800);
        } else {
            showUploadStatus(`❌ ${data.message}`, 'error');
        }
    } catch {
        showUploadStatus('❌ เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่', 'error');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '🚀 ส่งให้ AI วิเคราะห์';
    }
});

// ==========================================
// 5. Fetch Receipts & Render All
// ==========================================

async function fetchReceiptsAndRender() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const res  = await fetch(`${API_URL}/receipts?limit=200`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        allReceipts = data.data || [];

        populateMonthFilter(allReceipts);
        updateStats(allReceipts);
        renderChartFromCache();
        renderReceiptList(allReceipts);

    } catch (err) {
        console.error('❌ Fetch error:', err);
        drawChart(['เกิดข้อผิดพลาด'], [0], true, 'bar');
    }
}

// ==========================================
// 6. Month Filter
// ==========================================

function populateMonthFilter(receipts) {
    // Collect unique year-months
    const months = new Set();
    receipts.forEach(r => {
        const d = new Date(r.receiptDate || r.createdAt);
        if (!isNaN(d)) {
            months.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
        }
    });

    // Keep only the "all" option then add month options
    monthFilter.innerHTML = '<option value="all">📅 ทุกเดือน</option>';
    [...months].sort().reverse().forEach(ym => {
        const [y, m] = ym.split('-');
        const label = new Date(+y, +m-1, 1).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
        const opt   = document.createElement('option');
        opt.value   = ym;
        opt.textContent = label;
        monthFilter.appendChild(opt);
    });

    // Restore previously selected value if still valid
    if ([...monthFilter.options].some(o => o.value === currentMonthFilter)) {
        monthFilter.value = currentMonthFilter;
    }
}

monthFilter.addEventListener('change', () => {
    currentMonthFilter = monthFilter.value;
    renderChartFromCache();
    renderReceiptList(getFilteredReceipts());
});

chartTypeSelect.addEventListener('change', () => {
    currentChartType = chartTypeSelect.value;
    renderChartFromCache();
});

function getFilteredReceipts() {
    if (currentMonthFilter === 'all') return allReceipts;
    return allReceipts.filter(r => {
        const d = new Date(r.receiptDate || r.createdAt);
        if (isNaN(d)) return false;
        const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        return ym === currentMonthFilter;
    });
}

// ==========================================
// 7. Stats
// ==========================================

function updateStats(receipts) {
    document.getElementById('stat-total-count').textContent = receipts.length;

    // Month total (current calendar month)
    const now = new Date();
    const thisMonth = receipts.filter(r => {
        const d = new Date(r.receiptDate || r.createdAt);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const monthTotal = thisMonth.reduce((s, r) => s + (r.totalAmount || 0), 0);
    document.getElementById('stat-month-total').textContent = `฿${monthTotal.toLocaleString('th-TH', {maximumFractionDigits:0})}`;

    // Top category
    const cats = {};
    receipts.forEach(r => {
        const c = r.mainCategory || 'Other';
        cats[c] = (cats[c] || 0) + (r.totalAmount || 0);
    });
    const top = Object.entries(cats).sort((a,b) => b[1]-a[1])[0];
    document.getElementById('stat-top-category').textContent = top ? `${categoryIcon(top[0])} ${top[0]}` : '—';
}

// ==========================================
// 8. Chart
// ==========================================

function renderChartFromCache() {
    const filtered = getFilteredReceipts();

    if (!filtered.length) {
        drawChart(['ยังไม่มีข้อมูล'], [0], true, currentChartType);
        return;
    }

    // Use totalAmount per receipt (matches the list display), grouped by mainCategory
    const totals = {};
    filtered.forEach(r => {
        const cat = r.mainCategory || 'Other';
        totals[cat] = (totals[cat] || 0) + (r.totalAmount || 0);
    });

    drawChart(Object.keys(totals), Object.values(totals), false, currentChartType);
}

function drawChart(labels, data, isEmpty, type = 'bar') {
    const ctx = document.getElementById('expenseChart')?.getContext('2d');
    if (!ctx) return;

    if (expenseChartInstance) { expenseChartInstance.destroy(); }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor  = isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.07)';
    const tickColor  = isDark ? '#a0aec0' : '#718096';
    const legendColor = isDark ? '#e2e8f0' : '#4a5568';

    const palette = [
        '#667eea','#f6ad55','#68d391','#fc8181','#76e4f7',
        '#b794f4','#f687b3','#4fd1c5','#faf089','#a0aec0'
    ];
    const alphas = palette.map(c => c + 'cc');

    const finalLabels = labels?.length ? labels : ['ยังไม่มีข้อมูล'];
    const finalData   = data?.length   ? data   : [0];

    const datasetConfig = isEmpty
        ? { backgroundColor: ['rgba(180,180,180,.4)'], borderColor: ['rgba(180,180,180,.8)'], borderWidth: 1 }
        : { backgroundColor: alphas.slice(0, finalLabels.length), borderColor: palette.slice(0, finalLabels.length), borderWidth: 2 };

    const isBar = type === 'bar';

    expenseChartInstance = new Chart(ctx, {
        type: type,
        data: {
            labels: finalLabels,
            datasets: [{
                label: isEmpty ? 'รอข้อมูล...' : 'ยอดใช้จ่าย (บาท)',
                data: finalData,
                ...datasetConfig,
                ...(isBar ? { borderRadius: 6, borderSkipped: false } : {})
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 500, easing: 'easeOutQuart' },
            plugins: {
                legend: {
                    display: !isEmpty && !isBar,
                    position: 'bottom',
                    labels: { color: legendColor, padding: 16, font: { size: 12, family: 'Prompt' } }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => `฿${ctx.parsed[isBar?'y':''].toLocaleString?.() ?? Number(ctx.raw).toLocaleString()}`
                    }
                }
            },
            ...(isBar ? {
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: { color: tickColor, callback: v => '฿' + Number(v).toLocaleString(), font: { family: 'Prompt' } },
                        title: { display: true, text: 'จำนวนเงิน (บาท)', color: tickColor, font: { size: 12, weight: '600', family: 'Prompt' } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: tickColor, font: { family: 'Prompt' } },
                        title: { display: true, text: 'หมวดหมู่', color: tickColor, font: { size: 12, weight: '600', family: 'Prompt' } }
                    }
                }
            } : {})
        }
    });
}

// ==========================================
// 9. Receipt List
// ==========================================

function renderReceiptList(receipts) {
    document.getElementById('receipt-count-label').textContent = `${receipts.length} รายการ`;

    if (!receipts.length) {
        receiptsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <p>ยังไม่มีใบเสร็จ เริ่มสแกนใบเสร็จแรกของคุณได้เลย!</p>
            </div>`;
        return;
    }

    const sorted = [...receipts].sort((a, b) =>
        new Date(b.receiptDate || b.createdAt) - new Date(a.receiptDate || a.createdAt)
    );

    receiptsList.innerHTML = sorted.map((r, i) => {
        const date    = new Date(r.receiptDate || r.createdAt);
        const dateStr = isNaN(date) ? '—' : date.toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' });
        const amount  = (r.totalAmount || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
        const icon    = categoryIcon(r.mainCategory);
        const delay   = Math.min(i * 40, 400);

        return `
        <div class="receipt-row" style="animation-delay:${delay}ms" data-id="${r._id}">
            <div class="receipt-icon">${icon}</div>
            <div class="receipt-info">
                <div class="receipt-merchant">${escapeHtml(r.merchantName || 'ร้านค้า')}</div>
                <div class="receipt-meta">
                    <span>${dateStr}</span>
                    <span class="receipt-tag">${r.mainCategory || 'Other'}</span>
                </div>
            </div>
            <div class="receipt-amount">฿${amount}</div>
            <button class="btn-delete" onclick="openDeleteModal('${r._id}', '${escapeHtml(r.merchantName || 'ร้านค้า')}')" title="ลบใบเสร็จนี้">🗑️</button>
        </div>`;
    }).join('');
}

// ==========================================
// 10. Delete Receipt
// ==========================================

function openDeleteModal(id, name) {
    pendingDeleteId = id;
    document.getElementById('delete-receipt-name').textContent = name;
    deleteModal.classList.remove('hidden');
}

document.getElementById('cancel-delete-btn').addEventListener('click', () => {
    deleteModal.classList.add('hidden');
    pendingDeleteId = null;
});

deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) {
        deleteModal.classList.add('hidden');
        pendingDeleteId = null;
    }
});

document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
    if (!pendingDeleteId) return;

    const btn = document.getElementById('confirm-delete-btn');
    btn.disabled = true;
    btn.textContent = 'กำลังลบ...';

    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/receipts/${pendingDeleteId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            // Remove from local cache
            allReceipts = allReceipts.filter(r => r._id !== pendingDeleteId);
            deleteModal.classList.add('hidden');
            pendingDeleteId = null;

            populateMonthFilter(allReceipts);
            updateStats(allReceipts);
            renderChartFromCache();
            renderReceiptList(getFilteredReceipts());
        } else {
            const data = await res.json();
            alert(`❌ ลบไม่สำเร็จ: ${data.message || 'กรุณาลองใหม่'}`);
        }
    } catch {
        alert('❌ เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
        btn.disabled = false;
        btn.textContent = 'ลบเลย';
    }
});

// ==========================================
// 11. Utility Helpers
// ==========================================

const CATEGORY_ICONS = {
    Food: '🍜', Shopping: '🛍️', Transport: '🚗',
    Entertainment: '🎬', Healthcare: '💊', Utilities: '💡', Other: '📦'
};
function categoryIcon(cat) { return CATEGORY_ICONS[cat] || '📦'; }

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showMessage(message, type) {
    document.querySelector('.auth-message')?.remove();
    const div = document.createElement('div');
    div.className = 'auth-message status-msg';
    div.textContent = message;
    const colors = {
        success: { color: 'var(--success)', background: 'var(--success-bg)', border: '1px solid var(--success-border)' },
        error:   { color: 'var(--danger)',  background: 'var(--error-bg)',   border: '1px solid var(--error-border)' },
        loading: { color: '#d97706',        background: 'var(--warning-bg)', border: '1px solid var(--warning-border)' }
    };
    Object.assign(div.style, colors[type] || {});
    const container = document.querySelector('#auth-section form:not(.hidden)')?.parentElement;
    if (container) container.insertBefore(div, container.querySelector('.switch-form'));
    if (type !== 'loading') setTimeout(() => div.remove(), 5000);
}

function showUploadStatus(message, type) {
    uploadStatus.textContent = message;
    uploadStatus.className = 'status-msg';
    const styles = {
        success: { color: 'var(--success)', background: 'var(--success-bg)', border: '1px solid var(--success-border)' },
        error:   { color: 'var(--danger)',  background: 'var(--error-bg)',   border: '1px solid var(--error-border)' },
        loading: { color: '#d97706',        background: 'var(--warning-bg)', border: '1px solid var(--warning-border)' }
    };
    Object.assign(uploadStatus.style, styles[type] || {});
    if (type === 'loading') uploadStatus.classList.add('loading');
}

// ==========================================
// 12. Initialize
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    checkAuth();
    console.log('🚀 Receipt Scanner App Initialized');
});