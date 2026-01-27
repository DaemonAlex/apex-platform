# APEX Platform API Documentation

## Overview
The APEX Platform is primarily a client-side web application hosted on Nginx with optional backend API services. When backend integration is enabled, the platform provides RESTful API endpoints for enhanced functionality including user authentication, data synchronization, and advanced features.

**Primary Application:** Single-page HTML application served via HTTPS  
**Host:** Nginx Web Server  
**Backend API Base URL:** `https://apex.company.com/api` (when backend enabled)  
**Protocol:** HTTPS only  
**Authentication:** JWT Bearer Token (backend features only)  
**Content-Type:** `application/json`

## Architecture Overview

### Client-Side Application
- **Single HTML File**: Complete application in `index.html` 
- **Data Storage**: Browser localStorage for offline functionality
- **External Dependencies**: CDN-hosted libraries (XLSX, jsPDF, Chart.js, etc.)
- **Responsive Design**: Mobile and desktop compatible

### Optional Backend Services
- **Node.js API**: Enhanced features when available (port 3001, proxied by Nginx)
- **User Authentication**: JWT-based authentication system
- **Data Synchronization**: Real-time data sync capabilities
- **Advanced Reporting**: Server-side report generation

---

## Table of Contents
1. [Authentication](#authentication)
2. [Projects API](#projects-api)
3. [Tasks API](#tasks-api)
4. [Field Operations API](#field-operations-api)
5. [User Management API](#user-management-api)
6. [Audit API](#audit-api)
7. [File Management API](#file-management-api)
8. [Reporting API](#reporting-api)
9. [Error Handling](#error-handling)
10. [Rate Limiting](#rate-limiting)

---

## Authentication

### POST /api/auth/login
Authenticate user and receive access token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "project_manager",
    "permissions": ["view_projects", "create_tasks"]
  }
}
```

### POST /api/auth/refresh
Refresh expired access token using refresh token.

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "15m"
}
```

### POST /api/auth/logout
Invalidate current session and tokens.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Successfully logged out"
}
```

---

## Projects API

### GET /api/projects
Retrieve all projects with filtering and pagination.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 50, max: 100)
- `status` (optional): Filter by status (planning, active, completed, on-hold)
- `businessLine` (optional): Filter by business line
- `assignee` (optional): Filter by assigned user

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "proj_123",
      "name": "Corporate Boardroom AV Upgrade",
      "description": "Complete audiovisual system upgrade...",
      "status": "active",
      "priority": "high",
      "businessLine": "corporate",
      "type": "technology_upgrade",
      "client": "Acme Corporation",
      "location": "New York, NY",
      "estimatedBudget": 150000,
      "actualBudget": 142000,
      "progress": 75,
      "startDate": "2025-08-15",
      "dueDate": "2025-10-15",
      "assignedTo": "john.doe@company.com",
      "createdAt": "2025-08-10T10:00:00.000Z",
      "updatedAt": "2025-09-07T14:30:00.000Z",
      "tasks": [...],
      "files": [...]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 125,
    "pages": 3
  }
}
```

### GET /api/projects/:id
Retrieve specific project by ID.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "proj_123",
    "name": "Corporate Boardroom AV Upgrade",
    // ... full project details including tasks and files
  }
}
```

### POST /api/projects
Create new project.

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "name": "New Project Name",
  "description": "Project description",
  "client": "Client Name",
  "location": "Project Location",
  "businessLine": "corporate",
  "type": "new_construction",
  "priority": "medium",
  "estimatedBudget": 100000,
  "startDate": "2025-09-15",
  "dueDate": "2025-12-15",
  "assignedTo": "manager@company.com"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "proj_456",
    "name": "New Project Name",
    // ... created project details
  },
  "message": "Project created successfully"
}
```

### PUT /api/projects/:id
Update existing project.

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "name": "Updated Project Name",
  "status": "active",
  "progress": 80,
  "actualBudget": 95000
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "proj_123",
    // ... updated project details
  },
  "message": "Project updated successfully"
}
```

### DELETE /api/projects/:id
Delete project and all associated data.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Project deleted successfully"
}
```

---

## Tasks API

### GET /api/projects/:projectId/tasks
Retrieve all tasks for a specific project.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "task_789",
      "name": "Install conference room displays",
      "description": "Mount and configure 4x 75\" displays",
      "status": "in-progress",
      "priority": "high",
      "assignee": "tech@company.com",
      "estimatedHours": 16,
      "actualHours": 12,
      "startDate": "2025-09-01",
      "dueDate": "2025-09-05",
      "completedAt": null,
      "createdAt": "2025-08-28T09:00:00.000Z",
      "updatedAt": "2025-09-03T15:30:00.000Z",
      "subtasks": [...],
      "notes": "Displays delivered on schedule"
    }
  ]
}
```

### POST /api/projects/:projectId/tasks
Create new task within project.

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "name": "Task Name",
  "description": "Task description",
  "assignee": "user@company.com",
  "estimatedHours": 8,
  "startDate": "2025-09-08",
  "dueDate": "2025-09-10",
  "priority": "medium"
}
```

