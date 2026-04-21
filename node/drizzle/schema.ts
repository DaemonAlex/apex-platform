// =============================================================================
// Drizzle ORM Schema - Single Source of Truth for APEX Platform Database
// =============================================================================
//
// This file defines ALL 32 tables in the apex_db PostgreSQL database.
// It is the authoritative schema definition. To add or modify columns:
//   1. Edit this file
//   2. Run: npx drizzle-kit push   (or: npm run db:push)
//   3. Restart the backend: nssm restart APEX-Backend
//
// NEVER add CREATE TABLE or ALTER TABLE statements to route files.
// =============================================================================

import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  date,
  index,
  unique,
} from 'drizzle-orm/pg-core';

// =============================================================================
// CONFIG
// =============================================================================

export const appconfig = pgTable('appconfig', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// AUTH & USERS
// =============================================================================

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique('users_email_key'),
  password: varchar('password', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).default('auditor'),
  preferences: text('preferences'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }).defaultNow(),
  passwordExpiresAt: timestamp('password_expires_at', { withTimezone: true }),
  forcePasswordChange: boolean('force_password_change').default(false),
  avatar: text('avatar'),
});

// TOTP second-factor — P1-3 2026-04-18. One row per user who has enrolled.
// secret_encrypted is AES-256-GCM ciphertext of the raw base32 secret,
// encoded as `iv:tag:ciphertext` base64. backup_codes_hash holds bcrypt
// hashes of one-time recovery codes; entries are nulled on use.
export const userTotp = pgTable('user_totp', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  secretEncrypted: text('secret_encrypted').notNull(),
  enabledAt: timestamp('enabled_at', { withTimezone: true }),
  backupCodesHash: jsonb('backup_codes_hash').default([]),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Refresh tokens — P1-1 2026-04-18. Opaque random tokens (not JWTs) hashed
// with SHA-256 before storage. Revoked on logout or when replaced. Sliding
// 14-day TTL. user_agent + ip recorded for the session-management UI
// planned in P3.
export const refreshTokens = pgTable('refresh_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique('refresh_tokens_hash_key'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  userAgent: text('user_agent'),
  ip: varchar('ip', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('refresh_tokens_user_idx').on(table.userId),
  index('refresh_tokens_expires_idx').on(table.expiresAt),
]);

// Account lockout — added 2026-04-18 for P1-2. Tracks consecutive failed
// logins per lowercased username. Successful login deletes the row. Lock
// escalates: 5 fails → 15m, 10 → 1h, 15 → 24h. Respond 423 while locked.
export const authFailures = pgTable('auth_failures', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 255 }).notNull().unique('auth_failures_username_key'),
  count: integer('count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }).defaultNow(),
  lastIp: varchar('last_ip', { length: 64 }),
}, (table) => [
  index('auth_failures_locked_idx').on(table.lockedUntil),
]);

