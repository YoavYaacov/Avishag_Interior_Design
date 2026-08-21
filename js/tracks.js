// ============================================================
// מסלולים (TRACKS)
// רשימה קבועה בבסיס (הום סטיילינג / ליווי ממוקד / ליווי מלא), אך ניתנת
// להרחבה - אבישג יכולה להוסיף מסלול עתידי או לערוך תיאור בעצמה.
// אין שדה מחיר קבוע במכוון (המחיר תמיד משא-ומתן פר-לקוח).
//
// בהוספת מסלול חדש בלבד (לא בעריכת מסלול קיים) מוצג גם טופס פשוט
// ליצירת תבנית המשימות (TASK_TEMPLATES) של אותו מסלול - לפי דרישת שלב 4.
// אין מסך עריכה נפרד לתבניות הקיימות (הוחלט במפורש שלא נדרש).
// ============================================================

const tracksTableContainer = document.getElementById("tracks-table-container");
const newTrackBtn = document.getElementById("new-track-btn");

let tracksCache = [];
let tracksLoaded = false;

// טעינה עם קאש - כדי שכרטיס הלקוח יוכל להשתמש ברשימה בלי לטעון כל פעם מחדש
async function ensureTracksLoaded(forceRefresh = false) {
    if (tracksLoaded && !forceRefresh) return tracksCache;

    const { data, error } = await client.from("tracks").select("*").order("name");
    if (!error) {
        tracksCache = data || [];
        tracksLoaded = true;
    }
    return tracksCache;
}

async function loadTracksView() {
    tracksTableContainer.innerHTML = `<p class="muted">טוענת מסלולים...</p>`;
    await ensureTracksLoaded(true);
    renderTracksTable();
}

function renderTracksTable() {
    if (tracksCache.length === 0) {
        tracksTableContainer.innerHTML = `<p class="muted">אין עדיין מסלולים. לחצי על "מסלול חדש" כדי להוסיף.</p>`;
        return;
    }

    const rows = tracksCache.map((t) => `
        <tr class="table-row">
            <td>${escapeHtml(t.name)}</td>
            <td>${escapeHtml(t.description || "-")}</td>
            <td class="actions-cell">
                <button class="btn-icon" data-action="edit-track-row" data-id="${t.id}">עריכה</button>
            </td>
        </tr>
    `).join("");

    tracksTableContainer.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>שם המסלול</th>
                    <th>תיאור</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

tracksTableContainer.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="edit-track-row"]');
    if (!btn) return;
    const track = tracksCache.find((t) => t.id === btn.dataset.id);
    openTrackForm(track);
});

newTrackBtn.addEventListener("click", () => {
    newTrackTemplateRows = [{ stage: "", task: "" }]; // איפוס טופס תבנית המשימות לכל פתיחה חדשה
    openTrackForm(null);
});

// שורות תבנית המשימות הזמניות עבור טופס "מסלול חדש" בלבד
let newTrackTemplateRows = [{ stage: "", task: "" }];

function openTrackForm(existingTrack) {
    const isEdit = !!existingTrack;
    const t = existingTrack || { name: "", description: "" };

    const templateRowsHtml = !isEdit ? newTrackTemplateRows.map((row, i) => `
        <div class="dynamic-row" data-index="${i}">
            <input type="text" placeholder="שם שלב (לא חובה)" data-action="template-stage" data-index="${i}" value="${escapeHtml(row.stage)}" />
            <input type="text" placeholder="שם משימה" data-action="template-task" data-index="${i}" value="${escapeHtml(row.task)}" />
            <button type="button" class="btn-icon" data-action="remove-template-row" data-index="${i}">הסרה</button>
        </div>
    `).join("") : "";

    openModal(`
        <h2>${isEdit ? "עריכת מסלול" : "מסלול חדש"}</h2>
        <form id="track-modal-form">
            <label for="track-name">שם המסלול *</label>
            <input type="text" id="track-name" required value="${escapeHtml(t.name)}" />

            <label for="track-description">תיאור כללי</label>
            <textarea id="track-description" rows="3">${escapeHtml(t.description || "")}</textarea>

            ${!isEdit ? `
                <hr class="divider" />
                <label class="block-label">תבנית המשימות למסלול (לא חובה - אפשר להוסיף/לערוך בהמשך מול קלוד)</label>
                <p class="muted" style="margin-top:-10px">שם השלב קובע קיבוץ בכרטיס הלקוח (למשל "שלב א'"). השאירי ריק לרשימה שטוחה ללא קיבוץ.</p>
                <div id="template-rows-container">${templateRowsHtml}</div>
                <button type="button" class="btn-small btn-ghost" id="add-template-row-btn">+ הוספת משימה לתבנית</button>
            ` : ""}

            <div class="modal-actions">
                <button type="button" class="btn-ghost" data-action="close-modal">ביטול</button>
                <button type="submit" class="btn-primary">שמירה</button>
            </div>
        </form>
    `);

    if (!isEdit) {
        document.getElementById("add-template-row-btn").addEventListener("click", () => {
            newTrackTemplateRows.push({ stage: "", task: "" });
            openTrackForm(null);
        });

        document.getElementById("template-rows-container").addEventListener("click", (e) => {
            const btn = e.target.closest('[data-action="remove-template-row"]');
            if (!btn) return;
            newTrackTemplateRows.splice(Number(btn.dataset.index), 1);
            if (newTrackTemplateRows.length === 0) newTrackTemplateRows = [{ stage: "", task: "" }];
            openTrackForm(null);
        });

        document.getElementById("template-rows-container").addEventListener("input", (e) => {
            const el = e.target.closest("[data-action]");
            if (!el) return;
            const i = Number(el.dataset.index);
            if (el.dataset.action === "template-stage") newTrackTemplateRows[i].stage = el.value;
            if (el.dataset.action === "template-task") newTrackTemplateRows[i].task = el.value;
        });
    }

    document.getElementById("track-modal-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            name: document.getElementById("track-name").value.trim(),
            description: document.getElementById("track-description").value.trim() || null,
        };

        let error, newTrack;
        if (isEdit) {
            ({ error } = await client.from("tracks").update(payload).eq("id", t.id));
        } else {
            ({ data: newTrack, error } = await client.from("tracks").insert(payload).select().single());
        }

        if (error) {
            showToast("שגיאה בשמירת המסלול", "error");
            return;
        }

        if (!isEdit && newTrack) {
            const templateRows = newTrackTemplateRows
                .filter((r) => r.task.trim())
                .map((r, i) => ({
                    track_id: newTrack.id,
                    stage_name: r.stage.trim() || "",
                    task_name: r.task.trim(),
                    order_index: i + 1,
                }));

            if (templateRows.length > 0) {
                const { error: templatesError } = await client.from("task_templates").insert(templateRows);
                if (templatesError) {
                    showToast("המסלול נוצר, אך הייתה שגיאה בשמירת תבנית המשימות", "error");
                }
            }
        }

        showToast(isEdit ? "המסלול עודכן" : "המסלול נוצר", "ok");
        closeModal();
        tracksLoaded = false; // לרענן קאש כדי שמסלול חדש יופיע מיד בבחירת מסלול בכרטיס הלקוח
        loadTracksView();
    });
}