### PUT /api/projects/:projectId/tasks/:taskId
Update specific task.

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "status": "completed",
  "actualHours": 6,
  "completedAt": "2025-09-07T16:00:00.000Z",
  "notes": "Task completed ahead of schedule"
}
```

### DELETE /api/tasks/:id
Delete specific task.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Task deleted successfully"
}
```

---

## Field Operations API

### GET /api/fieldops
Retrieve field operations data.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `status` (optional): scheduled, completed, pending
- `date` (optional): Filter by specific date (YYYY-MM-DD)
- `assignee` (optional): Filter by assigned technician/vendor
- `workType` (optional): Installation, Commissioning, Break/Fix, Maintenance

**Response:**
```json
{
  "success": true,
  "data": {
    "scheduled": [
      {
        "id": "field_123",
        "workType": "Installation",
        "title": "Install conference room AV system",
        "client": "Acme Corp",
        "location": "123 Main St, Suite 400",
        "assignedTo": "John Tech",
        "vendor": false,
        "date": "2025-09-08",
        "startTime": "09:00",
        "duration": 8,
        "status": "scheduled",
        "projectId": "proj_123",
        "taskId": "task_456",
        "projectCode": "AC-2025-001",
        "notes": "Bring additional HDMI cables",
        "rescheduleHistory": [],
        "rescheduleCount": 0,
        "createdAt": "2025-09-05T10:00:00.000Z"
      }
    ],
    "completed": [...],
    "pending": [...]
  }
}
```

### POST /api/fieldops
Schedule new field work.

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "workType": "Installation",
  "title": "Install AV equipment",
  "client": "Client Name",
  "location": "Work Location",
  "assignedTo": "Technician Name",
  "vendor": false,
  "date": "2025-09-10",
  "startTime": "10:00",
  "duration": 6,
  "projectId": "proj_123",
  "taskId": "task_456",
  "notes": "Special instructions"
}
```

### PUT /api/fieldops/:id
Update field work (including reschedule).

**Headers:** `Authorization: Bearer <token>`

**Request (for reschedule):**
```json
{
  "action": "reschedule",
  "newDate": "2025-09-12",
  "newStartTime": "11:00",
  "rescheduleReason": "Parts Delay",
  "otherReason": null,
  "rescheduleNotes": "Parts expected Monday"
}
```

**Request (for completion):**
```json
{
  "action": "complete",
  "completedAt": "2025-09-08T17:00:00.000Z",
  "completionNotes": "Work completed successfully"
}
```

### GET /api/fieldops/analytics
Retrieve field operations analytics.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalJobs": 245,
    "completedJobs": 198,
    "scheduledJobs": 32,
    "pendingJobs": 15,
    "workTypeDistribution": {
      "Installation": 98,
      "Commissioning": 67,
      "Break/Fix": 45,
      "Maintenance": 35
    },
    "rescheduleAnalytics": {
      "rescheduleRate": 12,
      "totalReschedules": 34,
      "rescheduleReasons": {
        "Parts Delay": 15,
        "Vendor Delay": 8,
        "Client Reschedule": 6,
        "Vendor No-Show": 3,
        "Other": 2
      }
    },
    "resourceUtilization": {
      "John Tech": 23,
      "Vendor ABC (Vendor)": 18,
      "Tech Services Co (Vendor)": 15
    }
  }
}
```

---

