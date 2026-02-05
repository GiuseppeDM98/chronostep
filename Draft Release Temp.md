## ✨ New Features
- Added an Insights drilldown so you can click a priority or tag to see related tasks, steps, and work logs.
- Added a quick toggle to clear the active Insights focus by clicking the same priority or tag.

## 🔒 Security
- Fixed 3 high severity DoS vulnerabilities by upgrading Next.js from 14.1.0 to 16.1.6
- Upgraded firebase-admin from 12.5.0 to 13.6.1
- Added npm override for fast-xml-parser@5.3.4 to address transitive dependency vulnerability

## 🏗️ Technical
- Migrated dynamic route parameter handling to Next.js 16 Promise-based API
- Updated task detail page to use React's `use()` hook for unwrapping route params
- Auto-configured TypeScript settings for Next.js 16 compatibility
