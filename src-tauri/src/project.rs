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
        // Prevent duplicate project names
        if guard.project.projects.iter().any(|p| p.name == entry.name) {
            return Err(format!("Project '{}' already exists", entry.name));
        }
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
pub async fn update_project(
    state: State<'_, ManagedAppState>,
    name: String,
    entry: ProjectEntry,
) -> Result<(), String> {
    let updated = {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        let new_name = entry.name.clone();
        if let Some(existing) = guard.project.projects.iter_mut().find(|p| p.name == name) {
            existing.path = entry.path;
            existing.name = entry.name;
            existing.agent = entry.agent;
            existing.gsd_file = entry.gsd_file;
            existing.server_cmd = entry.server_cmd;
            existing.server_url = entry.server_url;
        } else {
            return Err(format!("Project '{}' not found", name));
        }
        // Update active name if it was renamed
        if guard.project.active.as_ref() == Some(&name) && name != new_name {
            guard.project.active = Some(new_name);
        }
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
