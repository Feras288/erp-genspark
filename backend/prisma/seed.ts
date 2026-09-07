// =====================================================
// ERP System — initial seed (Phase 0)
// Creates: 1 Company, 1 System / Company Admin user,
//          base roles, and core permissions catalog.
// Marked for DEVELOPMENT ONLY.
// =====================================================
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const PERMISSIONS = [
  // Phase 1 — auth & rbac
  { key: 'auth.me', module: 'auth', action: 'read', description: 'Read own profile' },
  { key: 'audit.read', module: 'audit', action: 'read', description: 'View audit logs' },
  { key: 'permissions.read', module: 'rbac', action: 'read', description: 'List permissions catalog' },
  // users & roles
  { key: 'users.read', module: 'users', action: 'read', description: 'List users' },
  { key: 'users.create', module: 'users', action: 'create', description: 'Create a user' },
  { key: 'users.update', module: 'users', action: 'update', description: 'Edit a user' },
  { key: 'users.delete', module: 'users', action: 'delete', description: 'Soft-delete a user' },
  { key: 'users.roles.update', module: 'users', action: 'roles.update', description: 'Assign roles to a user' },
  { key: 'roles.read', module: 'rbac', action: 'read', description: 'List roles' },
  { key: 'roles.create', module: 'rbac', action: 'create', description: 'Create a role' },
  { key: 'roles.update', module: 'rbac', action: 'update', description: 'Edit a role' },
  { key: 'roles.delete', module: 'rbac', action: 'delete', description: 'Delete a role' },
  { key: 'roles.permissions.update', module: 'rbac', action: 'permissions.update', description: 'Assign permissions to a role' },
  // settings
  { key: 'settings.read', module: 'settings', action: 'read', description: 'View company settings' },
  { key: 'settings.update', module: 'settings', action: 'update', description: 'Edit company settings' },
  // partners
  { key: 'partners.read', module: 'partners', action: 'read', description: 'List partners / customers / suppliers' },
  { key: 'partners.create', module: 'partners', action: 'create', description: 'Create partner' },
  { key: 'partners.update', module: 'partners', action: 'update', description: 'Edit partner' },
  { key: 'partners.delete', module: 'partners', action: 'delete', description: 'Soft-delete partner' },
  // products
  { key: 'products.read', module: 'products', action: 'read', description: 'List products/services' },
  { key: 'products.create', module: 'products', action: 'create', description: 'Create product' },
  { key: 'products.update', module: 'products', action: 'update', description: 'Edit product' },
  { key: 'products.delete', module: 'products', action: 'delete', description: 'Soft-delete product' },
  // inventory
  { key: 'inventory.read', module: 'inventory', action: 'read', description: 'View stock balances and movements' },
  { key: 'inventory.adjust', module: 'inventory', action: 'adjust', description: 'Adjust stock' },
  { key: 'inventory.transfer', module: 'inventory', action: 'transfer', description: 'Transfer stock between warehouses' },
  // warehouses (Phase 3)
  { key: 'warehouses.read', module: 'warehouses', action: 'read', description: 'List warehouses' },
  { key: 'warehouses.create', module: 'warehouses', action: 'create', description: 'Create warehouse' },
  { key: 'warehouses.update', module: 'warehouses', action: 'update', description: 'Edit warehouse' },
  { key: 'warehouses.delete', module: 'warehouses', action: 'delete', description: 'Soft-delete warehouse' },
  // stock movements (Phase 3)
  { key: 'stockMovements.read', module: 'inventory', action: 'movements.read', description: 'View stock movement history' },
  // sales (Phase 4A seed-only; modules land in a later phase)
  { key: 'sales.read', module: 'sales', action: 'read', description: 'List / get sales invoices' },
  { key: 'sales.create', module: 'sales', action: 'create', description: 'Create draft sales invoice' },
  { key: 'sales.update', module: 'sales', action: 'update', description: 'Edit draft sales invoice' },
  { key: 'sales.delete', module: 'sales', action: 'delete', description: 'Delete draft sales invoice' },
  { key: 'sales.issue', module: 'sales', action: 'issue', description: 'Issue invoice and deduct stock' },
  { key: 'sales.cancel', module: 'sales', action: 'cancel', description: 'Cancel eligible sales invoice' },
  // pos (Phase 4A seed-only; modules land in a later phase)
  { key: 'pos.read', module: 'pos', action: 'read', description: 'Read POS sales' },
  { key: 'pos.create', module: 'pos', action: 'create', description: 'Create POS quick-sale (issue immediately)' },
  // sales
  { key: 'sales.invoice.read', module: 'sales', action: 'read', description: 'List sales invoices' },
  { key: 'sales.invoice.create', module: 'sales', action: 'create', description: 'Create sales invoice' },
  { key: 'sales.invoice.issue', module: 'sales', action: 'issue', description: 'Issue (post) sales invoice' },
  { key: 'sales.invoice.cancel', module: 'sales', action: 'cancel', description: 'Cancel sales invoice' },
  { key: 'pos.use', module: 'pos', action: 'use', description: 'Use the POS terminal' },
  // purchases
  { key: 'purchases.invoice.read', module: 'purchases', action: 'read', description: 'List purchase invoices' },
  { key: 'purchases.invoice.create', module: 'purchases', action: 'create', description: 'Create purchase invoice' },
  { key: 'purchases.invoice.approve', module: 'purchases', action: 'approve', description: 'Approve/post purchase invoice' },
  // accounting
  { key: 'accounting.accounts.read', module: 'accounting', action: 'read', description: 'View chart of accounts' },
  { key: 'accounting.accounts.manage', module: 'accounting', action: 'manage', description: 'Manage chart of accounts' },
  { key: 'accounting.journal.create', module: 'accounting', action: 'create', description: 'Create journal entry' },
  { key: 'accounting.journal.read', module: 'accounting', action: 'read', description: 'View journal entries' },
  // reports
  { key: 'reports.read', module: 'reports', action: 'read', description: 'View reports' },
];

