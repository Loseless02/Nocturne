#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod vault;

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use sha1::{Digest, Sha1};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use zeroize::Zeroizing;

use vault::Session;

const MAX_IMPORT_BYTES: u64 = 50 * 1024 * 1024;

struct Inner {
    session: Option<Session>,
    last_activity: Instant,
    autolock_secs: u64,
    close_to_tray: bool,
    last_copied: Option<Zeroizing<String>>,
    failed_unlocks: u32,
}

struct AppState {
    inner: Mutex<Inner>,
    path: PathBuf,
}

static COPY_GEN: AtomicU64 = AtomicU64::new(0);

fn hotkey() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space)
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ---------- window / lifecycle ----------

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        let _ = w.emit("summon", ());
    }
}

fn toggle_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let visible = w.is_visible().unwrap_or(false);
        let focused = w.is_focused().unwrap_or(false);
        let minimized = w.is_minimized().unwrap_or(false);
        if visible && focused && !minimized {
            let _ = w.hide();
        } else {
            show_main(app);
        }
    }
}

fn do_lock(app: &AppHandle) {
    let st = app.state::<AppState>();
    let was_unlocked = {
        let mut g = st.inner.lock().unwrap();
        g.session.take().is_some()
    };
    if was_unlocked {
        let _ = app.emit("vault-locked", ());
    }
}

/// Clears the clipboard if it still holds the last secret we put there.
fn clear_own_clipboard(st: &AppState) {
    let last = st.inner.lock().unwrap().last_copied.take();
    if let Some(secret) = last {
        if let Ok(mut cb) = arboard::Clipboard::new() {
            if cb.get_text().map(|t| t == *secret).unwrap_or(false) {
                let _ = cb.clear();
            }
        }
    }
}

fn quit(app: &AppHandle) {
    let st = app.state::<AppState>();
    clear_own_clipboard(&st);
    st.inner.lock().unwrap().session = None;
    app.exit(0);
}

// ---------- vault commands ----------

#[derive(Serialize)]
struct Status {
    exists: bool,
    unlocked: bool,
    path: String,
}

#[tauri::command]
fn vault_status(state: State<AppState>) -> Status {
    let g = state.inner.lock().unwrap();
    Status {
        exists: state.path.exists(),
        unlocked: g.session.is_some(),
        path: state.path.display().to_string(),
    }
}

#[tauri::command]
async fn vault_create(app: AppHandle, master: String, data: String) -> Result<(), String> {
    let master = Zeroizing::new(master);
    let data = Zeroizing::new(data);
    tauri::async_runtime::spawn_blocking(move || {
        let st = app.state::<AppState>();
        if st.path.exists() {
            return Err("A vault already exists.".to_string());
        }
        if master.chars().count() < 8 {
            return Err("Master password must be at least 8 characters.".to_string());
        }
        let session = Session::new(&master)?;
        vault::write_atomic(&st.path, &session.seal(data.as_bytes())?)?;
        let mut g = st.inner.lock().unwrap();
        g.session = Some(session);
        g.last_activity = Instant::now();
        Ok(())
    })
    .await
    .map_err(err)?
}

#[tauri::command]
async fn vault_unlock(app: AppHandle, master: String) -> Result<String, String> {
    let master = Zeroizing::new(master);
    tauri::async_runtime::spawn_blocking(move || {
        let st = app.state::<AppState>();
        let bytes = fs::read(&st.path).map_err(|e| format!("Could not read vault: {e}"))?;
        match vault::open(&bytes, &master) {
            Ok((session, plain)) => {
                let mut g = st.inner.lock().unwrap();
                g.session = Some(session);
                g.last_activity = Instant::now();
                g.failed_unlocks = 0;
                Ok(plain.to_string())
            }
            Err(e) => {
                // Slow down repeated guessing on top of the Argon2 cost.
                let fails = {
                    let mut g = st.inner.lock().unwrap();
                    g.failed_unlocks += 1;
                    g.failed_unlocks
                };
                std::thread::sleep(Duration::from_millis((400 * fails.min(10)) as u64));
                Err(e)
            }
        }
    })
    .await
    .map_err(err)?
}

