import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ROLE_PERMISSIONS,
  resolveMemberPermissions,
  checkUserPermission,
  ROLE_DEFINITIONS,
  PERMISSION_DEFINITIONS,
  saveLocalMemberPermissions,
  getLocalMemberPermissions,
} from '../src/lib/permissions';
import type { MemberPermissions } from '../src/types/database';

// Mock localStorage for Node test environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, val: string) => {
      store.set(key, val);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (idx: number) => Array.from(store.keys())[idx] || null,
    length: 0,
  } as unknown as Storage;
}

// ============================================================
// 1. ROLE DEFINITIONS & CONSTANTS TESTS
// ============================================================
test('Permissions: Role definitions and default permissions exist for owner, admin, and member', () => {
  assert.equal(ROLE_DEFINITIONS.length, 3);
  assert.equal(PERMISSION_DEFINITIONS.length, 5);

  // Owner default
  assert.equal(DEFAULT_ROLE_PERMISSIONS.owner.can_view_items, true);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.owner.can_add_items, true);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.owner.can_edit_items, true);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.owner.can_delete_items, true);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.owner.can_manage_members, true);

  // Admin default (can manage inventory, cannot manage members by default)
  assert.equal(DEFAULT_ROLE_PERMISSIONS.admin.can_view_items, true);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.admin.can_add_items, true);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.admin.can_edit_items, true);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.admin.can_delete_items, true);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.admin.can_manage_members, false);

  // Member default (view only)
  assert.equal(DEFAULT_ROLE_PERMISSIONS.member.can_view_items, true);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.member.can_add_items, false);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.member.can_edit_items, false);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.member.can_delete_items, false);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.member.can_manage_members, false);
});

// ============================================================
// 2. OWNER PERMISSION INVARIANT TESTS
// ============================================================
test('Permissions: Owner must always retain full rights regardless of raw overrides', () => {
  // Even if false permissions are passed, owner MUST always have true
  const resolved = resolveMemberPermissions(
    'owner',
    {
      can_view_items: false,
      can_add_items: false,
      can_edit_items: false,
      can_delete_items: false,
      can_manage_members: false,
    },
    'hh-1',
    'user-owner-1'
  );

  assert.equal(resolved.role, 'owner');
  assert.equal(resolved.permissions.can_view_items, true);
  assert.equal(resolved.permissions.can_add_items, true);
  assert.equal(resolved.permissions.can_edit_items, true);
  assert.equal(resolved.permissions.can_delete_items, true);
  assert.equal(resolved.permissions.can_manage_members, true);
});

// ============================================================
// 3. ADMIN PERMISSION RESOLUTION TESTS
// ============================================================
test('Permissions: Admin gets full fridge management permissions', () => {
  const resolved = resolveMemberPermissions('admin', undefined, 'hh-1', 'user-admin-1');

  assert.equal(resolved.role, 'admin');
  assert.equal(resolved.permissions.can_view_items, true);
  assert.equal(resolved.permissions.can_add_items, true);
  assert.equal(resolved.permissions.can_edit_items, true);
  assert.equal(resolved.permissions.can_delete_items, true);
  assert.equal(resolved.permissions.can_manage_members, false);
});

// ============================================================
// 4. MEMBER PERMISSION RESOLUTION & GRANULAR TOGGLES
// ============================================================
test('Permissions: Member defaults to view-only when no permissions are specified', () => {
  const resolved = resolveMemberPermissions('member', null, 'hh-1', 'user-mem-1');

  assert.equal(resolved.role, 'member');
  assert.equal(resolved.permissions.can_view_items, true);
  assert.equal(resolved.permissions.can_add_items, false);
  assert.equal(resolved.permissions.can_edit_items, false);
  assert.equal(resolved.permissions.can_delete_items, false);
  assert.equal(resolved.permissions.can_manage_members, false);
});

test('Permissions: Member granted custom add and edit permissions', () => {
  const customPerms: Partial<MemberPermissions> = {
    can_view_items: true,
    can_add_items: true,
    can_edit_items: true,
    can_delete_items: false,
    can_manage_members: false,
  };

  const resolved = resolveMemberPermissions('member', customPerms, 'hh-1', 'user-mem-2');

  assert.equal(resolved.role, 'member');
  assert.equal(resolved.permissions.can_view_items, true);
  assert.equal(resolved.permissions.can_add_items, true);
  assert.equal(resolved.permissions.can_edit_items, true);
  assert.equal(resolved.permissions.can_delete_items, false);
  assert.equal(resolved.permissions.can_manage_members, false);
});

test('Permissions: Member granted add-only (e.g., receipt scan helper) without delete rights', () => {
  const customPerms: Partial<MemberPermissions> = {
    can_add_items: true,
    can_delete_items: false,
  };

  const resolved = resolveMemberPermissions('member', customPerms, 'hh-1', 'user-mem-3');

  assert.equal(resolved.role, 'member');
  assert.equal(resolved.permissions.can_view_items, true);
  assert.equal(resolved.permissions.can_add_items, true);
  assert.equal(resolved.permissions.can_edit_items, false);
  assert.equal(resolved.permissions.can_delete_items, false);
});

// ============================================================
// 5. LOCAL STORAGE CACHING & SYNC TESTS
// ============================================================
test('Permissions: LocalStorage cache saves and restores member permissions', () => {
  const hhId = 'hh-test-sync';
  const uId = 'u-test-sync';
  const customPerms: MemberPermissions = {
    can_view_items: true,
    can_add_items: true,
    can_edit_items: false,
    can_delete_items: false,
    can_manage_members: false,
  };

  saveLocalMemberPermissions(hhId, uId, 'member', customPerms);

  const cached = getLocalMemberPermissions(hhId, uId);
  assert.notEqual(cached, null);
  assert.equal(cached?.role, 'member');
  assert.equal(cached?.permissions.can_add_items, true);
  assert.equal(cached?.permissions.can_delete_items, false);

  // resolveMemberPermissions should pick up the cached permissions if raw is null
  const restored = resolveMemberPermissions('member', null, hhId, uId);
  assert.equal(restored.permissions.can_add_items, true);
  assert.equal(restored.permissions.can_delete_items, false);
});

// ============================================================
// 6. CHECK USER PERMISSION HELPER
// ============================================================
test('Permissions: checkUserPermission helper works accurately', () => {
  const perms: MemberPermissions = {
    can_view_items: true,
    can_add_items: true,
    can_edit_items: false,
    can_delete_items: false,
    can_manage_members: false,
  };

  assert.equal(checkUserPermission('view', 'member', perms), true);
  assert.equal(checkUserPermission('add', 'member', perms), true);
  assert.equal(checkUserPermission('edit', 'member', perms), false);
  assert.equal(checkUserPermission('delete', 'member', perms), false);
  assert.equal(checkUserPermission('view', 'member', undefined), true); // view is safe fallback
  assert.equal(checkUserPermission('delete', 'member', undefined), false);
  assert.equal(checkUserPermission('delete', 'owner', undefined), true); // owner has full rights
  assert.equal(checkUserPermission('edit', 'admin', undefined), true); // admin can edit
  assert.equal(checkUserPermission('manage_members', 'admin', undefined), false); // admin cannot manage members by default
});
