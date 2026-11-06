# Phase 0 — security hotfix (do before any deploy)

You must do these yourself; they need your Google Cloud and git access.

1. **Rotate the Google API key** that appeared in `.env.example` of the old scraper. Create a new key, delete the old one.
2. **Restrict the new key**: API restriction = only the APIs you use (Places API (New), Geocoding); add an application restriction where possible.
3. **Cap quota**: Cloud Console > APIs & Services > Quotas, set daily caps per API; add a billing budget alert.
4. **Purge git history** if the old repo was ever pushed (`git filter-repo` or BFG), then force-push and treat the old key as burned regardless.
5. **Lock the Cloud Run service**: remove `allUsers` from the invoker role; callers authenticate with IAM / an ID token.
6. **Review `deploy-scraper.bat`** and every committed file for secrets; move secrets to Secret Manager.
7. Update the old `.env.example` to blank placeholders (see this repo's `.env.example`).
