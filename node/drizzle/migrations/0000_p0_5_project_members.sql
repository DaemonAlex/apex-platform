CREATE TABLE "appconfig" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "auditlog" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user" varchar(255),
	"action" varchar(500) NOT NULL,
	"resource" varchar(500) DEFAULT '',
	"details" text DEFAULT '',
	"projectid" varchar(50),
	"taskid" varchar(50),
	"category" varchar(50) DEFAULT 'general',
	"severity" varchar(20) DEFAULT 'info',
	"ipaddress" varchar(50),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cisco_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"product" varchar(255),
	"type" varchar(100),
	"status" varchar(50),
	"serial" varchar(100),
	"mac" varchar(50),
	"ip" varchar(50),
	"workspace_id" varchar(255),
	"org_id" varchar(255),
	"last_seen" timestamp with time zone,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "cisco_devices_device_id_key" UNIQUE("device_id")
);
--> statement-breakpoint
CREATE TABLE "cisco_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"org_id" varchar(255),
	"address" jsonb DEFAULT '{}'::jsonb,
	"floors" jsonb DEFAULT '[]'::jsonb,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"synced_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "cisco_locations_location_id_key" UNIQUE("location_id")
);
--> statement-breakpoint
CREATE TABLE "cisco_room_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" varchar(255) NOT NULL,
	"workspace_name" varchar(255),
	"checked_by" varchar(255),
	"status" varchar(20) DEFAULT 'pass',
	"notes" text,
	"snow_ticket" varchar(100),
	"checked_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cisco_room_schedules" (
	"workspace_id" varchar(255) PRIMARY KEY NOT NULL,
	"workspace_name" varchar(255),
	"check_frequency" varchar(20) DEFAULT 'weekly',
	"check_day" integer DEFAULT 1,
	"last_checked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cisco_sync_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"sync_type" varchar(50) NOT NULL,
	"records_synced" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cisco_workspaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"org_id" varchar(255),
	"type" varchar(100),
	"capacity" integer DEFAULT 0,
	"location_id" varchar(255),
	"floor_id" varchar(255),
	"calling" jsonb DEFAULT '{}'::jsonb,
	"sip_address" varchar(255),
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"synced_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "cisco_workspaces_workspace_id_key" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"organization" varchar(255),
	"role" varchar(100),
	"email" varchar(255),
	"phone" varchar(50),
	"type" varchar(50) DEFAULT 'internal' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" varchar(100) NOT NULL,
	"filename" varchar(255) NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"file_size" integer,
	"mime_type" varchar(100),
	"doc_type" varchar(50) DEFAULT 'other',
	"description" text,
	"uploaded_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fieldopnotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"fieldop_id" integer NOT NULL,
	"author" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fieldops" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" varchar(50),
	"task_id" varchar(100),
	"task_name" varchar(500) NOT NULL,
	"project_name" varchar(500),
	"type" varchar(50) DEFAULT 'service',
	"location" varchar(500),
	"scheduled_date" timestamp with time zone NOT NULL,
	"start_time" varchar(20) DEFAULT '9:00 AM',
	"end_time" varchar(20) DEFAULT '5:00 PM',
	"assignee" varchar(255),
	"status" varchar(50) DEFAULT 'scheduled',
	"notes" text,
	"estimated_duration" integer,
	"completed_at" timestamp with time zone,
	"completed_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"ticket_numbers" jsonb DEFAULT '[]'::jsonb,
	"vendor_id" integer,
	"vendor_contact" varchar(255),
	"assigned_type" varchar(20) DEFAULT 'internal',
	"room_id" integer,
	"service_category" varchar(50) DEFAULT 'project',
	"priority" varchar(20) DEFAULT 'normal',
	"response_time_hours" numeric(6, 1),
	"vendor_name" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "floors" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"name" varchar(50) NOT NULL,
	"sort_order" integer DEFAULT 0,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"address" varchar(500),
	"city" varchar(100),
	"state" varchar(50),
	"zip" varchar(20),
	"contact_name" varchar(255),
	"contact_phone" varchar(50),
	"contact_email" varchar(255),
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" varchar(50) NOT NULL,
	"meeting_type" varchar(50) DEFAULT 'oac',
	"title" varchar(255) NOT NULL,
	"meeting_date" timestamp with time zone NOT NULL,
	"attendees" jsonb DEFAULT '[]'::jsonb,
	"agenda" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"action_items" jsonb DEFAULT '[]'::jsonb,
	"created_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "passwordresettokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "passwordresettokens_token_key" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "projectassignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" varchar(50) NOT NULL,
	"contact_id" integer NOT NULL,
	"role" varchar(100),
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"is_active" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projectdocuments" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"filename" varchar(255) NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"mime_type" varchar(100),
	"file_size" integer,
	"uploaded_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" varchar(50) NOT NULL,
	"user_id" integer NOT NULL,
	"role" varchar(20) DEFAULT 'viewer' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now(),
	"added_by_user_id" integer,
	CONSTRAINT "project_members_project_user_key" UNIQUE("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "projectnotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" varchar(50) NOT NULL,
	"author" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projectrooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" varchar(50) NOT NULL,
	"room_id" varchar(100) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "projectrooms_project_id_room_id_key" UNIQUE("project_id","room_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"client" varchar(255),
	"type" varchar(100),
	"status" varchar(50) DEFAULT 'planning',
	"budget" numeric(12, 2) DEFAULT '0',
	"actualbudget" numeric(12, 2) DEFAULT '0',
	"startdate" timestamp with time zone,
	"enddate" timestamp with time zone,
	"description" text,
	"tasks" jsonb,
	"requestorinfo" varchar(500),
	"sitelocation" varchar(500),
	"businessline" varchar(255),
	"progress" integer DEFAULT 0,
	"priority" varchar(50),
	"requestdate" timestamp with time zone,
	"duedate" timestamp with time zone,
	"estimatedbudget" numeric(12, 2) DEFAULT '0',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"costcenter" varchar(255),
	"purchaseorder" varchar(255),
	"parent_project_id" varchar(50),
	"ticket_numbers" jsonb DEFAULT '[]'::jsonb,
	"location_id" integer,
	"project_manager" varchar(255),
	"stakeholders" jsonb DEFAULT '[]'::jsonb,
	"floor_id" integer,
	"estimatedhours" numeric(10, 2),
	"actualhours" numeric(10, 2),
	"timeentries" text,
	"ragstatus" varchar(10),
	"ragreason" varchar(255),
	"created_by_user_id" integer
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"description" text DEFAULT '',
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"priority" integer DEFAULT 0,
	"is_system" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "roles_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "roomcheckhistory" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" varchar(100) NOT NULL,
	"checked_by" varchar(255),
	"rag_status" varchar(20) NOT NULL,
	"limited_functionality" text,
	"non_functional_reason" text,
	"check_1_video" boolean DEFAULT false,
	"check_2_display" boolean DEFAULT false,
	"check_3_audio" boolean DEFAULT false,
	"check_4_camera" boolean DEFAULT false,
	"check_5_network" boolean DEFAULT false,
	"notes" text,
	"checked_at" timestamp with time zone DEFAULT now(),
	"issue_found" boolean DEFAULT false,
	"issue_description" text,
	"ticket_number" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "roomequipment" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" varchar(100) NOT NULL,
	"category" varchar(50) NOT NULL,
	"make" varchar(100),
	"model" varchar(150),
	"serial_number" varchar(100),
	"firmware_version" varchar(50),
	"install_date" date,
	"warranty_end" date,
	"status" varchar(50) DEFAULT 'active',
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "roomstandards" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"required_equipment" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "roomtechdetails" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" varchar(100) NOT NULL,
	"platform" varchar(50),
	"platform_version" varchar(50),
	"cisco_workspace_id" varchar(100),
	"cisco_activation_code" varchar(100),
	"cisco_device_serial" varchar(100),
	"cisco_registration_status" varchar(50),
	"network_jacks" jsonb DEFAULT '[]'::jsonb,
	"devices" jsonb DEFAULT '[]'::jsonb,
	"cable_runs" jsonb DEFAULT '[]'::jsonb,
	"credentials" jsonb DEFAULT '[]'::jsonb,
	"vlan" varchar(50),
	"switch_name" varchar(100),
	"switch_port" varchar(50),
	"poe_status" varchar(50),
	"wifi_ssid" varchar(100),
	"notes" text,
	"updated_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"ceiling_type" varchar(100),
	"ceiling_height" varchar(50),
	"table_type" varchar(100),
	"table_seats" integer,
	"existing_av" text,
	"cable_pathways" text,
	"power_locations" text,
	"mounting_surfaces" text,
	"room_dimensions" varchar(100),
	"vendor_access_notes" text,
	CONSTRAINT "roomtechdetails_room_id_key" UNIQUE("room_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"schedule_day" integer NOT NULL,
	"schedule_day_name" varchar(20) NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"room_type" varchar(50),
	"capacity" integer,
	"location" varchar(255),
	"floor" varchar(50),
	"standard_id" integer,
	"location_id" integer,
	"floor_id" integer,
	"check_frequency" varchar(20) DEFAULT 'weekly',
	"check_day" integer,
	CONSTRAINT "rooms_room_id_key" UNIQUE("room_id")
);
--> statement-breakpoint
CREATE TABLE "sitevisits" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" varchar(50) NOT NULL,
	"visitor" varchar(255) NOT NULL,
	"visit_date" timestamp with time zone NOT NULL,
	"purpose" varchar(255),
	"summary" text,
	"ticket_number" varchar(100),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "submittals" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" varchar(50) NOT NULL,
	"type" varchar(20) DEFAULT 'submittal' NOT NULL,
	"number" varchar(50),
	"title" varchar(255) NOT NULL,
	"submitted_by" integer,
	"status" varchar(50) DEFAULT 'pending',
	"submitted_date" timestamp with time zone,
	"response_date" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	"role" varchar(50) DEFAULT 'auditor',
	"preferences" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"password_changed_at" timestamp with time zone DEFAULT now(),
	"password_expires_at" timestamp with time zone,
	"force_password_change" boolean DEFAULT false,
	"avatar" text,
	CONSTRAINT "users_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vendorassignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" varchar(100) NOT NULL,
	"role" varchar(100),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) DEFAULT 'external' NOT NULL,
	"category" varchar(100),
	"website" varchar(255),
	"address" varchar(500),
	"notes" text,
	"contacts" jsonb DEFAULT '[]'::jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "fieldops" ADD CONSTRAINT "fieldops_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passwordresettokens" ADD CONSTRAINT "passwordresettokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projectassignments" ADD CONSTRAINT "projectassignments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submittals" ADD CONSTRAINT "submittals_submitted_by_contacts_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendorassignments" ADD CONSTRAINT "vendorassignments_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_timestamp_idx" ON "auditlog" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "audit_category_idx" ON "auditlog" USING btree ("category");--> statement-breakpoint
CREATE INDEX "audit_severity_idx" ON "auditlog" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_members_project_idx" ON "project_members" USING btree ("project_id");