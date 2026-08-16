// ============================================================
// מסלולים (TRACKS)
// רשימה קבועה בבסיס (הום סטיילינג / ליווי ממוקד / ליווי מלא), אך ניתנת
// להרחבה - אבישג יכולה להוסיף מסלול עתידי או לערוך תיאור בעצמה.
// אין שדה מחיר קבוע במכוון (המחיר תמיד משא-ומתן פר-לקוח).
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

newTrackBtn.addEventListener("click", () => openTrackForm(null));

function openTrackForm(existingTrack) {
    const isEdit = !!existingTrack;
    const t = existingTrack || { name: "", description: "" };

    openModal(`
        <h2>${isEdit ? "עריכת מסלול" : "מסלול חדש"}</h2>
        <form id="track-modal-form">
            <label for="track-name">שם המסלול *</label>
            <input type="text" id="track-name" required value="${escapeHtml(t.name)}" />

            <label for="track-description">תיאור כללי</label>
            <textarea id="track-description" rows="3">${escapeHtml(t.description || "")}</textarea>

            <div class="modal-actions">
                <button type="button" class="btn-ghost" data-action="close-modal">ביטול</button>
                <button type="submit" class="btn-primary">שמירה</button>
            </div>
        </form>
    `);

    document.getElementById("track-modal-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            name: document.getElementById("track-name").value.trim(),
            description: document.getElementById("track-description").value.trim() || null,
        };

        let error;
        if (isEdit) {
            ({ error } = await client.from("tracks").update(payload).eq("id", t.id));
        } else {
            ({ error } = await client.from("tracks").insert(payload));
        }

        if (error) {
            showToast("שגיאה בשמירת המסלול", "error");
            return;
        }

        showToast(isEdit ? "המסלול עודכן" : "המסלול נוצר", "ok");
        closeModal();
        loadTracksView();
    });
}
