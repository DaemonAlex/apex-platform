# APEX Platform Data Storage Architecture

## Overview
The APEX Platform uses a hybrid data storage approach designed for maximum flexibility and reliability. The primary storage is browser-based localStorage for offline functionality, with optional backend database integration for enhanced features and data synchronization.

**Primary Storage:** Browser localStorage  
**Secondary Storage:** Optional MariaDB backend (when available)  
**Backup Methods:** JSON export/import, automated cloud sync  
**Data Format:** JavaScript objects stored as JSON strings

---

## Architecture Design

### 1. Client-Side Storage (Primary)

#### **Browser localStorage Implementation**
The platform stores all application data in the browser's localStorage, providing:
- **Offline Functionality**: Full application functionality without internet
- **Instant Performance**: No network latency for data operations
- **User Privacy**: Data stays on user's device by default
- **Backup Control**: Users control their own data exports

#### **Storage Limits and Management**
- **Capacity**: Typically 5-10MB per domain (browser dependent)
- **Monitoring**: Built-in storage usage monitoring
- **Cleanup**: Automatic cleanup of temporary data
- **Migration**: Version-aware data migration on updates

### 2. Backend Storage (Optional Enhancement)

When backend services are enabled, the platform can optionally sync with:
- **MariaDB Database**: Relational database for structured data
- **User Authentication**: Secure user management and permissions
- **Real-time Sync**: Multi-device data synchronization
- **Advanced Analytics**: Server-side reporting and insights

---

## Data Structure Organization

### Core Application State

```javascript
const AppState = {
    // User session information
    isLoggedIn: false,
    user: null,
    currentView: 'login',
    
    // Main application data
    projects: [],           // Array of project objects
    fieldOps: {            // Field operations data
        scheduled: [],
        completed: [],
        pending: []
    },
    auditLog: [],          // Activity audit trail
    
    // Configuration settings
    config: {
        USE_BACKEND: true,     // Backend integration enabled
        apiUrl: '/api',        // API endpoint (proxied by Nginx)
        refreshInterval: 30000,
        masterAccounts: ['admin@apex.local']
    },
    
    // Budget tracking
    breakfixBudget: {
        totalBudget: 50000,
        spentAmount: 0,
        remainingBudget: 50000,
        lastUpdated: "2025-09-07T..."
    },
    
    // User preferences and settings
    settings: {
        theme: 'light',
        notifications: true,
        autoSave: true
    }
};
```

---

## Data Models

### 1. Project Data Model

```javascript
const ProjectSchema = {
    id: "proj_2025_001",                    // Unique identifier
    projectNumber: "APEX-2025-001",         // Human-readable ID
    name: "Corporate AV Upgrade",           // Project name
    description: "Full description...",     // Detailed description
    
    // Client information
    client: "Acme Corporation",
    location: "New York, NY",
    siteLocation: "123 Main St, Floor 3",
    requestorInfo: "John Doe, CTO, john@acme.com",
    
    // Classification
    businessLine: "corporate",              // corporate, education, healthcare, etc.
    type: "technology_upgrade",             // project type
    priority: "high",                       // low, medium, high, critical
    status: "active",                       // planning, active, completed, etc.
    
    // Financial tracking
    estimatedBudget: 150000,
    actualBudget: 142000,
    budgetBreakdown: {
        labor: 80000,
        materials: 50000,
        vendor: 20000
    },
    
    // Timeline management
    requestDate: "2025-08-01",
    startDate: "2025-08-15",
    dueDate: "2025-10-15",
    endDate: null,
    completedAt: null,
    
    // Progress tracking
    progress: 75,                           // Percentage complete
    
    // Team assignment
    assignedTo: "project.manager@company.com",
    teamMembers: ["tech1@company.com", "tech2@company.com"],
    
    // Task management
    tasks: [
        {
            id: "task_001",
            name: "Install displays",
            description: "Mount and configure displays",
            status: "in-progress",
            assignee: "tech1@company.com",
            estimatedHours: 16,
            actualHours: 12,
            startDate: "2025-09-01",
            dueDate: "2025-09-05",
            completedAt: null,
            progress: 80,
            subtasks: [],
            notes: "Progress notes...",
            dependencies: [],
            attachments: []
        }
    ],
    
    // File management
    files: [
        {
            id: "file_001",
            name: "floor_plan.pdf",
            size: 2048576,
            uploadedAt: "2025-08-15T10:00:00.000Z",
            uploadedBy: "user@company.com",
            description: "Building floor plan"
        }
    ],
    
    // Audit trail
    notes: "General project notes...",
    tags: ["urgent", "corporate"],
    customFields: {
        buildingFloor: "3rd Floor",
        contactPerson: {
            name: "Jane Smith",
            phone: "555-0123"
        }
    },
    
    // System metadata
    createdAt: "2025-08-01T09:00:00.000Z",
    updatedAt: "2025-09-07T14:30:00.000Z",
    createdBy: "admin@company.com",
    isArchived: false
};
```

