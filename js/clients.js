// ============================================================
// מסך לקוחות (CLIENTS) - רשימה + כרטיס לקוח מלא
// ============================================================

const clientsListView = document.getElementById("clients-list-view");
const clientDetailView = document.getElementById("client-detail-view");
const clientsTableContainer = document.getElementById("clients-table-container");
const clientsSearchInput = document.getElementById("clients-search");

let clientsCache = [];
let leadContactDateMap = {}; // client_id -> contact_date (מהליד המקורי)
let clientsSort = { column: "contact_date", direction: "desc" };
let clientsSearchTerm = "";

// ---------- טעינת רשימה ----------

async function loadClientsListView() {
    clientsListView.classList.remove("hidden");
    clientDetailView.classList.add("hidden");
    clientsTableContainer.innerHTML = `<p class="muted">טוענת לקוחות...</p>`;

    const [{ data: clientsData, error: clientsError }, { data: convertedLeads }] = await Promise.all([
        client.from("clients").select("*"),
        client.from("leads").select("contact_date, converted_client_id").eq("status", LEAD_STATUS.CONVERTED),
    ]);

    if (clientsError) {
        clientsTableContainer.innerHTML = `<p class="error-text">שגיאה בטעינת לקוחות: ${escapeHtml(clientsError.message)}</p>`;
        return;
    }

    leadContactDateMap = {};
    (convertedLeads || []).forEach((l) => {
        if (l.converted_client_id) leadContactDateMap[l.converted_client_id] = l.contact_date;
    });

    clientsCache = clientsData || [];
    renderClientsTable();
}

function sortValue(clientRow, column) {
    if (column === "contact_date") return leadContactDateMap[clientRow.id] || clientRow.created_at || "";
    return clientRow[column] || "";
}

function renderClientsTable() {
    let rows = [...clientsCache];

    if (clientsSearchTerm.trim()) {
        const term = clientsSearchTerm.trim().toLowerCase();
        rows = rows.filter((c) => (c.full_name || "").toLowerCase().includes(term));
    }

    rows.sort((a, b) => {
        const va = sortValue(a, clientsSort.column);
        const vb = sortValue(b, clientsSort.column);
        const cmp = String(va).localeCompare(String(vb), "he");
        return clientsSort.direction === "asc" ? cmp : -cmp;
    });

    if (rows.length === 0) {
        clientsTableContainer.innerHTML = `<p class="muted">אין לקוחות להצגה.</p>`;
        return;
    }

    const arrow = (col) => (clientsSort.column === col ? (clientsSort.direction === "asc" ? " ▲" : " ▼") : "");

    const rowsHtml = rows.map((c) => `
        <tr class="table-row clickable-row" data-action="open-client" data-id="${c.id}">
            <td>${escapeHtml(c.full_name)}</td>
            <td><span class="${statusBadgeClass(c.status)}">${escapeHtml(c.status)}</span></td>
            <td><span class="${courtBadgeClass(c.ball_in_court)}">${escapeHtml(c.ball_in_court)}</span></td>
            <td>${formatDate(leadContactDateMap[c.id] || c.created_at)}</td>
        </tr>
    `).join("");

    clientsTableContainer.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th class="sortable" data-sort="full_name">שם${arrow("full_name")}</th>
                    <th class="sortable" data-sort="status">סטטוס${arrow("status")}</th>
                    <th class="sortable" data-sort="ball_in_court">אצל מי הכדור${arrow("ball_in_court")}</th>
                    <th class="sortable" data-sort="contact_date">תאריך פנייה ראשונית${arrow("contact_date")}</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;
}

clientsTableContainer.addEventListener("click", (e) => {
    const sortHeader = e.target.closest("th.sortable");
    if (sortHeader) {
        const col = sortHeader.dataset.sort;
        if (clientsSort.column === col) {
            clientsSort.direction = clientsSort.direction === "asc" ? "desc" : "asc";
        } else {
            clientsSort = { column: col, direction: "asc" };
        }
        renderClientsTable();
        return;
    }

    const row = e.target.closest('[data-action="open-client"]');
    if (row) openClientDetail(row.dataset.id);
});

