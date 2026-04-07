use serde_json::Value;
use std::fs;

use super::types::{ensure_config_dir, theme_path, ThemeConfig};

// ── iTerm2 color key -> theme.json terminal key mapping ─────────────────────

const ITERM2_TO_TERMINAL: &[(&str, &str)] = &[
    ("Foreground Color", "foreground"),
    ("Background Color", "background"),
    ("Cursor Color", "cursor"),
    ("Selection Color", "selectionBackground"),
    ("Ansi 0 Color", "black"),
    ("Ansi 1 Color", "red"),
    ("Ansi 2 Color", "green"),
    ("Ansi 3 Color", "yellow"),
    ("Ansi 4 Color", "blue"),
    ("Ansi 5 Color", "magenta"),
    ("Ansi 6 Color", "cyan"),
    ("Ansi 7 Color", "white"),
    ("Ansi 8 Color", "brightBlack"),
    ("Ansi 9 Color", "brightRed"),
    ("Ansi 10 Color", "brightGreen"),
    ("Ansi 11 Color", "brightYellow"),
    ("Ansi 12 Color", "brightBlue"),
    ("Ansi 13 Color", "brightMagenta"),
    ("Ansi 14 Color", "brightCyan"),
    ("Ansi 15 Color", "brightWhite"),
];

// ── Color conversion ────────────────────────────────────────────────────────

/// Convert an iTerm2 color object (float RGB 0.0-1.0) to a hex color string.
fn iterm2_color_to_hex(color: &Value) -> Option<String> {
    let r = (color.get("Red Component")?.as_f64()? * 255.0).round() as u8;
    let g = (color.get("Green Component")?.as_f64()? * 255.0).round() as u8;
    let b = (color.get("Blue Component")?.as_f64()? * 255.0).round() as u8;
    Some(format!("#{:02x}{:02x}{:02x}", r, g, b))
}

// ── Tauri command ───────────────────────────────────────────────────────────

/// Import an iTerm2 JSON profile and convert its colors to theme.json format.
///
/// - Reads the iTerm2 profile JSON at the given path
/// - Maps all 16 ANSI colors + foreground/background/cursor/selection to theme fields
/// - Derives chrome colors from terminal colors (bg, accent, text, border)
/// - Backs up existing theme.json to theme.json.bak before overwriting
/// - Writes the new theme.json (hot-reload watcher picks it up automatically)
#[tauri::command]
pub fn import_iterm2_theme(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);

    // 1. Must be an absolute path
    if !p.is_absolute() {
        return Err("Path must be absolute".into());
    }

    // 2. Must have an expected extension
    match p.extension().and_then(|e| e.to_str()) {
        Some("json") | Some("itermcolors") => {}
        _ => return Err("File must be a .json or .itermcolors file".into()),
    }

    // 3. Resolve symlinks to prevent traversal
    let canonical = p
        .canonicalize()
        .map_err(|e| format!("Cannot resolve path: {}", e))?;

    // 4. Read and parse the iTerm2 profile JSON
    let content =
        fs::read_to_string(&canonical).map_err(|e| format!("Failed to read iTerm2 file: {}", e))?;
    let profile: Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid iTerm2 JSON: {}", e))?;

    // 2. Start with default theme (chrome + unmapped terminal colors get defaults)
    let mut theme = ThemeConfig::default();

    // 3. Convert each iTerm2 color key to the terminal theme field
    //    Serialize current terminal section to a mutable JSON value, patch it, deserialize back
    let mut terminal_map =
        serde_json::to_value(&theme.terminal).map_err(|e| format!("Serialization error: {}", e))?;

    for (iterm_key, theme_key) in ITERM2_TO_TERMINAL {
        if let Some(color_obj) = profile.get(iterm_key) {
            if let Some(hex) = iterm2_color_to_hex(color_obj) {
                terminal_map[theme_key] = Value::String(hex);
            }
        }
    }

    // Derive chrome colors from imported terminal colors
    if let Some(bg) = terminal_map.get("background").and_then(|v| v.as_str()) {
        theme.chrome.bg = bg.to_string();
    }
    if let Some(cursor) = terminal_map.get("cursor").and_then(|v| v.as_str()) {
        theme.chrome.accent = cursor.to_string();
    }
    if let Some(fg) = terminal_map.get("foreground").and_then(|v| v.as_str()) {
        theme.chrome.text_bright = fg.to_string();
    }
    if let Some(sel) = terminal_map
        .get("selectionBackground")
        .and_then(|v| v.as_str())
    {
        theme.chrome.border = sel.to_string();
    }

    // Deserialize the modified terminal map back into the struct
    theme.terminal = serde_json::from_value(terminal_map)
        .map_err(|e| format!("Terminal theme conversion error: {}", e))?;

    // 4. Backup existing theme.json before overwrite (T-03-07 mitigation)
    ensure_config_dir();
    let target = theme_path();
    if target.exists() {
        let backup = target.with_extension("json.bak");
        fs::copy(&target, &backup).map_err(|e| format!("Failed to create backup: {}", e))?;
    }

    // 5. Write new theme.json (hot-reload watcher picks it up automatically)
    let json =
        serde_json::to_string_pretty(&theme).map_err(|e| format!("Serialization error: {}", e))?;
    fs::write(&target, &json).map_err(|e| format!("Failed to write theme.json: {}", e))?;

    println!(
        "[efxmux] Imported iTerm2 theme from {}. Backup saved to theme.json.bak",
        path
    );
    Ok(format!("Theme imported from {}", path))
}