export const passwordResetTokens = pgTable('passwordresettokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 255 }).notNull().unique('passwordresettokens_token_key'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used: boolean('used').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull().unique('roles_name_key'),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  description: text('description').default(''),
  permissions: jsonb('permissions').notNull().default([]),
  priority: integer('priority').default(0),
  isSystem: boolean('is_system').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// PROJECTS
// =============================================================================

export const projects = pgTable('projects', {
  id: varchar('id', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  client: varchar('client', { length: 255 }),
  type: varchar('type', { length: 100 }),
  status: varchar('status', { length: 50 }).default('planning'),
  budget: numeric('budget', { precision: 12, scale: 2 }).default('0'),
  actualBudget: numeric('actualbudget', { precision: 12, scale: 2 }).default('0'),
  startDate: timestamp('startdate', { withTimezone: true }),
  endDate: timestamp('enddate', { withTimezone: true }),
  description: text('description'),
  tasks: jsonb('tasks'),
  requestorInfo: varchar('requestorinfo', { length: 500 }),
  siteLocation: varchar('sitelocation', { length: 500 }),
  businessLine: varchar('businessline', { length: 255 }),
  progress: integer('progress').default(0),
  priority: varchar('priority', { length: 50 }),
  requestDate: timestamp('requestdate', { withTimezone: true }),
  dueDate: timestamp('duedate', { withTimezone: true }),
  estimatedBudget: numeric('estimatedbudget', { precision: 12, scale: 2 }).default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  costCenter: varchar('costcenter', { length: 255 }),
  purchaseOrder: varchar('purchaseorder', { length: 255 }),
  parentProjectId: varchar('parent_project_id', { length: 50 }),
  ticketNumbers: jsonb('ticket_numbers').default([]),
  locationId: integer('location_id'),
  projectManager: varchar('project_manager', { length: 255 }),
  stakeholders: jsonb('stakeholders').default([]),
  floorId: integer('floor_id'),
  estimatedHours: numeric('estimatedhours', { precision: 10, scale: 2 }),
  actualHours: numeric('actualhours', { precision: 10, scale: 2 }),
  timeEntries: text('timeentries'),
  ragStatus: varchar('ragstatus', { length: 10 }),
  ragReason: varchar('ragreason', { length: 255 }),
  createdByUserId: integer('created_by_user_id'),
});

// project_members — membership table introduced 2026-04-17 for ASRB IDOR fix.
// Admin / superadmin / owner roles bypass this table entirely and see all
// projects. Every other authenticated user (project_manager, field_ops,
// auditor, viewer, anything custom) must be a row in this table to read or
// write the project, otherwise the endpoint returns 404 (not 403, to avoid
// project-id enumeration).
export const projectMembers = pgTable('project_members', {
  id: serial('id').primaryKey(),
  projectId: varchar('project_id', { length: 50 }).notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull().default('viewer'),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow(),
  addedByUserId: integer('added_by_user_id'),
}, (table) => [
  unique('project_members_project_user_key').on(table.projectId, table.userId),
  index('project_members_user_idx').on(table.userId),
  index('project_members_project_idx').on(table.projectId),
]);

export const projectNotes = pgTable('projectnotes', {
  id: serial('id').primaryKey(),
  projectId: varchar('project_id', { length: 50 }).notNull(),
  author: varchar('author', { length: 255 }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const projectDocuments = pgTable('projectdocuments', {
  id: serial('id').primaryKey(),
  projectId: varchar('project_id', { length: 50 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }),
  fileSize: integer('file_size'),
  uploadedBy: varchar('uploaded_by', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const projectRooms = pgTable('projectrooms', {
  id: serial('id').primaryKey(),
  projectId: varchar('project_id', { length: 50 }).notNull(),
  roomId: varchar('room_id', { length: 100 }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  unique('projectrooms_project_id_room_id_key').on(table.projectId, table.roomId),
]);

export const siteVisits = pgTable('sitevisits', {
  id: serial('id').primaryKey(),
  projectId: varchar('project_id', { length: 50 }).notNull(),
  visitor: varchar('visitor', { length: 255 }).notNull(),
  visitDate: timestamp('visit_date', { withTimezone: true }).notNull(),
  purpose: varchar('purpose', { length: 255 }),
  summary: text('summary'),
  ticketNumber: varchar('ticket_number', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// CONTACTS & ASSIGNMENTS
// =============================================================================

export const contacts = pgTable('contacts', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  organization: varchar('organization', { length: 255 }),
  role: varchar('role', { length: 100 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  type: varchar('type', { length: 50 }).notNull().default('internal'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const projectAssignments = pgTable('projectassignments', {
  id: serial('id').primaryKey(),
  projectId: varchar('project_id', { length: 50 }).notNull(),
  contactId: integer('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 100 }),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  isActive: boolean('is_active').default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// MEETINGS & SUBMITTALS
// =============================================================================

export const meetings = pgTable('meetings', {
  id: serial('id').primaryKey(),
  projectId: varchar('project_id', { length: 50 }).notNull(),
  meetingType: varchar('meeting_type', { length: 50 }).default('oac'),
  title: varchar('title', { length: 255 }).notNull(),
  meetingDate: timestamp('meeting_date', { withTimezone: true }).notNull(),
  attendees: jsonb('attendees').default([]),
  agenda: jsonb('agenda').default([]),
  notes: text('notes'),
  actionItems: jsonb('action_items').default([]),
  createdBy: varchar('created_by', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const submittals = pgTable('submittals', {
  id: serial('id').primaryKey(),
  projectId: varchar('project_id', { length: 50 }).notNull(),
  type: varchar('type', { length: 20 }).notNull().default('submittal'),
  number: varchar('number', { length: 50 }),
  title: varchar('title', { length: 255 }).notNull(),
  submittedBy: integer('submitted_by').references(() => contacts.id),
  status: varchar('status', { length: 50 }).default('pending'),
  submittedDate: timestamp('submitted_date', { withTimezone: true }),
  responseDate: timestamp('response_date', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// FIELD OPS
// =============================================================================

export const fieldops = pgTable('fieldops', {
  id: serial('id').primaryKey(),
  projectId: varchar('project_id', { length: 50 }).references(() => projects.id, { onDelete: 'cascade' }),
  taskId: varchar('task_id', { length: 100 }),
  taskName: varchar('task_name', { length: 500 }).notNull(),
  projectName: varchar('project_name', { length: 500 }),
  type: varchar('type', { length: 50 }).default('service'),
  location: varchar('location', { length: 500 }),
  scheduledDate: timestamp('scheduled_date', { withTimezone: true }).notNull(),
  startTime: varchar('start_time', { length: 20 }).default('9:00 AM'),
  endTime: varchar('end_time', { length: 20 }).default('5:00 PM'),
  assignee: varchar('assignee', { length: 255 }),
  status: varchar('status', { length: 50 }).default('scheduled'),
  notes: text('notes'),
  estimatedDuration: integer('estimated_duration'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completedBy: varchar('completed_by', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  ticketNumbers: jsonb('ticket_numbers').default([]),
  vendorId: integer('vendor_id'),
  vendorContact: varchar('vendor_contact', { length: 255 }),
  assignedType: varchar('assigned_type', { length: 20 }).default('internal'),
  roomId: integer('room_id'),
  serviceCategory: varchar('service_category', { length: 50 }).default('project'),
  priority: varchar('priority', { length: 20 }).default('normal'),
  responseTimeHours: numeric('response_time_hours', { precision: 6, scale: 1 }),
  vendorName: varchar('vendor_name', { length: 255 }),
});

export const fieldOpNotes = pgTable('fieldopnotes', {
  id: serial('id').primaryKey(),
  fieldopId: integer('fieldop_id').notNull(),
  author: varchar('author', { length: 255 }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// LOCATIONS & ROOMS
// =============================================================================

export const locations = pgTable('locations', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  address: varchar('address', { length: 500 }),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 50 }),
  zip: varchar('zip', { length: 20 }),
  contactName: varchar('contact_name', { length: 255 }),
  contactPhone: varchar('contact_phone', { length: 50 }),
  contactEmail: varchar('contact_email', { length: 255 }),
  notes: text('notes'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const floors = pgTable('floors', {
  id: serial('id').primaryKey(),
  locationId: integer('location_id').notNull().references(() => locations.id),
  name: varchar('name', { length: 50 }).notNull(),
  sortOrder: integer('sort_order').default(0),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const rooms = pgTable('rooms', {
  id: serial('id').primaryKey(),
  roomId: varchar('room_id', { length: 100 }).notNull().unique('rooms_room_id_key'),
  name: varchar('name', { length: 255 }).notNull(),
  scheduleDay: integer('schedule_day').notNull(),
  scheduleDayName: varchar('schedule_day_name', { length: 20 }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  roomType: varchar('room_type', { length: 50 }),
  capacity: integer('capacity'),
  location: varchar('location', { length: 255 }),
  floor: varchar('floor', { length: 50 }),
  standardId: integer('standard_id'),
  locationId: integer('location_id'),
  floorId: integer('floor_id'),
  checkFrequency: varchar('check_frequency', { length: 20 }).default('weekly'),
  checkDay: integer('check_day'),
});

export const roomCheckHistory = pgTable('roomcheckhistory', {
  id: serial('id').primaryKey(),
  roomId: varchar('room_id', { length: 100 }).notNull(),
  checkedBy: varchar('checked_by', { length: 255 }),
  ragStatus: varchar('rag_status', { length: 20 }).notNull(),
  limitedFunctionality: text('limited_functionality'),
  nonFunctionalReason: text('non_functional_reason'),
  check1Video: boolean('check_1_video').default(false),
  check2Display: boolean('check_2_display').default(false),
  check3Audio: boolean('check_3_audio').default(false),
  check4Camera: boolean('check_4_camera').default(false),
  check5Network: boolean('check_5_network').default(false),
  notes: text('notes'),
  checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow(),
  issueFound: boolean('issue_found').default(false),
  issueDescription: text('issue_description'),
  ticketNumber: varchar('ticket_number', { length: 100 }),
});

export const roomEquipment = pgTable('roomequipment', {
  id: serial('id').primaryKey(),
  roomId: varchar('room_id', { length: 100 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  make: varchar('make', { length: 100 }),
  model: varchar('model', { length: 150 }),
  serialNumber: varchar('serial_number', { length: 100 }),
  firmwareVersion: varchar('firmware_version', { length: 50 }),
  installDate: date('install_date'),
  warrantyEnd: date('warranty_end'),
  status: varchar('status', { length: 50 }).default('active'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const roomStandards = pgTable('roomstandards', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  requiredEquipment: jsonb('required_equipment').default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const roomTechDetails = pgTable('roomtechdetails', {
  id: serial('id').primaryKey(),
  roomId: varchar('room_id', { length: 100 }).notNull().unique('roomtechdetails_room_id_key'),
  platform: varchar('platform', { length: 50 }),
  platformVersion: varchar('platform_version', { length: 50 }),
  ciscoWorkspaceId: varchar('cisco_workspace_id', { length: 100 }),
  ciscoActivationCode: varchar('cisco_activation_code', { length: 100 }),
  ciscoDeviceSerial: varchar('cisco_device_serial', { length: 100 }),
  ciscoRegistrationStatus: varchar('cisco_registration_status', { length: 50 }),
  networkJacks: jsonb('network_jacks').default([]),
  devices: jsonb('devices').default([]),
  cableRuns: jsonb('cable_runs').default([]),
  credentials: jsonb('credentials').default([]),
  vlan: varchar('vlan', { length: 50 }),
  switchName: varchar('switch_name', { length: 100 }),
  switchPort: varchar('switch_port', { length: 50 }),
  poeStatus: varchar('poe_status', { length: 50 }),
  wifiSsid: varchar('wifi_ssid', { length: 100 }),
  notes: text('notes'),
  updatedBy: varchar('updated_by', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  ceilingType: varchar('ceiling_type', { length: 100 }),
  ceilingHeight: varchar('ceiling_height', { length: 50 }),
  tableType: varchar('table_type', { length: 100 }),
  tableSeats: integer('table_seats'),
  existingAv: text('existing_av'),
  cablePathways: text('cable_pathways'),
  powerLocations: text('power_locations'),
  mountingSurfaces: text('mounting_surfaces'),
  roomDimensions: varchar('room_dimensions', { length: 100 }),
  vendorAccessNotes: text('vendor_access_notes'),
});

// =============================================================================
// DOCUMENTS (generic entity-based)
// =============================================================================

export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: varchar('entity_id', { length: 100 }).notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  fileSize: integer('file_size'),
  mimeType: varchar('mime_type', { length: 100 }),
  docType: varchar('doc_type', { length: 50 }).default('other'),
  description: text('description'),
  uploadedBy: varchar('uploaded_by', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// VENDORS
// =============================================================================

export const vendors = pgTable('vendors', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull().default('external'),
  category: varchar('category', { length: 100 }),
  website: varchar('website', { length: 255 }),
  address: varchar('address', { length: 500 }),
  notes: text('notes'),
  contacts: jsonb('contacts').default([]),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const vendorAssignments = pgTable('vendorassignments', {
  id: serial('id').primaryKey(),
  vendorId: integer('vendor_id').notNull().references(() => vendors.id),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: varchar('entity_id', { length: 100 }).notNull(),
  role: varchar('role', { length: 100 }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// CISCO INTEGRATION
// =============================================================================

export const ciscoDevices = pgTable('cisco_devices', {
  id: serial('id').primaryKey(),
  deviceId: varchar('device_id', { length: 255 }).notNull().unique('cisco_devices_device_id_key'),
  displayName: varchar('display_name', { length: 255 }),
  product: varchar('product', { length: 255 }),
  type: varchar('type', { length: 100 }),
  status: varchar('status', { length: 50 }),
  serial: varchar('serial', { length: 100 }),
  mac: varchar('mac', { length: 50 }),
  ip: varchar('ip', { length: 50 }),
  workspaceId: varchar('workspace_id', { length: 255 }),
  orgId: varchar('org_id', { length: 255 }),
  lastSeen: timestamp('last_seen', { withTimezone: true }),
  rawData: jsonb('raw_data').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const ciscoSyncLog = pgTable('cisco_sync_log', {
  id: serial('id').primaryKey(),
  syncType: varchar('sync_type', { length: 50 }).notNull(),
  recordsSynced: integer('records_synced').default(0),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const ciscoLocations = pgTable('cisco_locations', {
  id: serial('id').primaryKey(),
  locationId: varchar('location_id', { length: 255 }).notNull().unique('cisco_locations_location_id_key'),
  displayName: varchar('display_name', { length: 255 }),
  orgId: varchar('org_id', { length: 255 }),
  address: jsonb('address').default({}),
  floors: jsonb('floors').default([]),
  rawData: jsonb('raw_data').default({}),
  syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow(),
});

export const ciscoWorkspaces = pgTable('cisco_workspaces', {
  id: serial('id').primaryKey(),
  workspaceId: varchar('workspace_id', { length: 255 }).notNull().unique('cisco_workspaces_workspace_id_key'),
  displayName: varchar('display_name', { length: 255 }),
  orgId: varchar('org_id', { length: 255 }),
  type: varchar('type', { length: 100 }),
  capacity: integer('capacity').default(0),
  locationId: varchar('location_id', { length: 255 }),
  floorId: varchar('floor_id', { length: 255 }),
  calling: jsonb('calling').default({}),
  sipAddress: varchar('sip_address', { length: 255 }),
  rawData: jsonb('raw_data').default({}),
  syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow(),
});

export const ciscoRoomChecks = pgTable('cisco_room_checks', {
  id: serial('id').primaryKey(),
  workspaceId: varchar('workspace_id', { length: 255 }).notNull(),
  workspaceName: varchar('workspace_name', { length: 255 }),
  checkedBy: varchar('checked_by', { length: 255 }),
  status: varchar('status', { length: 20 }).default('pass'),
  notes: text('notes'),
  snowTicket: varchar('snow_ticket', { length: 100 }),
  checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow(),
});

export const ciscoRoomSchedules = pgTable('cisco_room_schedules', {
  workspaceId: varchar('workspace_id', { length: 255 }).primaryKey(),
  workspaceName: varchar('workspace_name', { length: 255 }),
  checkFrequency: varchar('check_frequency', { length: 20 }).default('weekly'),
  checkDay: integer('check_day').default(1),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// AUDIT LOG
// =============================================================================

export const auditlog = pgTable('auditlog', {
  id: varchar('id', { length: 100 }).primaryKey(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  user: varchar('user', { length: 255 }),
  action: varchar('action', { length: 500 }).notNull(),
  resource: varchar('resource', { length: 500 }).default(''),
  details: text('details').default(''),
  projectId: varchar('projectid', { length: 50 }),
  taskId: varchar('taskid', { length: 50 }),
  category: varchar('category', { length: 50 }).default('general'),
  severity: varchar('severity', { length: 20 }).default('info'),
  ipAddress: varchar('ipaddress', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('audit_timestamp_idx').on(table.timestamp),
  index('audit_category_idx').on(table.category),
  index('audit_severity_idx').on(table.severity),
]);
