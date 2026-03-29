/**
 * APEX Demo Data Seed Script v2
 *
 * Fictional bank: "Lakefront Financial Group"
 * 3 AV Vendors: AVI-SPL, Whitlock Group, Diversified
 * Internal team: Damon Alexander (Sr AV Engineer), Mike Chen (AV Tech), Lisa Park (AV Coordinator)
 * Training center: 9700 Building (1st and 2nd floor event spaces)
 *
 * Usage: cd node && node seed-demo.js
 */

require('dotenv').config();
const { pool } = require('./db');

// Date helper - returns ISO string
const now = new Date();
function d(daysOffset) {
  const date = new Date(now);
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString();
}
function dateOnly(daysOffset) {
  return d(daysOffset).split('T')[0];
}

async function seed() {
  console.log('APEX Demo Seed v2\n');

  // Clean
  console.log('Clearing existing data...');
  await pool.query("DELETE FROM projects WHERE id LIKE 'WTB_%'");
  await pool.query("DELETE FROM roomcheckhistory");
  await pool.query("DELETE FROM rooms");
  console.log('  Done.\n');

  // ============================================================
  // PROJECTS - Full range of types, states, and timelines
  // ============================================================

  const projects = [

    // ================================================================
    // COMPLETED - Oakbrook HQ Executive Boardroom (large, 3 months ago)
    // ================================================================
    proj('WTB_DEMO_001', {
      name: 'Oakbrook HQ - Executive Boardroom AV Install',
      requestor: 'Sarah Mitchell, VP Operations',
      location: '2100 Spring Road, Oakbrook, IL 60523',
      business: 'Corporate HQ',
      desc: 'Complete AV buildout for 24-seat executive boardroom. Dual 86" displays, Cisco Room Kit Pro, 4-zone ceiling mic array, Crestron control. Coordinated with Turner Construction (GC) and Gensler (architect).',
      type: 'new-build', status: 'completed', priority: 'critical',
      po: 'PO-2025-0142', cc: 'CC-IT-AV-001',
      reqDate: d(-180), start: d(-150), due: d(-30), end: d(-25),
      estBudget: 185000, actBudget: 192400, progress: 100,
      tasks: [
        t('Kick off call with Facilities and CRE', 1, 'completed', 'Damon Alexander', 1.5, -150, -148),
        t('Create project folder in Egnyte', 1, 'completed', 'Lisa Park', 0.5, -150, -150),
        t('Gather project requirements from stakeholders', 1, 'completed', 'Damon Alexander', 4, -148, -142),
        t('Site survey with AVI-SPL', 1, 'completed', 'Mike Chen', 4, -140, -140, true, 'Walkthrough of 3rd floor. Confirmed ceiling height, conduit paths, power locations.'),
        t('Review architect drawings (Gensler)', 1, 'completed', 'Damon Alexander', 3, -138, -136),
        t('Submit AV infrastructure requirements to GC', 1, 'completed', 'Damon Alexander', 2, -135, -134),
        t('OAC Meeting #1 - AV requirements review', 1, 'completed', 'Damon Alexander', 1.5, -132, -132, false, 'Presented conduit and power requirements. GC confirmed timeline.'),
        t('Request vendor quote - AVI-SPL', 1, 'completed', 'Damon Alexander', 1, -130, -125),
        t('Review and revise vendor quote', 1, 'completed', 'Damon Alexander', 3, -124, -120),
        t('Submit business case to VP IT', 1, 'completed', 'Damon Alexander', 4, -119, -115),
        t('PO submitted and approved', 1, 'completed', 'Lisa Park', 1, -114, -110),
        t('Track shipment - Cisco Room Kit Pro', 1, 'completed', 'Mike Chen', 2, -108, -90, false, '6-week lead. Shipped from Cisco Dallas.'),
        t('Track shipment - Crestron CP4 + DM NVX', 1, 'completed', 'Mike Chen', 1, -108, -85, false, '4-week lead. Crestron direct.'),
        t('Track shipment - LG 86" displays (x2)', 1, 'completed', 'Mike Chen', 1, -100, -80),
        t('OAC Meeting #2 - conduit progress', 1, 'completed', 'Damon Alexander', 1.5, -95, -95, false, 'Conduit 80% complete. Ceiling grid on schedule.'),
        t('Verify infrastructure before equipment delivery', 1, 'completed', 'Damon Alexander', 3, -78, -75, true),
        t('Request serial numbers and MACs', 1, 'completed', 'Mike Chen', 1, -74, -72),
        t('Create room calendar in Entra', 2, 'completed', 'Lisa Park', 0.5, -70, -68),
        t('Verify AV VLAN at site', 2, 'completed', 'Mike Chen', 1, -66, -65),
        t('IP address assignment (SNOW)', 2, 'completed', 'Lisa Park', 0.5, -64, -62),
        t('Add MACs to AV VLAN (ISE)', 2, 'completed', 'Lisa Park', 0.5, -61, -58),
        t('Firewall policy group for IPs', 2, 'completed', 'Lisa Park', 0.5, -57, -55),
        t('Vendor delivery and installation (AVI-SPL)', 3, 'completed', 'AVI-SPL', 24, -50, -46, true, 'Install team: 3 techs, 4 days. GC cleared room dust-free 2 days prior.'),
        t('Vendor commissioning and programming', 3, 'completed', 'AVI-SPL', 16, -45, -43, true),
        t('Testing - video systems', 3, 'completed', 'Damon Alexander', 2, -42, -42, true),
        t('Testing - audio and mic zones', 3, 'completed', 'Damon Alexander', 2, -42, -42, true),
        t('Testing - UC platforms (Webex, Teams, Zoom)', 3, 'completed', 'Damon Alexander', 3, -41, -41, true, 'All working. Zoom required firewall rule update.'),
        t('Verify vendor labeling', 3, 'completed', 'Damon Alexander', 1, -40, -40, true),
        t('Collect vendor documentation', 3, 'completed', 'Mike Chen', 1, -40, -39),
        t('Install sign-off', 3, 'completed', 'Damon Alexander', 0.5, -38, -38),
        t('Install monitoring (PRTG)', 3, 'completed', 'Mike Chen', 2, -37, -36),
        t('Update NOC with new devices', 3, 'completed', 'Mike Chen', 1, -36, -35),
        t('Create room instructions', 3, 'completed', 'Damon Alexander', 3, -35, -33),
        t('Label systems, cabling, furniture', 3, 'completed', 'Mike Chen', 2, -33, -32, true),
        t('Schedule training with exec team', 3, 'completed', 'Damon Alexander', 0.5, -32, -31),
        t('Deliver end-user training', 3, 'completed', 'Damon Alexander', 2, -28, -28, true),
        t('AV department final sign-off', 3, 'completed', 'Damon Alexander', 1, -27, -27),
        t('Approve vendor invoices', 4, 'completed', 'Damon Alexander', 2, -26, -26),
        t('Enter equipment into asset inventory', 4, 'completed', 'Lisa Park', 2, -26, -25),
        t('Save documentation to project folder', 4, 'completed', 'Lisa Park', 1, -25, -25),
        t('Update SharePoint conference room info', 4, 'completed', 'Lisa Park', 0.5, -25, -25),
        t('Add room to health monitoring dashboard', 4, 'completed', 'Mike Chen', 1, -25, -25),
      ]
    }),

    // ================================================================
    // COMPLETED - Naperville Drive-Thru (medium, 2 months ago)
    // ================================================================
    proj('WTB_DEMO_002', {
      name: 'Naperville Branch - Drive-Thru AV Upgrade',
      requestor: 'Tom Rivera, Branch Manager',
      location: '455 W Ogden Ave, Naperville, IL 60540',
      business: 'Retail Banking',
      desc: 'Replace aging analog drive-thru intercom and camera system with IP-based solution. Axis cameras, Zenitel IP intercom, teller station integration.',
      type: 'upgrade', status: 'completed', priority: 'high',
      po: 'PO-2025-0198', cc: 'CC-RETAIL-042',
      reqDate: d(-120), start: d(-100), due: d(-50), end: d(-48),
      estBudget: 42000, actBudget: 39800, progress: 100,
      tasks: [
        t('Site survey - existing drive-thru infrastructure', 1, 'completed', 'Mike Chen', 3, -100, -100, true),
        t('Gather requirements from branch operations', 1, 'completed', 'Damon Alexander', 2, -98, -96),
        t('Request vendor quote - Whitlock Group', 1, 'completed', 'Damon Alexander', 1, -95, -88),
        t('Approve quote and submit PO', 1, 'completed', 'Damon Alexander', 1, -85, -82),
        t('Track camera and intercom shipment', 1, 'completed', 'Mike Chen', 1, -80, -65),
        t('Coordinate install window with branch', 1, 'completed', 'Damon Alexander', 1, -62, -60),
        t('Network prep - PoE switch ports and VLAN', 2, 'completed', 'Mike Chen', 2, -58, -56),
        t('IP address assignment', 2, 'completed', 'Lisa Park', 0.5, -55, -54),
        t('Vendor install - cameras and intercom (Whitlock)', 3, 'completed', 'Whitlock Group', 8, -52, -51, true),
        t('Testing and verification', 3, 'completed', 'Damon Alexander', 2, -50, -50, true),
        t('Branch staff training', 3, 'completed', 'Damon Alexander', 1.5, -49, -49, true),
        t('Close out and documentation', 4, 'completed', 'Lisa Park', 2, -48, -48),
      ]
    }),

    // ================================================================
    // COMPLETED - Beverly PA System (fast-tracked, 2.5 months ago)
    // ================================================================
    proj('WTB_DEMO_003', {
      name: 'Beverly Branch - Emergency PA System Install',
      requestor: 'Security Team',
      location: '10250 S Western Ave, Chicago, IL 60643',
      business: 'Security',
      desc: 'Emergency PA/notification system per updated compliance requirements. Atlas Sound IP speakers integrated with building automation. Fast-tracked due to audit finding.',
      type: 'new-build', status: 'completed', priority: 'critical',
      po: 'PO-2025-0210', cc: 'CC-SEC-001',
      reqDate: d(-95), start: d(-85), due: d(-55), end: d(-58),
      estBudget: 18500, actBudget: 17200, progress: 100,
      tasks: [
        t('Compliance audit review and scope', 1, 'completed', 'Damon Alexander', 3, -85, -83),
        t('Emergency vendor engagement - AVI-SPL', 1, 'completed', 'Damon Alexander', 1, -82, -80),
        t('Fast-track PO approval', 1, 'completed', 'Lisa Park', 0.5, -79, -78),
        t('Network and power infrastructure prep', 2, 'completed', 'Mike Chen', 4, -75, -72),
        t('Speaker installation - 12 zones (AVI-SPL)', 3, 'completed', 'AVI-SPL', 16, -70, -65, true),
        t('Integration with building automation', 3, 'completed', 'Mike Chen', 6, -64, -62, true),
        t('Full system test - all zones', 3, 'completed', 'Damon Alexander', 3, -61, -60, true),
        t('Compliance sign-off documentation', 4, 'completed', 'Damon Alexander', 2, -59, -58),
      ]
    }),

    // ================================================================
    // ACTIVE - Schaumburg 3-Room Buildout (45%, OAC meetings)
    // ================================================================
    proj('WTB_DEMO_004', {
      name: 'Schaumburg Branch - Conference Room Buildout (3 rooms)',
      requestor: 'Jennifer Walsh, Regional Director',
      location: '1400 E Golf Rd, Schaumburg, IL 60173',
      business: 'Retail Banking',
      desc: 'New AV for 3 conference rooms in branch renovation. Room A (12-seat, Cisco), Room B (8-seat, Teams MTR), Room C (6-seat huddle, Neat Bar). GC: Pepper Construction. Architect: Gensler. OAC meetings every Tuesday.',
      type: 'new-build', status: 'active', priority: 'high',
      po: 'PO-2026-0015', cc: 'CC-RETAIL-051',
      reqDate: d(-60), start: d(-45), due: d(30), end: d(30),
      estBudget: 128000, actBudget: 52000, progress: 45,
      tasks: [
        t('Kick off call with CRE and Facilities', 1, 'completed', 'Damon Alexander', 1.5, -45, -44),
        t('Review architect plans (Gensler)', 1, 'completed', 'Damon Alexander', 4, -43, -40),
        t('OAC Meeting #1 - AV infrastructure requirements', 1, 'completed', 'Damon Alexander', 1.5, -38, -38, false, 'Submitted conduit requirements. GC confirmed 18-month timeline.'),
        t('Site survey with AVI-SPL', 1, 'completed', 'Mike Chen', 4, -35, -35, true),
        t('Request quotes - AVI-SPL (Room A+B), Whitlock (Room C)', 1, 'completed', 'Damon Alexander', 2, -33, -25),
        t('Review and finalize quotes', 1, 'completed', 'Damon Alexander', 4, -24, -20),
        t('Submit business case to VP IT', 1, 'completed', 'Damon Alexander', 3, -19, -16),
        t('PO submitted and approved', 1, 'completed', 'Lisa Park', 1, -15, -12),
        t('OAC Meeting #2 - conduit progress review', 1, 'completed', 'Damon Alexander', 1.5, -10, -10, false, 'GC reports conduit 70% complete. Room A ceiling grid delayed 1 week.'),
        t('Track equipment - Cisco Room Bar Pro', 1, 'in-progress', 'Mike Chen', 3, -8, 15, false, 'Shipped, ETA 10 days.'),
        t('Track equipment - Crestron DM NVX', 1, 'in-progress', 'Mike Chen', 1, -8, 12, false, '3-week lead time from Crestron.'),
        t('Track equipment - Neat Bar + LG displays', 1, 'in-progress', 'Mike Chen', 1, -8, 10, false, 'Neat Bar in stock. LG: standard 2-week.'),
        t('OAC Meeting #3 - pre-install coordination', 1, 'not-started', 'Damon Alexander', 1.5, 4, 4),
        t('Verify rooms dust-free before delivery', 1, 'not-started', 'Mike Chen', 2, 12, 12, true),
        t('Request serial numbers and MACs', 1, 'not-started', 'Mike Chen', 1, 8, 10),
        t('Create room calendars (3 rooms)', 2, 'not-started', 'Lisa Park', 1.5, 10, 12),
        t('Network prep - VLAN, IPs, ISE', 2, 'not-started', 'Mike Chen', 3, 10, 14),
        t('Firewall policy group', 2, 'not-started', 'Lisa Park', 1, 14, 16),
        t('Vendor install - Room A (AVI-SPL)', 3, 'not-started', 'AVI-SPL', 16, 18, 20, true),
        t('Vendor install - Room B (AVI-SPL)', 3, 'not-started', 'AVI-SPL', 8, 20, 21, true),
        t('Vendor install - Room C (Whitlock)', 3, 'not-started', 'Whitlock Group', 4, 21, 22, true),
        t('Testing all 3 rooms', 3, 'not-started', 'Damon Alexander', 6, 23, 24, true),
        t('End-user training', 3, 'not-started', 'Damon Alexander', 2, 26, 26, true),
        t('Close out, documentation, asset entry', 4, 'not-started', 'Lisa Park', 4, 28, 30),
      ]
    }),

    // ================================================================
    // ACTIVE - Hinsdale BreakFix (urgent, critical)
    // ================================================================
    proj('WTB_DEMO_005', {
      name: 'Hinsdale Branch - BreakFix: Boardroom Display Failure',
      requestor: 'Marcus Johnson, Branch Manager',
      location: '25 E 1st St, Hinsdale, IL 60521',
      business: 'Wealth Management',
      desc: 'Main boardroom 75" Samsung display failed (backlight). Used daily for client meetings. Warranty expired. Diversified has compatible display in local stock.',
      type: 'breakfix', status: 'active', priority: 'critical',
      po: 'PO-2026-0031', cc: 'CC-WM-012',
      reqDate: d(-5), start: d(-4), due: d(3), end: d(3),
      estBudget: 4200, actBudget: 0, progress: 35,
      tasks: [
        t('Receive break/fix request', 1, 'completed', 'Damon Alexander', 0.5, -5, -5),
        t('Remote diagnostics - confirm hardware failure', 1, 'completed', 'Mike Chen', 1, -4, -4, false, 'Backlight failure, not firmware. 4 years old, out of warranty.'),
        t('Contact Diversified for replacement', 1, 'completed', 'Damon Alexander', 0.5, -4, -4, false, 'Samsung QM75C in Chicago warehouse. Can deliver tomorrow.'),
        t('Emergency PO approved', 1, 'completed', 'Damon Alexander', 0.5, -3, -3),
        t('Vendor on-site - remove old, mount new (Diversified)', 3, 'in-progress', 'Diversified', 3, -1, 0, true, 'Scheduled for today. Branch using temp setup.'),
        t('Reconfigure and test with Cisco codec', 3, 'not-started', 'Mike Chen', 1.5, 0, 1, true),
        t('Verify all UC platforms', 3, 'not-started', 'Mike Chen', 1, 1, 1, true),
        t('Update asset inventory, dispose old display', 4, 'not-started', 'Lisa Park', 1, 2, 3),
      ]
    }),

    // ================================================================
    // ACTIVE - Lake Forest Telephony Migration (60%)
    // ================================================================
    proj('WTB_DEMO_006', {
      name: 'Lake Forest - Telephony Migration (Cisco to Teams)',
      requestor: 'Patricia Gomez, IT Director',
      location: '700 N Western Ave, Lake Forest, IL 60045',
      business: 'Corporate Services',
      desc: 'Migrate 45 desk phones from Cisco CUCM to Microsoft Teams Phone System. Poly CCX400 handsets, Teams calling plans, number porting, user training.',
      type: 'telephony', status: 'active', priority: 'medium',
      po: 'PO-2026-0022', cc: 'CC-IT-UC-003',
      reqDate: d(-40), start: d(-30), due: d(20), end: d(20),
      estBudget: 32000, actBudget: 18500, progress: 60,
      tasks: [
        t('Audit current Cisco phone inventory', 1, 'completed', 'Lisa Park', 4, -30, -28),
        t('User and phone number mapping', 1, 'completed', 'Lisa Park', 3, -27, -25),
        t('Order Poly CCX400 handsets (45 units) from CDW', 1, 'completed', 'Mike Chen', 1, -24, -24, false, 'Standard 2-week delivery.'),
        t('Request Teams Phone licenses', 2, 'completed', 'Lisa Park', 1, -23, -20),
        t('Configure Teams calling policies', 2, 'completed', 'Damon Alexander', 4, -19, -16),
        t('Initiate number porting', 2, 'completed', 'Lisa Park', 2, -15, -14, false, 'Port request submitted. 10 business day SLA.'),
        t('Receive and stage handsets', 2, 'completed', 'Mike Chen', 4, -10, -8),
        t('Provision handsets in Teams admin', 2, 'completed', 'Damon Alexander', 6, -7, -4),
        t('Number port complete - verify', 2, 'in-progress', 'Lisa Park', 2, -2, 2, false, 'Carrier confirmed port window for next Tuesday.'),
        t('Deploy handsets - Floor 1 (20 users)', 3, 'not-started', 'Mike Chen', 6, 3, 5, true),
        t('Deploy handsets - Floor 2 (25 users)', 3, 'not-started', 'Mike Chen', 8, 6, 8, true),
        t('User training (3 group sessions)', 3, 'not-started', 'Damon Alexander', 4.5, 10, 12, true),
        t('Decommission Cisco phones', 4, 'not-started', 'Mike Chen', 4, 14, 16),
        t('Update asset inventory', 4, 'not-started', 'Lisa Park', 2, 18, 20),
      ]
    }),

    // ================================================================
    // ACTIVE - Crystal Lake Digital Signage (70%)
    // ================================================================
    proj('WTB_DEMO_007', {
      name: 'Crystal Lake - Digital Signage Deployment',
      requestor: 'Marketing Team',
      location: '100 W Virginia St, Crystal Lake, IL 60014',
      business: 'Marketing',
      desc: '3 digital signage displays in lobby and teller area. Cloud CMS (Four Winds Interactive). Power and data drops already in place.',
      type: 'new-build', status: 'active', priority: 'low',
      po: 'PO-2026-0028', cc: 'CC-MKT-003',
      reqDate: d(-25), start: d(-15), due: d(15), end: d(15),
      estBudget: 12500, actBudget: 8900, progress: 70,
      tasks: [
        t('Confirm display locations with branch and marketing', 1, 'completed', 'Damon Alexander', 1.5, -15, -14),
        t('Order displays and media players', 1, 'completed', 'Mike Chen', 1, -13, -13),
        t('FWI CMS license setup', 2, 'completed', 'Lisa Park', 2, -12, -10),
        t('Network prep - signage VLAN', 2, 'completed', 'Mike Chen', 1.5, -10, -9),
        t('Receive and stage displays', 2, 'completed', 'Mike Chen', 2, -5, -4),
        t('Content creation with Marketing', 2, 'in-progress', 'Lisa Park', 4, -3, 5, false, 'Marketing finalizing Q2 campaign assets. 3 of 5 templates done.'),
        t('On-site installation', 3, 'not-started', 'Mike Chen', 4, 7, 8, true),
        t('Content deployment and testing', 3, 'not-started', 'Lisa Park', 2, 9, 10),
        t('Branch walkthrough and sign-off', 3, 'not-started', 'Damon Alexander', 1, 12, 12, true),
        t('Documentation and asset entry', 4, 'not-started', 'Lisa Park', 1, 14, 15),
      ]
    }),

    // ================================================================
    // ACTIVE - AT RISK - Wheaton UC Upgrade (supply chain delay)
    // ================================================================
    proj('WTB_DEMO_008', {
      name: 'Wheaton Branch - Conference Room UC Upgrade',
      requestor: 'Angela Torres, Ops Manager',
      location: '501 N Main St, Wheaton, IL 60187',
      business: 'Retail Banking',
      desc: 'Upgrade 2 conference rooms from Polycom to Cisco Room Bar. DELAYED: Cisco Room Bar on 8-week backorder from Diversified.',
      type: 'upgrade', status: 'active', priority: 'high',
      po: 'PO-2026-0019', cc: 'CC-RETAIL-039',
      reqDate: d(-50), start: d(-40), due: d(-5), end: d(-5),
      estBudget: 24000, actBudget: 11000, progress: 40,
      tasks: [
        t('Site survey', 1, 'completed', 'Mike Chen', 2, -40, -38, true),
        t('Vendor quote - Diversified', 1, 'completed', 'Damon Alexander', 1, -36, -30),
        t('PO approved', 1, 'completed', 'Lisa Park', 0.5, -28, -26),
        t('Order Cisco Room Bar (x2)', 1, 'completed', 'Mike Chen', 0.5, -25, -25, false, 'ISSUE: 8-week backorder.'),
        t('WAITING - Equipment delivery (backordered)', 1, 'in-progress', 'Mike Chen', 0, -25, 20, false, 'BLOCKED: New ETA from Diversified: +3 weeks. Escalated to Cisco rep.', 'red'),
        t('Network prep', 2, 'completed', 'Mike Chen', 2, -20, -18),
        t('Remove legacy Polycom systems', 3, 'not-started', 'Mike Chen', 2, null, null, true),
        t('Install Cisco Room Bars (Diversified)', 3, 'not-started', 'Diversified', 4, null, null, true),
        t('Testing, training, close out', 3, 'not-started', 'Damon Alexander', 4, null, null, true),
      ]
    }),

    // ================================================================
    // ON HOLD - Libertyville Training Room (budget frozen)
    // ================================================================
    proj('WTB_DEMO_009', {
      name: 'Libertyville Branch - Training Room AV Refresh',
      requestor: 'David Kim, L&D Manager',
      location: '1500 N Milwaukee Ave, Libertyville, IL 60048',
      business: 'Human Resources',
      desc: 'Refresh aging projector-based training room with flat panel + wireless presentation. ON HOLD: budget reallocation pending from Q3 to Q4.',
      type: 'refresh', status: 'on-hold', priority: 'medium',
      po: '', cc: 'CC-HR-005',
      reqDate: d(-90), start: d(-75), due: d(60), end: d(60),
      estBudget: 28000, actBudget: 2200, progress: 15,
      tasks: [
        t('Site survey and requirements', 1, 'completed', 'Mike Chen', 3, -75, -73, true),
        t('Request vendor quote - Whitlock Group', 1, 'completed', 'Damon Alexander', 1, -70, -62),
        t('Business case submitted to L&D', 1, 'completed', 'Damon Alexander', 2, -60, -55),
        t('Budget approval', 1, 'on-hold', 'Damon Alexander', 0, -50, null, false, 'ON HOLD: L&D budget frozen for Q2/Q3. David Kim expects reallocation in Q4. Vendor quote valid until Dec 2026.', 'yellow'),
      ]
    }),

    // ================================================================
    // SCHEDULED - Barrington New Branch (future, 6 months)
    // ================================================================
    proj('WTB_DEMO_010', {
      name: 'Barrington Branch - New Build (Full Branch AV Package)',
      requestor: 'VP Real Estate',
      location: '200 E Main St, Barrington, IL 60010 (new construction)',
      business: 'Retail Banking',
      desc: 'Brand new branch. Full AV: 2 conference rooms, lobby signage, drive-thru, teller area. GC: Power Construction. Architect: Ware Malcomb. OAC meetings start 6 months before occupancy.',
      type: 'new-build', status: 'scheduled', priority: 'high',
      po: '', cc: 'CC-CRE-NEW-008',
      reqDate: d(-20), start: d(30), due: d(180), end: d(180),
      estBudget: 210000, actBudget: 0, progress: 0,
      tasks: [
        t('Review architect AV infrastructure drawings', 1, 'not-started', 'Damon Alexander', 8, 30, 35),
        t('OAC Meeting #1 - introduce AV requirements', 1, 'not-started', 'Damon Alexander', 2, 35, 35),
        t('Submit conduit and infrastructure specs to GC', 1, 'not-started', 'Damon Alexander', 4, 38, 42),
        t('RFP to 3 AV vendors', 1, 'not-started', 'Damon Alexander', 6, 45, 55),
        t('Vendor selection and PO', 1, 'not-started', 'Damon Alexander', 4, 60, 70),
        t('Monthly OAC meetings', 1, 'not-started', 'Damon Alexander', 12, 35, 150),
        t('Equipment procurement (long lead)', 1, 'not-started', 'Mike Chen', 8, 75, 130),
        t('Network infrastructure prep', 2, 'not-started', 'Mike Chen', 8, 140, 150),
        t('Vendor installation (all spaces)', 3, 'not-started', 'TBD Vendor', 40, 155, 168, true),
        t('Testing, commissioning, training', 3, 'not-started', 'Damon Alexander', 16, 169, 175, true),
        t('Close out and documentation', 4, 'not-started', 'Lisa Park', 8, 176, 180),
      ]
    }),

    // ================================================================
    // SMALL - TV Replacement (simple breakfix)
    // ================================================================
    proj('WTB_DEMO_011', {
      name: 'Northbrook Branch - Lobby TV Replacement',
      requestor: 'Branch Reception',
      location: '1200 Shermer Rd, Northbrook, IL 60062',
      business: 'Retail Banking',
      desc: 'Replace 55" lobby TV that has a cracked panel. Simple swap, same mount. Ordered from CDW.',
      type: 'breakfix', status: 'active', priority: 'low',
      po: 'PO-2026-0033', cc: 'CC-RETAIL-060',
      reqDate: d(-7), start: d(-5), due: d(5), end: d(5),
      estBudget: 1800, actBudget: 1650, progress: 50,
      tasks: [
        t('Verify TV model and mount compatibility', 1, 'completed', 'Mike Chen', 0.5, -5, -5),
        t('Order replacement from CDW', 1, 'completed', 'Lisa Park', 0.5, -4, -4),
        t('Receive TV', 1, 'completed', 'Mike Chen', 0.5, -1, -1),
        t('On-site swap and test', 3, 'not-started', 'Mike Chen', 1.5, 2, 2, true),
        t('Update asset inventory', 4, 'not-started', 'Lisa Park', 0.5, 3, 3),
      ]
    }),

    // ================================================================
    // SMALL - CRE Room Repair Request
    // ================================================================
    proj('WTB_DEMO_012', {
      name: 'St. Charles Branch - CRE Repair: Conference Room B',
      requestor: 'Facilities Team',
      location: '2020 Dean St, St. Charles, IL 60174',
      business: 'Facilities',
      desc: 'CRE submitted repair request. Conference Room B has a damaged ceiling tile near the projector mount and loose AV cable management tray. AV needs to coordinate with CRE contractor for access and verify AV equipment after repair.',
      type: 'breakfix', status: 'active', priority: 'medium',
      po: '', cc: 'CC-FAC-011',
      reqDate: d(-3), start: d(-2), due: d(10), end: d(10),
      estBudget: 500, actBudget: 0, progress: 20,
      tasks: [
        t('Review CRE repair ticket and scope', 1, 'completed', 'Damon Alexander', 0.5, -2, -2),
        t('Coordinate access schedule with CRE contractor', 1, 'in-progress', 'Damon Alexander', 0.5, -1, 2, false, 'CRE contractor available next Wednesday.'),
        t('On-site - disconnect AV equipment for ceiling work', 3, 'not-started', 'Mike Chen', 1, 5, 5, true),
        t('CRE contractor performs repair (not AV scope)', 3, 'not-started', 'CRE Contractor', 0, 5, 6),
        t('Reconnect and test AV equipment', 3, 'not-started', 'Mike Chen', 1.5, 7, 7, true),
        t('Verify room fully operational', 3, 'not-started', 'Mike Chen', 0.5, 8, 8, true),
      ]
    }),

    // ================================================================
    // SMALL - Another TV replacement (completed)
    // ================================================================
    proj('WTB_DEMO_013', {
      name: 'Old Plank Trail Branch - Break Room TV Swap',
      requestor: 'Branch Manager',
      location: '22001 S Wolf Rd, Mokena, IL 60448',
      business: 'Retail Banking',
      desc: 'Break room TV stopped working. Not business critical but staff morale. Swapped with spare from warehouse.',
      type: 'breakfix', status: 'completed', priority: 'low',
      po: '', cc: 'CC-RETAIL-045',
      reqDate: d(-14), start: d(-12), due: d(-8), end: d(-9),
      estBudget: 0, actBudget: 0, progress: 100,
      tasks: [
        t('Verify failure (not a cable/input issue)', 1, 'completed', 'Mike Chen', 0.5, -12, -12),
        t('Pull spare 50" TV from warehouse', 1, 'completed', 'Mike Chen', 0.5, -11, -11),
        t('On-site swap', 3, 'completed', 'Mike Chen', 1, -10, -10, true),
        t('Dispose old TV', 4, 'completed', 'Lisa Park', 0.5, -9, -9),
      ]
    }),

    // ================================================================
    // EVENTS - 9700 Training Center Coverage
    // ================================================================
    proj('WTB_DEMO_014', {
      name: '9700 Training Center - Q2 Event AV Support Schedule',
      requestor: 'Events Coordination Team',
      location: '9700 W Higgins Rd, Rosemont, IL 60018 (1st and 2nd Floor)',
      business: 'Corporate Events',
      desc: 'Ongoing AV support for events in the 9700 Training Center. 1st floor has 3 training rooms and a large multipurpose space. 2nd floor has the executive conference center and 2 breakout rooms. Events team schedules AV support for leadership meetings, training sessions, town halls, and client events.',
      type: 'custom', status: 'active', priority: 'medium',
      po: 'PO-2026-EVENTS', cc: 'CC-EVENTS-001',
      reqDate: d(-30), start: d(-30), due: d(60), end: d(60),
      estBudget: 8000, actBudget: 3200, progress: 40,
      tasks: [
        t('Q1 Leadership Town Hall - 1st Floor Multipurpose (200 attendees)', 1, 'completed', 'Damon Alexander', 6, -28, -28, true, 'Full AV: 2 projectors, wireless mics, livestream to Webex. Setup 7am, event 9am-12pm.'),
        t('New Hire Orientation - 1st Floor Training Room A', 1, 'completed', 'Mike Chen', 3, -21, -21, true, 'Standard classroom AV. Laptop presentation, room audio. 25 attendees.'),
        t('Board of Directors Meeting - 2nd Floor Executive Center', 1, 'completed', 'Damon Alexander', 8, -14, -14, true, 'High-profile: 4 remote board members via Webex. Backup Zoom. Recording requested. Setup 6am.'),
        t('Sales Training Workshop (2-day) - 1st Floor Room B+C combined', 1, 'completed', 'Mike Chen', 10, -10, -9, true, 'Combined rooms, portable PA, 2 wireless mics, breakout room support.'),
        t('Client Investment Seminar - 2nd Floor Breakout Room 1', 1, 'in-progress', 'Damon Alexander', 4, 1, 1, true, 'Client-facing event. Premium setup: branded slides template, lobby signage. 30 attendees.'),
        t('IT Security Awareness Training - 1st Floor Room A', 1, 'not-started', 'Mike Chen', 2, 7, 7, true, 'Standard classroom. IT Security presenting. ~40 attendees.'),
        t('Q2 All-Hands Town Hall - 1st Floor Multipurpose', 1, 'not-started', 'Damon Alexander', 8, 14, 14, true, 'Full production: 2 projectors, wireless mics, Webex livestream, recording. 250+ attendees.'),
        t('Wealth Management Client Dinner - 2nd Floor Executive Center', 1, 'not-started', 'Damon Alexander', 4, 21, 21, true, 'Evening event. Background music system, presentation capability, low lighting. 50 attendees.'),
        t('New Manager Onboarding - 1st Floor Training Room A', 1, 'not-started', 'Mike Chen', 2, 28, 28, true),
        t('Compliance Annual Review - 2nd Floor Breakout Room 1+2', 1, 'not-started', 'Damon Alexander', 4, 35, 35, true, 'Combined breakout rooms. Video playback, recording required.'),
        t('Summer Intern Orientation - 1st Floor Room B', 1, 'not-started', 'Mike Chen', 3, 45, 45, true),
        t('Executive Strategy Offsite (2-day) - 2nd Floor Full', 1, 'not-started', 'Damon Alexander', 16, 55, 56, true, 'All 2nd floor spaces. Executive team only. Catering coordination with facilities.'),
      ]
    }),

    // ================================================================
    // ACTIVE - Small CRE coordination
    // ================================================================
    proj('WTB_DEMO_015', {
      name: 'Town Bank Branch - CRE Renovation AV Coordination',
      requestor: 'CRE Project Manager',
      location: '333 S Wacker Dr, Suite 200, Chicago, IL 60606',
      business: 'Corporate Real Estate',
      desc: 'CRE renovating the 2nd floor office space. AV needs to disconnect, store, and reconnect equipment in 4 offices and 1 conference room during the 3-week renovation. CRE managing GC (Walsh Construction).',
      type: 'custom', status: 'active', priority: 'medium',
      po: '', cc: 'CC-CRE-015',
      reqDate: d(-10), start: d(-7), due: d(14), end: d(14),
      estBudget: 3500, actBudget: 800, progress: 25,
      tasks: [
        t('Walk through with CRE PM and GC', 1, 'completed', 'Damon Alexander', 2, -7, -7, true, 'Identified all AV equipment to protect/move. 4 desk monitors, 1 conf room system.'),
        t('Document current equipment locations and configs', 1, 'completed', 'Mike Chen', 2, -6, -5, true),
        t('Disconnect and store conference room AV', 3, 'not-started', 'Mike Chen', 3, 0, 0, true, 'GC starts demo Monday. Equipment must be out by Friday.'),
        t('Monitor renovation progress (weekly check-in)', 3, 'not-started', 'Damon Alexander', 1, 3, 10),
        t('Reconnect conference room AV after renovation', 3, 'not-started', 'Mike Chen', 4, 11, 12, true),
        t('Test and verify all systems', 3, 'not-started', 'Mike Chen', 2, 13, 13, true),
        t('Update documentation with new room layout', 4, 'not-started', 'Lisa Park', 1, 14, 14),
      ]
    }),
  ];

  // ============================================================
  // INSERT PROJECTS
  // ============================================================
  for (const p of projects) {
    console.log(`  ${p.status.toUpperCase().padEnd(10)} ${p.name}`);
    try {
      await pool.query(`
        INSERT INTO projects (id, name, client, type, status, budget, actualbudget, startdate, enddate,
          description, tasks, requestorinfo, sitelocation, businessline, progress, priority,
          requestdate, duedate, estimatedbudget, costcenter, purchaseorder, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW(),NOW())
        ON CONFLICT (id) DO UPDATE SET
          name=$2, client=$3, type=$4, status=$5, budget=$6, actualbudget=$7, startdate=$8, enddate=$9,
          description=$10, tasks=$11, requestorinfo=$12, sitelocation=$13, businessline=$14,
          progress=$15, priority=$16, requestdate=$17, duedate=$18, estimatedbudget=$19,
          costcenter=$20, purchaseorder=$21, updated_at=NOW()
      `, [
        p.id, p.name, p.businessLine, p.type, p.status, p.estimatedBudget, p.actualBudget,
        p.startDate, p.endDate, p.description, JSON.stringify(p.tasks),
        p.requestorInfo, p.siteLocation, p.businessLine, p.progress, p.priority,
        p.requestDate, p.dueDate, p.estimatedBudget, p.costCenter, p.purchaseOrder
      ]);
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
    }
  }

  // ============================================================
  // ROOM STATUS DATA
  // ============================================================
  console.log('\nCreating room status data...');

  const rooms = [
    { id: 'OAK-EXEC-BR', name: 'Oakbrook HQ - Executive Boardroom', day: 1, dayName: 'Monday' },
    { id: 'OAK-CONF-A', name: 'Oakbrook HQ - Conference Room A', day: 1, dayName: 'Monday' },
    { id: 'OAK-CONF-B', name: 'Oakbrook HQ - Conference Room B', day: 1, dayName: 'Monday' },
    { id: 'OAK-HUDDLE-1', name: 'Oakbrook HQ - Huddle Room 1', day: 3, dayName: 'Wednesday' },
    { id: 'NAP-CONF', name: 'Naperville - Main Conference Room', day: 2, dayName: 'Tuesday' },
    { id: 'HIN-BOARD', name: 'Hinsdale - Boardroom', day: 2, dayName: 'Tuesday' },
    { id: 'LF-CONF-1', name: 'Lake Forest - Conference Room 1', day: 4, dayName: 'Thursday' },
    { id: 'LF-CONF-2', name: 'Lake Forest - Conference Room 2', day: 4, dayName: 'Thursday' },
    { id: '9700-MULTI', name: '9700 Training - 1F Multipurpose', day: 5, dayName: 'Friday' },
    { id: '9700-TRA', name: '9700 Training - 1F Room A', day: 5, dayName: 'Friday' },
    { id: '9700-TRB', name: '9700 Training - 1F Room B', day: 5, dayName: 'Friday' },
    { id: '9700-EXEC', name: '9700 Training - 2F Executive Center', day: 5, dayName: 'Friday' },
    { id: '9700-BR1', name: '9700 Training - 2F Breakout 1', day: 5, dayName: 'Friday' },
    { id: '9700-BR2', name: '9700 Training - 2F Breakout 2', day: 5, dayName: 'Friday' },
  ];

  for (const room of rooms) {
    await pool.query(`
      INSERT INTO rooms (room_id, name, schedule_day, schedule_day_name, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (room_id) DO UPDATE SET name=$2, schedule_day=$3, schedule_day_name=$4, updated_at=NOW()
    `, [room.id, room.name, room.day, room.dayName]);

    // Add check history (last 2-4 checks per room)
    const statuses = ['green', 'green', 'green', 'amber', 'green', 'green'];
    for (let i = 0; i < 3; i++) {
      const checkDate = d(-7 * (i + 1));
      const rag = room.id === 'HIN-BOARD' && i === 0 ? 'red' : statuses[Math.floor(Math.random() * statuses.length)];
      const limitedFunc = rag === 'amber' ? 'Camera slightly out of alignment' : null;
      const nonFunc = rag === 'red' ? 'Display failed - backlight issue (see project WTB_DEMO_005)' : null;

      await pool.query(`
        INSERT INTO roomcheckhistory (room_id, checked_by, rag_status, limited_functionality, non_functional_reason,
          check_1_video, check_2_display, check_3_audio, check_4_camera, check_5_network, notes, checked_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        room.id,
        i % 2 === 0 ? 'Mike Chen' : 'Damon Alexander',
        rag,
        limitedFunc,
        nonFunc,
        rag !== 'red', true, true,
        rag !== 'amber',
        true,
        rag === 'green' ? 'All systems operational' : (rag === 'amber' ? 'Minor issue noted, scheduled for next maintenance window' : 'Critical issue - repair in progress'),
        checkDate
      ]);
    }
  }
  console.log(`  Created ${rooms.length} rooms with check history.`);

  // ============================================================
  // SUMMARY
  // ============================================================
  const summary = await pool.query("SELECT status, COUNT(*) as count FROM projects WHERE id LIKE 'WTB_%' GROUP BY status ORDER BY count DESC");
  console.log('\nProject Summary:');
  summary.rows.forEach(r => console.log(`  ${r.status}: ${r.count}`));

  const total = await pool.query("SELECT COUNT(*) FROM projects WHERE id LIKE 'WTB_%'");
  console.log(`  Total: ${total.rows[0].count}`);

  const roomCount = await pool.query("SELECT COUNT(*) FROM rooms");
  console.log(`  Rooms: ${roomCount.rows[0].count}`);

  await pool.end();
  console.log('\nDone! Refresh APEX to see the demo data.');

  // ============================================================
  // FIELD OPS DATA - Output JSON for localStorage injection
  // ============================================================
  console.log('\n--- FIELD OPS DATA ---');
  console.log('To populate Field Ops, paste this into the browser console:');

  const fieldOpsData = {
    scheduled: [],
    pending: [],
    completed: []
  };

  // Build field ops from tasks with fieldOps flag
  let fieldId = 1;
  for (const p of projects) {
    for (const task of p.tasks) {
      if (task.fieldOperationsRequired && task.startDate) {
        const entry = {
          id: `field_${fieldId++}`,
          projectId: p.id,
          projectName: p.name,
          taskId: task.id,
          taskName: task.name,
          type: p.type === 'breakfix' ? 'service' : (task.name.toLowerCase().includes('install') ? 'installation' : (task.name.toLowerCase().includes('survey') ? 'site_survey' : 'commissioning')),
          location: p.siteLocation,
          date: task.startDate,
          startTime: '9:00 AM',
          endTime: task.estimatedHours > 4 ? '5:00 PM' : '1:00 PM',
          assignee: task.assignee,
          notes: task.notes || '',
          estimatedDuration: (task.estimatedHours || 2) * 60,
          status: task.status === 'completed' ? 'completed' : (task.status === 'in-progress' ? 'in-progress' : 'scheduled')
        };

        if (task.status === 'completed') {
          fieldOpsData.completed.push(entry);
        } else {
          fieldOpsData.scheduled.push(entry);
        }
      }
    }
  }

  console.log(`\nlocalStorage.setItem('apex_field_ops', '${JSON.stringify(fieldOpsData).replace(/'/g, "\\'")}');\nlocation.reload();`);
}

// ============================================================
// HELPERS
// ============================================================

function proj(id, p) {
  return {
    id,
    name: p.name,
    requestorInfo: p.requestor,
    siteLocation: p.location,
    businessLine: p.business,
    description: p.desc,
    type: p.type,
    status: p.status,
    priority: p.priority,
    purchaseOrder: p.po || '',
    costCenter: p.cc || '',
    requestDate: p.reqDate,
    startDate: p.start,
    dueDate: p.due,
    endDate: p.end,
    estimatedBudget: p.estBudget,
    actualBudget: p.actBudget,
    progress: p.progress,
    tasks: p.tasks
  };
}

let taskCounter = 0;
function t(name, phase, status, assignee, hours, startOff, endOff, fieldOps, notes, ragStatus) {
  taskCounter++;
  return {
    id: `task_demo_${taskCounter}_${Math.random().toString(36).substr(2, 5)}`,
    name,
    description: notes || '',
    status,
    ragStatus: ragStatus || (status === 'completed' ? 'green' : 'green'),
    phase: `phase_${phase}`,
    priority: 'medium',
    assignee: assignee || '',
    estimatedHours: hours || null,
    actualHours: status === 'completed' ? (hours || 0) : (status === 'in-progress' ? Math.round((hours || 0) * 0.4 * 10) / 10 : 0),
    startDate: startOff !== null ? d(startOff) : null,
    endDate: endOff !== null ? d(endOff) : null,
    completedDate: status === 'completed' && endOff !== null ? d(endOff) : null,
    notes: notes || '',
    fieldOperationsRequired: fieldOps || false,
    parentTaskId: null,
    subtasks: [],
    notesThread: [],
    createdAt: startOff !== null ? d(startOff) : new Date().toISOString(),
    updatedAt: endOff !== null ? d(endOff) : new Date().toISOString()
  };
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