## User Management API

### GET /api/users
Retrieve user list (admin only).

**Headers:** `Authorization: Bearer <token>`

**Required Permissions:** `['admin', 'owner', 'superadmin']`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "user_123",
      "email": "john.doe@company.com",
      "name": "John Doe",
      "role": "project_manager",
      "active": true,
      "lastLogin": "2025-09-07T08:30:00.000Z",
      "createdAt": "2025-01-15T10:00:00.000Z",
      "permissions": ["view_projects", "create_tasks", "edit_tasks"]
    }
  ]
}
```

### POST /api/users
Create new user (admin only).

**Headers:** `Authorization: Bearer <token>`

**Required Permissions:** `['admin', 'owner', 'superadmin']`

**Request:**
```json
{
  "email": "newuser@company.com",
  "name": "New User",
  "password": "securepassword",
  "role": "team_member"
}
```

### PUT /api/users/:id
Update user information.

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "name": "Updated Name",
  "role": "project_manager",
  "active": true
}
```

### DELETE /api/users/:id
Deactivate user account (admin only).

**Headers:** `Authorization: Bearer <token>`

**Required Permissions:** `['admin', 'owner']`

---

## Audit API

### GET /api/audit/logs
Retrieve audit logs.

**Headers:** `Authorization: Bearer <token>`

**Required Permissions:** `['admin', 'auditor', 'owner']`

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Results per page (max 100)
- `action` (optional): Filter by action type
- `entity` (optional): Filter by entity type
- `user` (optional): Filter by user
- `startDate` (optional): Filter from date
- `endDate` (optional): Filter to date

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "audit_123",
      "timestamp": "2025-09-07T14:30:00.000Z",
      "action": "project.update",
      "entity": "project",
      "entityId": "proj_123",
      "entityName": "Corporate Boardroom Upgrade",
      "actor": {
        "id": "user_456",
        "name": "John Doe",
        "email": "john.doe@company.com"
      },
      "details": "Updated project status from 'active' to 'completed'",
      "diff": {
        "before": { "status": "active", "progress": 95 },
        "after": { "status": "completed", "progress": 100 }
      },
      "meta": {
        "userAgent": "Mozilla/5.0...",
        "ipAddress": "192.168.1.100",
        "sessionId": "sess_789"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1247,
    "pages": 25
  }
}
```

### POST /api/audit/log
Create new audit log entry (system use).

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "action": "custom.action",
  "entity": "entity_type",
  "entityId": "entity_123",
  "entityName": "Entity Name",
  "details": "Description of action",
  "meta": {
    "additional": "metadata"
  }
}
```

---

## File Management API

### POST /api/files/upload
Upload file attachment.

**Headers:** 
- `Authorization: Bearer <token>`
- `Content-Type: multipart/form-data`

**Form Data:**
- `file`: File to upload
- `projectId`: Associated project ID
- `description`: File description

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "file_123",
    "filename": "floor_plan.pdf",
    "originalName": "Corporate Floor Plan.pdf",
    "size": 2048576,
    "mimeType": "application/pdf",
    "projectId": "proj_123",
    "description": "Building floor plan for AV installation",
    "uploadedBy": "user_456",
    "createdAt": "2025-09-07T15:00:00.000Z",
    "downloadUrl": "/api/files/download/file_123"
  }
}
```

### GET /api/files/download/:id
Download file by ID.

**Headers:** `Authorization: Bearer <token>`

**Response:** File binary data with appropriate headers

### DELETE /api/files/:id
Delete file attachment.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

---

## Reporting API

### GET /api/reports/dashboard
Get executive dashboard data.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `dateRange` (optional): 30d, 60d, 90d, ytd, custom
- `startDate` (optional): For custom date range
- `endDate` (optional): For custom date range

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalProjects": 245,
      "activeProjects": 67,
      "completedProjects": 178,
      "totalBudget": 12500000,
      "actualSpend": 11800000
    },
    "projectsByStatus": {
      "planning": 15,
      "active": 52,
      "completed": 178
    },
    "budgetAnalysis": {
      "onBudget": 89,
      "overBudget": 12,
      "underBudget": 77
    },
    "timelinePerformance": {
      "onTime": 156,
      "delayed": 22,
      "ahead": 67
    },
    "resourceUtilization": {...},
    "fieldOperations": {...}
  }
}
```