async function main() {
  console.log('🌱 ERP seed — start');

  // Permissions catalog (idempotent)
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { module: p.module, action: p.action, description: p.description },
      create: p,
    });
  }
  console.log(`  ✓ ${PERMISSIONS.length} permissions upserted`);

  // Demo company
  const company = await prisma.company.upsert({
    where: { id: 'seed-company-default' },
    update: {},
    create: {
      id: 'seed-company-default',
      name: 'شركة تجريبية للتطوير',
      vatNumber: '300000000000003',
      crNumber: '1010101010',
      currency: 'SAR',
      vatRate: 15.0,
      address: 'الرياض، المملكة العربية السعودية',
      phone: '+966500000000',
      email: 'demo@example.sa',
    },
  });
  console.log(`  ✓ Company upserted: ${company.name}`);

  // System role: Company Admin (gets ALL permissions)
  const allPermissions = await prisma.permission.findMany();
  const adminRole = await prisma.role.upsert({
    where: { companyId_key: { companyId: company.id, key: 'company_admin' } },
    update: { isSystem: true, description: 'Full access within a single company' },
    create: {
      companyId: company.id,
      name: 'Company Admin',
      key: 'company_admin',
      description: 'Full access within a single company',
      isSystem: true,
    },
  });
  for (const p of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: p.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: p.id },
    });
  }
  console.log(`  ✓ Role upserted: ${adminRole.name} (${allPermissions.length} perms)`);

  // Demo admin user (DEV ONLY)
  const passwordHash = await bcrypt.hash('Admin@12345', 12);
  const adminUser = await prisma.user.upsert({
    where: { companyId_email: { companyId: company.id, email: 'admin@example.sa' } },
    update: {},
    create: {
      companyId: company.id,
      email: 'admin@example.sa',
      passwordHash,
      fullName: 'مدير النظام',
      isActive: true,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: adminRole.id },
  });
  console.log(`  ✓ Admin user upserted: ${adminUser.email} (password in dev only)`);

  console.log('✅ ERP seed — done');
}

main()
  .catch((e) => {
    console.error('seed failed', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
