use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ── Chrome (app UI) theme ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChromeTheme {
    #[serde(default = "default_chrome_bg")]
    pub bg: String,

    #[serde(default = "default_chrome_bg_raised", rename = "bgRaised")]
    pub bg_raised: String,

    #[serde(default = "default_chrome_border")]
    pub border: String,

    #[serde(default = "default_chrome_text")]
    pub text: String,

    #[serde(default = "default_chrome_text_bright", rename = "textBright")]
    pub text_bright: String,

    #[serde(default = "default_chrome_accent")]
    pub accent: String,

    #[serde(default = "default_chrome_font")]
    pub font: String,

    #[serde(default = "default_chrome_font_size", rename = "fontSize")]
    pub font_size: u32,
}

// Chrome defaults (Solarized Dark)
fn default_chrome_bg() -> String { "#282d3a".into() }
fn default_chrome_bg_raised() -> String { "#363b3d".into() }
fn default_chrome_border() -> String { "#3e454a".into() }
fn default_chrome_text() -> String { "#8d999a".into() }
fn default_chrome_text_bright() -> String { "#92a0a0".into() }
fn default_chrome_accent() -> String { "#258ad1".into() }
fn default_chrome_font() -> String { "FiraCode Light".into() }
fn default_chrome_font_size() -> u32 { 14 }

impl Default for ChromeTheme {
    fn default() -> Self {
        Self {
            bg: default_chrome_bg(),
            bg_raised: default_chrome_bg_raised(),
            border: default_chrome_border(),
            text: default_chrome_text(),
            text_bright: default_chrome_text_bright(),
            accent: default_chrome_accent(),
            font: default_chrome_font(),
            font_size: default_chrome_font_size(),
        }
    }
}

// ── Terminal theme (xterm.js ANSI colors) ────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalTheme {
    #[serde(default = "default_term_background")]
    pub background: String,

    #[serde(default = "default_term_foreground")]
    pub foreground: String,

    #[serde(default = "default_term_cursor")]
    pub cursor: String,

    #[serde(default = "default_term_selection_background", rename = "selectionBackground")]
    pub selection_background: String,

    #[serde(default = "default_term_black")]
    pub black: String,

    #[serde(default = "default_term_red")]
    pub red: String,

    #[serde(default = "default_term_green")]
    pub green: String,

    #[serde(default = "default_term_yellow")]
    pub yellow: String,

    #[serde(default = "default_term_blue")]
    pub blue: String,

    #[serde(default = "default_term_magenta")]
    pub magenta: String,

    #[serde(default = "default_term_cyan")]
    pub cyan: String,

    #[serde(default = "default_term_white")]
    pub white: String,

    #[serde(default = "default_term_bright_black", rename = "brightBlack")]
    pub bright_black: String,

    #[serde(default = "default_term_bright_red", rename = "brightRed")]
    pub bright_red: String,

    #[serde(default = "default_term_bright_green", rename = "brightGreen")]
    pub bright_green: String,

    #[serde(default = "default_term_bright_yellow", rename = "brightYellow")]
    pub bright_yellow: String,

    #[serde(default = "default_term_bright_blue", rename = "brightBlue")]
    pub bright_blue: String,

    #[serde(default = "default_term_bright_magenta", rename = "brightMagenta")]
    pub bright_magenta: String,

    #[serde(default = "default_term_bright_cyan", rename = "brightCyan")]
    pub bright_cyan: String,

    #[serde(default = "default_term_bright_white", rename = "brightWhite")]
    pub bright_white: String,
}