#[tauri::command]
fn vault_save(state: State<AppState>, data: String) -> Result<(), String> {
    let data = Zeroizing::new(data);
    let sealed = {
        let mut g = state.inner.lock().unwrap();
        g.last_activity = Instant::now();
        let s = g.session.as_ref().ok_or("Vault is locked.")?;
        s.seal(data.as_bytes())?
    };
    vault::write_atomic(&state.path, &sealed)
}

#[tauri::command]
fn vault_lock(app: AppHandle) {
    do_lock(&app);
}

#[tauri::command]
async fn vault_change_master(app: AppHandle, old: String, new: String) -> Result<(), String> {
    let old = Zeroizing::new(old);
    let new = Zeroizing::new(new);
    tauri::async_runtime::spawn_blocking(move || {
        let st = app.state::<AppState>();
        if new.chars().count() < 8 {
            return Err("New master password must be at least 8 characters.".to_string());
        }
        let bytes = fs::read(&st.path).map_err(err)?;
        let (_, plain) = vault::open(&bytes, &old).map_err(|_| "Current master password is wrong.".to_string())?;
        let session = Session::new(&new)?;
        vault::write_atomic(&st.path, &session.seal(plain.as_bytes())?)?;
        // Second write rotates the .bak too, so no copy under the old password stays behind.
        vault::write_atomic(&st.path, &session.seal(plain.as_bytes())?)?;
        st.inner.lock().unwrap().session = Some(session);
        Ok(())
    })
    .await
    .map_err(err)?
}

#[tauri::command]
fn touch(state: State<AppState>) {
    state.inner.lock().unwrap().last_activity = Instant::now();
}

#[tauri::command]
fn set_prefs(app: AppHandle, state: State<AppState>, autolock_secs: u64, close_to_tray: bool, hotkey_on: bool) -> Result<bool, String> {
    {
        let mut g = state.inner.lock().unwrap();
        g.autolock_secs = autolock_secs;
        g.close_to_tray = close_to_tray;
    }
    let gs = app.global_shortcut();
    let registered = gs.is_registered(hotkey());
    if hotkey_on && !registered {
        return Ok(gs.register(hotkey()).is_ok());
    }
    if !hotkey_on && registered {
        let _ = gs.unregister(hotkey());
    }
    Ok(hotkey_on)
}

// ---------- clipboard ----------

#[tauri::command]
fn copy_secret(state: State<AppState>, text: String, clear_secs: u64) -> Result<(), String> {
    let mut cb = arboard::Clipboard::new().map_err(err)?;
    #[cfg(windows)]
    {
        use arboard::SetExtWindows;
        cb.set()
            .exclude_from_cloud()
            .exclude_from_history()
            .exclude_from_monitoring()
            .text(text.clone())
            .map_err(err)?;
    }
    #[cfg(not(windows))]
    cb.set_text(text.clone()).map_err(err)?;

    let gen = COPY_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let secret = Zeroizing::new(text);
    {
        let mut g = state.inner.lock().unwrap();
        g.last_activity = Instant::now();
        g.last_copied = Some(secret.clone());
    }
    if clear_secs > 0 {
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(clear_secs));
            if COPY_GEN.load(Ordering::SeqCst) != gen {
                return; // something newer was copied; its own timer handles it
            }
            if let Ok(mut cb) = arboard::Clipboard::new() {
                if cb.get_text().map(|t| t == *secret).unwrap_or(false) {
                    let _ = cb.clear();
                }
            }
        });
    }
    Ok(())
}

// ---------- strength ----------

#[derive(Serialize)]
struct Strength {
    score: u8,
    crack: String,
    warning: String,
    suggestions: Vec<String>,
    log10: f64,
}

fn clip(s: &str) -> &str {
    // zxcvbn gets slow on very long inputs; the first 64 chars decide the score anyway.
    match s.char_indices().nth(64) {
        Some((i, _)) => &s[..i],
        None => s,
    }
}

#[tauri::command]
fn strength(password: String, inputs: Vec<String>) -> Strength {
    let refs: Vec<&str> = inputs.iter().map(|s| s.as_str()).filter(|s| !s.is_empty()).collect();
    match zxcvbn::zxcvbn(clip(&password), &refs) {
        Ok(e) => {
            let (warning, suggestions) = match e.feedback() {
                Some(f) => (
                    f.warning().map(|w| w.to_string()).unwrap_or_default(),
                    f.suggestions().iter().map(|s| s.to_string()).collect(),
                ),
                None => (String::new(), vec![]),
            };
            Strength {
                score: e.score(),
                crack: e.crack_times().offline_slow_hashing_1e4_per_second().to_string(),
                warning,
                suggestions,
                log10: e.guesses_log10(),
            }
        }
        Err(_) => Strength { score: 0, crack: "instant".into(), warning: String::new(), suggestions: vec![], log10: 0.0 },
    }
}

