// ============================================================
// שלד ראשוני: התחברות + בדיקת חיבור לבסיס הנתונים
// ============================================================

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    "quotes", "photos", "suppliers", "client_suppliers", "calendar_events"
];

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
    runConnectionTest();
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