clientsSearchInput.addEventListener("input", (e) => {
    clientsSearchTerm = e.target.value;
    renderClientsTable();
});

// ---------- כרטיס לקוח ----------

let currentClient = null;
let editingSections = new Set();
let homeDraft = null;

const HOME_FIXED_SPACES = [
    { key: "living_room", label: "סלון" },
    { key: "kitchen", label: "מטבח" },
    { key: "office", label: "חדר עבודה" },
    { key: "yard", label: "חצר/מרפסת" },
    { key: "storage", label: "מחסן" },
];

const BEDROOM_TYPES = ["הורים", "רגיל"];
const BATHROOM_TYPES = ["הורים (מקלחון)", "ילדים/משפחתי (אמבט)", "אחר"];

function parseJSONField(raw, makeEmpty, wrapLegacyText) {
    if (!raw) return makeEmpty();
    try {
        return JSON.parse(raw);
    } catch {
        return wrapLegacyText(raw); // legacy plain-text value -> preserved inside the new structure
    }
}

function emptyRoomTypes() {
    const fixed = {};
    HOME_FIXED_SPACES.forEach((s) => (fixed[s.key] = false));
    return { fixed, bedrooms: [], bathrooms: [], other: [] };
}

function emptyFamilyTraits() {
    return { pets: { has: false, type: "" }, kids: { has: false, ages: "" }, hosts_a_lot: false, notes: "" };
}

function emptyPreferredStyle() {
    return { styles: [], notes: "" };
}

function summarizeRoomTypes(rt) {
    const parts = [];
    HOME_FIXED_SPACES.forEach((s) => { if (rt.fixed[s.key]) parts.push(s.label); });
    if (rt.bedrooms.length) {
        const master = rt.bedrooms.filter((b) => b.type === "הורים").length;
        const regular = rt.bedrooms.filter((b) => b.type === "רגיל").length;
        const closets = rt.bedrooms.filter((b) => b.walk_in_closet).length;
        let txt = `${rt.bedrooms.length} חדרי שינה`;
        const detail = [];
        if (master) detail.push(`${master} הורים`);
        if (regular) detail.push(`${regular} רגילים`);
        if (closets) detail.push(`${closets} עם חדר ארונות`);
        if (detail.length) txt += ` (${detail.join(", ")})`;
        parts.push(txt);
    }
    if (rt.bathrooms.length) {
        parts.push(`${rt.bathrooms.length} חדרי רחצה (${rt.bathrooms.map((b) => b.type).join(", ")})`);
    }
    rt.other.forEach((o) => parts.push(o));
    return parts.length ? parts.join(" · ") : "טרם הוזן";
}

function countRooms(rt) {
    const fixedCount = HOME_FIXED_SPACES.filter((s) => rt.fixed[s.key]).length;
    return fixedCount + rt.bedrooms.length + rt.bathrooms.length + rt.other.length;
}

function summarizeFamilyTraits(ft) {
    const parts = [];
    parts.push(ft.pets.has ? `חיות מחמד${ft.pets.type ? " (" + ft.pets.type + ")" : ""}` : "אין חיות מחמד");
    parts.push(ft.kids.has ? `ילדים${ft.kids.ages ? " (גילאים: " + ft.kids.ages + ")" : ""}` : "אין ילדים");
    parts.push(ft.hosts_a_lot ? "מארחים הרבה" : "לא מארחים הרבה");
    if (ft.notes) parts.push(ft.notes);
    return parts.join(" · ");
}

function summarizeStyle(st) {
    const parts = [];
    if (st.styles.length) parts.push(st.styles.join(", "));
    if (st.notes) parts.push(st.notes);
    return parts.length ? parts.join(" · ") : "טרם נבחר";
}

async function openClientDetail(id) {
    await ensureTracksLoaded();
    const { data, error } = await client.from("clients").select("*").eq("id", id).single();
    if (error) {
        showToast("שגיאה בטעינת כרטיס הלקוח", "error");
        return;
    }
    currentClient = data;
    editingSections = new Set();
    homeDraft = null;

    clientsListView.classList.add("hidden");
    clientDetailView.classList.remove("hidden");
    renderClientDetail();
}

