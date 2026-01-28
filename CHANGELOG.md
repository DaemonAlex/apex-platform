# Changelog

All notable changes to the APEX Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [7.0.0] - 2026-01-27

### Major Refactoring - ES Module Architecture

**Complete modularization of the monolithic codebase using Vite and ES Modules.**

#### Added
- **Vite Build System**
  - Hot Module Replacement (HMR) for development
  - ES Module support with tree-shaking
  - API proxy configuration for development
  - Production build optimization

- **New Modular Architecture**
  - `src/js/api/client.js` - Centralized API client with JWT management (281 lines)
  - `src/js/core/config.js` - Application configuration and feature flags
  - `src/js/core/state.js` - Reactive state management store
  - `src/js/core/state-bridge.js` - Legacy-to-modern state synchronization (228 lines)
  - `src/js/ui/auth.js` - Authentication UI with password strength validation (354 lines)
  - `src/js/ui/notifications.js` - Toast notification system (308 lines)
  - `src/js/ui/modal.js` - Modal/dialog component system (389 lines)
  - `src/js/utils/formatters.js` - General utility functions (209 lines)
  - `src/js/utils/project-helpers.js` - Project-specific helpers (408 lines)

- **CSS Extraction**
  - 4,471 lines of CSS extracted to `src/css/main.css`
  - Maintains backward compatibility with legacy code

- **Developer Experience**
  - `npm run dev` - Start Vite development server
  - `npm run build` - Production build
  - `npm run preview` - Preview production build
  - `APEX_migrationStatus()` - Console command for migration status

#### Changed
- **API Client**
  - Centralized fetch wrapper with automatic JWT injection
  - Request timeout handling (30s default, 2min for uploads)
  - Domain-specific endpoints (authApi, projectsApi, usersApi, adminApi, attachmentsApi)
  - Automatic token refresh and session management

- **State Management**
  - Bridge pattern syncs legacy `window.AppState` with new modular state
  - Reactive subscriptions for state changes
  - Feature flag controlled rollout (`FEATURES.USE_NEW_STATE`)

- **UI Components**
  - New notification system with toast animations
  - Enhanced modal system with stacking support
  - Password strength indicator with real-time feedback
  - Lockout protection for failed login attempts

#### Fixed
- **Connection Pool Bug** - Fixed `pool.close()` issue in all route files that was closing database connections prematurely
  - Affected files: auth.js, projects.js, users.js, admin.js, audit.js, room-status.js
  - Connections now properly reused via pooling

#### Technical
- **Total Lines Extracted:** 6,989 lines from monolithic index.html
- **Migration Pattern:** "Strangler Fig" - gradual extraction while maintaining compatibility
- **Legacy Bridge:** All new modules exposed to `window.*` for backward compatibility

---

## [1.0.0] - 2025-09-07

### Added
- **Complete Field Operations Management**
  - Advanced scheduling system with calendar integration
  - Reschedule management with comprehensive reason tracking
  - Work order management (Installation, Commissioning, Break/Fix, Maintenance)
  - Resource planning and technician coordination
  - Mobile-friendly interface for field teams

- **Productivity Monitoring System**
  - Real-time activity tracking and focus monitoring
  - Personal insights dashboard with productivity analytics
  - Early warning systems for project risks and burnout detection
  - Team performance tracking and collaboration metrics

- **Enhanced Executive Reporting**
  - Advanced filtering system with executive-focused terminology
  - Pipeline visibility and strategic oversight metrics
  - Improved visual indicators and status reporting
  - Custom report generation with multiple export formats

- **Comprehensive Security Implementation**
  - XSS protection with HTML escaping for all user inputs
  - Comprehensive audit logging for all user activities
  - Role-based access control with granular permissions
  - Secure authentication with JWT token support

- **Data Management Enhancements**
  - Browser localStorage as primary data storage
  - Optional backend database integration with MariaDB
  - Automatic data validation and migration system
  - Export/import functionality with JSON, Excel, PDF, and CSV formats

### Security
- **Critical XSS Vulnerability Fixed**: All user-provided data now properly escaped
- **Audit Logging**: Complete activity trail for compliance and security monitoring
- **Input Validation**: Client and server-side validation for all data inputs
- **Session Management**: Secure authentication and session handling

### Technical
- **Single-Page Application**: Complete platform in one HTML file
- **Offline Capability**: Full functionality without internet connection
- **Mobile Responsive**: Optimized for all device sizes
- **CDN Dependencies**: Fast loading from global CDNs
- **Browser Compatibility**: Works on all modern browsers

### Infrastructure
- **Nginx Hosting**: Production-ready web server configuration
- **HTTPS Support**: SSL/TLS encryption with security headers
- **Backend Integration**: Optional Node.js API for enhanced features
- **Database Support**: MariaDB/MySQL integration when backend enabled

## [0.9.0] - Previous Version

### Features (Legacy)
- Basic project management functionality
- Task creation and assignment
- Simple reporting capabilities
- Local storage data persistence

---

## Release Notes

### Breaking Changes in 1.0.0
- Updated data structure for enhanced field operations
- Security improvements may require data validation
- Configuration changes for backend integration

### Migration Guide
- All existing localStorage data will be automatically migrated
- Review security settings for role-based access
- Update any custom integrations to use new API endpoints

### Known Issues
- None currently identified

### Supported Browsers
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

**For detailed technical documentation, see the [documentation folder](docs/).**