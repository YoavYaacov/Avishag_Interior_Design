// ============================================================
// ליבה: התחברות, ניווט בין מסכים, כלים משותפים, קבועים
// ============================================================

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- קבועים משותפים ----------

const LEAD_STATUS = {
    OPEN: "פתוח",
    CONVERTED: "הומר ללקוח",
    IRRELEVANT: "לא רלוונטי",
};

const LEAD_SOURCES = ["אינסטגרם", "פייסבוק", "גוגל", "המלצה מלקוח", "אתר", "אחר"];

const CLIENT_STATUSES = [
    "נקבעה פגישת ייעוץ",
    "ממתין לבחירת מסלול",
    "מסלול נבחר - בעבודה",
    "ממתין לתשלום",
    "תכניות בעבודה",
    "הועבר לקבלן",
    "בביצוע בשטח",
    "לקראת מסירה",
    "הושלם - ממתין לתמונות סיום",
    "סגור/ארכיון",
];

const BALL_IN_COURT = { AVISHAG: "אבישג", CLIENT: "לקוח" };

const STYLE_OPTIONS = [
    "מודרני", "סקנדינבי", "מינימליסטי", "כפרי/רוסטיק",
    "בוהו", "קלאסי", "תעשייתי", "ים תיכוני",
];

// ---------- אלמנטים כלליים ----------

const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");
const userEmailEl = document.getElementById("user-email");
const statusGrid = document.getElementById("status-grid");
const statusMessage = document.getElementById("status-message");

const TABLES = [
    "tracks", "leads", "clients", "task_templates", "tasks",
    "payments", "commission_income", "meeting_summary", "addendums",
    "quotes", "photos", "suppliers", "client_suppliers", "calendar_events",
];

// ---------- התחברות ----------

async function checkSession() {
    const { data: { session } } = await client.auth.getSession();
    if (session) {
        showDashboard(session.user.email);
    } else {
        showLogin();
    }
}

function showLogin() {
    loginView.classList.remove("hidden");
    dashboardView.classList.add("hidden");
}

function showDashboard(email) {
    loginView.classList.add("hidden");
    dashboardView.classList.remove("hidden");
    userEmailEl.textContent = email;
    switchView("leads");
}

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.textContent = "";
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
        loginError.textContent = "פרטי התחברות שגויים. נסי שוב.";
        return;
    }
    showDashboard(data.user.email);
});

logoutBtn.addEventListener("click", async () => {
    await client.auth.signOut();
    showLogin();
});

// ---------- ניווט בין מסכים ----------

function switchView(viewName) {
    document.querySelectorAll(".app-view").forEach((el) => el.classList.add("hidden"));
    document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.remove("active"));

    document.getElementById(`${viewName}-view`).classList.remove("hidden");
    document.querySelector(`.nav-btn[data-view="${viewName}"]`).classList.add("active");

    if (viewName === "leads") loadLeadsView();
    if (viewName === "clients") loadClientsListView();
    if (viewName === "diagnostics") runConnectionTest();
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
});

// ---------- מודאל כללי ----------

const modalOverlay = document.getElementById("modal-overlay");
const modalBox = document.getElementById("modal-box");

function openModal(html) {
    modalBox.innerHTML = html;
    modalOverlay.classList.remove("hidden");
}

function closeModal() {
    modalOverlay.classList.add("hidden");
    modalBox.innerHTML = "";
}

modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
});

// ---------- טוסט ----------

let toastTimer = null;
function showToast(message, type = "ok") {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.className = `toast toast-${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 3000);
}

// ---------- כלי עזר ----------

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr) {
    if (!dateStr) return "-";
    const [y, m, d] = dateStr.split("-");
    return `${d}.${m}.${y}`;
}

function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function normalizePhone(phone) {
    return (phone || "").replace(/\D/g, "");
}

// בודקת אם טלפון כבר קיים בלידים או בלקוחות (אזהרה בלבד, לא חסימה)
async function findPhoneDuplicate(phone, { excludeLeadId = null, excludeClientId = null } = {}) {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;

    const { data: leadMatches } = await client.from("leads").select("id, full_name, phone, status");
    const { data: clientMatches } = await client.from("clients").select("id, full_name, phone, status");

    const leadHit = (leadMatches || []).find(
        (l) => normalizePhone(l.phone) === normalized && l.id !== excludeLeadId
    );
    if (leadHit) return { type: "lead", record: leadHit };

    const clientHit = (clientMatches || []).find(
        (c) => normalizePhone(c.phone) === normalized && c.id !== excludeClientId
    );
    if (clientHit) return { type: "client", record: clientHit };

    return null;
}

function statusBadgeClass(status) {
    if (status === LEAD_STATUS.OPEN) return "badge badge-open";
    if (status === LEAD_STATUS.CONVERTED) return "badge badge-converted";
    if (status === LEAD_STATUS.IRRELEVANT) return "badge badge-irrelevant";

    const idx = CLIENT_STATUSES.indexOf(status);
    if (idx === -1) return "badge";
    if (idx <= 1) return "badge badge-open";
    if (idx <= 7) return "badge badge-progress";
    if (idx === 8) return "badge badge-nearing";
    return "badge badge-closed";
}

function courtBadgeClass(court) {
    return court === BALL_IN_COURT.AVISHAG ? "badge badge-court-avishag" : "badge badge-court-client";
}

// ---------- בדיקת חיבור (אבחון) ----------

async function runConnectionTest() {
    statusGrid.innerHTML = "";
    statusMessage.textContent = "בודקת חיבור לכל הטבלאות...";

    let successCount = 0;

    for (const table of TABLES) {
        const card = document.createElement("div");
        card.className = "status-card pending";
        card.innerHTML = `<span class="table-name">${table}</span><span class="table-state">בודקת...</span>`;
        statusGrid.appendChild(card);

        const { count, error } = await client
            .from(table)
            .select("*", { count: "exact", head: true });

        if (error) {
            card.className = "status-card error";
            card.querySelector(".table-state").textContent = "שגיאה";
        } else {
            card.className = "status-card ok";
            card.querySelector(".table-state").textContent = `${count} שורות`;
            successCount++;
        }
    }

    statusMessage.textContent = successCount === TABLES.length
        ? `החיבור תקין - כל ${TABLES.length} הטבלאות נגישות.`
        : `${successCount} מתוך ${TABLES.length} טבלאות נגישות. בדקי שהרצת את schema.sql במלואו.`;
}

checkSession();