function backToClientsList() {
    clientDetailView.classList.add("hidden");
    clientsListView.classList.remove("hidden");
    loadClientsListView();
}

function renderClientDetail() {
    const c = currentClient;
    const roomTypes = parseJSONField(c.room_types, emptyRoomTypes, (raw) => ({ ...emptyRoomTypes(), other: [raw] }));
    const familyTraits = parseJSONField(c.family_traits, emptyFamilyTraits, (raw) => ({ ...emptyFamilyTraits(), notes: raw }));
    const preferredStyle = parseJSONField(c.preferred_style, emptyPreferredStyle, (raw) => ({ ...emptyPreferredStyle(), notes: raw }));

    clientDetailView.innerHTML = `
        <div class="detail-header">
            <button class="btn-ghost" data-action="back-to-clients">→ חזרה לרשימה</button>
            <h2>${escapeHtml(c.full_name)}</h2>
            <span class="${statusBadgeClass(c.status)}">${escapeHtml(c.status)}</span>
            <span class="${courtBadgeClass(c.ball_in_court)}">אצל: ${escapeHtml(c.ball_in_court)}</span>
        </div>

        ${renderBasicSection(c)}
        ${renderStatusSection(c)}
        ${renderHomeSection(c, roomTypes, familyTraits, preferredStyle)}
        ${renderTrackSection(c)}
    `;
}

// ---------- מסלול ותמחור ----------

function renderTrackSection(c) {
    const editing = editingSections.has("track");

    if (!editing) {
        const track = tracksCache.find((t) => t.id === c.track_id);
        const priceDisplay = c.total_project_price
            ? `₪${Number(c.total_project_price).toLocaleString("he-IL")}`
            : "-";

        return `
            <section class="detail-section">
                <div class="section-header">
                    <h3>מסלול ותמחור</h3>
                    <button class="btn-small btn-ghost" data-action="edit-track">עריכה</button>
                </div>
                <div class="detail-grid">
                    <div><span class="detail-label">מסלול</span><span>${escapeHtml(track ? track.name : "טרם נבחר מסלול")}</span></div>
                    <div><span class="detail-label">מחיר כולל</span><span>${priceDisplay}</span></div>
                    <div class="span-2"><span class="detail-label">הערות/דיוקים למסלול</span><span>${escapeHtml(c.track_notes || "-")}</span></div>
                </div>
            </section>
        `;
    }

    const trackOptions = tracksCache.map(
        (t) => `<option value="${t.id}" ${c.track_id === t.id ? "selected" : ""}>${escapeHtml(t.name)}</option>`
    ).join("");

    return `
        <section class="detail-section">
            <h3>מסלול ותמחור</h3>
            <form id="track-form">
                <label for="track-select">מסלול</label>
                <select id="track-select">
                    <option value="">לא נבחר</option>
                    ${trackOptions}
                </select>

                <label for="track-price">מחיר כולל שסוכם (₪)</label>
                <input type="number" id="track-price" min="0" step="1" value="${c.total_project_price ?? ""}" />

                <label for="track-notes-input">הערות/דיוקים למסלול</label>
                <textarea id="track-notes-input" rows="3" placeholder="לדוגמה: יום רכישות נוסף בתשלום">${escapeHtml(c.track_notes || "")}</textarea>

                <div class="modal-actions">
                    <button type="button" class="btn-ghost" data-action="cancel-track">ביטול</button>
                    <button type="submit" class="btn-primary">שמירה</button>
                </div>
            </form>
        </section>
    `;
}

// ---------- פרטים בסיסיים ----------

