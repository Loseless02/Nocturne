# Nocturne

A fast, local password manager for Windows. Dark, glassy, keyboard-first, built for one job: get the right password onto your clipboard in under a second.

**Download:** [Nocturne.exe](https://github.com/Loseless02/Nocturne/releases/latest) — a single portable exe for Windows 10/11 (uses the built-in WebView2). Nothing to install.

## Fast copy

- `Ctrl+Shift+Space` from any app opens Nocturne with the search focused. Type a few letters, press `Enter`, and the password is copied and the window hides again.
- `Shift+Enter` copies the username or email, `Alt+Enter` the live 2FA code, `Ctrl+1`…`9` the password of result 1 to 9.
- Every row has one-click copy buttons for password, login and 2FA code. Double-click a row to copy its password.
- The most-used logins sort to the top.
- Copied secrets are cleared from the clipboard after 20 s (configurable) and kept out of Windows clipboard history and cloud clipboard.

## What it stores

Service name, website, username, email, phone (several per login if you need them), password, 2FA secret (shows live 6-digit codes), backup/recovery codes (with used/unused tracking), custom fields such as User ID, ID number, customer number or PIN (each can be hidden), tags, notes, favorites, and password history.

## Adding a login

`Ctrl+N`, type the service (popular sites autocomplete their website), `Enter`, type the login (Nocturne detects email, phone or username), `Enter` (a strong password is generated if the field is empty), `Enter` saves.

## Generators

- **Passwords:** *Spit* (default) mixes real words, numbers and symbols, for example `Velvet-Harbor-472-Mango!`. Also passphrase, pronounceable, classic random and PIN. Strength and estimated crack time are shown live.
- **Nicknames:** 17 themes (gamer, cyber, fantasy, dark, cute, mythic, space, Anatolian, Japanese…), five syllable engines, a dozen name patterns, build-around-a-word, formats, numbers, l33t and gamer flair.

## Security

- Vault: one file, encrypted with XChaCha20-Poly1305. The key comes from your master password via Argon2id (64 MiB, 3 passes). The file header is authenticated, and the previous version is kept as `vault.noct.bak`.
- Auto-lock after inactivity (default 5 min). The lock timer runs in the Rust backend, so it still fires while the window is hidden. `Ctrl+L` locks immediately.
- Security page: breached, weak, reused and old passwords, plus 2FA coverage.
  - Password breach check uses Have I Been Pwned's k-anonymity API. Only the first 5 characters of the SHA-1 hash are sent.
  - Email breach check uses XposedOrNot and runs only when you click it, because the address itself is sent.
  - Phone numbers have no public breach database, so they only get reuse checks.
- No account, no sync, no telemetry. The only network calls are the breach checks above.

Vault location: `%APPDATA%\dev.atherion.nocturne\vault.noct`. There is no recovery if you forget the master password.

## Import / export

Import CSV from Chrome, Edge, Brave, Firefox, Bitwarden, 1Password, LastPass or Proton Pass, Bitwarden JSON, or a Nocturne backup. Export an encrypted `.noct` backup, or plain JSON/CSV for moving to another app.

## Build

Requires Rust and Node.

```
npm install
npm run build        # portable exe: src-tauri/target/release/nocturne.exe
npm run installer    # NSIS installer
```

Stack: Tauri 2 (Rust) with a framework-free HTML/CSS/JS front end.