### GET /api/reports/export
Export data in various formats.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `type`: projects, tasks, fieldops, audit
- `format`: json, csv, xlsx
- `filters`: JSON encoded filter parameters

**Response:** File download or JSON data based on format

---

## Error Handling

### Standard Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ],
    "timestamp": "2025-09-07T15:30:00.000Z",
    "requestId": "req_123456"
  }
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| AUTHENTICATION_REQUIRED | 401 | Valid JWT token required |
| AUTHORIZATION_FAILED | 403 | Insufficient permissions |
| VALIDATION_ERROR | 400 | Request validation failed |
| RESOURCE_NOT_FOUND | 404 | Requested resource not found |
| DUPLICATE_RESOURCE | 409 | Resource already exists |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| INTERNAL_SERVER_ERROR | 500 | Unexpected server error |
| SERVICE_UNAVAILABLE | 503 | Service temporarily unavailable |

---

## Rate Limiting

### Rate Limit Headers

All API responses include rate limiting headers:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1630000000
X-RateLimit-Window: 3600
```

### Rate Limits by Endpoint Category

| Category | Requests per Hour | Notes |
|----------|------------------|-------|
| Authentication | 20 | Per IP address |
| Read Operations | 5000 | Per authenticated user |
| Write Operations | 1000 | Per authenticated user |
| File Uploads | 100 | Per authenticated user |
| Report Generation | 50 | Per authenticated user |
| Admin Operations | 500 | Admin users only |

### Rate Limit Exceeded Response

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Try again later.",
    "retryAfter": 3600,
    "timestamp": "2025-09-07T15:30:00.000Z"
  }
}
```

---

## Pagination

### Request Parameters

- `page`: Page number (1-based, default: 1)
- `limit`: Items per page (default: 50, max: 100)
- `sort`: Sort field (default varies by endpoint)
- `order`: Sort order (asc/desc, default: desc)

### Response Format

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 50,
    "total": 247,
    "pages": 5,
    "hasNext": true,
    "hasPrevious": true
  }
}
```

---

## Webhooks (Future Feature)

### Webhook Events

- `project.created`
- `project.updated`
- `project.completed`
- `task.created`
- `task.completed`
- `fieldwork.scheduled`
- `fieldwork.completed`
- `fieldwork.rescheduled`

### Webhook Payload Example

```json
{
  "event": "project.completed",
  "timestamp": "2025-09-07T16:00:00.000Z",
  "data": {
    "projectId": "proj_123",
    "projectName": "Corporate Boardroom Upgrade",
    "completedBy": "john.doe@company.com",
    "completionDate": "2025-09-07T16:00:00.000Z"
  },
  "signature": "sha256=..."
}
```

---

## SDK and Integration Examples

### JavaScript/Node.js Example

```javascript
const axios = require('axios');

class ApexAPI {
  constructor(baseURL, token) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async getProjects(filters = {}) {
    const response = await this.client.get('/projects', { params: filters });
    return response.data;
  }

  async createProject(projectData) {
    const response = await this.client.post('/projects', projectData);
    return response.data;
  }

  async scheduleFieldWork(fieldWorkData) {
    const response = await this.client.post('/fieldops', fieldWorkData);
    return response.data;
  }
}

// Usage
const api = new ApexAPI('https://localhost:3001/api', 'your-jwt-token');
const projects = await api.getProjects({ status: 'active' });
```

### Python Example

```python
import requests
from typing import Dict, List, Optional

class ApexAPI:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
    
    def get_projects(self, filters: Optional[Dict] = None) -> Dict:
        response = requests.get(
            f'{self.base_url}/projects',
            headers=self.headers,
            params=filters or {}
        )
        return response.json()
    
    def create_project(self, project_data: Dict) -> Dict:
        response = requests.post(
            f'{self.base_url}/projects',
            headers=self.headers,
            json=project_data
        )
        return response.json()

# Usage
api = ApexAPI('https://localhost:3001/api', 'your-jwt-token')
projects = api.get_projects({'status': 'active'})
```

---

**API Documentation Version: 1.0**  
**Last Updated: 2025-09-07**  
**Next Review: 2025-10-07**