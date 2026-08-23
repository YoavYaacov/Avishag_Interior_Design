// ============================================================
// משימות (TASKS + TASK_TEMPLATES)
// חלק א': מסך "משימות" גלובלי (חוצה-לקוחות)
// חלק ב': ניהול משימות בתוך כרטיס הלקוח (תצוגה, checkbox, הוספה/הסרה,
//         ויצירה/מחיקה אוטומטית של משימות כשמסלול נקבע/משתנה)
// ============================================================

const TASK_STATUS = { OPEN: "פתוח", DONE: "הושלם" };

// קבוצת "משימות נוספות" = ברירת המחדל למשימות ad-hoc שאבישג מוסיפה ידנית
// דרך כרטיס הלקוח (מעבר למה שמגיע מהתבנית).
const AD_HOC_STAGE_LABEL = "משימות נוספות";

// סדר קבוע לתצוגת קבוצות-השלב בכרטיס הלקוח. ערך ריק ("") = הום סטיילינג
// (ללא שלבים, רשימה שטוחה ללא כותרת קבוצה). כל קבוצה שלא ברשימה (לא אמור
// לקרות בפועל, אבל ליתר ביטחון) תוצג בסוף, לפי סדר א'-ב'.
const TASK_STAGE_ORDER = [
    "",
    "שלב מקדים",
    "שלב א' - תכנון ראשוני",
    "שלב ב' - סט תכניות",
    "שלב ג' - בחירת חומרי גמר",
    "התחייבויות מול הלקוח",
    AD_HOC_STAGE_LABEL,
];

// ============================================================
// חלק א' - מסך "משימות" גלובלי
// ============================================================

const tasksTableContainer = document.getElementById("tasks-table-container");

let globalTasksCache = [];
let globalTasksClientNames = {}; // client_id -> full_name
let globalTasksSort = { column: "due_date", direction: "asc" };

async function loadTasksView() {
    tasksTableContainer.innerHTML = `<p class="muted">טוענת משימות...</p>`;

    const [{ data: tasksData, error: tasksError }, { data: clientsData }] = await Promise.all([
        client.from("tasks").select("*"),
        client.from("clients").select("id, full_name"),
    ]);

    if (tasksError) {
        tasksTableContainer.innerHTML = `<p class="error-text">שגיאה בטעינת משימות: ${escapeHtml(tasksError.message)}</p>`;
        return;
    }

    globalTasksClientNames = {};
    (clientsData || []).forEach((c) => { globalTasksClientNames[c.id] = c.full_name; });

    globalTasksCache = tasksData || [];
    renderGlobalTasksTable();
}

function taskSortValue(task, column) {
    if (column === "client") return globalTasksClientNames[task.client_id] || "";
    if (column === "stage") return task.stage_source || "";
    if (column === "title") return task.title || "";
    return task[column] || "";
}