### 2. Field Operations Data Model

```javascript
const FieldOperationsSchema = {
    scheduled: [
        {
            id: "field_2025_001",
            workType: "Installation",           // Installation, Commissioning, Break/Fix, Maintenance
            title: "Install conference room AV",
            client: "Acme Corporation",
            location: "123 Main St, Suite 400",
            
            // Assignment details
            assignedTo: "John Tech",
            vendor: false,                      // true if external vendor
            
            // Scheduling
            date: "2025-09-10",
            startTime: "09:00",
            endTime: null,
            duration: 8,                        // Estimated hours
            
            // Project integration
            projectId: "proj_2025_001",         // Optional project link
            taskId: "task_001",                 // Optional task link
            projectCode: "APEX-2025-001",       // Project reference
            
            // Status tracking
            status: "scheduled",                // scheduled, in-progress, completed, cancelled
            notes: "Bring extra HDMI cables",
            equipmentNeeded: ["Displays", "Cables", "Mounting hardware"],
            
            // Reschedule tracking
            rescheduleHistory: [
                {
                    originalDate: "2025-09-08",
                    originalStartTime: "09:00",
                    newDate: "2025-09-10",
                    newStartTime: "09:00",
                    reason: "Parts Delay",
                    otherReason: null,
                    notes: "Equipment delayed until Monday",
                    rescheduledAt: "2025-09-07T14:30:00.000Z",
                    rescheduledBy: "Project Manager"
                }
            ],
            rescheduleCount: 1,
            lastRescheduled: "2025-09-07T14:30:00.000Z",
            
            // System metadata
            createdAt: "2025-09-05T10:00:00.000Z",
            updatedAt: "2025-09-07T14:30:00.000Z",
            createdBy: "admin@company.com"
        }
    ],
    completed: [...],
    pending: [...]
};
```

### 3. User Management Data Model

```javascript
const UserSchema = {
    id: "user_001",
    email: "admin@company.com",
    name: "John Smith",
    
    // Authentication
    password: "$2b$10$hashed_password",       // Bcrypt hashed
    role: "Admin",                           // Admin, Project-Manager, Team-Lead, etc.
    active: true,
    
    // Session management
    lastLogin: "2025-09-07T08:30:00.000Z",
    loginCount: 47,
    
    // User preferences
    preferences: {
        theme: "light",
        language: "en",
        timezone: "America/New_York",
        notifications: {
            email: true,
            browser: true,
            mobile: false
        },
        dashboard: {
            defaultView: "projects",
            itemsPerPage: 50
        }
    },
    
    // Profile information
    avatar: "JS",
    phone: "555-0123",
    department: "IT",
    manager: "manager@company.com",
    
    // System metadata
    createdAt: "2025-01-15T10:00:00.000Z",
    updatedAt: "2025-09-07T08:30:00.000Z"
};
```

### 4. Audit Log Data Model

```javascript
const AuditLogSchema = {
    id: "audit_2025_001",
    timestamp: "2025-09-07T14:30:00.000Z",
    
    // Action details
    action: "project.update",               // Standardized action types
    entity: "project",                      // Entity type
    entityId: "proj_2025_001",             // Entity identifier
    entityName: "Corporate AV Upgrade",     // Human-readable name
    
    // User information
    actor: {
        id: "user_001",
        name: "John Smith",
        email: "admin@company.com",
        role: "Admin"
    },
    
    // Change details
    details: "Updated project status from 'active' to 'completed'",
    diff: {
        before: { status: "active", progress: 95 },
        after: { status: "completed", progress: 100 }
    },
    
    // Context information
    severity: "info",                       // debug, info, warning, error, critical
    metadata: {
        ipAddress: "192.168.1.100",
        userAgent: "Mozilla/5.0...",
        sessionId: "sess_001",
        page: "/projects",
        additional: {}
    }
};
```

---

## Storage Operations

### 1. Data Persistence

