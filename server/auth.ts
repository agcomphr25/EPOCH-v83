// Stub AuthService for development - authentication is bypassed in development mode
export class AuthService {
  static async getUserById(userId: number) {
    // Stub implementation
    console.warn('AuthService.getUserById called - stub implementation');
    return null;
  }

  static async getUserBySession(sessionToken: string) {
    // Stub implementation
    console.warn('AuthService.getUserBySession called - stub implementation');
    return null;
  }

  static async verifyJWT(token: string) {
    // Stub implementation
    console.warn('AuthService.verifyJWT called - stub implementation');
    return null;
  }

  static async validatePortalToken(token: string) {
    // Stub implementation
    console.warn('AuthService.validatePortalToken called - stub implementation');
    return { valid: false, employeeId: null };
  }

  static async cleanupExpiredSessions() {
    // Stub implementation - no cleanup needed in development
    return;
  }
}
