# Email templates

Supabase sends these emails, and they are set in the Supabase dashboard, not in the app.
To use one: Supabase dashboard > Authentication > Emails > Templates, pick the email,
set the subject, paste the file's HTML into "Message body" and save.

| File | Template in Supabase | Subject |
| --- | --- | --- |
| confirm-signup.html | Confirm signup | Confirm your email for Nextlyr Skill Tracker |
| reset-password.html | Reset password | Reset your Nextlyr Skill Tracker password |
| change-email.html | Change Email Address | Confirm your new email for Nextlyr Skill Tracker |

The logo is loaded from `https://nextlyrtech-skilltracker.vercel.app/icons/icon-192.png`.
If the site moves to another address, change that one line in each file.
Keep the `{{ .ConfirmationURL }}`, `{{ .Email }}` and `{{ .NewEmail }}` placeholders as they are.
