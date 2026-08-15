# מערכת ניהול לקוחות - אבישג (עיצוב פנים)

שלד ראשוני (שלב 1 - תשתית). אתר סטטי (HTML/CSS/JS ללא build step), מתחבר ל-Supabase.

## מה יש כאן כרגע

- `supabase/schema.sql` - סכימת בסיס הנתונים המלאה (14 טבלאות + RLS). **מריצים פעם אחת** ב-SQL Editor של Supabase.
- `index.html` + `css/style.css` + `js/` - מסך התחברות (Supabase Auth) ובדיקת חיבור לכל הטבלאות. עדיין לא מסך עבודה אמיתי - זה יבוא בשלבים הבאים.

## הקמה (חד פעמי)

1. **Supabase:** צרו פרויקט חדש. לכו ל-SQL Editor, הדביקו את כל התוכן של `supabase/schema.sql` והריצו.
2. **מפתחות:** ב-Project Settings → API, העתיקו את ה-`Project URL` וה-`anon public key` לתוך `js/config.js` (מחליפים את הפלייסהולדרים).
3. **משתמש:** ב-Authentication → Users → Add User, צרו משתמש עם האימייל של אבישג וסיסמה.
4. **GitHub Pages:** לאחר שהקוד בריפו, Settings → Pages → Deploy from branch → main → root.

## מבנה טבלאות

ראו `avishag-db-erd.mermaid` (במסמך האב) לתרשים היחסים המלא. שם כל הטבלאות זהה 1:1 לשמות בקובץ ה-SQL (lowercase, snake_case).

## מה הלאה

לפי מסמך האב, השלב הבא (2) הוא מסכי LEADS ו-CLIENTS: טופס יצירה/עריכת לקוח ומסך רשימת לקוחות.