function renderGlobalTasksTable() {
    if (globalTasksCache.length === 0) {
        tasksTableContainer.innerHTML = `<p class="muted">אין משימות להצגה כרגע.</p>`;
        return;
    }

    const rows = [...globalTasksCache];
    const col = globalTasksSort.column;
    const dir = globalTasksSort.direction;

    rows.sort((a, b) => {
        if (col === "due_date") {
            // ברירת מחדל: לפי תאריך יעד קרוב. משימות בלי תאריך יעד תמיד בסוף,
            // ללא תלות בכיוון המיון (כפי שסוכם עם אבישג).
            const va = a.due_date, vb = b.due_date;
            if (!va && !vb) return 0;
            if (!va) return 1;
            if (!vb) return -1;
            const cmp = va.localeCompare(vb);
            return dir === "asc" ? cmp : -cmp;
        }
        const va = String(taskSortValue(a, col));
        const vb = String(taskSortValue(b, col));
        const cmp = va.localeCompare(vb, "he");
        return dir === "asc" ? cmp : -cmp;
    });

    const arrow = (c) => (col === c ? (dir === "asc" ? " ▲" : " ▼") : "");

    const rowsHtml = rows.map((t) => `
        <tr class="table-row ${t.status === TASK_STATUS.DONE ? "dim" : ""}">
            <td>
                <label class="checkbox-inline">
                    <input type="checkbox" data-action="toggle-global-task" data-id="${t.id}" ${t.status === TASK_STATUS.DONE ? "checked" : ""} />
                </label>
            </td>
            <td>
                <button type="button" class="btn-icon" data-action="open-task-client" data-client-id="${t.client_id}">
                    ${escapeHtml(globalTasksClientNames[t.client_id] || "לקוח לא ידוע")}
                </button>
            </td>
            <td>${escapeHtml(t.title)}</td>
            <td>${escapeHtml(t.stage_source || "-")}</td>
            <td>${t.due_date ? formatDate(t.due_date) : "ללא תאריך יעד"}</td>
        </tr>
    `).join("");

    tasksTableContainer.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th></th>
                    <th class="sortable" data-sort="client">לקוח${arrow("client")}</th>
                    <th class="sortable" data-sort="title">משימה${arrow("title")}</th>
                    <th class="sortable" data-sort="stage">שלב${arrow("stage")}</th>
                    <th class="sortable" data-sort="due_date">תאריך יעד${arrow("due_date")}</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;
}

tasksTableContainer.addEventListener("click", async (e) => {
    const sortHeader = e.target.closest("th.sortable");
    if (sortHeader) {
        const col = sortHeader.dataset.sort;
        if (globalTasksSort.column === col) {
            globalTasksSort.direction = globalTasksSort.direction === "asc" ? "desc" : "asc";
        } else {
            globalTasksSort = { column: col, direction: "asc" };
        }
        renderGlobalTasksTable();
        return;
    }

    const clientBtn = e.target.closest('[data-action="open-task-client"]');
    if (clientBtn) {
        switchView("clients");
        await openClientDetail(clientBtn.dataset.clientId);
    }
});

tasksTableContainer.addEventListener("change", async (e) => {
    const checkbox = e.target.closest('[data-action="toggle-global-task"]');
    if (!checkbox) return;

    const id = checkbox.dataset.id;
    const task = globalTasksCache.find((t) => t.id === id);
    if (!task) return;

    const newStatus = task.status === TASK_STATUS.DONE ? TASK_STATUS.OPEN : TASK_STATUS.DONE;
    const { error } = await client.from("tasks").update({ status: newStatus }).eq("id", id);
    if (error) {
        showToast("שגיאה בעדכון המשימה", "error");
        checkbox.checked = !checkbox.checked;
        return;
    }
    task.status = newStatus;
    renderGlobalTasksTable();
});

// ============================================================
// חלק ב' - משימות בתוך כרטיס הלקוח
// ============================================================

let currentClientTasks = [];

async function loadCurrentClientTasks(clientId) {
    const { data, error } = await client.from("tasks").select("*").eq("client_id", clientId);
    if (error) {
        currentClientTasks = [];
        return currentClientTasks;
    }
    currentClientTasks = data || [];
    return currentClientTasks;
}

function stageOrderIndex(stage) {
    const idx = TASK_STAGE_ORDER.indexOf(stage || "");
    return idx === -1 ? TASK_STAGE_ORDER.length : idx;
}

function renderClientTasksSection() {
    const groups = {};
    currentClientTasks.forEach((t) => {
        const key = t.stage_source || "";
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
    });

    const groupKeys = Object.keys(groups).sort((a, b) => stageOrderIndex(a) - stageOrderIndex(b));

    groupKeys.forEach((key) => {
        groups[key].sort((a, b) => {
            if (!a.due_date && !b.due_date) return 0;
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return a.due_date.localeCompare(b.due_date);
        });
    });

    const bodyHtml = groupKeys.length === 0
        ? `<p class="muted">אין עדיין משימות ללקוח זה. בחרי מסלול כדי ליצור משימות אוטומטית מהתבנית, או הוסיפי משימה ידנית.</p>`
        : groupKeys.map((key) => `
            <div class="task-group">
                ${key ? `<h4 class="task-group-title">${escapeHtml(key)}</h4>` : ""}
                ${groups[key].map((t) => renderTaskRow(t)).join("")}
            </div>
        `).join("");

    const extraHeader = `<button type="button" class="btn-small btn-ghost" data-action="add-task">+ הוספת משימה</button>`;
    return renderCollapsibleSection("tasks", "משימות", bodyHtml, { extraHeaderHtml: extraHeader });
}

