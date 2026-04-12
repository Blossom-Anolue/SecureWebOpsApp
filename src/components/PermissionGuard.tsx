import React from 'react';

// Define the possible permission levels as a union type for better type safety
export type AppPermission = 'VIEW' | 'DOWNLOAD' | 'ADMIN';

// Define numeric weights for permissions, mapping the AppPermission type to a number
const PERMISSION_LEVELS: Record<AppPermission, number> = {
  'VIEW': 1,
  'DOWNLOAD': 2,
  'ADMIN': 3
};

interface PermissionGuardProps {
  /** The permission level the current user has. Can be undefined or an invalid string. */
  userLevel?: AppPermission | string;
  /** The minimum permission level required to render the children. */
  requiredLevel: AppPermission;
  /** The content to render if the user has sufficient permissions. */
  children: React.ReactNode;
}

export const PermissionGuard = ({ userLevel, requiredLevel, children }: PermissionGuardProps) => {
  // Safely get the numeric value for the user's permission level. Defaults to 0 if the level is falsy or not a valid key.
  const currentUserPermissionValue = userLevel ? (PERMISSION_LEVELS[userLevel as AppPermission] || 0) : 0;
  const requiredPermissionValue = PERMISSION_LEVELS[requiredLevel];

  if (currentUserPermissionValue < requiredPermissionValue) return null;

  return <>{children}</>;
};