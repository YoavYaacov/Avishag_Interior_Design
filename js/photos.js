// ============================================================
// גלריית תמונות (PHOTOS) - בתוך כרטיס הלקוח
// שתי גלריות נפרדות: תמונות מהייעוץ (consultation) ותמונות תוצאה סופית (result)
// אחסון: Supabase Storage, bucket פרטי בשם "client-photos" (ראו הוראות הקמה בסוף הקובץ)
// חייב להיטען אחרי js/clients.js (משתמש ב-clientDetailView שמוגדר שם).
// ============================================================

const PHOTOS_BUCKET = "client-photos";
const PHOTO_TYPE = { CONSULTATION: "consultation", RESULT: "result" };
const SIGNED_URL_TTL_SECONDS = 3600; // הבאקט פרטי - כתובת חתומה שנוצרת מחדש בכל פתיחת כרטיס לקוח

let currentClientPhotos = []; // כל תמונות הלקוח הנוכחי, כולל signed_url מחושב
let photosUploading = false; // מונע העלאות כפולות בלחיצה חוזרת

// ---------- טעינה ----------

async function loadCurrentClientPhotos(clientId) {
    const { data, error } = await client
        .from("photos")
        .select("*")
        .eq("client_id", clientId)
        .order("uploaded_at", { ascending: false });

    if (error) {
        currentClientPhotos = [];
        return;
    }

    const rows = data || [];

    // הבאקט פרטי -> לכל תמונה נוצרת signed URL בתוקף שעה, בכל טעינה מחדש
    await Promise.all(rows.map(async (p) => {
        const { data: signed, error: signError } = await client
            .storage
            .from(PHOTOS_BUCKET)
            .createSignedUrl(p.storage_url, SIGNED_URL_TTL_SECONDS);
        p.signed_url = signError ? null : signed.signedUrl;
    }));

    currentClientPhotos = rows;
}

// ---------- רינדור ----------

function renderPhotosSection() {
    const consultationPhotos = currentClientPhotos.filter((p) => p.type === PHOTO_TYPE.CONSULTATION);
    const resultPhotos = currentClientPhotos.filter((p) => p.type === PHOTO_TYPE.RESULT);

    return `
        <section class="detail-section">
            <div class="section-header">
                <h3>גלריית תמונות</h3>
            </div>
            ${renderPhotoGallery("תמונות מהייעוץ", PHOTO_TYPE.CONSULTATION, consultationPhotos)}
            ${renderPhotoGallery("תמונות תוצאה סופית", PHOTO_TYPE.RESULT, resultPhotos)}
        </section>
    `;
}

function renderPhotoGallery(title, type, photos) {
    const grid = photos.length
        ? `<div class="photo-grid">${photos.map((p) => renderPhotoThumb(p)).join("")}</div>`
        : `<p class="muted">אין עדיין תמונות בגלריה הזו.</p>`;

    return `
        <div class="photo-gallery" data-type="${type}">
            <div class="photo-gallery-header">
                <h4>${title}</h4>
                <label class="btn-small btn-ghost photo-upload-label">
                    + הוספת תמונות
                    <input
                        type="file"
                        accept="image/*"
                        multiple
                        class="hidden"
                        data-action="upload-photo"
                        data-type="${type}"
                    />
                </label>
            </div>
            ${grid}
        </div>
    `;
}

function renderPhotoThumb(p) {
    const starClass = p.is_portfolio_featured ? "photo-star active" : "photo-star";
    const img = p.signed_url
        ? `<img src="${p.signed_url}" alt="" loading="lazy" />`
        : `<div class="photo-thumb-error">שגיאה בטעינה</div>`;

    return `
        <div class="photo-thumb" data-id="${p.id}">
            ${img}
            <div class="photo-thumb-actions">
                <button
                    type="button"
                    class="${starClass}"
                    data-action="toggle-featured"
                    data-id="${p.id}"
                    title="${p.is_portfolio_featured ? "מוצג בפורטפוליו" : "סמני לתצוגה בפורטפוליו"}"
                >★</button>
                <button type="button" class="photo-delete" data-action="delete-photo" data-id="${p.id}" title="מחיקה">🗑</button>
            </div>
        </div>
    `;
}