// Terminal defaults (Solarized Dark ANSI)
fn default_term_background() -> String { "#282d3a".into() }
fn default_term_foreground() -> String { "#92a0a0".into() }
fn default_term_cursor() -> String { "#258ad1".into() }
fn default_term_selection_background() -> String { "#3e454a".into() }
fn default_term_black() -> String { "#073642".into() }
fn default_term_red() -> String { "#dc322f".into() }
fn default_term_green() -> String { "#859900".into() }
fn default_term_yellow() -> String { "#b58900".into() }
fn default_term_blue() -> String { "#268bd2".into() }
fn default_term_magenta() -> String { "#d33682".into() }
fn default_term_cyan() -> String { "#2aa198".into() }
fn default_term_white() -> String { "#eee8d5".into() }
fn default_term_bright_black() -> String { "#002b36".into() }
fn default_term_bright_red() -> String { "#cb4b16".into() }
fn default_term_bright_green() -> String { "#586e75".into() }
fn default_term_bright_yellow() -> String { "#657b83".into() }
fn default_term_bright_blue() -> String { "#839496".into() }
fn default_term_bright_magenta() -> String { "#6c71c4".into() }
fn default_term_bright_cyan() -> String { "#93a1a1".into() }
fn default_term_bright_white() -> String { "#fdf6e3".into() }

impl Default for TerminalTheme {
    fn default() -> Self {
        Self {
            background: default_term_background(),
            foreground: default_term_foreground(),
            cursor: default_term_cursor(),
            selection_background: default_term_selection_background(),
            black: default_term_black(),
            red: default_term_red(),
            green: default_term_green(),
            yellow: default_term_yellow(),
            blue: default_term_blue(),
            magenta: default_term_magenta(),
            cyan: default_term_cyan(),
            white: default_term_white(),
            bright_black: default_term_bright_black(),
            bright_red: default_term_bright_red(),
            bright_green: default_term_bright_green(),
            bright_yellow: default_term_bright_yellow(),
            bright_blue: default_term_bright_blue(),
            bright_magenta: default_term_bright_magenta(),
            bright_cyan: default_term_bright_cyan(),
            bright_white: default_term_bright_white(),
        }
    }
}

// ── Top-level theme config ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeConfig {
    #[serde(default)]
    pub chrome: ChromeTheme,

    #[serde(default)]
    pub terminal: TerminalTheme,
}

impl Default for ThemeConfig {
    fn default() -> Self {
        Self {
            chrome: ChromeTheme::default(),
            terminal: TerminalTheme::default(),
        }
    }
}

// ── Path helpers ─────────────────────────────────────────────────────────────

pub fn config_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .ok()
        .filter(|h| !h.is_empty())
        .unwrap_or_else(|| {
            eprintln!("[efxmux] WARNING: HOME not set; using /tmp/efxmux-fallback for config");
            "/tmp/efxmux-fallback".to_string()
        });
    PathBuf::from(home).join(".config/efxmux")
}

pub fn theme_path() -> PathBuf {
    config_dir().join("theme.json")
}

pub fn ensure_config_dir() {
    let dir = config_dir();
    if !dir.exists() {
        if let Err(e) = std::fs::create_dir_all(&dir) {
            eprintln!("[efxmux] Failed to create config dir {:?}: {}", dir, e);
        }
    }
}

// ── Load / create ────────────────────────────────────────────────────────────

pub fn load_or_create_theme() -> ThemeConfig {
    ensure_config_dir();

    let path = theme_path();
    if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(content) => match serde_json::from_str::<ThemeConfig>(&content) {
                Ok(theme) => return theme,
                Err(err) => {
                    eprintln!(
                        "[efxmux] Invalid theme.json: {}. Using defaults.",
                        err
                    );
                }
            },
            Err(err) => {
                eprintln!("[efxmux] Failed to read theme.json: {}. Using defaults.", err);
            }
        }
    } else {
        // First launch: write defaults
        let defaults = ThemeConfig::default();
        match serde_json::to_string_pretty(&defaults) {
            Ok(json) => {
                if let Err(e) = std::fs::write(&path, &json) {
                    eprintln!("[efxmux] Failed to write default theme.json: {}", e);
                }
            }
            Err(e) => {
                eprintln!("[efxmux] Failed to serialize default theme: {}", e);
            }
        }
    }

    ThemeConfig::default()
}

// ── Tauri command ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn load_theme() -> ThemeConfig {
    load_or_create_theme()
}