#[tauri::command]
async fn strength_many(passwords: Vec<String>) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        passwords
            .iter()
            .map(|p| zxcvbn::zxcvbn(clip(p), &[]).map(|e| e.score()).unwrap_or(0))
            .collect()
    })
    .await
    .map_err(err)
}

// ---------- breach checks ----------

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(15))
        .user_agent("Nocturne-Password-Manager")
        .build()
}

/// Have I Been Pwned "range" API (k-anonymity): only the first 5 hex chars of
/// each SHA-1 hash leave the machine. Returns breach counts, -1 on network error.
#[tauri::command]
async fn hibp_check(passwords: Vec<String>) -> Result<Vec<i64>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = vec![-1i64; passwords.len()];
        let mut by_prefix: HashMap<String, Vec<(usize, String)>> = HashMap::new();
        for (i, pw) in passwords.iter().enumerate() {
            if pw.is_empty() {
                out[i] = 0;
                continue;
            }
            let hash: String = Sha1::digest(pw.as_bytes()).iter().map(|b| format!("{b:02X}")).collect();
            by_prefix.entry(hash[..5].to_string()).or_default().push((i, hash[5..].to_string()));
        }
        let agent = agent();
        let mut any_ok = by_prefix.is_empty();
        for (prefix, items) in by_prefix {
            let resp = agent
                .get(&format!("https://api.pwnedpasswords.com/range/{prefix}"))
                .set("Add-Padding", "true")
                .call();
            let Ok(resp) = resp else { continue };
            let Ok(body) = resp.into_string() else { continue };
            any_ok = true;
            for (i, _) in &items {
                out[*i] = 0;
            }
            for line in body.lines() {
                let mut parts = line.trim().split(':');
                let (Some(suffix), Some(count)) = (parts.next(), parts.next()) else { continue };
                for (i, s) in &items {
                    if s == suffix {
                        out[*i] = count.trim().parse().unwrap_or(0);
                    }
                }
            }
        }
        if !any_ok {
            return Err("Could not reach the breach database. Check your internet connection.".to_string());
        }
        Ok(out)
    })
    .await
    .map_err(err)?
}

fn pct_encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'@' | b'+' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn collect_strings(v: &serde_json::Value, out: &mut Vec<String>) {
    match v {
        serde_json::Value::String(s) => out.push(s.clone()),
        serde_json::Value::Array(a) => a.iter().for_each(|x| collect_strings(x, out)),
        _ => {}
    }
}

/// XposedOrNot free email breach lookup. The email address itself is sent,
/// so the UI only calls this when the user explicitly asks.
#[tauri::command]
async fn email_breaches(email: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let url = format!("https://api.xposedornot.com/v1/check-email/{}", pct_encode(email.trim()));
        match agent().get(&url).call() {
            Ok(resp) => {
                let body = resp.into_string().map_err(err)?;
                let v: serde_json::Value = serde_json::from_str(&body).map_err(err)?;
                let mut names = vec![];
                if let Some(b) = v.get("breaches") {
                    collect_strings(b, &mut names);
                }
                names.sort();
                names.dedup();
                Ok(names)
            }
            Err(ureq::Error::Status(404, _)) => Ok(vec![]),
            Err(ureq::Error::Status(429, _)) => Err("Rate limited by the breach service. Try again in a minute.".to_string()),
            Err(e) => Err(format!("Breach service unreachable: {e}")),
        }
    })
    .await
    .map_err(err)?
}

// ---------- files ----------

#[tauri::command]
async fn pick_open(app: AppHandle, title: String, exts: Vec<String>) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    tauri::async_runtime::spawn_blocking(move || {
        let refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
        let mut d = app.dialog().file().set_title(&title);
        if !refs.is_empty() {
            d = d.add_filter("Supported files", &refs);
        }
        d.blocking_pick_file().and_then(|p| p.into_path().ok()).map(|p| p.display().to_string())
    })
    .await
    .map_err(err)
}

