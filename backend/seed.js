const pool = require('./db');
const bcrypt = require('bcryptjs');

async function seed() {
  const client = await pool.connect();
  try {
    // Drop tables
    await client.query(`
      DROP TABLE IF EXISTS device_health_scores CASCADE;
      DROP TABLE IF EXISTS device_metrics CASCADE;
      DROP TABLE IF EXISTS network_topology CASCADE;
      DROP TABLE IF EXISTS firmware_updates CASCADE;
      DROP TABLE IF EXISTS firmware_catalog CASCADE;
      DROP TABLE IF EXISTS device_events CASCADE;
      DROP TABLE IF EXISTS devices CASCADE;
      DROP TABLE IF EXISTS guards CASCADE;
      DROP TABLE IF EXISTS zones CASCADE;
      DROP TABLE IF EXISTS work_orders CASCADE;
      DROP TABLE IF EXISTS tenants CASCADE;
      DROP TABLE IF EXISTS incidents CASCADE;
      DROP TABLE IF EXISTS cameras CASCADE;
      DROP TABLE IF EXISTS credentials CASCADE;
      DROP TABLE IF EXISTS visitors CASCADE;
      DROP TABLE IF EXISTS access_events CASCADE;
      DROP TABLE IF EXISTS properties CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);

    // Users
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const hash = await bcrypt.hash('password123', 10);
    await client.query(`INSERT INTO users (email, password, full_name, role) VALUES ($1, $2, $3, $4)`, ['admin@kastle.com', hash, 'Admin User', 'admin']);

    // Properties
    await client.query(`
      CREATE TABLE properties (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address VARCHAR(255),
        city VARCHAR(100),
        state VARCHAR(50),
        property_type VARCHAR(100),
        floors INTEGER,
        sq_ft INTEGER,
        cameras_count INTEGER DEFAULT 0,
        access_points INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const properties = [
      ['One World Trade Center', '285 Fulton St', 'New York', 'NY', 'Class A Office', 104, 3500000, 450, 120, 'Active'],
      ['Willis Tower', '233 S Wacker Dr', 'Chicago', 'IL', 'Class A Office', 110, 4500000, 380, 95, 'Active'],
      ['Salesforce Tower', '415 Mission St', 'San Francisco', 'CA', 'Class A Office', 61, 1400000, 220, 68, 'Active'],
      ['Bank of America Plaza', '600 Peachtree St NE', 'Atlanta', 'GA', 'Class A Office', 55, 1300000, 190, 52, 'Active'],
      ['US Bank Tower', '633 W 5th St', 'Los Angeles', 'CA', 'Class A Office', 73, 1400000, 210, 75, 'Active'],
      ['Comcast Technology Center', '1800 Arch St', 'Philadelphia', 'PA', 'Class A Office', 60, 1200000, 175, 48, 'Active'],
      ['JPMorgan Chase Tower', '600 Travis St', 'Houston', 'TX', 'Class A Office', 75, 1700000, 240, 82, 'Active'],
      ['Columbia Center', '701 5th Ave', 'Seattle', 'WA', 'Class A Office', 76, 1500000, 200, 60, 'Active'],
      ['Key Tower', '127 Public Square', 'Cleveland', 'OH', 'Class A Office', 57, 1200000, 160, 45, 'Active'],
      ['Prudential Tower', '800 Boylston St', 'Boston', 'MA', 'Class A Office', 52, 1100000, 150, 42, 'Active'],
      ['Republic Plaza', '370 17th St', 'Denver', 'CO', 'Class B Office', 56, 1200000, 165, 48, 'Active'],
      ['First Canadian Place', '100 King St W', 'Toronto', 'ON', 'Class A Office', 72, 2800000, 300, 90, 'Active'],
      ['Aon Center', '200 E Randolph St', 'Chicago', 'IL', 'Class A Office', 83, 2700000, 280, 85, 'Under Renovation'],
      ['Renaissance Center', '300 Renaissance Ctr', 'Detroit', 'MI', 'Mixed Use', 73, 5500000, 320, 100, 'Active'],
      ['Transamerica Pyramid', '600 Montgomery St', 'San Francisco', 'CA', 'Class A Office', 48, 530000, 95, 30, 'Active'],
      ['One Liberty Place', '1650 Market St', 'Philadelphia', 'PA', 'Class A Office', 61, 1300000, 180, 55, 'Active'],
    ];
    for (const p of properties) {
      await client.query(`INSERT INTO properties (name, address, city, state, property_type, floors, sq_ft, cameras_count, access_points, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, p);
    }

    // Access Events
    await client.query(`
      CREATE TABLE access_events (
        id SERIAL PRIMARY KEY,
        property_name VARCHAR(255),
        person_name VARCHAR(255),
        badge_number VARCHAR(50),
        door_name VARCHAR(255),
        direction VARCHAR(20),
        timestamp TIMESTAMP,
        status VARCHAR(50),
        method VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const accessEvents = [
      ['One World Trade Center', 'John Martinez', 'B-1001', 'Main Lobby Entrance', 'Entry', '2024-12-15 08:15:00', 'Granted', 'Proximity Card'],
      ['One World Trade Center', 'Sarah Chen', 'B-1002', 'Parking Garage B1', 'Entry', '2024-12-15 07:45:00', 'Granted', 'Smart Card'],
      ['Willis Tower', 'Mike Johnson', 'B-2001', 'Loading Dock', 'Entry', '2024-12-15 06:30:00', 'Granted', 'Key Fob'],
      ['Willis Tower', 'Unknown Person', 'B-9999', 'Server Room 4A', 'Entry', '2024-12-15 02:30:00', 'Denied', 'Proximity Card'],
      ['Salesforce Tower', 'Emily Davis', 'B-3001', 'Floor 35 Suite A', 'Entry', '2024-12-15 09:00:00', 'Granted', 'Mobile Credential'],
      ['Salesforce Tower', 'Robert Wilson', 'B-3002', 'Executive Floor', 'Entry', '2024-12-15 23:45:00', 'Denied', 'Smart Card'],
      ['Bank of America Plaza', 'Lisa Thompson', 'B-4001', 'Main Entrance', 'Entry', '2024-12-15 08:30:00', 'Granted', 'Proximity Card'],
      ['Bank of America Plaza', 'David Brown', 'B-4002', 'Side Entrance B', 'Exit', '2024-12-15 17:30:00', 'Granted', 'Proximity Card'],
      ['US Bank Tower', 'James Lee', 'B-5001', 'Lobby Turnstile 1', 'Entry', '2024-12-15 08:00:00', 'Granted', 'Smart Card'],
      ['US Bank Tower', 'Amanda Garcia', 'B-5002', 'Roof Access', 'Entry', '2024-12-15 01:15:00', 'Denied', 'Key Fob'],
      ['Comcast Technology Center', 'Chris Taylor', 'B-6001', 'Floor 12 Lab', 'Entry', '2024-12-15 10:00:00', 'Granted', 'Mobile Credential'],
      ['JPMorgan Chase Tower', 'Nancy White', 'B-7001', 'Trading Floor', 'Entry', '2024-12-15 06:45:00', 'Granted', 'Smart Card'],
      ['Columbia Center', 'Kevin Harris', 'B-8001', 'Garage Level 2', 'Entry', '2024-12-15 07:30:00', 'Granted', 'Key Fob'],
      ['Key Tower', 'Patricia Clark', 'B-9001', 'Main Lobby', 'Entry', '2024-12-15 08:45:00', 'Granted', 'Proximity Card'],
      ['Prudential Tower', 'Brian Lewis', 'B-0001', 'Loading Dock', 'Entry', '2024-12-15 03:00:00', 'Denied', 'Smart Card'],
      ['Republic Plaza', 'Jennifer Walker', 'B-0002', 'Stairwell B', 'Entry', '2024-12-15 14:00:00', 'Granted', 'Proximity Card'],
      ['One World Trade Center', 'Tom Reynolds', 'B-1003', 'Emergency Exit 2', 'Exit', '2024-12-15 22:30:00', 'Granted', 'Manual Override'],
      ['Willis Tower', 'Susan Baker', 'B-2002', 'Floor 50 Executive', 'Entry', '2024-12-15 11:00:00', 'Granted', 'Mobile Credential'],
    ];
    for (const e of accessEvents) {
      await client.query(`INSERT INTO access_events (property_name, person_name, badge_number, door_name, direction, timestamp, status, method) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, e);
    }

    // Visitors
    await client.query(`
      CREATE TABLE visitors (
        id SERIAL PRIMARY KEY,
        visitor_name VARCHAR(255),
        visitor_company VARCHAR(255),
        host_name VARCHAR(255),
        property_name VARCHAR(255),
        check_in TIMESTAMP,
        check_out TIMESTAMP,
        purpose VARCHAR(255),
        status VARCHAR(50),
        photo_id_verified BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const visitors = [
      ['Michael Torres', 'Cisco Systems', 'John Martinez', 'One World Trade Center', '2024-12-15 09:00:00', '2024-12-15 12:00:00', 'Vendor Meeting', 'Checked Out', true],
      ['Rachel Kim', 'Deloitte', 'Sarah Chen', 'One World Trade Center', '2024-12-15 10:00:00', null, 'Audit', 'Checked In', true],
      ['David Patel', 'AWS', 'Mike Johnson', 'Willis Tower', '2024-12-15 08:30:00', '2024-12-15 16:00:00', 'Server Maintenance', 'Checked Out', true],
      ['Laura Bennett', 'Indeed', 'Emily Davis', 'Salesforce Tower', '2024-12-15 09:30:00', '2024-12-15 11:00:00', 'Job Interview', 'Checked Out', true],
      ['Jason Wright', 'FedEx', 'Lisa Thompson', 'Bank of America Plaza', '2024-12-15 07:00:00', '2024-12-15 07:30:00', 'Package Delivery', 'Checked Out', false],
      ['Angela Morrison', 'Cushman & Wakefield', 'James Lee', 'US Bank Tower', '2024-12-15 14:00:00', null, 'Property Inspection', 'Checked In', true],
      ['Steven Chang', 'Microsoft', 'Chris Taylor', 'Comcast Technology Center', '2024-12-15 10:00:00', '2024-12-15 15:00:00', 'Client Meeting', 'Checked Out', true],
      ['Maria Rodriguez', 'KPMG', 'Nancy White', 'JPMorgan Chase Tower', '2024-12-15 09:00:00', null, 'Financial Audit', 'Checked In', true],
      ['Robert Foster', 'Siemens', 'Kevin Harris', 'Columbia Center', '2024-12-15 08:00:00', '2024-12-15 17:00:00', 'HVAC Maintenance', 'Checked Out', true],
      ['Sophie Anderson', 'WeWork', 'Patricia Clark', 'Key Tower', '2024-12-15 11:00:00', '2024-12-15 12:30:00', 'Lease Negotiation', 'Checked Out', true],
      ['William Chen', 'Google', 'Brian Lewis', 'Prudential Tower', '2024-12-15 13:00:00', null, 'Tech Integration', 'Checked In', true],
      ['Emma Jackson', 'JLL', 'Jennifer Walker', 'Republic Plaza', '2024-12-15 09:00:00', '2024-12-15 11:00:00', 'Facility Audit', 'Checked Out', true],
      ['Tyler Grant', 'Honeywell', 'John Martinez', 'One World Trade Center', '2024-12-15 07:30:00', '2024-12-15 16:30:00', 'Fire System Inspection', 'Checked Out', true],
      ['Nicole Park', 'McKinsey', 'Sarah Chen', 'One World Trade Center', '2024-12-15 14:00:00', null, 'Strategy Consult', 'Pre-Registered', true],
      ['Carlos Mendez', 'Uber', 'Emily Davis', 'Salesforce Tower', '2024-12-15 15:30:00', null, 'Partnership Meeting', 'Pre-Registered', false],
      ['Hannah Lee', 'PwC', 'Nancy White', 'JPMorgan Chase Tower', '2024-12-15 10:00:00', '2024-12-15 14:00:00', 'Compliance Review', 'Checked Out', true],
    ];
    for (const v of visitors) {
      await client.query(`INSERT INTO visitors (visitor_name, visitor_company, host_name, property_name, check_in, check_out, purpose, status, photo_id_verified) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, v);
    }

    // Credentials
    await client.query(`
      CREATE TABLE credentials (
        id SERIAL PRIMARY KEY,
        holder_name VARCHAR(255),
        badge_number VARCHAR(50),
        credential_type VARCHAR(50),
        property_name VARCHAR(255),
        access_level VARCHAR(50),
        department VARCHAR(100),
        status VARCHAR(50) DEFAULT 'Active',
        expiry_date DATE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const creds = [
      ['John Martinez', 'B-1001', 'Proximity Card', 'One World Trade Center', 'Full Access', 'Security', 'Active', '2025-12-31'],
      ['Sarah Chen', 'B-1002', 'Smart Card', 'One World Trade Center', 'Standard', 'Finance', 'Active', '2025-06-30'],
      ['Mike Johnson', 'B-2001', 'Key Fob', 'Willis Tower', 'Full Access', 'IT', 'Active', '2025-12-31'],
      ['Emily Davis', 'B-3001', 'Mobile Credential', 'Salesforce Tower', 'Executive', 'Management', 'Active', '2025-12-31'],
      ['Robert Wilson', 'B-3002', 'Smart Card', 'Salesforce Tower', 'Standard', 'Engineering', 'Suspended', '2025-03-15'],
      ['Lisa Thompson', 'B-4001', 'Proximity Card', 'Bank of America Plaza', 'Standard', 'HR', 'Active', '2025-09-30'],
      ['David Brown', 'B-4002', 'Proximity Card', 'Bank of America Plaza', 'Standard', 'Legal', 'Active', '2025-08-31'],
      ['James Lee', 'B-5001', 'Smart Card', 'US Bank Tower', 'Full Access', 'Operations', 'Active', '2025-12-31'],
      ['Amanda Garcia', 'B-5002', 'Key Fob', 'US Bank Tower', 'Limited', 'Maintenance', 'Expired', '2024-11-30'],
      ['Chris Taylor', 'B-6001', 'Mobile Credential', 'Comcast Technology Center', 'Full Access', 'Engineering', 'Active', '2025-12-31'],
      ['Nancy White', 'B-7001', 'Smart Card', 'JPMorgan Chase Tower', 'Executive', 'Trading', 'Active', '2025-12-31'],
      ['Kevin Harris', 'B-8001', 'Key Fob', 'Columbia Center', 'Standard', 'Administration', 'Active', '2025-10-31'],
      ['Patricia Clark', 'B-9001', 'Proximity Card', 'Key Tower', 'Standard', 'Marketing', 'Active', '2025-07-31'],
      ['Brian Lewis', 'B-0001', 'Smart Card', 'Prudential Tower', 'Limited', 'Contractor', 'Active', '2025-03-31'],
      ['Jennifer Walker', 'B-0002', 'Proximity Card', 'Republic Plaza', 'Standard', 'Sales', 'Active', '2025-11-30'],
      ['Tom Reynolds', 'B-1003', 'Mobile Credential', 'One World Trade Center', 'Security', 'Security', 'Active', '2025-12-31'],
    ];
    for (const c of creds) {
      await client.query(`INSERT INTO credentials (holder_name, badge_number, credential_type, property_name, access_level, department, status, expiry_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, c);
    }

    // Cameras
    await client.query(`
      CREATE TABLE cameras (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        property_name VARCHAR(255),
        location_description VARCHAR(255),
        camera_type VARCHAR(50),
        status VARCHAR(50) DEFAULT 'Online',
        resolution VARCHAR(50),
        recording_mode VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const cams = [
      ['CAM-WTC-001', 'One World Trade Center', 'Main Lobby North', 'Dome', 'Online', '4K', 'Continuous'],
      ['CAM-WTC-002', 'One World Trade Center', 'Parking Garage B1 Entry', 'Bullet', 'Online', '1080p', 'Motion-Activated'],
      ['CAM-WTC-003', 'One World Trade Center', 'Loading Dock', 'PTZ', 'Offline', '4K', 'Continuous'],
      ['CAM-WIL-001', 'Willis Tower', 'Main Entrance', 'Dome', 'Online', '4K', 'Continuous'],
      ['CAM-WIL-002', 'Willis Tower', 'Server Room 4A', 'Fisheye', 'Online', '4K', 'Continuous'],
      ['CAM-WIL-003', 'Willis Tower', 'Skydeck Observation', 'PTZ', 'Online', '1080p', 'Continuous'],
      ['CAM-SF-001', 'Salesforce Tower', 'Ground Floor Lobby', 'Dome', 'Online', '4K', 'Continuous'],
      ['CAM-SF-002', 'Salesforce Tower', 'Executive Floor 35', 'Bullet', 'Maintenance', '1080p', 'Motion-Activated'],
      ['CAM-BOA-001', 'Bank of America Plaza', 'Main Entrance', 'Dome', 'Online', '4K', 'Continuous'],
      ['CAM-BOA-002', 'Bank of America Plaza', 'Parking Garage Level 3', 'Thermal', 'Online', '720p', 'Continuous'],
      ['CAM-USB-001', 'US Bank Tower', 'Lobby Turnstiles', 'Dome', 'Online', '4K', 'Continuous'],
      ['CAM-USB-002', 'US Bank Tower', 'Roof Access Point', 'Bullet', 'Offline', '1080p', 'Motion-Activated'],
      ['CAM-COM-001', 'Comcast Technology Center', 'Floor 12 Lab Entrance', 'Fisheye', 'Online', '4K', 'Continuous'],
      ['CAM-JPM-001', 'JPMorgan Chase Tower', 'Trading Floor Entry', 'Dome', 'Online', '4K', 'Continuous'],
      ['CAM-COL-001', 'Columbia Center', 'Garage Level 2', 'Bullet', 'Online', '1080p', 'Motion-Activated'],
      ['CAM-KEY-001', 'Key Tower', 'Main Lobby', 'PTZ', 'Online', '4K', 'Continuous'],
      ['CAM-PRU-001', 'Prudential Tower', 'Loading Dock', 'Thermal', 'Maintenance', '720p', 'Continuous'],
      ['CAM-REP-001', 'Republic Plaza', 'Stairwell B', 'Bullet', 'Online', '1080p', 'Motion-Activated'],
    ];
    for (const c of cams) {
      await client.query(`INSERT INTO cameras (name, property_name, location_description, camera_type, status, resolution, recording_mode) VALUES ($1,$2,$3,$4,$5,$6,$7)`, c);
    }

    // Incidents
    await client.query(`
      CREATE TABLE incidents (
        id SERIAL PRIMARY KEY,
        incident_number VARCHAR(50),
        title VARCHAR(255),
        property_name VARCHAR(255),
        severity VARCHAR(20),
        incident_type VARCHAR(100),
        status VARCHAR(50),
        reported_by VARCHAR(255),
        description TEXT,
        resolution TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const incidents = [
      ['INC-2024-001', 'Unauthorized Access Attempt Server Room', 'Willis Tower', 'Critical', 'Unauthorized Access', 'Open', 'Security Operations', 'Unknown individual attempted to access Server Room 4A at 2:30 AM using stolen badge B-9999. Access was denied. Individual fled before security arrived.', null],
      ['INC-2024-002', 'Tailgating at Main Entrance', 'One World Trade Center', 'High', 'Tailgating', 'Investigating', 'Guard Tom Reynolds', 'Two individuals followed an authorized employee through the main lobby turnstile without presenting credentials. Captured on CAM-WTC-001.', null],
      ['INC-2024-003', 'Fire Alarm Activation Floor 22', 'Salesforce Tower', 'High', 'Fire Alarm', 'Resolved', 'Building Management', 'Fire alarm triggered on floor 22 at 14:30. Investigation revealed burnt food in kitchen area. No actual fire. False alarm confirmed by fire department.', 'Kitchen area microwave removed. Notice sent to tenants.'],
      ['INC-2024-004', 'Laptop Theft from Suite 4500', 'Bank of America Plaza', 'Medium', 'Theft', 'Investigating', 'Tenant Security Lead', 'Three laptops reported missing from Suite 4500 overnight. Last known access to suite was at 21:00 by cleaning crew.', null],
      ['INC-2024-005', 'Suspicious Package Loading Dock', 'Prudential Tower', 'High', 'Suspicious Package', 'Resolved', 'Guard Brian Lewis', 'Unattended package found at loading dock at 3:00 AM. Area evacuated. Package determined to be misdelivered shipment.', 'Package returned to courier service. Loading dock procedures reviewed.'],
      ['INC-2024-006', 'Camera System Outage', 'US Bank Tower', 'Medium', 'Equipment Failure', 'Open', 'NOC', 'CAM-USB-002 at roof access point has been offline for 48 hours. Unable to restore remotely. Technician dispatch required.', null],
      ['INC-2024-007', 'After-Hours Access Anomaly', 'Salesforce Tower', 'Medium', 'Unauthorized Access', 'Investigating', 'AI Anomaly System', 'Robert Wilson (B-3002) attempted executive floor access at 23:45. Badge has standard access only. Multiple denied attempts logged.', null],
      ['INC-2024-008', 'Garage Vehicle Break-In', 'Columbia Center', 'Medium', 'Vandalism', 'Resolved', 'Guard Kevin Harris', 'Tenant reported vehicle window broken in Garage Level 2. Review of CAM-COL-001 shows incident at approximately 2:15 AM. Suspect not identifiable.', 'Increased garage patrols. Additional lighting requested.'],
      ['INC-2024-009', 'Badge Cloning Suspected', 'JPMorgan Chase Tower', 'Critical', 'Security Breach', 'Investigating', 'Security Director', 'Duplicate badge readings detected for B-7001 at two different locations within 2 minutes. Possible badge cloning attack.', null],
      ['INC-2024-010', 'Emergency Exit Door Propped Open', 'One World Trade Center', 'Low', 'Policy Violation', 'Resolved', 'Guard Tom Reynolds', 'Emergency exit door on floor 15 found propped open during patrol. No unauthorized access detected.', 'Door alarm reset. Tenant reminded of policy.'],
      ['INC-2024-011', 'Elevator Entrapment', 'Key Tower', 'Medium', 'Safety', 'Resolved', 'Building Operations', 'Two people trapped in elevator #3 for 45 minutes due to mechanical failure. Fire department called for extraction.', 'Elevator serviced. Additional maintenance scheduled.'],
      ['INC-2024-012', 'Protest Activity Outside Building', 'Willis Tower', 'Low', 'External Threat', 'Monitoring', 'Security Operations', 'Group of approximately 30 protesters outside main entrance. Peaceful demonstration. No building access attempted.', null],
      ['INC-2024-013', 'Water Leak Near Server Room', 'Comcast Technology Center', 'High', 'Environmental', 'Open', 'Facilities', 'Water leak detected on floor 12 near the lab entrance. Close proximity to server infrastructure. Emergency plumbing dispatched.', null],
      ['INC-2024-014', 'Lost Badge Report', 'Republic Plaza', 'Low', 'Lost Credential', 'Resolved', 'Jennifer Walker', 'Employee reported badge B-0002 lost in parking area. Badge deactivated immediately.', 'New badge B-0002-R issued. Old badge blacklisted.'],
      ['INC-2024-015', 'Roof Access Attempt Off-Hours', 'US Bank Tower', 'High', 'Unauthorized Access', 'Open', 'AI Anomaly System', 'Amanda Garcia (B-5002) attempted roof access at 1:15 AM. Badge has maintenance-level access only. Badge has been expired since Nov 2024.', null],
      ['INC-2024-016', 'Smoke Detector Malfunction', 'Renaissance Center', 'Medium', 'Equipment Failure', 'Open', 'Facilities', 'Multiple false alarms from smoke detectors on floors 40-42. Detectors may need recalibration or replacement.', null],
    ];
    for (const i of incidents) {
      await client.query(`INSERT INTO incidents (incident_number, title, property_name, severity, incident_type, status, reported_by, description, resolution) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, i);
    }

    // Tenants
    await client.query(`
      CREATE TABLE tenants (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(255),
        property_name VARCHAR(255),
        floor VARCHAR(50),
        suite VARCHAR(50),
        primary_contact VARCHAR(255),
        employee_count INTEGER,
        badge_count INTEGER,
        lease_end DATE,
        access_hours VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const tenants = [
      ['Goldman Sachs', 'One World Trade Center', '42-48', 'Suite 4200', 'Richard Hoffman', 850, 920, '2027-06-30', '24/7'],
      ['Conde Nast', 'One World Trade Center', '20-25', 'Suite 2000', 'Sarah Mitchell', 1200, 1350, '2028-12-31', '6AM-10PM'],
      ['BMO Financial', 'Willis Tower', '50-56', 'Suite 5000', 'Michael Stevens', 600, 680, '2026-09-30', '24/7'],
      ['United Airlines', 'Willis Tower', '77-84', 'Suite 7700', 'Karen Phillips', 2500, 2800, '2029-03-31', '24/7'],
      ['Salesforce', 'Salesforce Tower', '30-40', 'Suite 3000', 'David Kim', 3000, 3200, '2030-12-31', '24/7'],
      ['Accenture', 'Salesforce Tower', '15-19', 'Suite 1500', 'Jennifer Walsh', 450, 500, '2026-06-30', '7AM-9PM'],
      ['Troutman Pepper', 'Bank of America Plaza', '44-47', 'Suite 4400', 'William Foster', 300, 340, '2027-12-31', '24/7'],
      ['Invesco', 'Bank of America Plaza', '38-41', 'Suite 3800', 'Rebecca Torres', 250, 280, '2026-11-30', '7AM-8PM'],
      ['KPMG', 'US Bank Tower', '30-35', 'Suite 3000', 'Andrew Sullivan', 400, 450, '2027-08-31', '24/7'],
      ['Comcast', 'Comcast Technology Center', '5-20', 'Suite 500', 'Laura Bennett', 4000, 4200, '2035-12-31', '24/7'],
      ['JPMorgan Chase', 'JPMorgan Chase Tower', '1-30', 'Suite 100', 'Robert Chen', 5000, 5500, '2031-06-30', '24/7'],
      ['Amazon', 'Columbia Center', '25-30', 'Suite 2500', 'Lisa Johnson', 800, 900, '2028-03-31', '24/7'],
      ['KeyBank', 'Key Tower', '1-15', 'Suite 100', 'Thomas Grant', 600, 650, '2027-12-31', '7AM-7PM'],
      ['Fidelity Investments', 'Prudential Tower', '22-28', 'Suite 2200', 'Maria Santos', 350, 400, '2026-09-30', '24/7'],
      ['Xcel Energy', 'Republic Plaza', '30-35', 'Suite 3000', 'Brian Parker', 280, 310, '2027-04-30', '7AM-8PM'],
      ['Ally Financial', 'Renaissance Center', '10-15', 'Suite 1000', 'Nicole Green', 500, 560, '2028-12-31', '24/7'],
    ];
    for (const t of tenants) {
      await client.query(`INSERT INTO tenants (company_name, property_name, floor, suite, primary_contact, employee_count, badge_count, lease_end, access_hours) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, t);
    }

    // Work Orders
    await client.query(`
      CREATE TABLE work_orders (
        id SERIAL PRIMARY KEY,
        work_order_number VARCHAR(50),
        title VARCHAR(255),
        property_name VARCHAR(255),
        device_type VARCHAR(100),
        device_name VARCHAR(100),
        priority VARCHAR(20),
        status VARCHAR(50),
        assigned_to VARCHAR(255),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const workOrders = [
      ['WO-2024-001', 'Replace PTZ Motor - Loading Dock Camera', 'One World Trade Center', 'Camera', 'CAM-WTC-003', 'High', 'In Progress', 'Tony Ramirez', 'PTZ motor failure on loading dock camera. Camera stuck in fixed position. Replacement motor ordered.'],
      ['WO-2024-002', 'Card Reader Firmware Update', 'Willis Tower', 'Access Reader', 'RDR-WIL-4A', 'Medium', 'Scheduled', 'Sarah Kim', 'Firmware update required for server room card reader. Schedule during maintenance window.'],
      ['WO-2024-003', 'Replace Offline Camera', 'US Bank Tower', 'Camera', 'CAM-USB-002', 'High', 'Open', 'Unassigned', 'Roof access camera offline for 48 hours. Power supply suspected. Replace camera unit.'],
      ['WO-2024-004', 'Recalibrate Thermal Camera', 'Bank of America Plaza', 'Camera', 'CAM-BOA-002', 'Low', 'Scheduled', 'James Wilson', 'Thermal camera showing false heat signatures in parking garage. Needs recalibration.'],
      ['WO-2024-005', 'Door Controller Replacement', 'Salesforce Tower', 'Door Controller', 'CTRL-SF-35', 'Critical', 'In Progress', 'Mike Chen', 'Executive floor door controller intermittently failing. Replacement unit installed, testing in progress.'],
      ['WO-2024-006', 'Alarm Panel Battery Replacement', 'Key Tower', 'Alarm Panel', 'ALM-KEY-01', 'Medium', 'Completed', 'Robert Garcia', 'Annual battery replacement for main alarm panel. UL-listed batteries installed.'],
      ['WO-2024-007', 'Camera Cleaning - Lobby', 'Prudential Tower', 'Camera', 'CAM-PRU-001', 'Low', 'Open', 'Unassigned', 'Loading dock camera lens obscured by dirt/moisture. Schedule cleaning.'],
      ['WO-2024-008', 'Intercom System Repair', 'Columbia Center', 'Intercom', 'INT-COL-G2', 'Medium', 'In Progress', 'Kevin Park', 'Garage level 2 intercom has static interference. Audio board may need replacement.'],
      ['WO-2024-009', 'Access Reader Installation', 'Republic Plaza', 'Access Reader', 'RDR-REP-NEW', 'High', 'Scheduled', 'Tony Ramirez', 'New card reader installation for renovated suite on floor 32. Run cable and mount unit.'],
      ['WO-2024-010', 'NVR Storage Expansion', 'Willis Tower', 'NVR', 'NVR-WIL-01', 'Medium', 'Open', 'Unassigned', 'NVR reaching 85% capacity. Add additional 20TB storage drives.'],
      ['WO-2024-011', 'Smoke Detector Replacement', 'Renaissance Center', 'Smoke Detector', 'SMK-REN-40', 'High', 'In Progress', 'Lisa Anderson', 'Replace malfunctioning smoke detectors on floors 40-42 causing false alarms.'],
      ['WO-2024-012', 'Turnstile Calibration', 'US Bank Tower', 'Turnstile', 'TURN-USB-01', 'Low', 'Completed', 'James Wilson', 'Lobby turnstile #1 barrier arm not closing fully. Adjusted and calibrated.'],
      ['WO-2024-013', 'Camera Relocation', 'Comcast Technology Center', 'Camera', 'CAM-COM-001', 'Medium', 'Scheduled', 'Sarah Kim', 'Relocate fisheye camera to new position per tenant renovation. Run new cable.'],
      ['WO-2024-014', 'Emergency Phone Test', 'One World Trade Center', 'Emergency Phone', 'EPH-WTC-ALL', 'Low', 'Scheduled', 'Robert Garcia', 'Quarterly testing of all emergency phones in stairwells and elevators.'],
      ['WO-2024-015', 'Biometric Reader Install', 'JPMorgan Chase Tower', 'Biometric Reader', 'BIO-JPM-TF', 'Critical', 'In Progress', 'Mike Chen', 'Install biometric fingerprint readers at trading floor entries per security upgrade project.'],
      ['WO-2024-016', 'Perimeter Fence Sensor Repair', 'Renaissance Center', 'Fence Sensor', 'FEN-REN-E1', 'High', 'Open', 'Unassigned', 'East perimeter fence vibration sensor reporting intermittent faults. Inspect and repair.'],
    ];
    for (const w of workOrders) {
      await client.query(`INSERT INTO work_orders (work_order_number, title, property_name, device_type, device_name, priority, status, assigned_to, description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, w);
    }

    // Zones
    await client.query(`
      CREATE TABLE zones (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        property_name VARCHAR(255),
        floor VARCHAR(50),
        zone_type VARCHAR(100),
        access_level VARCHAR(50),
        cameras_count INTEGER DEFAULT 0,
        doors_count INTEGER DEFAULT 0,
        max_occupancy INTEGER,
        alarm_enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const zones = [
      ['Main Lobby', 'One World Trade Center', '1', 'Lobby', 'Public', 8, 4, 500, true],
      ['Parking Garage B1', 'One World Trade Center', 'B1', 'Garage', 'Tenant', 6, 2, 200, true],
      ['Executive Suite', 'Salesforce Tower', '35', 'Executive', 'Executive', 4, 3, 50, true],
      ['Server Room 4A', 'Willis Tower', '4', 'Data Center', 'Restricted', 4, 1, 10, true],
      ['Loading Dock', 'One World Trade Center', '1', 'Loading', 'Authorized', 3, 2, 30, true],
      ['Skydeck', 'Willis Tower', '103', 'Public Area', 'Public', 12, 4, 300, false],
      ['Trading Floor', 'JPMorgan Chase Tower', '15', 'Trading', 'Restricted', 8, 6, 200, true],
      ['Lab Floor 12', 'Comcast Technology Center', '12', 'Laboratory', 'Restricted', 4, 2, 40, true],
      ['Garage Level 2', 'Columbia Center', 'P2', 'Garage', 'Tenant', 4, 2, 150, true],
      ['Main Lobby', 'Key Tower', '1', 'Lobby', 'Public', 6, 3, 300, true],
      ['Loading Dock', 'Prudential Tower', '1', 'Loading', 'Authorized', 2, 2, 20, true],
      ['Stairwell B', 'Republic Plaza', 'All', 'Stairwell', 'Tenant', 0, 16, 20, true],
      ['Roof Deck', 'US Bank Tower', '73', 'Roof', 'Restricted', 2, 1, 25, true],
      ['Conference Center', 'Bank of America Plaza', '2', 'Common Area', 'Tenant', 4, 4, 200, false],
      ['Emergency Operations', 'One World Trade Center', '2', 'Command Center', 'Restricted', 6, 2, 15, true],
      ['Fitness Center', 'Willis Tower', '3', 'Amenity', 'Tenant', 2, 2, 100, false],
    ];
    for (const z of zones) {
      await client.query(`INSERT INTO zones (name, property_name, floor, zone_type, access_level, cameras_count, doors_count, max_occupancy, alarm_enabled) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, z);
    }

    // Guards
    await client.query(`
      CREATE TABLE guards (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255),
        badge_id VARCHAR(50),
        property_name VARCHAR(255),
        shift VARCHAR(50),
        shift_start TIME,
        shift_end TIME,
        certifications TEXT,
        status VARCHAR(50) DEFAULT 'On Duty',
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const guards = [
      ['Tom Reynolds', 'G-001', 'One World Trade Center', 'Day', '06:00', '14:00', 'CPR, First Aid, Armed', 'On Duty', '212-555-0101'],
      ['Marcus Johnson', 'G-002', 'One World Trade Center', 'Swing', '14:00', '22:00', 'CPR, First Aid', 'On Duty', '212-555-0102'],
      ['Frank Diaz', 'G-003', 'One World Trade Center', 'Night', '22:00', '06:00', 'CPR, First Aid, Armed, Hazmat', 'On Duty', '212-555-0103'],
      ['Steven Park', 'G-004', 'Willis Tower', 'Day', '06:00', '14:00', 'CPR, First Aid, Armed', 'On Duty', '312-555-0201'],
      ['Raymond Carter', 'G-005', 'Willis Tower', 'Night', '22:00', '06:00', 'CPR, First Aid', 'On Duty', '312-555-0202'],
      ['Diana Ross', 'G-006', 'Salesforce Tower', 'Day', '07:00', '15:00', 'CPR, First Aid, Fire Safety', 'On Duty', '415-555-0301'],
      ['Carlos Ruiz', 'G-007', 'Bank of America Plaza', 'Day', '06:00', '14:00', 'CPR, Armed', 'On Duty', '404-555-0401'],
      ['Angela Wright', 'G-008', 'US Bank Tower', 'Swing', '14:00', '22:00', 'CPR, First Aid', 'On Duty', '213-555-0501'],
      ['James O\'Brien', 'G-009', 'Comcast Technology Center', 'Day', '07:00', '15:00', 'CPR, First Aid, Armed', 'On Duty', '215-555-0601'],
      ['Maria Santos', 'G-010', 'JPMorgan Chase Tower', 'Day', '06:00', '14:00', 'CPR, First Aid, Armed, K9', 'On Duty', '713-555-0701'],
      ['Derek Williams', 'G-011', 'Columbia Center', 'Night', '22:00', '06:00', 'CPR, First Aid', 'On Duty', '206-555-0801'],
      ['Patricia Kim', 'G-012', 'Key Tower', 'Day', '07:00', '15:00', 'CPR, First Aid', 'On Duty', '216-555-0901'],
      ['Robert Hernandez', 'G-013', 'Prudential Tower', 'Swing', '14:00', '22:00', 'CPR, Armed', 'Off Duty', '617-555-0001'],
      ['William Chang', 'G-014', 'Republic Plaza', 'Day', '06:00', '14:00', 'CPR, First Aid', 'On Duty', '303-555-0002'],
      ['Nicole Foster', 'G-015', 'Renaissance Center', 'Day', '06:00', '14:00', 'CPR, First Aid, Fire Safety', 'On Duty', '313-555-0003'],
      ['Ahmed Hassan', 'G-016', 'One World Trade Center', 'Day', '06:00', '14:00', 'CPR, First Aid, Surveillance', 'On Leave', '212-555-0104'],
    ];
    for (const g of guards) {
      await client.query(`INSERT INTO guards (full_name, badge_id, property_name, shift, shift_start, shift_end, certifications, status, phone) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, g);
    }

    // Devices (Device Registry)
    await client.query(`
      CREATE TABLE devices (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        device_type VARCHAR(100),
        ip_address VARCHAR(45),
        mac_address VARCHAR(17),
        firmware_version VARCHAR(50),
        manufacturer VARCHAR(255),
        model VARCHAR(255),
        property_name VARCHAR(255),
        zone_name VARCHAR(255),
        subnet VARCHAR(50),
        port INTEGER DEFAULT 443,
        protocol VARCHAR(20) DEFAULT 'HTTPS',
        status VARCHAR(50) DEFAULT 'Online',
        last_seen TIMESTAMP DEFAULT NOW(),
        uptime_hours NUMERIC,
        cpu_usage NUMERIC,
        memory_usage NUMERIC,
        temperature NUMERIC,
        config JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const devices = [
      ['CAM-WTC-001','Camera','192.168.10.101','AA:BB:CC:01:01:01','v8.4.2','Axis','P3245-V','One World Trade Center','Main Lobby','192.168.10.0/24',443,'HTTPS','Online','2024-12-15 08:00:00',2160,45.2,38.1,42.5,'{"resolution":"4K","recording_mode":"continuous","night_vision":true,"ptz":true}'],
      ['CAM-WTC-002','Camera','192.168.10.102','AA:BB:CC:01:01:02','v8.4.2','Axis','P3245-V','One World Trade Center','Parking Garage B1','192.168.10.0/24',443,'HTTPS','Online','2024-12-15 07:55:00',2160,52.0,41.3,44.1,'{"resolution":"4K","recording_mode":"continuous","night_vision":true,"ptz":false}'],
      ['CAM-WTC-003','Camera','192.168.10.103','AA:BB:CC:01:01:03','v8.2.1','Axis','M3106-L','One World Trade Center','Loading Dock','192.168.10.0/24',443,'HTTPS','Offline','2024-12-14 22:00:00',0,0,0,0,'{"resolution":"1080p","recording_mode":"motion","night_vision":true,"ptz":false}'],
      ['CAM-WIL-001','Camera','192.168.20.101','AA:BB:CC:02:01:01','v8.3.0','Axis','Q6135-LE','Willis Tower','Main Entrance','192.168.20.0/24',443,'HTTPS','Online','2024-12-15 08:00:00',1440,38.7,35.2,40.8,'{"resolution":"4K","recording_mode":"continuous","night_vision":true,"ptz":true}'],
      ['CAM-SF-001','Camera','192.168.30.101','AA:BB:CC:03:01:01','v8.4.2','Axis','P3245-V','Salesforce Tower','Lobby Level 1','192.168.30.0/24',443,'HTTPS','Online','2024-12-15 08:00:00',720,41.5,36.8,41.2,'{"resolution":"4K","recording_mode":"continuous","night_vision":true,"ptz":true}'],
      ['CAM-BOA-001','Camera','192.168.40.101','AA:BB:CC:04:01:01','v4.1.0','Bosch','FLEXIDOME 5100i','Bank of America Plaza','Conference Center','192.168.40.0/24',443,'HTTPS','Online','2024-12-15 07:50:00',3600,33.2,29.5,38.4,'{"resolution":"1080p","recording_mode":"scheduled","night_vision":false,"ptz":false}'],
      ['CAM-JPM-001','Camera','192.168.50.101','AA:BB:CC:05:01:01','v8.4.2','Axis','P3245-V','JPMorgan Chase Tower','Main Lobby','192.168.50.0/24',443,'HTTPS','Online','2024-12-15 08:00:00',4320,52.0,44.1,43.7,'{"resolution":"4K","recording_mode":"continuous","night_vision":true,"ptz":true}'],
      ['CAM-USB-001','Camera','192.168.60.101','AA:BB:CC:06:01:01','v8.1.0','Axis','M3106-L','US Bank Tower','Loading Dock','192.168.60.0/24',443,'HTTPS','Offline','2024-12-13 14:00:00',0,0,0,0,'{"resolution":"1080p","recording_mode":"motion","night_vision":true,"ptz":false}'],
      ['RDR-WTC-001','Reader','192.168.10.201','AA:BB:CC:01:02:01','v3.2.1','HID','iCLASS SE','One World Trade Center','Main Lobby','192.168.10.0/24',443,'HTTPS','Online','2024-12-15 08:00:00',8760,12.5,18.3,35.2,'{"access_level":"all","card_format":"iCLASS","two_factor":true}'],
      ['RDR-WIL-001','Reader','192.168.20.201','AA:BB:CC:02:02:01','v3.1.0','HID','iCLASS SE','Willis Tower','Server Room 4A','192.168.20.0/24',443,'HTTPS','Online','2024-12-15 08:00:00',4380,10.8,15.7,33.1,'{"access_level":"restricted","card_format":"iCLASS","two_factor":true}'],
      ['RDR-SF-001','Reader','192.168.30.201','AA:BB:CC:03:02:01','v3.2.1','HID','iCLASS SE R40','Salesforce Tower','Executive Suite','192.168.30.0/24',443,'HTTPS','Maintenance','2024-12-15 06:00:00',2190,0,0,0,'{"access_level":"executive","card_format":"Seos","two_factor":true}'],
      ['RDR-BOA-001','Reader','192.168.40.201','AA:BB:CC:04:02:01','v3.2.1','HID','iCLASS SE','Bank of America Plaza','Loading Dock','192.168.40.0/24',443,'HTTPS','Online','2024-12-15 07:58:00',6570,11.3,16.9,34.5,'{"access_level":"staff","card_format":"iCLASS","two_factor":false}'],
      ['RDR-KEY-001','Reader','192.168.10.202','AA:BB:CC:07:02:01','v3.0.5','HID','iCLASS SE','Key Tower','Main Lobby','192.168.10.0/24',443,'HTTPS','Online','2024-12-15 08:00:00',7300,9.8,14.2,32.8,'{"access_level":"all","card_format":"iCLASS","two_factor":false}'],
      ['CTRL-WTC-001','Controller','192.168.10.150','AA:BB:CC:01:03:01','v5.0.8','Lenel','LNL-4420','One World Trade Center','Emergency Operations','192.168.10.0/24',8080,'HTTPS','Online','2024-12-15 08:00:00',8760,62.3,55.8,48.2,'{"max_doors":64,"active_doors":48,"alarm_inputs":128}'],
      ['CTRL-SF-001','Controller','192.168.30.150','AA:BB:CC:03:03:01','v5.0.3','Lenel','LNL-4420','Salesforce Tower','Executive Suite','192.168.30.0/24',8080,'HTTPS','Online','2024-12-15 08:00:00',1095,92.8,78.4,52.1,'{"max_doors":64,"active_doors":61,"alarm_inputs":128}'],
      ['CTRL-WIL-001','Controller','192.168.20.150','AA:BB:CC:02:03:01','v5.0.8','Lenel','LNL-3300','Willis Tower','Server Room 4A','192.168.20.0/24',8080,'HTTPS','Online','2024-12-15 07:59:00',4380,55.1,48.7,46.5,'{"max_doors":32,"active_doors":28,"alarm_inputs":64}'],
      ['CTRL-USB-001','Controller','192.168.60.150','AA:BB:CC:06:03:01','v5.0.8','Lenel','LNL-3300','US Bank Tower','Roof Deck','192.168.60.0/24',8080,'HTTPS','Maintenance','2024-12-14 18:00:00',0,0,0,0,'{"max_doors":32,"active_doors":24,"alarm_inputs":64}'],
      ['SNS-WTC-001','Sensor','192.168.10.180','AA:BB:CC:01:04:01','v1.5.2','Honeywell','5800PIR-RES','One World Trade Center','Main Lobby','192.168.10.0/24',80,'HTTP','Online','2024-12-15 08:00:00',8760,8.2,12.1,31.5,'{"sensor_type":"motion_ir","sensitivity":"high","range_ft":40}'],
      ['SNS-REN-001','Sensor','192.168.40.180','AA:BB:CC:08:04:01','v1.4.2','Honeywell','5800COMBO','Renaissance Center','Stairwell B','192.168.40.0/24',80,'HTTP','Online','2024-12-15 07:45:00',2190,7.5,10.8,33.9,'{"sensor_type":"smoke_heat","sensitivity":"medium","range_ft":30}'],
      ['SNS-PRU-001','Sensor','192.168.50.180','AA:BB:CC:09:04:01','v1.5.2','Honeywell','5800PIR-RES','Prudential Tower','Loading Dock','192.168.50.0/24',80,'HTTP','Online','2024-12-15 07:55:00',4380,6.9,11.4,30.2,'{"sensor_type":"motion_ir","sensitivity":"medium","range_ft":40}'],
      ['ALM-WTC-001','Alarm Panel','192.168.10.160','AA:BB:CC:01:05:01','v2.9.0','Honeywell','VISTA-128BPT','One World Trade Center','Emergency Operations','192.168.10.0/24',443,'HTTPS','Online','2024-12-15 08:00:00',8760,22.1,30.5,37.8,'{"zones":128,"active_zones":112,"battery_backup":true}'],
      ['ALM-KEY-001','Alarm Panel','192.168.10.161','AA:BB:CC:07:05:01','v2.8.0','Honeywell','VISTA-128BPT','Key Tower','Main Lobby','192.168.10.0/24',443,'HTTPS','Online','2024-12-15 08:00:00',6570,18.4,25.7,36.1,'{"zones":128,"active_zones":85,"battery_backup":true}'],
      ['NSW-WTC-001','Network Switch','192.168.10.1','AA:BB:CC:01:06:01','v12.3.1','Cisco','Catalyst 9300','One World Trade Center','Emergency Operations','192.168.10.0/24',443,'HTTPS','Online','2024-12-15 08:00:00',8760,67.1,58.3,44.9,'{"ports":48,"poe":true,"throughput_gbps":10,"vlan_count":12}'],
      ['NSW-WIL-001','Network Switch','192.168.20.1','AA:BB:CC:02:06:01','v12.3.1','Cisco','Catalyst 9200','Willis Tower','Server Room 4A','192.168.20.0/24',443,'HTTPS','Online','2024-12-15 08:00:00',4380,54.8,47.2,42.3,'{"ports":24,"poe":true,"throughput_gbps":1,"vlan_count":8}'],
      ['NSW-SF-001','Network Switch','192.168.30.1','AA:BB:CC:03:06:01','v12.2.0','Cisco','Catalyst 9300','Salesforce Tower','Executive Suite','192.168.30.0/24',443,'HTTPS','Online','2024-12-15 07:58:00',2190,61.2,52.8,43.5,'{"ports":48,"poe":true,"throughput_gbps":10,"vlan_count":10}'],
    ];
    for (const d of devices) {
      await client.query(`INSERT INTO devices (name, device_type, ip_address, mac_address, firmware_version, manufacturer, model, property_name, zone_name, subnet, port, protocol, status, last_seen, uptime_hours, cpu_usage, memory_usage, temperature, config) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`, d);
    }

    // Device Events
    await client.query(`
      CREATE TABLE IF NOT EXISTS device_events (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(100),
        device_type VARCHAR(100),
        device_name VARCHAR(255),
        property_name VARCHAR(255),
        zone_name VARCHAR(255),
        severity VARCHAR(20) DEFAULT 'info',
        description TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const deviceEvents = [
      ['access_granted', 'Reader', 'RDR-MAIN-ENTRY', 'One World Trade Center', 'Main Lobby', 'info', 'Badge access granted - John Smith (Badge #1042)', '{"badge_number":"1042","holder":"John Smith"}'],
      ['access_denied', 'Reader', 'RDR-WIL-4A', 'Willis Tower', 'Server Room 4A', 'warning', 'Access denied - expired credential attempted', '{"badge_number":"0891","reason":"expired"}'],
      ['camera_motion', 'Camera', 'CAM-WTC-001', 'One World Trade Center', 'Main Lobby', 'info', 'Motion detected in main lobby - normal foot traffic', '{"confidence":0.92}'],
      ['sensor_triggered', 'Sensor', 'SMK-REN-40', 'Renaissance Center', 'Floor 40', 'warning', 'Smoke sensor triggered - investigating', '{"sensor_subtype":"smoke","reading":45.2}'],
      ['device_online', 'Camera', 'CAM-WTC-003', 'One World Trade Center', 'Parking Garage B1', 'info', 'Camera back online after PTZ motor replacement', '{"downtime_hours":12}'],
      ['access_granted', 'Reader', 'RDR-SF-35', 'Salesforce Tower', 'Executive Suite', 'info', 'Badge access granted - Diana Ross (Badge #2201)', '{"badge_number":"2201","holder":"Diana Ross"}'],
      ['alarm_triggered', 'Alarm Panel', 'ALM-KEY-01', 'Key Tower', 'Main Lobby', 'critical', 'Intrusion alarm triggered in lobby after hours', '{"alarm_zone":"Zone-A","trigger":"door_forced"}'],
      ['health_warning', 'Controller', 'CTRL-SF-35', 'Salesforce Tower', 'Floor 35', 'warning', 'Controller CPU at 92% - performance degradation risk', '{"cpu_percent":92.8}'],
      ['access_granted', 'Reader', 'RDR-BOA-01', 'Bank of America Plaza', 'Conference Center', 'info', 'Badge access granted - visitor escort', '{"badge_number":"V-0042","holder":"Visitor: Mark Chen"}'],
      ['camera_motion', 'Camera', 'CAM-WIL-002', 'Willis Tower', 'Server Room 4A', 'warning', 'Motion detected in server room during restricted hours', '{"confidence":0.98,"after_hours":true}'],
      ['tailgating_detected', 'Camera', 'CAM-SF-001', 'Salesforce Tower', 'Main Lobby', 'critical', 'Tailgating detected at main entrance - two people on single badge', '{"confidence":0.87}'],
      ['access_denied', 'Reader', 'RDR-JPM-01', 'JPMorgan Chase Tower', 'Trading Floor', 'warning', 'Access denied - unauthorized area attempt', '{"badge_number":"3055","reason":"insufficient_clearance"}'],
      ['sensor_triggered', 'Sensor', 'TEMP-COM-12', 'Comcast Technology Center', 'Lab Floor 12', 'warning', 'Temperature exceeding threshold in server room', '{"sensor_subtype":"temperature","reading":82.5}'],
      ['device_offline', 'Camera', 'CAM-USB-002', 'US Bank Tower', 'Loading Dock', 'critical', 'Camera offline - power supply failure suspected', '{"last_heartbeat":"2024-12-13T08:00:00"}'],
      ['alarm_cleared', 'Alarm Panel', 'ALM-KEY-01', 'Key Tower', 'Main Lobby', 'info', 'Alarm cleared by security - false alarm confirmed', '{"cleared_by":"Patricia Kim","response_time_min":8}'],
      ['access_granted', 'Reader', 'RDR-WTC-GARAGE', 'One World Trade Center', 'Parking Garage B1', 'info', 'Vehicle access granted - employee parking', '{"badge_number":"1042","vehicle":"Toyota Camry"}'],
      ['camera_motion', 'Camera', 'CAM-PRU-001', 'Prudential Tower', 'Loading Dock', 'info', 'Delivery truck arrival detected', '{"confidence":0.95,"vehicle_type":"delivery_truck"}'],
      ['health_warning', 'Sensor', 'SMK-REN-40', 'Renaissance Center', 'Floor 40', 'warning', 'Smoke sensor signal strength degraded', '{"signal_strength":28.3}'],
      ['access_granted', 'Reader', 'RDR-COM-01', 'Comcast Technology Center', 'Main Lobby', 'info', 'Badge access granted - contractor entry', '{"badge_number":"C-0188","holder":"Contractor: Tech Solutions Inc"}'],
      ['alarm_triggered', 'Alarm Panel', 'ALM-REN-01', 'Renaissance Center', 'Floor 42', 'critical', 'Fire alarm activated floors 40-42', '{"alarm_zone":"Zone-F40-42","trigger":"smoke_detector"}'],
      ['device_online', 'Reader', 'RDR-REP-01', 'Republic Plaza', 'Stairwell B', 'info', 'Reader back online after firmware update', '{"firmware":"v3.2.1"}'],
      ['access_denied', 'Reader', 'RDR-SF-35', 'Salesforce Tower', 'Executive Suite', 'critical', 'Multiple failed access attempts - potential breach', '{"badge_number":"UNKNOWN","attempts":5,"lockout":true}'],
      ['camera_motion', 'Camera', 'CAM-JPM-001', 'JPMorgan Chase Tower', 'Trading Floor', 'info', 'Normal trading floor activity detected', '{"confidence":0.88,"people_count":45}'],
      ['sensor_triggered', 'Sensor', 'VIB-REP-01', 'Republic Plaza', 'Stairwell B', 'warning', 'Vibration sensor triggered - possible structural concern', '{"sensor_subtype":"vibration","reading":7.2}'],
      ['access_granted', 'Reader', 'RDR-WIL-MAIN', 'Willis Tower', 'Main Lobby', 'info', 'Badge access granted - delivery personnel', '{"badge_number":"D-0077","holder":"FedEx Delivery"}'],
      ['health_warning', 'Camera', 'CAM-SF-002', 'Salesforce Tower', 'Executive Suite', 'warning', 'Camera temperature elevated - 78.5F', '{"temperature":78.5}'],
      ['alarm_cleared', 'Alarm Panel', 'ALM-REN-01', 'Renaissance Center', 'Floor 42', 'info', 'Fire alarm cleared - electrical issue resolved', '{"cleared_by":"Nicole Foster","response_time_min":15}'],
      ['camera_motion', 'Camera', 'CAM-BOA-001', 'Bank of America Plaza', 'Conference Center', 'info', 'After-hours motion detected - cleaning crew confirmed', '{"confidence":0.91}'],
      ['device_offline', 'Network Switch', 'NSW-WTC-02', 'One World Trade Center', 'Floor 55', 'critical', 'Network switch offline - affecting 12 cameras', '{"affected_devices":12}'],
      ['access_granted', 'Reader', 'RDR-JPM-01', 'JPMorgan Chase Tower', 'Trading Floor', 'info', 'Badge access granted - Maria Santos (Badge #3001)', '{"badge_number":"3001","holder":"Maria Santos"}'],
    ];
    for (const e of deviceEvents) {
      await client.query(`INSERT INTO device_events (event_type, device_type, device_name, property_name, zone_name, severity, description, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, e);
    }

    // Firmware Catalog
    await client.query(`
      CREATE TABLE firmware_catalog (
        id SERIAL PRIMARY KEY, manufacturer VARCHAR(255), model VARCHAR(255), latest_version VARCHAR(50),
        release_date DATE, severity VARCHAR(50), file_size_mb DECIMAL(8,2), release_notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const fwCatalog = [
      ['Axis','P3245-V','v10.12.114','2026-01-15','Critical',245.5,'Critical security patch fixing CVE-2025-4412.'],
      ['Axis','Q6135-LE','v10.12.114','2026-01-15','Critical',312.8,'Critical security patch. Enhanced PTZ motor control.'],
      ['Axis','M3106-L','v10.11.65','2025-11-20','Recommended',198.3,'Performance improvements for low-light conditions.'],
      ['HID','iCLASS SE','v3.2.1','2025-12-01','Recommended',45.2,'OSDP v2 compliance update.'],
      ['HID','iCLASS SE R40','v3.2.1','2025-12-01','Recommended',42.0,'OSDP v2 compliance update for R40 model.'],
      ['Lenel','LNL-4420','v5.1.0','2026-02-01','Critical',156.4,'Critical vulnerability fix for controller protocol.'],
      ['Lenel','LNL-3300','v5.1.0','2026-02-01','Critical',148.2,'Critical vulnerability fix.'],
      ['Honeywell','5800PIR-RES','v1.6.0','2025-12-15','Optional',12.0,'Improved motion sensitivity.'],
      ['Honeywell','VISTA-128BPT','v3.0.0','2026-01-20','Recommended',88.4,'Zone management improvements.'],
      ['Honeywell','5800COMBO','v1.5.0','2025-10-01','Optional',10.5,'Improved wireless sensor range.'],
      ['Cisco','Catalyst 9300','v12.4.0','2026-01-20','Critical',890.2,'Security advisory fix. Improved VLAN performance.'],
      ['Cisco','Catalyst 9200','v12.4.0','2026-01-20','Critical',745.6,'Security advisory fix.'],
      ['Bosch','FLEXIDOME 5100i','v4.2.0','2025-09-15','Optional',120.0,'Image quality improvements.'],
    ];
    for (const f of fwCatalog) {
      await client.query('INSERT INTO firmware_catalog (manufacturer,model,latest_version,release_date,severity,file_size_mb,release_notes) VALUES ($1,$2,$3,$4,$5,$6,$7)', f);
    }

    // Firmware Updates
    await client.query(`
      CREATE TABLE firmware_updates (
        id SERIAL PRIMARY KEY, device_id INT, device_name VARCHAR(255), property_name VARCHAR(255),
        current_version VARCHAR(50), target_version VARCHAR(50), status VARCHAR(50) DEFAULT 'Pending',
        progress INT DEFAULT 0, scheduled_at TIMESTAMP, started_at TIMESTAMP, completed_at TIMESTAMP,
        initiated_by VARCHAR(255), error_message TEXT, created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const fwUpdates = [
      [1,'CAM-WTC-001','One World Trade Center','v8.4.2','v10.12.114','Completed',100,'2026-02-10 02:00:00','2026-02-10 02:05:00','2026-02-10 02:18:00','admin@kastle.com',null],
      [2,'CAM-WTC-002','One World Trade Center','v8.4.2','v10.12.114','Completed',100,'2026-02-10 02:00:00','2026-02-10 02:20:00','2026-02-10 02:35:00','admin@kastle.com',null],
      [9,'RDR-WTC-001','One World Trade Center','v3.1.0','v3.2.1','Failed',67,null,'2026-02-12 03:00:00',null,'admin@kastle.com','Connection timeout during firmware transfer'],
      [14,'CTRL-WTC-001','One World Trade Center','v5.0.8','v5.1.0','Scheduled',0,'2026-02-28 02:00:00',null,null,'admin@kastle.com',null],
      [23,'NSW-WTC-001','One World Trade Center','v12.3.1','v12.4.0','Pending',0,null,null,null,'admin@kastle.com',null],
      [4,'CAM-WIL-001','Willis Tower','v8.3.0','v10.12.114','Completed',100,'2026-02-11 03:00:00','2026-02-11 03:05:00','2026-02-11 03:22:00','admin@kastle.com',null],
      [10,'RDR-WIL-001','Willis Tower','v3.1.0','v3.2.1','Completed',100,'2026-02-11 03:30:00','2026-02-11 03:32:00','2026-02-11 03:38:00','admin@kastle.com',null],
      [7,'CAM-JPM-001','JPMorgan Chase Tower','v8.4.2','v10.12.114','Downloading',34,null,'2026-02-25 02:00:00',null,'admin@kastle.com',null],
      [21,'ALM-WTC-001','One World Trade Center','v2.9.0','v3.0.0','Completed',100,'2026-02-09 04:00:00','2026-02-09 04:02:00','2026-02-09 04:15:00','admin@kastle.com',null],
      [15,'CTRL-SF-001','Salesforce Tower','v5.0.3','v5.1.0','Installing',78,null,'2026-02-25 02:30:00',null,'admin@kastle.com',null],
      [5,'CAM-SF-001','Salesforce Tower','v8.2.0','v8.4.2','Completed',100,'2026-02-05 02:00:00','2026-02-05 02:03:00','2026-02-05 02:19:00','admin@kastle.com',null],
      [6,'CAM-BOA-001','Bank of America Plaza','v4.0.1','v4.1.0','Completed',100,'2026-02-06 03:00:00','2026-02-06 03:04:00','2026-02-06 03:16:00','admin@kastle.com',null],
      [16,'CTRL-WIL-001','Willis Tower','v5.0.5','v5.0.8','Completed',100,'2026-02-07 02:00:00','2026-02-07 02:02:00','2026-02-07 02:20:00','admin@kastle.com',null],
      [24,'NSW-WIL-001','Willis Tower','v12.2.0','v12.3.1','Completed',100,'2026-02-08 03:00:00','2026-02-08 03:05:00','2026-02-08 03:45:00','admin@kastle.com',null],
      [18,'SNS-WTC-001','One World Trade Center','v1.4.0','v1.5.2','Completed',100,'2026-02-04 04:00:00','2026-02-04 04:01:00','2026-02-04 04:08:00','admin@kastle.com',null],
      [12,'RDR-BOA-001','Bank of America Plaza','v3.1.0','v3.2.1','Failed',45,'2026-02-13 02:00:00','2026-02-13 02:05:00',null,'admin@kastle.com','Device rebooted unexpectedly during install'],
      [20,'SNS-PRU-001','Prudential Tower','v1.4.0','v1.5.2','Completed',100,'2026-02-14 03:00:00','2026-02-14 03:01:00','2026-02-14 03:06:00','admin@kastle.com',null],
      [25,'NSW-SF-001','Salesforce Tower','v12.1.0','v12.2.0','Completed',100,'2026-02-03 02:00:00','2026-02-03 02:10:00','2026-02-03 02:55:00','admin@kastle.com',null],
      [22,'ALM-KEY-001','Key Tower','v2.7.0','v2.8.0','Completed',100,'2026-02-02 04:00:00','2026-02-02 04:03:00','2026-02-02 04:12:00','admin@kastle.com',null],
      [13,'RDR-KEY-001','Key Tower','v3.0.0','v3.0.5','Cancelled',0,'2026-02-15 02:00:00',null,null,'admin@kastle.com',null],
      [3,'CAM-WTC-003','One World Trade Center','v8.0.0','v8.2.1','Failed',22,'2026-02-09 02:00:00','2026-02-09 02:04:00',null,'admin@kastle.com','Device offline - unable to reach target'],
      [19,'SNS-REN-001','Renaissance Center','v1.3.0','v1.4.2','Completed',100,'2026-02-06 04:00:00','2026-02-06 04:01:00','2026-02-06 04:09:00','admin@kastle.com',null],
      [11,'RDR-SF-001','Salesforce Tower','v3.0.5','v3.2.1','Scheduled',0,'2026-03-01 02:00:00',null,null,'admin@kastle.com',null],
      [17,'CTRL-USB-001','US Bank Tower','v5.0.5','v5.0.8','Failed',88,null,'2026-02-16 02:00:00',null,'admin@kastle.com','Verification checksum mismatch after install'],
      [8,'CAM-USB-001','US Bank Tower','v8.0.0','v8.1.0','Cancelled',0,'2026-02-17 02:00:00',null,null,'admin@kastle.com',null],
    ];
    for (const u of fwUpdates) {
      await client.query('INSERT INTO firmware_updates (device_id,device_name,property_name,current_version,target_version,status,progress,scheduled_at,started_at,completed_at,initiated_by,error_message) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', u);
    }

    // Network Topology
    await client.query(`
      CREATE TABLE network_topology (
        id SERIAL PRIMARY KEY, source_device_id INT, source_device_name VARCHAR(255),
        target_device_id INT, target_device_name VARCHAR(255), connection_type VARCHAR(50),
        port_number VARCHAR(20), bandwidth_mbps INT, property_name VARCHAR(255),
        subnet VARCHAR(50), status VARCHAR(50) DEFAULT 'Active', created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const topoRows = [
      // One World Trade Center - 192.168.10.0/24
      [23,'NSW-WTC-001',1,'CAM-WTC-001','ethernet','Gi1/0/1',1000,'One World Trade Center','192.168.10.0/24','Active'],
      [23,'NSW-WTC-001',2,'CAM-WTC-002','ethernet','Gi1/0/2',1000,'One World Trade Center','192.168.10.0/24','Active'],
      [23,'NSW-WTC-001',3,'CAM-WTC-003','ethernet','Gi1/0/3',1000,'One World Trade Center','192.168.10.0/24','Down'],
      [23,'NSW-WTC-001',9,'RDR-WTC-001','ethernet','Gi1/0/4',100,'One World Trade Center','192.168.10.0/24','Active'],
      [23,'NSW-WTC-001',13,'RDR-KEY-001','ethernet','Gi1/0/5',100,'One World Trade Center','192.168.10.0/24','Active'],
      [23,'NSW-WTC-001',14,'CTRL-WTC-001','ethernet','Gi1/0/6',100,'One World Trade Center','192.168.10.0/24','Active'],
      [23,'NSW-WTC-001',18,'SNS-WTC-001','ethernet','Gi1/0/7',100,'One World Trade Center','192.168.10.0/24','Active'],
      [23,'NSW-WTC-001',21,'ALM-WTC-001','ethernet','Gi1/0/8',100,'One World Trade Center','192.168.10.0/24','Active'],
      // Willis Tower - 192.168.20.0/24
      [24,'NSW-WIL-001',4,'CAM-WIL-001','ethernet','Gi1/0/1',1000,'Willis Tower','192.168.20.0/24','Active'],
      [24,'NSW-WIL-001',10,'RDR-WIL-001','ethernet','Gi1/0/2',100,'Willis Tower','192.168.20.0/24','Active'],
      [24,'NSW-WIL-001',16,'CTRL-WIL-001','ethernet','Gi1/0/3',100,'Willis Tower','192.168.20.0/24','Active'],
      // Salesforce Tower - 192.168.30.0/24
      [25,'NSW-SF-001',5,'CAM-SF-001','ethernet','Gi1/0/1',1000,'Salesforce Tower','192.168.30.0/24','Active'],
      [25,'NSW-SF-001',11,'RDR-SF-001','ethernet','Gi1/0/2',100,'Salesforce Tower','192.168.30.0/24','Degraded'],
      [25,'NSW-SF-001',15,'CTRL-SF-001','ethernet','Gi1/0/3',100,'Salesforce Tower','192.168.30.0/24','Active'],
      // Bank of America - 192.168.40.0/24
      [null,'NSW-BOA-001',6,'CAM-BOA-001','ethernet','Gi1/0/1',1000,'Bank of America Plaza','192.168.40.0/24','Active'],
      [null,'NSW-BOA-001',12,'RDR-BOA-001','ethernet','Gi1/0/2',100,'Bank of America Plaza','192.168.40.0/24','Active'],
      [null,'NSW-BOA-001',19,'SNS-REN-001','ethernet','Gi1/0/3',100,'Bank of America Plaza','192.168.40.0/24','Active'],
      // JPMorgan - 192.168.50.0/24
      [null,'NSW-JPM-001',7,'CAM-JPM-001','ethernet','Gi1/0/1',1000,'JPMorgan Chase Tower','192.168.50.0/24','Active'],
      [null,'NSW-JPM-001',20,'SNS-PRU-001','ethernet','Gi1/0/2',100,'JPMorgan Chase Tower','192.168.50.0/24','Active'],
      // US Bank Tower - 192.168.60.0/24
      [null,'NSW-USB-001',8,'CAM-USB-001','ethernet','Gi1/0/1',1000,'US Bank Tower','192.168.60.0/24','Down'],
      [null,'NSW-USB-001',17,'CTRL-USB-001','ethernet','Gi1/0/2',100,'US Bank Tower','192.168.60.0/24','Degraded'],
      // Cross-site uplinks
      [23,'NSW-WTC-001',24,'NSW-WIL-001','fiber','Te1/0/1',40000,'Cross-Site','uplink','Active'],
      [23,'NSW-WTC-001',25,'NSW-SF-001','fiber','Te1/0/2',40000,'Cross-Site','uplink','Active'],
      [24,'NSW-WIL-001',25,'NSW-SF-001','fiber','Te1/0/1',40000,'Cross-Site','uplink','Active'],
    ];
    for (const t of topoRows) {
      await client.query('INSERT INTO network_topology (source_device_id,source_device_name,target_device_id,target_device_name,connection_type,port_number,bandwidth_mbps,property_name,subnet,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', t);
    }

    // Device Metrics (programmatic: 25 devices × 7 days × 6 samples/day = 1050 rows)
    await client.query(`
      CREATE TABLE device_metrics (
        id SERIAL PRIMARY KEY, device_id INT, device_name VARCHAR(255), device_type VARCHAR(100),
        property_name VARCHAR(255), cpu_usage DECIMAL(5,2), memory_usage DECIMAL(5,2),
        temperature DECIMAL(5,2), uptime_hours DECIMAL(10,2), bandwidth_mbps DECIMAL(10,2),
        error_count INT DEFAULT 0, recorded_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const devDefs = devices.map((d, i) => ({
      id: i + 1, name: d[0], type: d[1], property: d[7],
      baseCpu: parseFloat(d[15]) || 30, baseMem: parseFloat(d[16]) || 25, baseTemp: parseFloat(d[17]) || 35
    }));
    const metricsRows = [];
    const baseDate = new Date('2026-02-18T00:00:00Z');
    for (const dev of devDefs) {
      for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour += 2) {
          const dt = new Date(baseDate); dt.setDate(dt.getDate() + day); dt.setHours(hour);
          const biz = hour >= 8 && hour <= 18;
          const cpu = Math.min(99, Math.max(1, dev.baseCpu + (biz ? 15 : 0) + (Math.random() * 12 - 6) + (Math.random() < 0.08 ? 25 : 0)));
          const mem = Math.min(99, Math.max(5, dev.baseMem + (biz ? 8 : 0) + (Math.random() * 8 - 4)));
          const temp = Math.min(85, Math.max(20, dev.baseTemp + (biz ? 5 : 0) + (Math.random() * 6 - 3)));
          const uptime = 24 * day + hour + Math.random() * 2;
          const bw = dev.type === 'Camera' ? 50 + Math.random() * 80 : dev.type === 'Network Switch' ? 200 + Math.random() * 400 : 5 + Math.random() * 20;
          const errors = Math.random() < 0.15 ? Math.floor(Math.random() * 6) + 1 : 0;
          metricsRows.push([dev.id, dev.name, dev.type, dev.property, cpu.toFixed(2), mem.toFixed(2), temp.toFixed(2), uptime.toFixed(2), bw.toFixed(2), errors, dt.toISOString()]);
        }
      }
    }
    for (let i = 0; i < metricsRows.length; i += 50) {
      const batch = metricsRows.slice(i, i + 50);
      const vals = []; const params = [];
      batch.forEach((row, bi) => {
        const o = bi * 11;
        vals.push(`($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},$${o+7},$${o+8},$${o+9},$${o+10},$${o+11})`);
        params.push(...row);
      });
      await client.query(`INSERT INTO device_metrics (device_id,device_name,device_type,property_name,cpu_usage,memory_usage,temperature,uptime_hours,bandwidth_mbps,error_count,recorded_at) VALUES ${vals.join(',')}`, params);
    }
    await client.query('CREATE INDEX IF NOT EXISTS idx_device_metrics_device_time ON device_metrics (device_id, recorded_at)');

    // Device Health Scores (25 devices × 7 days = 175 rows)
    await client.query(`
      CREATE TABLE device_health_scores (
        id SERIAL PRIMARY KEY, device_id INT, device_name VARCHAR(255), device_type VARCHAR(100),
        property_name VARCHAR(255), health_score INT, availability_pct DECIMAL(5,2),
        avg_cpu DECIMAL(5,2), avg_memory DECIMAL(5,2), avg_temperature DECIMAL(5,2),
        alert_count INT DEFAULT 0, score_date DATE, created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const healthRows = [];
    for (const dev of devDefs) {
      for (let day = 0; day < 7; day++) {
        const dt = new Date(baseDate); dt.setDate(dt.getDate() + day);
        const dateStr = dt.toISOString().split('T')[0];
        const baseH = dev.type === 'Camera' ? 82 : dev.type === 'Network Switch' ? 76 : dev.type === 'Controller' ? 88 : 90;
        const dayDrift = day < 3 ? -3 : day > 5 ? 4 : 0;
        const health = Math.min(100, Math.max(40, baseH + dayDrift + Math.floor(Math.random() * 18 - 8)));
        const avail = Math.min(100, Math.max(88, 94 + Math.random() * 6));
        const alerts = Math.random() < 0.45 ? Math.floor(Math.random() * 6) + 1 : 0;
        healthRows.push([dev.id, dev.name, dev.type, dev.property, health, avail.toFixed(2), (dev.baseCpu + 8 + Math.random() * 8).toFixed(2), (dev.baseMem + 4 + Math.random() * 6).toFixed(2), (dev.baseTemp + 2 + Math.random() * 5).toFixed(2), alerts, dateStr]);
      }
    }
    for (let i = 0; i < healthRows.length; i += 25) {
      const batch = healthRows.slice(i, i + 25);
      const vals = []; const params = [];
      batch.forEach((row, bi) => {
        const o = bi * 11;
        vals.push(`($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},$${o+7},$${o+8},$${o+9},$${o+10},$${o+11})`);
        params.push(...row);
      });
      await client.query(`INSERT INTO device_health_scores (device_id,device_name,device_type,property_name,health_score,availability_pct,avg_cpu,avg_memory,avg_temperature,alert_count,score_date) VALUES ${vals.join(',')}`, params);
    }

    console.log(`Metrics: ${metricsRows.length} rows, Health scores: ${healthRows.length} rows`);
    console.log('✅ Database seeded successfully! All tables created with data.');
  } catch (err) {
    console.error('Seed error:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