function renderBasicSection(c) {
    const editing = editingSections.has("basic");

    if (!editing) {
        return `
            <section class="detail-section">
                <div class="section-header">
                    <h3>פרטים בסיסיים</h3>
                    <button class="btn-small btn-ghost" data-action="edit-basic">עריכה</button>
                </div>
                <div class="detail-grid">
                    <div><span class="detail-label">טלפון</span><span class="ltr-cell">${escapeHtml(c.phone)}</span></div>
                    <div><span class="detail-label">מייל</span><span>${escapeHtml(c.email || "-")}</span></div>
                    <div><span class="detail-label">כתובת</span><span>${escapeHtml(c.address || "-")}</span></div>
                </div>
            </section>
        `;
    }

    return `
        <section class="detail-section">
            <h3>פרטים בסיסיים</h3>
            <form id="basic-form">
                <label for="basic-phone">טלפון</label>
                <input type="tel" id="basic-phone" value="${escapeHtml(c.phone)}" dir="ltr" required />
                <label for="basic-email">מייל</label>
                <input type="email" id="basic-email" value="${escapeHtml(c.email || "")}" />
                <label for="basic-address">כתובת</label>
                <input type="text" id="basic-address" value="${escapeHtml(c.address || "")}" />
                <div class="modal-actions">
                    <button type="button" class="btn-ghost" data-action="cancel-basic">ביטול</button>
                    <button type="submit" class="btn-primary">שמירה</button>
                </div>
            </form>
        </section>
    `;
}

// ---------- סטטוס ואצל מי הכדור ----------

function renderStatusSection(c) {
    const editing = editingSections.has("status");

    if (!editing) {
        return `
            <section class="detail-section">
                <div class="section-header">
                    <h3>סטטוס ותהליך</h3>
                    <button class="btn-small btn-ghost" data-action="edit-status">עריכה</button>
                </div>
            </section>
        `;
    }

    const statusOptions = CLIENT_STATUSES.map(
        (s) => `<option value="${s}" ${c.status === s ? "selected" : ""}>${s}</option>`
    ).join("");

    return `
        <section class="detail-section">
            <h3>סטטוס ותהליך</h3>
            <form id="status-form">
                <label for="status-select">סטטוס</label>
                <select id="status-select">${statusOptions}</select>
                <label for="court-select">אצל מי הכדור</label>
                <select id="court-select">
                    <option value="${BALL_IN_COURT.AVISHAG}" ${c.ball_in_court === BALL_IN_COURT.AVISHAG ? "selected" : ""}>אבישג</option>
                    <option value="${BALL_IN_COURT.CLIENT}" ${c.ball_in_court === BALL_IN_COURT.CLIENT ? "selected" : ""}>לקוח</option>
                </select>
                <div class="modal-actions">
                    <button type="button" class="btn-ghost" data-action="cancel-status">ביטול</button>
                    <button type="submit" class="btn-primary">שמירה</button>
                </div>
            </form>
        </section>
    `;
}

// ---------- פרטי הבית ----------

