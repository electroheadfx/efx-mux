---
status: diagnosed
trigger: "After completing wizard (even with a valid project setup), user is shown the Add Project modal instead of the main terminal view."
created: 2026-04-10T12:00:00Z
updated: 2026-04-10T12:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - Two competing "no projects" handlers: initProjects() opens wizard, Sidebar useEffect opens ProjectModal
test: Code trace confirms both paths fire on mount when projectList.length === 0
expecting: n/a
next_action: Return diagnosis

## Symptoms

expected: After completing wizard, user lands in the main terminal view
actual: After completing wizard (even with a valid project setup), user is shown the Add Project modal instead of the main terminal view
errors: None reported
reproduction: Test 10 in UAT - complete wizard steps
started: Discovered during UAT

## Eliminated

## Evidence

- timestamp: 2026-04-10T12:01:00Z
  checked: main.tsx initProjects() (line 264-283)
  found: When projectList.length === 0, calls openWizard() and returns early
  implication: This is the correct first-run path

- timestamp: 2026-04-10T12:02:00Z
  checked: sidebar.tsx useEffect init() (line 228-236)
  found: Independently calls getProjects(), and when loadedProjects.length === 0, calls openProjectModal()
  implication: This is a SECOND "no projects" handler that fires concurrently, opening the Add Project modal on top of the wizard

- timestamp: 2026-04-10T12:03:00Z
  checked: Execution order in bootstrap()
  found: initProjects() is called at line 98, but Sidebar mounts at line 92 (render). Sidebar useEffect fires after render, roughly same tick as initProjects(). Both call getProjects() independently and both detect 0 projects.
  implication: Race between two independent "empty project list" handlers -- both fire, wizard + modal both open

## Resolution

root_cause: Two independent "no projects detected" handlers both fire on app startup. main.tsx initProjects() (line 268) opens the wizard, while sidebar.tsx useEffect init() (line 235) opens the Add Project modal. Both call getProjects() independently and both detect 0 projects. After the wizard completes and adds a project, the ProjectModal is already open from the sidebar's init, so the user sees "Add Project" instead of the main terminal view.
fix:
verification:
files_changed: []
