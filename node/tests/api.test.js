/**
 * APEX API Contract Tests
 * Verifies all key endpoints return expected data shapes.
 * Run with: npm test (from node/ directory)
 */
const { api } = require('./setup');

// ==================== HEALTH ====================

describe('Health', () => {
  test('GET /health returns healthy status', async () => {
    const res = await fetch((process.env.APEX_TEST_URL || 'http://localhost:3001') + '/health');
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('service');
  });
});

// ==================== FIELD OPS ====================

describe('Field Ops API', () => {
  test('GET /api/fieldops returns grouped arrays', async () => {
    const { status, data } = await api('/fieldops');
    expect(status).toBe(200);
    expect(data).toHaveProperty('scheduled');
    expect(data).toHaveProperty('completed');
    expect(data).toHaveProperty('pending');
    expect(Array.isArray(data.scheduled)).toBe(true);
  });

  test('field op objects have required fields', async () => {
    const { data } = await api('/fieldops');
    const all = [...data.scheduled, ...data.completed, ...data.pending];
    if (all.length > 0) {
      const op = all[0];
      expect(op).toHaveProperty('id');
      expect(op).toHaveProperty('taskName');
      expect(op).toHaveProperty('status');
      expect(op).toHaveProperty('assignedType');
      expect(op).toHaveProperty('serviceCategory');
      expect(op).toHaveProperty('priority');
    }
  });

  test('GET /api/fieldops/report returns summary and breakdowns', async () => {
    const { status, data } = await api('/fieldops/report');
    expect(status).toBe(200);
    expect(data).toHaveProperty('summary');
    expect(data.summary).toHaveProperty('total');
    expect(data.summary).toHaveProperty('completed');
    expect(data.summary).toHaveProperty('completionRate');
    expect(data).toHaveProperty('byType');
    expect(data).toHaveProperty('byAssignee');
    expect(data).toHaveProperty('byMonth');
    expect(data).toHaveProperty('byVendor');
    expect(data).toHaveProperty('byCategory');
    expect(data).toHaveProperty('teamWorkload');
    expect(data).toHaveProperty('vendorPerformance');
    expect(data).toHaveProperty('flags');
    expect(Array.isArray(data.flags)).toBe(true);
  });

  let createdId = null;

  test('POST /api/fieldops creates with new fields', async () => {
    const { status, data } = await api('/fieldops', {
      method: 'POST',
      body: JSON.stringify({
        taskName: 'Test Field Op (auto-test)',
        type: 'service',
        location: 'Test Location',
        scheduledDate: new Date().toISOString().split('T')[0],
        serviceCategory: 'service_call',
        assignedType: 'internal',
        assignee: 'Test User',
        priority: 'high',
      }),
    });
    expect(status).toBe(201);
    expect(data).toHaveProperty('fieldOp');
    expect(data.fieldOp.serviceCategory).toBe('service_call');
    expect(data.fieldOp.priority).toBe('high');
    expect(data.fieldOp.assignedType).toBe('internal');
    createdId = data.fieldOp.dbId;
  });

  test('DELETE created test field op', async () => {
    if (!createdId) return;
    const { status } = await api(`/fieldops/${createdId}`, { method: 'DELETE' });
    expect(status).toBe(200);
  });
});

// ==================== PROJECTS ====================

describe('Projects API', () => {
  test('GET /api/projects returns projects array with pagination', async () => {
    const { status, data } = await api('/projects?summary=true&limit=5');
    expect(status).toBe(200);
    expect(data).toHaveProperty('projects');
    expect(data).toHaveProperty('pagination');
    expect(Array.isArray(data.projects)).toBe(true);
    expect(data.pagination).toHaveProperty('total');
  });

  test('project objects have id and name', async () => {
    const { data } = await api('/projects?summary=true&limit=5');
    if (data.projects.length > 0) {
      const p = data.projects[0];
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('status');
    }
  });
});

// ==================== ROOM STATUS ====================

describe('Room Status API', () => {
  test('GET /api/room-status returns rooms array', async () => {
    const { status, data } = await api('/room-status');
    expect(status).toBe(200);
    expect(data).toHaveProperty('rooms');
    expect(Array.isArray(data.rooms)).toBe(true);
  });

  test('GET /api/room-status/compliance/scorecard returns summary', async () => {
    const { status, data } = await api('/room-status/compliance/scorecard');
    expect(status).toBe(200);
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('rooms');
    expect(data.summary).toHaveProperty('total');
  });
});

// ==================== VENDORS ====================

describe('Vendors API', () => {
  test('GET /api/vendors returns vendors array', async () => {
    const { status, data } = await api('/vendors');
    expect(status).toBe(200);
    const vendors = data.vendors || data;
    expect(Array.isArray(vendors)).toBe(true);
    if (vendors.length > 0) {
      expect(vendors[0]).toHaveProperty('id');
      expect(vendors[0]).toHaveProperty('name');
    }
  });
});

// ==================== DASHBOARD ====================

describe('Dashboard APIs', () => {
  test('GET /api/reports/portfolio returns expected shape', async () => {
    const { status, data } = await api('/reports/portfolio');
    expect(status).toBe(200);
    expect(data).toHaveProperty('projects');
    expect(data.projects).toHaveProperty('total');
    expect(data).toHaveProperty('budget');
    expect(data).toHaveProperty('tasks');
  });

  test('GET /api/reports/attention returns attention feed', async () => {
    const { status, data } = await api('/reports/attention');
    expect(status).toBe(200);
    expect(data).toHaveProperty('attention');
    expect(data).toHaveProperty('today');
    expect(data).toHaveProperty('counts');
    expect(Array.isArray(data.attention)).toBe(true);
  });
});

// ==================== CONTACTS ====================

describe('Contacts API', () => {
  test('GET /api/contacts returns contacts array', async () => {
    const { status, data } = await api('/contacts');
    expect(status).toBe(200);
    const contacts = data.contacts || data;
    expect(Array.isArray(contacts)).toBe(true);
  });
});

// ==================== USERS ====================

describe('Users API', () => {
  test('GET /api/users returns users array', async () => {
    const { status, data } = await api('/users');
    expect(status).toBe(200);
    expect(data).toHaveProperty('users');
    expect(Array.isArray(data.users)).toBe(true);
    if (data.users.length > 0) {
      expect(data.users[0]).toHaveProperty('email');
      expect(data.users[0]).toHaveProperty('name');
    }
  });
});