function renderHomeSection(c, roomTypes, familyTraits, preferredStyle) {
    const editing = editingSections.has("home");

    if (!editing) {
        return `
            <section class="detail-section">
                <div class="section-header">
                    <h3>פרטי הבית</h3>
                    <button class="btn-small btn-ghost" data-action="edit-home">עריכה</button>
                </div>
                <div class="detail-grid">
                    <div><span class="detail-label">מספר נפשות</span><span>${c.household_members ?? "-"}</span></div>
                    <div><span class="detail-label">מספר חללים</span><span>${c.rooms_count ?? "-"}</span></div>
                    <div class="span-2"><span class="detail-label">פירוט חללים</span><span>${escapeHtml(summarizeRoomTypes(roomTypes))}</span></div>
                    <div class="span-2"><span class="detail-label">אופי משפחתי</span><span>${escapeHtml(summarizeFamilyTraits(familyTraits))}</span></div>
                    <div class="span-2"><span class="detail-label">סגנון מועדף</span><span>${escapeHtml(summarizeStyle(preferredStyle))}</span></div>
                    <div class="span-2"><span class="detail-label">גוונים וחומריות</span><span>${escapeHtml(c.color_materials || "-")}</span></div>
                </div>
            </section>
        `;
    }

    // מצב עריכה - עובדים על עותק זמני (homeDraft) עד לשמירה
    if (!homeDraft) {
        homeDraft = {
            household_members: c.household_members || "",
            room_types: JSON.parse(JSON.stringify(roomTypes)),
            family_traits: JSON.parse(JSON.stringify(familyTraits)),
            preferred_style: JSON.parse(JSON.stringify(preferredStyle)),
            color_materials: c.color_materials || "",
        };
    }

    const fixedCheckboxes = HOME_FIXED_SPACES.map((s) => `
        <label class="checkbox-pill">
            <input type="checkbox" data-action="toggle-fixed" data-key="${s.key}" ${homeDraft.room_types.fixed[s.key] ? "checked" : ""} />
            ${s.label}
        </label>
    `).join("");

    const bedroomRows = homeDraft.room_types.bedrooms.map((b, i) => `
        <div class="dynamic-row" data-index="${i}">
            <select data-action="bedroom-type" data-index="${i}">
                ${BEDROOM_TYPES.map((t) => `<option value="${t}" ${b.type === t ? "selected" : ""}>${t}</option>`).join("")}
            </select>
            <label class="checkbox-inline">
                <input type="checkbox" data-action="bedroom-closet" data-index="${i}" ${b.walk_in_closet ? "checked" : ""} />
                חדר ארונות
            </label>
            <button type="button" class="btn-icon" data-action="remove-bedroom" data-index="${i}">הסרה</button>
        </div>
    `).join("");

    const bathroomRows = homeDraft.room_types.bathrooms.map((b, i) => `
        <div class="dynamic-row" data-index="${i}">
            <select data-action="bathroom-type" data-index="${i}">
                ${BATHROOM_TYPES.map((t) => `<option value="${t}" ${b.type === t ? "selected" : ""}>${t}</option>`).join("")}
            </select>
            <button type="button" class="btn-icon" data-action="remove-bathroom" data-index="${i}">הסרה</button>
        </div>
    `).join("");

    const otherRows = homeDraft.room_types.other.map((val, i) => `
        <div class="dynamic-row" data-index="${i}">
            <input type="text" data-action="other-space-text" data-index="${i}" value="${escapeHtml(val)}" placeholder="חלל נוסף..." />
            <button type="button" class="btn-icon" data-action="remove-other-space" data-index="${i}">הסרה</button>
        </div>
    `).join("");

    const styleChips = STYLE_OPTIONS.map((s) => `
        <label class="chip ${homeDraft.preferred_style.styles.includes(s) ? "chip-selected" : ""}">
            <input type="checkbox" class="hidden" data-action="toggle-style" data-style="${s}" ${homeDraft.preferred_style.styles.includes(s) ? "checked" : ""} />
            ${s}
        </label>
    `).join("");

    return `
        <section class="detail-section">
            <h3>פרטי הבית</h3>
            <div id="home-edit-form">
                <label for="home-members">מספר נפשות בבית</label>
                <input type="number" id="home-members" min="0" value="${escapeHtml(homeDraft.household_members)}" />

                <label class="block-label">חללים קבועים</label>
                <div class="pill-row">${fixedCheckboxes}</div>

                <label class="block-label">חדרי שינה</label>
                <div id="bedrooms-list">${bedroomRows}</div>
                <button type="button" class="btn-small btn-ghost" data-action="add-bedroom">+ הוספת חדר שינה</button>

                <label class="block-label">חדרי רחצה</label>
                <div id="bathrooms-list">${bathroomRows}</div>
                <button type="button" class="btn-small btn-ghost" data-action="add-bathroom">+ הוספת חדר רחצה</button>

                <label class="block-label">חללים נוספים</label>
                <div id="other-spaces-list">${otherRows}</div>
                <button type="button" class="btn-small btn-ghost" data-action="add-other-space">+ הוספת חלל אחר</button>

                <hr class="divider" />

                <label class="block-label">אופי משפחתי</label>
                <label class="toggle-row">
                    <span>חיות מחמד</span>
                    <input type="checkbox" class="switch" data-action="toggle-pets" ${homeDraft.family_traits.pets.has ? "checked" : ""} />
                </label>
                ${homeDraft.family_traits.pets.has ? `
                    <input type="text" id="pets-type" placeholder="איזה חיה?" value="${escapeHtml(homeDraft.family_traits.pets.type)}" data-action="pets-type" />
                ` : ""}

                <label class="toggle-row">
                    <span>ילדים</span>
                    <input type="checkbox" class="switch" data-action="toggle-kids" ${homeDraft.family_traits.kids.has ? "checked" : ""} />
                </label>
                ${homeDraft.family_traits.kids.has ? `
                    <input type="text" id="kids-ages" placeholder="גילאים" value="${escapeHtml(homeDraft.family_traits.kids.ages)}" data-action="kids-ages" />
                ` : ""}

                <label class="toggle-row">
                    <span>מארחים הרבה</span>
                    <input type="checkbox" class="switch" data-action="toggle-hosts" ${homeDraft.family_traits.hosts_a_lot ? "checked" : ""} />
                </label>

                <label for="family-notes">הערות נוספות על אופי המשפחה</label>
                <textarea id="family-notes" rows="2" data-action="family-notes">${escapeHtml(homeDraft.family_traits.notes)}</textarea>

                <hr class="divider" />

                <label class="block-label">סגנון עיצובי מועדף</label>
                <div class="pill-row">${styleChips}</div>
                <label for="style-notes">דיוקים / ניואנסים בסגנון</label>
                <textarea id="style-notes" rows="2" data-action="style-notes">${escapeHtml(homeDraft.preferred_style.notes)}</textarea>

                <label for="color-materials">גוונים וחומריות</label>
                <textarea id="color-materials" rows="2" data-action="color-materials">${escapeHtml(homeDraft.color_materials)}</textarea>

                <div class="modal-actions">
                    <button type="button" class="btn-ghost" data-action="cancel-home">ביטול</button>
                    <button type="button" class="btn-primary" data-action="save-home">שמירה</button>
                </div>
            </div>
        </section>
    `;
}