#### **localStorage Operations**
```javascript
// Save application state
function saveToLocal(data, key = 'apexProjects') {
    try {
        const serialized = JSON.stringify(data);
        localStorage.setItem(key, serialized);
        
        // Update storage usage tracking
        updateStorageUsage();
        
        return true;
    } catch (error) {
        console.error('Failed to save to localStorage:', error);
        handleStorageError(error);
        return false;
    }
}

// Load application state
function loadFromLocal(key = 'apexProjects') {
    try {
        const serialized = localStorage.getItem(key);
        if (!serialized) return null;
        
        const data = JSON.parse(serialized);
        
        // Validate and migrate data if needed
        return validateAndMigrate(data);
    } catch (error) {
        console.error('Failed to load from localStorage:', error);
        return null;
    }
}

// Storage usage monitoring
function updateStorageUsage() {
    const usage = JSON.stringify(AppState).length;
    const limit = 5 * 1024 * 1024; // 5MB typical limit
    const percentage = (usage / limit) * 100;
    
    if (percentage > 80) {
        showStorageWarning(percentage);
    }
    
    return { usage, limit, percentage };
}
```

#### **Data Validation and Migration**
```javascript
function validateAndMigrate(data) {
    // Check data version
    const currentVersion = '1.0';
    const dataVersion = data.version || '0.9';
    
    if (dataVersion !== currentVersion) {
        data = migrateData(data, dataVersion, currentVersion);
    }
    
    // Validate required fields
    data.projects = data.projects || [];
    data.fieldOps = data.fieldOps || { scheduled: [], completed: [], pending: [] };
    data.auditLog = data.auditLog || [];
    
    // Ensure data integrity
    data.projects.forEach(validateProject);
    
    return data;
}
```

### 2. Backup and Export

#### **JSON Export/Import**
```javascript
// Full data export
function exportData() {
    const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        data: {
            projects: AppState.projects,
            fieldOps: AppState.fieldOps,
            settings: AppState.settings,
            auditLog: AppState.auditLog
        },
        metadata: {
            totalProjects: AppState.projects.length,
            totalTasks: AppState.projects.reduce((sum, p) => sum + p.tasks.length, 0),
            totalFieldJobs: Object.values(AppState.fieldOps).flat().length
        }
    };
    
    return JSON.stringify(exportData, null, 2);
}

// Data import with validation
function importData(jsonString) {
    try {
        const importData = JSON.parse(jsonString);
        
        // Validate import format
        if (!importData.version || !importData.data) {
            throw new Error('Invalid import format');
        }
        
        // Merge with existing data or replace
        const mergeStrategy = confirm('Merge with existing data? (Cancel to replace)');
        
        if (mergeStrategy) {
            mergeImportedData(importData.data);
        } else {
            replaceAllData(importData.data);
        }
        
        return true;
    } catch (error) {
        console.error('Import failed:', error);
        return false;
    }
}
```

### 3. Backend Synchronization (Optional)

#### **Data Sync Process**
```javascript
// Synchronize with backend when available
async function syncWithBackend() {
    if (!AppState.config.USE_BACKEND) return;
    
    try {
        // Upload local changes
        const localChanges = getLocalChanges();
        if (localChanges.length > 0) {
            await uploadChanges(localChanges);
        }
        
        // Download remote changes
        const remoteChanges = await fetchRemoteChanges();
        if (remoteChanges.length > 0) {
            await mergeRemoteChanges(remoteChanges);
        }
        
        // Update sync timestamp
        AppState.lastSyncTime = new Date().toISOString();
        saveToLocal(AppState);
        
    } catch (error) {
        console.error('Sync failed:', error);
        handleSyncError(error);
    }
}

// Conflict resolution
function resolveConflicts(localData, remoteData) {
    const conflicts = [];
    
    // Compare timestamps and user preferences
    localData.projects.forEach(localProject => {
        const remoteProject = remoteData.projects.find(p => p.id === localProject.id);
        
        if (remoteProject && localProject.updatedAt !== remoteProject.updatedAt) {
            conflicts.push({
                type: 'project',
                id: localProject.id,
                local: localProject,
                remote: remoteProject
            });
        }
    });
    
    return conflicts;
}
```

---

## Performance Optimization

### 1. Storage Efficiency

