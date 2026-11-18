# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cleaned-up version of second screen app with auto-updates. Refactored Electron application for customer display with GitHub release integration.

**Platform:** Electron (Windows, macOS, Linux)

---

## 🤖 Agent Ekibi

Bu proje için özel agent ekibi tanımlanmıştır:

### 🎯 Product Manager
- **Agent**: `@product-manager`
- **Rol**: Second screen feature planlama, customer experience
- **Odak**: Display content strategy, marketing integration, auto-update policies

### 💻 Frontend Developer
- **Agent**: `@frontend-developer`
- **Rol**: Electron/Express geliştirme
- **Odak**: Electron IPC, renderer process, Express routing
- **Teknolojiler**: Electron 29, Express.js, electron-updater

### ⚙️ Backend Developer
- **Agent**: `@backend-developer`
- **Rol**: Content server, real-time data sync
- **Odak**: Express API, WebSocket/Socket.io, data streaming

### 🔒 Security Expert
- **Agent**: `@security-expert`
- **Rol**: Electron security, kiosk mode protection
- **Odak**: Content Security Policy, Electron security best practices, XSS prevention
- **Özel Konular**: Kiosk lockdown, auto-update security, remote content validation

### 🎨 UI Designer
- **Agent**: `@ui-designer`
- **Rol**: Customer display interface design
- **Odak**: Large text, high visibility, animation, idle screen content
- **Özel Konular**: Distance readability, marketing content layout, attention grabbing

## Agent Kullanımı

### Yeni Display Mode
```bash
# 1. Product Manager - Feature scope
@product-manager "QR kod feedback sistemi özelliğini planla"

# 2. Frontend Developer - Electron implementation
@frontend-developer "QR kod display componentini oluştur"

# 3. Backend Developer - Content API
@backend-developer "QR kod generation ve tracking API'sini tasarla"

# 4. Security Expert - Security review
@security-expert "QR kod content injection risklerini kontrol et"

# 5. UI Designer - Display design
@ui-designer "QR kod placement ve timing'ini optimize et"
```

### Auto-Update Deployment
```bash
# Ekip ile release hazırlığı
/teams start
"GitHub release için hazırlık: build, test, security check, changelog"
```

### Performance Tuning
```bash
@frontend-developer "Electron memory leak ve CPU kullanımını incele"
```

---

## Technology Stack

- **Framework:** Electron 29
- **Backend:** Express.js
- **Updates:** electron-updater (GitHub)
- **Language:** JavaScript/Node.js

## Development Commands

```bash
# Install dependencies
npm install

# Run in development
npm start

# Build installers
npm run dist
```

## Architecture

Refactored Electron app with:
- Auto-update capability from GitHub
- Express server for content
- Customer display interface
- One-click installer

## Key Features

- Second screen/customer display
- Auto-updates from GitHub releases
- One-click installer
- Desktop shortcuts
- Cleaner codebase vs. original
- Express-based content server

## Build Output

- Windows: NSIS installer with auto-update
- Desktop shortcuts created
- Start menu integration

## Important Notes

- Improved version of easyrest-second-screen
- Auto-update support added
- Cleaner code architecture
- GitHub releases for updates
- Simplified deployment
- Part of EasyRest ecosystem
