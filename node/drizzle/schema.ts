import { pgTable, serial, varchar, text, integer, numeric, boolean, timestamp, jsonb, date } from 'drizzle-orm/pg-core';

// ==================== LOCATIONS & ROOMS ====================

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
  roomId: varchar('room_id', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  roomType: varchar('room_type', { length: 50 }),
  capacity: integer('capacity'),
  checkFrequency: varchar('check_frequency', { length: 20 }).default('weekly').notNull(),
  checkDay: integer('check_day'),
  locationId: integer('location_id').references(() => locations.id),
  floorId: integer('floor_id').references(() => floors.id),
  standardId: integer('standard_id').references(() => roomStandards.id),
  // Legacy text fields (kept for backward compat during migration)
  location: varchar('location', { length: 255 }),
  floor: varchar('floor', { length: 50 }),
  scheduleDay: integer('schedule_day').default(1).notNull(),
  scheduleDayName: varchar('schedule_day_name', { length: 20 }).default('').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const roomCheckHistory = pgTable('roomcheckhistory', {
  id: serial('id').primaryKey(),
  roomId: varchar('room_id', { length: 100 }).notNull(),
  checkedBy: varchar('checked_by', { length: 255 }).notNull(),
  ragStatus: varchar('rag_status', { length: 20 }).default('green').notNull(),
  issueFound: boolean('issue_found').default(false),
  issueDescription: text('issue_description'),
  ticketNumber: varchar('ticket_number', { length: 100 }),
  check1Video: boolean('check_1_video').default(false),
  check2Display: boolean('check_2_display').default(false),
  check3Audio: boolean('check_3_audio').default(false),
  check4Camera: boolean('check_4_camera').default(false),
  check5Network: boolean('check_5_network').default(false),
  notes: text('notes'),
  checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow(),
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

// ==================== PROJECTS ====================

// ==================== CONTACTS & ASSIGNMENTS ====================

export const contacts = pgTable('contacts', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  organization: varchar('organization', { length: 255 }),
  role: varchar('role', { length: 100 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  type: varchar('type', { length: 50 }).default('internal').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const projectAssignments = pgTable('projectassignments', {
  id: serial('id').primaryKey(),
  projectId: varchar('project_id', { length: 50 }).notNull(),
  contactId: integer('contact_id').notNull().references(() => contacts.id),
  role: varchar('role', { length: 100 }),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  isActive: boolean('is_active').default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ==================== MEETINGS & SUBMITTALS ====================

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
  type: varchar('type', { length: 20 }).default('submittal').notNull(),
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

export const projectRooms = pgTable('projectrooms', {
  id: serial('id').primaryKey(),
  projectId: varchar('project_id', { length: 50 }).notNull(),
  roomId: varchar('room_id', { length: 100 }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ==================== PROJECTS ====================

export const projects = pgTable('projects', {
  id: varchar('id', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 255 }),
  client: varchar('client', { length: 255 }),
  type: varchar('type', { length: 50 }),
  status: varchar('status', { length: 50 }),
  budget: numeric('budget'),
  actualBudget: numeric('actualbudget'),
  startDate: timestamp('startdate', { withTimezone: true }),
  endDate: timestamp('enddate', { withTimezone: true }),
  description: text('description'),
  tasks: jsonb('tasks'),
  requestorInfo: varchar('requestorinfo', { length: 255 }),
  siteLocation: varchar('sitelocation', { length: 255 }),
  businessLine: varchar('businessline', { length: 100 }),
  progress: integer('progress'),
  priority: varchar('priority', { length: 50 }),
  requestDate: timestamp('requestdate', { withTimezone: true }),
  dueDate: timestamp('duedate', { withTimezone: true }),
  estimatedBudget: numeric('estimatedbudget'),
  costCenter: varchar('costcenter', { length: 100 }),
  purchaseOrder: varchar('purchaseorder', { length: 100 }),
  parentProjectId: varchar('parent_project_id', { length: 50 }),
  ticketNumbers: jsonb('ticket_numbers'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ==================== USERS & AUTH ====================

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  password: varchar('password', { length: 255 }),
  role: varchar('role', { length: 50 }),
  preferences: jsonb('preferences'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
  passwordExpiresAt: timestamp('password_expires_at', { withTimezone: true }),
  forcePasswordChange: boolean('force_password_change'),
  avatar: text('avatar'),
});