// ---------- אירועים (delegation על clientDetailView, כמו שאר קטעי הכרטיס) ----------

clientDetailView.addEventListener("change", async (e) => {
    const el = e.target.closest('[data-action="upload-photo"]');
    if (!el || !el.files || !el.files.length) return;

    const files = Array.from(el.files);
    const type = el.dataset.type;
    el.value = ""; // מאפשר לבחור שוב את אותו קובץ בפעם הבאה

    await uploadPhotos(currentClient.id, type, files);
});

clientDetailView.addEventListener("click", async (e) => {
    const starBtn = e.target.closest('[data-action="toggle-featured"]');
    if (starBtn) {
        await togglePhotoFeatured(starBtn.dataset.id);
        return;
    }

    const delBtn = e.target.closest('[data-action="delete-photo"]');
    if (delBtn) {
        const id = delBtn.dataset.id;
        openConfirmModal("האם למחוק את התמונה? הפעולה בלתי הפיכה.", async () => {
            await deletePhoto(id);
        }, "כן, למחוק");
        return;
    }
});

// ---------- פעולות ----------

async function uploadPhotos(clientId, type, files) {
    if (photosUploading) return;
    photosUploading = true;

    let successCount = 0;
    let failCount = 0;

    for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${clientId}/${type}/${Date.now()}_${safeName}`;

        const { error: uploadError } = await client.storage.from(PHOTOS_BUCKET).upload(path, file);
        if (uploadError) {
            failCount++;
            continue;
        }

        const { error: insertError } = await client.from("photos").insert({
            client_id: clientId,
            type,
            storage_url: path,
            is_portfolio_featured: false,
            uploaded_at: todayISO(),
        });

        if (insertError) {
            // הקובץ הועלה אך הרשומה בטבלה נכשלה - מנקה כדי לא להשאיר קובץ יתום בלי רשומה
            await client.storage.from(PHOTOS_BUCKET).remove([path]);
            failCount++;
            continue;
        }

        successCount++;
    }

    photosUploading = false;

    if (successCount && !failCount) showToast(`הועלו ${successCount} תמונות בהצלחה`, "ok");
    else if (successCount && failCount) showToast(`הועלו ${successCount} תמונות, ${failCount} נכשלו`, "error");
    else showToast("העלאת התמונות נכשלה", "error");

    await loadCurrentClientPhotos(clientId);
    renderClientDetail();
}

async function togglePhotoFeatured(id) {
    const photo = currentClientPhotos.find((p) => p.id === id);
    if (!photo) return;

    const nextValue = !photo.is_portfolio_featured;
    const { error } = await client.from("photos").update({ is_portfolio_featured: nextValue }).eq("id", id);
    if (error) {
        showToast("שגיאה בעדכון סימון הפורטפוליו", "error");
        return;
    }

    photo.is_portfolio_featured = nextValue;
    renderClientDetail();
}

async function deletePhoto(id) {
    const photo = currentClientPhotos.find((p) => p.id === id);
    if (!photo) return;

    const { error: storageError } = await client.storage.from(PHOTOS_BUCKET).remove([photo.storage_url]);
    if (storageError) {
        showToast("שגיאה במחיקת הקובץ מהאחסון", "error");
        return;
    }

    const { error: dbError } = await client.from("photos").delete().eq("id", id);
    if (dbError) {
        showToast("הקובץ נמחק מהאחסון אך לא מהרשימה - רעננ/י את הדף", "error");
        return;
    }

    currentClientPhotos = currentClientPhotos.filter((p) => p.id !== id);
    showToast("התמונה נמחקה", "ok");
    renderClientDetail();
}
