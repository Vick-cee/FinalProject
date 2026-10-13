import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Vehicle from '../models/Vehicle.js';
import VehiclePass from '../models/VehiclePass.js';
import Gate from '../models/Gate.js';
import GateOfficer from '../models/GateOfficer.js';
import ScanLog from '../models/ScanLog.js';
import AuditLog from '../models/AuditLog.js';

export const seedDatabase = async (force = true) => {
  try {
    const adminExists = await User.findOne({ role: 'ADMIN' });
    if (adminExists && !force) {
      console.log('✅ Admin account and gates already initialized.');
      return;
    }

    console.log('🌱 Initializing clean Kaduna State University (KASU) Database...');

    // Clear previous demo data completely
    await Promise.all([
      User.deleteMany({}),
      Vehicle.deleteMany({}),
      VehiclePass.deleteMany({}),
      Gate.deleteMany({}),
      GateOfficer.deleteMany({}),
      ScanLog.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);

    const salt = await bcrypt.genSalt(10);
    const adminPasswordHash = await bcrypt.hash('Admin@KASU2026!', salt);

    // 1. Create Kaduna State University Chief Security Officer (Super Admin)
    const adminUser = await User.create({
      fullName: 'KASU Chief Security Officer',
      email: 'admin@kasu.edu.ng',
      phone: '+234 803 000 0001',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      idNumber: 'KASU-CSO-001',
      department: 'Directorate of Campus Security & Safety',
      status: 'ACTIVE',
    });

    // Also support admin@university.edu alias with the same credentials for convenience
    await User.create({
      fullName: 'KASU Security Admin Director',
      email: 'admin@university.edu',
      phone: '+234 803 000 0002',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      idNumber: 'KASU-DIR-002',
      department: 'Directorate of Campus Security & Safety',
      status: 'ACTIVE',
    });

    // 2. Create Kaduna State University Two Designated Gates
    const gateEntry = await Gate.create({
      name: 'KASU Main Entry Gate',
      code: 'GATE-ENTRY',
      location: 'Tafawa Balewa Way / Main Campus Inbound Boulevard',
      status: 'ACTIVE',
      description: 'Designated primary university entry checkpoint for inbound vehicle clearance (CHECK IN).',
      operatingHours: '24/7',
    });

    const gateExit = await Gate.create({
      name: 'KASU Main Exit Gate',
      code: 'GATE-EXIT',
      location: 'Tafawa Balewa Way / Main Campus Outbound Boulevard',
      status: 'ACTIVE',
      description: 'Designated primary university exit checkpoint for outbound vehicle clearance (CHECK OUT).',
      operatingHours: '24/7',
    });

    // 3. Initialize Audit Log
    await AuditLog.create({
      actorId: adminUser._id,
      actorName: adminUser.fullName,
      actorRole: adminUser.role,
      action: 'SYSTEM_INITIALIZED',
      targetType: 'SYSTEM',
      targetId: 'INIT',
      details: {
        message: 'KASU Vehicle Gate Pass system initialized. All demo accounts cleared. Two gates configured: GATE-ENTRY and GATE-EXIT.',
      },
      timestamp: new Date(),
    });

    console.log('===============================================================');
    console.log('🏛️  KADUNA STATE UNIVERSITY (KASU) INITIALIZED SUCCESSFULLY');
    console.log('👑  ADMIN LOGIN DETAILS:');
    console.log('    Email:    admin@kasu.edu.ng  (or admin@university.edu)');
    console.log('    Password: Admin@KASU2026!');
    console.log('🚪  GATES CONFIGURED:');
    console.log(`    - ${gateEntry.name} (${gateEntry.code})`);
    console.log(`    - ${gateExit.name} (${gateExit.code})`);
    console.log('👥  OFFICERS: 0 (Admin can register and assign officers directly)');
    console.log('===============================================================');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
  }
};
