# Privacy

Openvibes is designed for local-first operation. Job prompts and metadata are stored in a local SQLite database. Generated media is intended to be stored in a local output directory. The current blocked Meta provider makes no Meta generation request and does not upload prompts or reference images.

Future provider integrations must document transmitted data, destination, retention, and whether the provider uses data for model improvement.


## Retention and request counters

Use `openvibes cleanup --older-than-days N` to preview older job and asset records. Add `--yes` to delete them and media files safely located inside the configured output directory. Cleanup is manual; Openvibes does not schedule deletion automatically. Protect and expire backups separately.

Openvibes stores provider request counts by provider and UTC date to enforce local request quotas. It does not store provider credentials in this counter and does not treat request counts as monetary usage. It also records operational audit metadata for job transitions, saved assets, provider request reservations and generation slots. Audit details exclude prompts, credentials, custom workflow bodies and local paths; the trail is not tamper-proof and is pruned by manual retention cleanup.