// ---------- אירועים בכרטיס הלקוח (delegation יחיד) ----------

clientDetailView.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;

    if (action === "back-to-clients") return backToClientsList();

    if (action === "edit-basic") { editingSections.add("basic"); return renderClientDetail(); }
    if (action === "cancel-basic") { editingSections.delete("basic"); return renderClientDetail(); }

    if (action === "edit-status") { editingSections.add("status"); return renderClientDetail(); }
    if (action === "cancel-status") { editingSections.delete("status"); return renderClientDetail(); }

    if (action === "edit-home") { editingSections.add("home"); homeDraft = null; return renderClientDetail(); }
    if (action === "cancel-home") { editingSections.delete("home"); homeDraft = null; return renderClientDetail(); }

    if (action === "edit-track") { await ensureTracksLoaded(); editingSections.add("track"); return renderClientDetail(); }
    if (action === "cancel-track") { editingSections.delete("track"); return renderClientDetail(); }

    if (action === "add-bedroom") {
        homeDraft.room_types.bedrooms.push({ type: "רגיל", walk_in_closet: false });
        return renderClientDetail();
    }
    if (action === "remove-bedroom") {
        homeDraft.room_types.bedrooms.splice(Number(el.dataset.index), 1);
        return renderClientDetail();
    }
    if (action === "add-bathroom") {
        homeDraft.room_types.bathrooms.push({ type: BATHROOM_TYPES[0] });
        return renderClientDetail();
    }
    if (action === "remove-bathroom") {
        homeDraft.room_types.bathrooms.splice(Number(el.dataset.index), 1);
        return renderClientDetail();
    }
    if (action === "add-other-space") {
        homeDraft.room_types.other.push("");
        return renderClientDetail();
    }
    if (action === "remove-other-space") {
        homeDraft.room_types.other.splice(Number(el.dataset.index), 1);
        return renderClientDetail();
    }

    if (action === "save-home") return saveHomeSection();
});