function renderTaskRow(t) {
    const isDone = t.status === TASK_STATUS.DONE;
    const isOverdue = !isDone && t.reminder_active && t.due_date && t.due_date < todayISO();

    return `
        <div class="task-row ${isDone ? "task-row-done" : ""} ${isOverdue ? "task-row-overdue" : ""}">
            <label class="checkbox-inline">
                <input type="checkbox" data-action="toggle-task" data-id="${t.id}" ${isDone ? "checked" : ""} />
            </label>
            <span class="task-title">${escapeHtml(t.title)}</span>
            <input
                type="date"
                class="task-due-date"
                data-action="task-due-date"
                data-id="${t.id}"
                value="${t.due_date || ""}"
                title="תאריך יעד"
            />
            <button
                type="button"
                class="btn-icon task-reminder-toggle ${t.reminder_active ? "active" : ""}"
                data-action="toggle-reminder"
                data-id="${t.id}"
                title="תזכורת ויזואלית (כשעבר תאריך היעד, השורה תודגש)"
            >🔔</button>
            <button type="button" class="btn-icon" data-action="remove-task" data-id="${t.id}">הסרה</button>
        </div>
    `;
}

// ---------- אירועים בכרטיס הלקוח (מאזינים נפרדים על clientDetailView,
// לצד המאזינים של clients.js - namespaced ע"י data-action ייחודי) ----------

clientDetailView.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;

    if (action === "add-task") return openAddTaskModal();
    if (action === "remove-task") return removeTask(el.dataset.id);
    if (action === "toggle-reminder") return toggleTaskReminder(el.dataset.id);
});

clientDetailView.addEventListener("change", (e) => {
    const checkbox = e.target.closest('[data-action="toggle-task"]');
    if (checkbox) return toggleTaskStatus(checkbox.dataset.id, checkbox);

    const dateInput = e.target.closest('[data-action="task-due-date"]');
    if (dateInput) return updateTaskDueDate(dateInput.dataset.id, dateInput.value);
});

async function toggleTaskStatus(id, checkboxEl) {
    const task = currentClientTasks.find((t) => t.id === id);
    if (!task) return;

    const newStatus = task.status === TASK_STATUS.DONE ? TASK_STATUS.OPEN : TASK_STATUS.DONE;
    const { error } = await client.from("tasks").update({ status: newStatus }).eq("id", id);
    if (error) {
        showToast("שגיאה בעדכון המשימה", "error");
        if (checkboxEl) checkboxEl.checked = !checkboxEl.checked;
        return;
    }
    task.status = newStatus;
    renderClientDetail();
}

async function updateTaskDueDate(id, value) {
    const task = currentClientTasks.find((t) => t.id === id);
    if (!task) return;

    const newDate = value || null;
    const { error } = await client.from("tasks").update({ due_date: newDate }).eq("id", id);
    if (error) {
        showToast("שגיאה בעדכון תאריך היעד", "error");
        return;
    }
    task.due_date = newDate;
    renderClientDetail();
}

async function toggleTaskReminder(id) {
    const task = currentClientTasks.find((t) => t.id === id);
    if (!task) return;

    const newVal = !task.reminder_active;
    const { error } = await client.from("tasks").update({ reminder_active: newVal }).eq("id", id);
    if (error) {
        showToast("שגיאה בעדכון התזכורת", "error");
        return;
    }
    task.reminder_active = newVal;
    renderClientDetail();
}

