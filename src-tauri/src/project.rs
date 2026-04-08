//! Project registry commands

use crate::state::{save_state_sync, ManagedAppState, ProjectEntry};
use tauri::State;

#[tauri::command]
pub async fn add_project(
    state: State<'_, ManagedAppState>,
    entry: ProjectEntry,
) -> Result<(), String> {
    let updated = {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        guard.project.projects.push(entry);
        guard.clone()
    };
    tauri::async_runtime::spawn_blocking(move || save_state_sync(&updated))
        .await
        .map_err(|e| e.to_string())??;
    Ok(())
}

#[tauri::command]
pub async fn remove_project(
    state: State<'_, ManagedAppState>,
    name: String,
) -> Result<(), String> {
    let updated = {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        guard.project.projects.retain(|p| p.name != name);
        if guard.project.active.as_ref() == Some(&name) {
            guard.project.active = None;
        }
        guard.clone()
    };
    tauri::async_runtime::spawn_blocking(move || save_state_sync(&updated))
        .await
        .map_err(|e| e.to_string())??;
    Ok(())
}

#[tauri::command]
pub async fn switch_project(
    state: State<'_, ManagedAppState>,
    name: String,
) -> Result<(), String> {
    let updated = {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        if !guard.project.projects.iter().any(|p| p.name == name) {
            return Err(format!("Project '{}' not found", name));
        }
        guard.project.active = Some(name);
        guard.clone()
    };
    tauri::async_runtime::spawn_blocking(move || save_state_sync(&updated))
        .await
        .map_err(|e| e.to_string())??;
    Ok(())
}

#[tauri::command]
pub async fn get_projects(
    state: State<'_, ManagedAppState>,
) -> Result<Vec<ProjectEntry>, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(guard.project.projects.clone())
}

#[tauri::command]
pub async fn get_active_project(
    state: State<'_, ManagedAppState>,
) -> Result<Option<String>, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(guard.project.active.clone())
}