// שינויים בתוך טפסים (checkbox/select/input) - delegation על change
clientDetailView.addEventListener("change", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || !homeDraft) return;
    const action = el.dataset.action;

    if (action === "toggle-fixed") homeDraft.room_types.fixed[el.dataset.key] = el.checked;
    if (action === "bedroom-type") homeDraft.room_types.bedrooms[Number(el.dataset.index)].type = el.value;
    if (action === "bedroom-closet") homeDraft.room_types.bedrooms[Number(el.dataset.index)].walk_in_closet = el.checked;
    if (action === "bathroom-type") homeDraft.room_types.bathrooms[Number(el.dataset.index)].type = el.value;
    if (action === "toggle-style") {
        const styles = homeDraft.preferred_style.styles;
        const idx = styles.indexOf(el.dataset.style);
        if (el.checked && idx === -1) styles.push(el.dataset.style);
        if (!el.checked && idx !== -1) styles.splice(idx, 1);
        el.closest(".chip").classList.toggle("chip-selected", el.checked);
    }

    if (action === "toggle-pets") { homeDraft.family_traits.pets.has = el.checked; renderClientDetail(); }
    if (action === "toggle-kids") { homeDraft.family_traits.kids.has = el.checked; renderClientDetail(); }
    if (action === "toggle-hosts") homeDraft.family_traits.hosts_a_lot = el.checked;
});

// קלט חופשי (input/textarea) - שומר ל-draft בלי לרנדר מחדש כדי לא לאבד פוקוס
clientDetailView.addEventListener("input", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || !homeDraft) return;
    const action = el.dataset.action;

    if (action === "other-space-text") homeDraft.room_types.other[Number(el.dataset.index)] = el.value;
    if (action === "pets-type") homeDraft.family_traits.pets.type = el.value;
    if (action === "kids-ages") homeDraft.family_traits.kids.ages = el.value;
    if (action === "family-notes") homeDraft.family_traits.notes = el.value;
    if (action === "style-notes") homeDraft.preferred_style.notes = el.value;
    if (action === "color-materials") homeDraft.color_materials = el.value;
    if (el.id === "home-members") homeDraft.household_members = el.value;
});

// טפסים עם submit רגיל (basic-form, status-form)
clientDetailView.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (e.target.id === "basic-form") {
        const payload = {
            phone: document.getElementById("basic-phone").value.trim(),
            email: document.getElementById("basic-email").value.trim() || null,
            address: document.getElementById("basic-address").value.trim() || null,
        };
        const { error } = await client.from("clients").update(payload).eq("id", currentClient.id);
        if (error) { showToast("שגיאה בשמירה", "error"); return; }
        Object.assign(currentClient, payload);
        editingSections.delete("basic");
        showToast("הפרטים נשמרו", "ok");
        renderClientDetail();
    }

    if (e.target.id === "status-form") {
        const payload = {
            status: document.getElementById("status-select").value,
            ball_in_court: document.getElementById("court-select").value,
        };
        const { error } = await client.from("clients").update(payload).eq("id", currentClient.id);
        if (error) { showToast("שגיאה בשמירה", "error"); return; }
        Object.assign(currentClient, payload);
        editingSections.delete("status");
        showToast("הסטטוס עודכן", "ok");
        renderClientDetail();
        loadClientsListView();
    }

    if (e.target.id === "track-form") {
        const priceRaw = document.getElementById("track-price").value;
        const payload = {
            track_id: document.getElementById("track-select").value || null,
            total_project_price: priceRaw === "" ? null : Number(priceRaw),
            track_notes: document.getElementById("track-notes-input").value.trim() || null,
        };
        const { error } = await client.from("clients").update(payload).eq("id", currentClient.id);
        if (error) { showToast("שגיאה בשמירה", "error"); return; }
        Object.assign(currentClient, payload);
        editingSections.delete("track");
        showToast("פרטי המסלול נשמרו", "ok");
        renderClientDetail();
    }
});

async function saveHomeSection() {
    const payload = {
        household_members: homeDraft.household_members === "" ? null : Number(homeDraft.household_members),
        room_types: JSON.stringify(homeDraft.room_types),
        rooms_count: countRooms(homeDraft.room_types),
        family_traits: JSON.stringify(homeDraft.family_traits),
        preferred_style: JSON.stringify(homeDraft.preferred_style),
        color_materials: homeDraft.color_materials.trim() || null,
    };

    const { error } = await client.from("clients").update(payload).eq("id", currentClient.id);
    if (error) {
        showToast("שגיאה בשמירת פרטי הבית", "error");
        return;
    }

    Object.assign(currentClient, payload);
    editingSections.delete("home");
    homeDraft = null;
    showToast("פרטי הבית נשמרו", "ok");
    renderClientDetail();
}