function removeTask(id) {
    openConfirmModal(
        "האם להסיר את המשימה? הפעולה תמחק אותה סופית מהלקוח הזה (לא משפיעה על התבנית הכללית).",
        async () => {
            const { error } = await client.from("tasks").delete().eq("id", id);
            if (error) {
                showToast("שגיאה בהסרת המשימה", "error");
                return;
            }
            currentClientTasks = currentClientTasks.filter((t) => t.id !== id);
            showToast("המשימה הוסרה", "ok");
            renderClientDetail();
        },
        "כן, להסיר"
    );
}

function openAddTaskModal() {
    // רשימת הקבוצות הקיימות אצל הלקוח הזה + "משימות נוספות" כברירת מחדל
    const existingStages = [...new Set(currentClientTasks.map((t) => t.stage_source || "").filter(Boolean))];
    if (!existingStages.includes(AD_HOC_STAGE_LABEL)) existingStages.push(AD_HOC_STAGE_LABEL);

    const stageOptions = existingStages.map(
        (s) => `<option value="${escapeHtml(s)}" ${s === AD_HOC_STAGE_LABEL ? "selected" : ""}>${escapeHtml(s)}</option>`
    ).join("");

    openModal(`
        <h2>משימה חדשה</h2>
        <form id="add-task-form">
            <label for="new-task-title">שם המשימה *</label>
            <input type="text" id="new-task-title" required />

            <label for="new-task-stage">שייכות לקבוצה</label>
            <select id="new-task-stage">${stageOptions}</select>

            <label for="new-task-due">תאריך יעד</label>
            <input type="date" id="new-task-due" />

            <label for="new-task-desc">פירוט (לא חובה)</label>
            <textarea id="new-task-desc" rows="2"></textarea>

            <div class="modal-actions">
                <button type="button" class="btn-ghost" data-action="close-modal">ביטול</button>
                <button type="submit" class="btn-primary">הוספה</button>
            </div>
        </form>
    `);

    document.getElementById("add-task-form").addEventListener("submit", async (e) => {
        e.preventDefault();

        const payload = {
            client_id: currentClient.id,
            title: document.getElementById("new-task-title").value.trim(),
            description: document.getElementById("new-task-desc").value.trim() || null,
            due_date: document.getElementById("new-task-due").value || null,
            reminder_active: false,
            status: TASK_STATUS.OPEN,
            stage_source: document.getElementById("new-task-stage").value || AD_HOC_STAGE_LABEL,
        };

        const { data, error } = await client.from("tasks").insert(payload).select().single();
        if (error) {
            showToast("שגיאה בהוספת המשימה", "error");
            return;
        }

        currentClientTasks.push(data);
        showToast("המשימה נוספה", "ok");
        closeModal();
        renderClientDetail();
    });
}

// ---------- יצירה/מחיקה אוטומטית של משימות לפי מסלול ----------

// נקראת מ-clients.js בכל פעם ש-track_id נקבע/משתנה ללקוח.
// מוחקת מחיקה אמיתית את כל המשימות הקיימות של הלקוח, ויוצרת חדשות מהתבנית
// של המסלול החדש (חריג מכוון למדיניות "לא מוחקים" הכללית - סוכם עם אבישג).
async function regenerateTasksForClient(clientId, trackId) {
    await client.from("tasks").delete().eq("client_id", clientId);

    if (!trackId) return; // אין מסלול נבחר - אין תבנית ליצור ממנה, המשימות נשארות ריקות

    const { data: templates, error } = await client
        .from("task_templates")
        .select("*")
        .eq("track_id", trackId)
        .order("order_index");

    if (error || !templates || templates.length === 0) return;

    const newTasks = templates.map((tpl) => ({
        client_id: clientId,
        title: tpl.task_name,
        description: null,
        due_date: null,
        reminder_active: false,
        status: TASK_STATUS.OPEN,
        stage_source: tpl.stage_name || "",
    }));

    await client.from("tasks").insert(newTasks);
}
