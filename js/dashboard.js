// ============================================================
// דשבורד (שלב 11) - תמונת מצב כלכלית ופרויקטלית
// חייב להיטען אחרי js/app.js (CLIENT_STATUSES, LEAD_STATUS) ואחרי
// שכל שאר קבצי המסכים נטענו, כדי שיוכל לנווט אליהם בלחיצה על כרטיס.
// ============================================================

const dashboardContainer = document.getElementById("dashboard-container");

async function loadDashboardView() {
    dashboardContainer.innerHTML = `<p class="muted">טוענת נתוני דשבורד...</p>`;

    const [
        { data: leadsData, error: leadsError },
        { data: clientsData, error: clientsError },
        { data: paymentsData, error: paymentsError },
        { data: commissionData, error: commissionError },
    ] = await Promise.all([
        client.from("leads").select("id, status"),
        client.from("clients").select("id, status"),
        client.from("payments").select("id, amount, status"),
        client.from("commission_income").select("id, commission_amount, status"),
    ]);

    if (leadsError || clientsError || paymentsError || commissionError) {
        dashboardContainer.innerHTML = `<p class="error-text">שגיאה בטעינת נתוני הדשבורד.</p>`;
        return;
    }

    renderDashboard(leadsData || [], clientsData || [], paymentsData || [], commissionData || []);
}

function renderDashboard(leads, clients, payments, commissions) {
    // ---------- חישובי תשלומים ----------
    const paidTotal = payments
        .filter((p) => p.status === PAYMENT_STATUS.PAID)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const lateRows = payments.filter((p) => p.status === PAYMENT_STATUS.LATE);
    const lateTotal = lateRows.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const pendingRows = payments.filter((p) => p.status === PAYMENT_STATUS.PENDING);
    const pendingTotal = pendingRows.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    // ---------- חישובי עמלות ----------
    const commissionPendingTotal = commissions
        .filter((c) => c.status === COMMISSION_STATUS.PENDING)
        .reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);

    // ---------- חישובי פרויקטים/פניות ----------
    const openLeadsCount = leads.filter((l) => l.status === LEAD_STATUS.OPEN).length;

    const CLOSED_CLIENT_STATUSES = ["סגור/ארכיון", "ויתר"];
    const activeClients = clients.filter((c) => !CLOSED_CLIENT_STATUSES.includes(c.status));

    // ---------- כרטיסי KPI ----------
    dashboardContainer.innerHTML = `
        <div class="kpi-grid">
            <div class="kpi-card kpi-green">
                <span class="kpi-label">הכנסות שהתקבלו</span>
                <span class="kpi-value">₪${paidTotal.toLocaleString("he-IL")}</span>
                <span class="kpi-sub">סה"כ תשלומים ששולמו במלואם</span>
            </div>
            <div class="kpi-card kpi-blue">
                <span class="kpi-label">ממתין לגבייה</span>
                <span class="kpi-value">₪${pendingTotal.toLocaleString("he-IL")}</span>
                <span class="kpi-sub">${pendingRows.length} תשלומים בהמתנה</span>
            </div>
            <div class="kpi-card kpi-red">
                <span class="kpi-label">באיחור</span>
                <span class="kpi-value">₪${lateTotal.toLocaleString("he-IL")}</span>
                <span class="kpi-sub">${lateRows.length} תשלומים באיחור - דורש מעקב</span>
            </div>
            <div class="kpi-card kpi-purple">
                <span class="kpi-label">פרויקטים פעילים</span>
                <span class="kpi-value">${activeClients.length}</span>
                <span class="kpi-sub">לקוחות שאינם סגורים/ארכיון</span>
            </div>
            <div class="kpi-card kpi-amber">
                <span class="kpi-label">פניות פתוחות</span>
                <span class="kpi-value">${openLeadsCount}</span>
                <span class="kpi-sub">ממתינות לטיפול/החלטה</span>
            </div>
            <div class="kpi-card kpi-gray">
                <span class="kpi-label">עמלות ממתינות לגבייה</span>
                <span class="kpi-value">₪${commissionPendingTotal.toLocaleString("he-IL")}</span>
                <span class="kpi-sub">מחברות עיצוב</span>
            </div>
        </div>

        <div class="dashboard-section">
            <h3 style="margin-bottom:14px">פרויקטים לפי סטטוס</h3>
            <div id="dashboard-status-breakdown"></div>
        </div>
    `;

    renderStatusBreakdown(clients);
}

function renderStatusBreakdown(clients) {
    const container = document.getElementById("dashboard-status-breakdown");
    const total = clients.length;

    if (total === 0) {
        container.innerHTML = `<p class="muted">אין עדיין לקוחות במערכת.</p>`;
        return;
    }

    const rows = CLIENT_STATUSES.map((status) => {
        const count = clients.filter((c) => c.status === status).length;
        const pct = total ? Math.round((count / total) * 100) : 0;
        return `
            <div class="status-breakdown-row">
                <span style="min-width:170px">${escapeHtml(status)}</span>
                <div class="status-breakdown-bar-track">
                    <div class="status-breakdown-bar-fill" style="width:${pct}%"></div>
                </div>
                <span class="status-breakdown-count">${count}</span>
            </div>
        `;
    }).join("");

    container.innerHTML = rows;
}