#[tauri::command]
async fn pick_save(app: AppHandle, title: String, name: String, exts: Vec<String>) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    tauri::async_runtime::spawn_blocking(move || {
        let refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
        let mut d = app.dialog().file().set_title(&title).set_file_name(&name);
        if !refs.is_empty() {
            d = d.add_filter("File", &refs);
        }
        d.blocking_save_file().and_then(|p| p.into_path().ok()).map(|p| p.display().to_string())
    })
    .await
    .map_err(err)
}

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    let meta = fs::metadata(&path).map_err(err)?;
    if meta.len() > MAX_IMPORT_BYTES {
        return Err("File is too large to import (50 MB max).".to_string());
    }
    let bytes = fs::read(&path).map_err(err)?;
    let text = String::from_utf8_lossy(&bytes).to_string();
    Ok(text.trim_start_matches('\u{feff}').to_string())
}

#[tauri::command]
fn write_text(path: String, contents: String) -> Result<(), String> {
    let contents = Zeroizing::new(contents);
    vault::write_atomic(&PathBuf::from(path), contents.as_bytes())
}

#[tauri::command]
fn export_backup(state: State<AppState>, path: String) -> Result<(), String> {
    if state.inner.lock().unwrap().session.is_none() {
        return Err("Vault is locked.".to_string());
    }
    let bytes = fs::read(&state.path).map_err(err)?;
    vault::write_atomic(&PathBuf::from(path), &bytes)
}

#[tauri::command]
async fn decrypt_backup(path: String, password: String) -> Result<String, String> {
    let password = Zeroizing::new(password);
    tauri::async_runtime::spawn_blocking(move || {
        let meta = fs::metadata(&path).map_err(err)?;
        if meta.len() > MAX_IMPORT_BYTES {
            return Err("File is too large.".to_string());
        }
        let bytes = fs::read(&path).map_err(err)?;
        let (_, plain) = vault::open(&bytes, &password)?;
        Ok(plain.to_string())
    })
    .await
    .map_err(err)?
}

// ---------- misc ----------

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://")) {
        return Err("Only http(s) links can be opened.".to_string());
    }
    app.opener().open_url(url, None::<&str>).map_err(err)
}

#[tauri::command]
fn hide_window(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    quit(&app);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| show_main(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _sc, ev| {
                    if ev.state() == ShortcutState::Pressed {
                        toggle_main(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            fs::create_dir_all(&dir)?;
            app.manage(AppState {
                inner: Mutex::new(Inner {
                    session: None,
                    last_activity: Instant::now(),
                    autolock_secs: 300,
                    close_to_tray: true,
                    last_copied: None,
                    failed_unlocks: 0,
                }),
                path: dir.join("vault.noct"),
            });

            let _ = app.global_shortcut().register(hotkey());

            let open_i = MenuItem::with_id(app, "show", "Open Nocturne", true, None::<&str>)?;
            let lock_i = MenuItem::with_id(app, "lock", "Lock now", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &lock_i, &quit_i])?;
            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("Nocturne")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "show" => show_main(app),
                    "lock" => do_lock(app),
                    "quit" => quit(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            // Auto-lock watchdog lives in Rust so it still fires when the
            // webview is hidden or throttled.
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(2));
                let st = handle.state::<AppState>();
                let expired = {
                    let g = st.inner.lock().unwrap();
                    g.session.is_some() && g.autolock_secs > 0 && g.last_activity.elapsed().as_secs() >= g.autolock_secs
                };
                if expired {
                    do_lock(&handle);
                }
            });
            Ok(())
        })
        .on_window_event(|w, e| {
            if let WindowEvent::CloseRequested { api, .. } = e {
                let app = w.app_handle();
                let to_tray = app.state::<AppState>().inner.lock().unwrap().close_to_tray;
                if to_tray {
                    api.prevent_close();
                    let _ = w.hide();
                } else {
                    quit(app);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            vault_status,
            vault_create,
            vault_unlock,
            vault_save,
            vault_lock,
            vault_change_master,
            touch,
            set_prefs,
            copy_secret,
            strength,
            strength_many,
            hibp_check,
            email_breaches,
            pick_open,
            pick_save,
            read_text,
            write_text,
            export_backup,
            decrypt_backup,
            open_url,
            hide_window,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("failed to start Nocturne");
}
