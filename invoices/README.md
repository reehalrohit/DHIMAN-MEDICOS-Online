📂 invoices/
Drop your supplier bill CSV files here.
How it works
Open GitHub on your phone
Go to invoices/ folder
Tap Add file → Upload files
Upload the CSV from your supplier (Sood Medicine Trader format works directly)
Tap Commit changes
That's it. GitHub automatically:
Reads the new CSV
Finds medicines not already in the catalog
Adds them to the right category
Updates lib/medicines.js
Vercel redeploys your site in ~1 minute
Notes
You can upload multiple CSVs at once
Already-existing medicines are skipped automatically (no duplicates)
Unrecognised medicines go into General Medicines
Free gift rows and zero-price items are skipped
Old CSV files can stay here — they won't cause duplicates on re-run
