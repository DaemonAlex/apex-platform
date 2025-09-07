# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a single-file AV Project Management Tool - a standalone HTML application with embedded JavaScript and CSS for managing audio/visual projects. The entire application is contained within `AV Project Tracker 6.1.html`.

## Architecture

The application is built as a monolithic HTML file containing:
- **HTML Structure**: Complete UI including modals, dashboard, and project views
- **CSS Styles**: ~2500 lines of embedded styles with light/dark theme support
- **JavaScript Logic**: ~5000 lines of embedded JavaScript handling all functionality
- **External Dependencies**: 
  - XLSX library (CDN) for Excel export
  - jsPDF (CDN) for PDF generation
  - jsPDF-autotable (CDN) for PDF tables

## Core Data Structures

Projects are stored as JavaScript objects with:
- Unique IDs (generated with timestamp + random)
- Metadata (name, client, type, status, dates, budget)
- Tasks array with subtasks
- Progress tracking
- File attachments
- Notes and comments

## Key Functions

### Data Management
- `saveToLocal(projectsData)` - Persists to localStorage
- `loadFromLocal()` - Retrieves from localStorage
- `dbService` object - Handles potential API connections (currently offline mode)

### UI Rendering
- `renderProjects()` - Main dashboard grid
- `renderProjectDetails(projectId)` - Individual project view
- `renderKanbanBoard(projectId)` - Kanban task view

### Export Functions  
- `exportToExcel(project)` - Excel export using XLSX
- `exportToPDF(project)` - PDF generation using jsPDF
- `exportToCSV(projectId)` - CSV export
- `createBackup()` - Full JSON backup

### Modal Management
- `showCreateProjectModal()` - New project creation
- `showProjectView(projectId)` - Project details
- `showKanbanView(projectId)` - Kanban board
- `showExecutiveReporting()` - Analytics dashboard

## Development Commands

Since this is a standalone HTML file, there are no build or compilation steps required:

```bash
# Open the file directly in a browser
start "AV Project Tracker 6.1.html"  # Windows
open "AV Project Tracker 6.1.html"    # macOS
xdg-open "AV Project Tracker 6.1.html" # Linux

# For development with live reload (if you have a local server)
python -m http.server 8000  # Then navigate to localhost:8000
```

## Testing Approach

Manual testing in browser:
1. Open Developer Console (F12) for debugging
2. Set `localStorage.setItem('debugMode', 'true')` for debug logs
3. Test localStorage persistence across sessions
4. Verify export functionality (Excel, PDF, CSV)

## Data Storage

- **Primary**: Browser localStorage with key 'avProjects'
- **Backup**: Manual JSON export/import functionality
- **API Ready**: dbService structure prepared for future backend integration

## Browser Compatibility

Requires modern browser with support for:
- ES6+ JavaScript
- localStorage API
- Fetch API (for future backend)
- CSS Grid and Flexbox
- CSS Custom Properties

## Important Considerations

1. **Single File Architecture**: All changes must be made within the single HTML file
2. **No Build Process**: Direct browser execution without compilation
3. **localStorage Limits**: Browser typically limits to 5-10MB
4. **Offline First**: Designed to work completely offline with optional API
5. **Version Tracking**: APP_VERSION constant at line 3345 for updates