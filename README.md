# Print Ledger — MVP

Plain HTML + CSS + JavaScript app with a Supabase backend. No build step.

## Setup (5 minutes)

1. Create a project at https://supabase.com.
2. Open **SQL Editor**, paste the contents of `schema.sql`, and run it.
3. Open **Project Settings → API**, copy the **Project URL** and **anon public key**.
4. Paste them into `config.js`.
5. Open `index.html` in a browser (or host the folder on Netlify / Vercel / GitHub Pages / any static host).

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App shell and navigation |
| `style.css` | Styling (responsive: sidebar on desktop, bottom nav on phones) |
| `app.js` | All six screens and Supabase calls |
| `config.js` | Your Supabase URL and anon key |
| `schema.sql` | Tables, balance view, access policies |

## Notes

- No login in this MVP (as specified). The `anon` key has full access through the RLS policies in `schema.sql`, so keep the site URL private, or add Supabase Auth later and tighten the policies.
- Each print entry stores its own `unit_price`, so changing the price in Settings never alters old entries.
- Voiding a payment sets `status = 'void'`; it is kept in history but ignored in balances.
- Extras beyond the 3-table spec: a small `settings` table (shared price/currency across devices), a `student_code` column (the optional Student ID), and a `student_balances` view.
