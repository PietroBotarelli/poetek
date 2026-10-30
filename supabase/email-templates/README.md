# Template email

I file di questa cartella corrispondono ai soli flussi email usati
dall'applicazione:

- `confirmation.html` → Authentication → Emails → Confirm sign up
- `recovery.html` → Authentication → Emails → Reset password

Incolla il contenuto nel dashboard Supabase senza sostituire
`{{ .ConfirmationURL }}`. Site URL e Redirect URL devono puntare all'origine
HTTPS esatta dell'applicazione.

I template non contengono credenziali. Il mittente e il provider SMTP si
configurano soltanto nel dashboard.
