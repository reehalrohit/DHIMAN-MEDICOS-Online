DHIMAN MEDICOS — fixed catalog workflow

Replace:
.github/workflows/update-medicines.yml

Key fix:
- Uses the GitHub token supplied by actions/checkout.
- Does NOT overwrite origin with a hard-coded repository URL.
- Pushes with `git push origin HEAD:main`.
- Keeps the existing Supabase secret checks and invoice processing.

Required GitHub Repository secrets:
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

After committing this workflow:
GitHub → Actions → Update Medicine Catalog → Run workflow

The current repository already has a newer commit that corrects the remote URL, but the failed run shown in the screenshots was created from the older commit, so it must be run again from the corrected workflow.