#### **Data Compression**
```javascript
// Compress large data objects
function compressData(data) {
    // Remove unnecessary whitespace and null values
    const cleaned = JSON.parse(JSON.stringify(data, (key, value) => {
        if (value === null || value === undefined || value === '') {
            return undefined;
        }
        return value;
    }));
    
    return cleaned;
}

// Archive old data
function archiveOldData() {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 12); // 12 months ago
    
    const activeProjects = AppState.projects.filter(p => 
        p.status !== 'completed' || new Date(p.completedAt) > cutoffDate
    );
    
    const archivedProjects = AppState.projects.filter(p => 
        p.status === 'completed' && new Date(p.completedAt) <= cutoffDate
    );
    
    // Store archived projects separately
    saveToLocal(archivedProjects, 'apexArchivedProjects');
    
    // Keep active projects in main storage
    AppState.projects = activeProjects;
    saveToLocal(AppState);
    
    return { archived: archivedProjects.length, active: activeProjects.length };
}
```

### 2. Query Optimization

#### **Indexed Data Access**
```javascript
// Create indexes for fast lookups
function createProjectIndex() {
    const indexes = {
        byId: {},
        byStatus: {},
        byAssignee: {},
        byBusinessLine: {}
    };
    
    AppState.projects.forEach(project => {
        indexes.byId[project.id] = project;
        
        if (!indexes.byStatus[project.status]) {
            indexes.byStatus[project.status] = [];
        }
        indexes.byStatus[project.status].push(project);
        
        if (project.assignedTo) {
            if (!indexes.byAssignee[project.assignedTo]) {
                indexes.byAssignee[project.assignedTo] = [];
            }
            indexes.byAssignee[project.assignedTo].push(project);
        }
        
        if (!indexes.byBusinessLine[project.businessLine]) {
            indexes.byBusinessLine[project.businessLine] = [];
        }
        indexes.byBusinessLine[project.businessLine].push(project);
    });
    
    return indexes;
}
```

---

## Security Considerations

### 1. Data Protection

#### **Sensitive Data Handling**
- **Client-Side Encryption**: Sensitive fields encrypted before localStorage
- **Data Anonymization**: Personal information can be masked in exports
- **Access Control**: Role-based data visibility in shared environments
- **Secure Transmission**: All backend sync over HTTPS

#### **Data Validation**
```javascript
function validateProjectData(project) {
    const schema = {
        id: { required: true, type: 'string' },
        name: { required: true, type: 'string', maxLength: 255 },
        estimatedBudget: { type: 'number', min: 0, max: 10000000 },
        email: { type: 'email' }
    };
    
    return validateAgainstSchema(project, schema);
}
```

### 2. Data Integrity

#### **Consistency Checks**
```javascript
function verifyDataIntegrity() {
    const issues = [];
    
    // Check for orphaned tasks
    AppState.projects.forEach(project => {
        project.tasks.forEach(task => {
            if (task.projectId && task.projectId !== project.id) {
                issues.push(`Task ${task.id} has mismatched projectId`);
            }
        });
    });
    
    // Check for duplicate IDs
    const projectIds = new Set();
    AppState.projects.forEach(project => {
        if (projectIds.has(project.id)) {
            issues.push(`Duplicate project ID: ${project.id}`);
        }
        projectIds.add(project.id);
    });
    
    return issues;
}
```

---

## Disaster Recovery

### 1. Backup Strategy

#### **Automatic Backups**
```javascript
// Auto-backup on significant changes
function setupAutoBackup() {
    let lastBackup = localStorage.getItem('lastBackupTime');
    const backupInterval = 24 * 60 * 60 * 1000; // 24 hours
    
    if (!lastBackup || Date.now() - parseInt(lastBackup) > backupInterval) {
        createAutomaticBackup();
    }
}

function createAutomaticBackup() {
    const backupData = exportData();
    const timestamp = new Date().toISOString().split('T')[0];
    
    // Store multiple backup generations
    for (let i = 4; i >= 1; i--) {
        const oldKey = `apexBackup${i}`;
        const newKey = `apexBackup${i + 1}`;
        
        const oldBackup = localStorage.getItem(oldKey);
        if (oldBackup) {
            localStorage.setItem(newKey, oldBackup);
        }
    }
    
    // Store current backup
    localStorage.setItem('apexBackup1', backupData);
    localStorage.setItem('lastBackupTime', Date.now().toString());
}
```

### 2. Recovery Procedures

#### **Data Recovery Options**
1. **localStorage Recovery**: Restore from automatic backups
2. **Export File Recovery**: Import from user-generated backup files
3. **Backend Sync Recovery**: Re-sync from server when available
4. **Partial Recovery**: Recover individual projects or components

---

**Data Storage Architecture Version: 1.0**  
**Last Updated: 2025-09-07**  
**Next Review: 2025-10-07**