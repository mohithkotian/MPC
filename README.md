# Pulse MPC - Secure Audio Delivery Architecture

Pulse MPC is a browser-based Music Production Center built with React, TypeScript, Web Audio API, and a Node.js/Express secure audio streaming backend.

This document details the **Threat Model**, **Security Architecture**, and **Technical Boundaries** governing audio sample delivery in Pulse MPC.

---

## 🔒 Threat Model & Security Boundaries

### What This Security System Prevents:
1. **Casual DevTools / Inspect Extraction**: Audio samples are never served as static `.mp3`, `.wav`, or `.ogg` file URLs. Inspecting DOM element sources or network requests will not reveal downloadable raw audio files.
2. **Direct Link Sharing & Hotlinking**: Requests originating from unapproved domains or lacking a valid session cookie are rejected with HTTP 403 / 401.
3. **Automated Scraping**:
   - Audio payloads require an active authenticated session.
   - Per-IP rate limits restrict automated bulk sample harvesting.
4. **Static File Exposure**: Sample files are stored on disk outside the web root (`server/storage/samples/*.mp3`) using opaque UUID filenames. Real disk paths and original filenames are never exposed.

---

### ⚠️ What This System Fundamentally Cannot Prevent (Honest Security Boundaries):

> [!IMPORTANT]
> **Browser Audio Decoding Boundary**:
> Because the browser's Web Audio API (`AudioContext.decodeAudioData()`) **must** decode audio into raw uncompressed PCM memory buffers to play audio through speaker output, a determined user with low-level memory inspection tools, sound-card recording software, or custom browser builds can capture PCM audio output during active playback.
> 
> **Why No Client-Side Tricks?**:
> - We **do not** implement DevTools detection/blocking, right-click disabling, copy-paste prevention, or client-side code obfuscation tricks.
> - These client-side methods provide **zero real security**, degrade user experience, and create a false sense of protection. Real security relies exclusively on server-side authorization, strict HTTP streaming, anti-hotlinking, and rate-limiting.

---

## 🛠️ Security Architecture Overview

```
 [ Client Browser ]                   [ Secure Node.js Backend ]               [ Storage (UUID Named) ]
       |                                          |                                     |
       |--- 1. POST /api/auth/login ------------->| (Authenticate)                      |
       |<-- 2. Set-Cookie: pulse_session ---------|                                     |
       |                                          |                                     |
       |--- 3. GET /api/audio/stream/:sampleId -->| (Check Cookie, Origin, Rate Limit)  |
       |       (with credentials: include)        |                                     |
       |                                          |--- 4. Map UUID via manifest.json -->|
       |                                          |<-- 5. Read physical .mp3 file ------|
       |                                          |                                     |
       |<-- 6. Returns raw audio HTTP stream -----|                                     |
       |                                          |                                     |
  [ Web Audio API ]                               |                                     |
       | fetch().arrayBuffer()                    |                                     |
       | audioContext.decodeAudioData()           |                                     |
       v                                          |                                     |
  [ Playback Output ]                             |                                     |
```

---

## 🔐 Layered Security Control Details

| Layer | Mechanism | Implementation Detail |
|---|---|---|
| **Storage at Rest** | UUID Obfuscation | Samples stored outside web root (`server/storage/samples/*.mp3`) using opaque UUID filenames. |
| **Transport** | Standard HTTPS | Streams audio securely over TLS. |
| **Client Decryption** | Web Audio API | Fetched directly to `ArrayBuffer` and passed to `AudioContext.decodeAudioData()`. Never saved to disk or Blob URLs. |
| **Tokenization** | Session Cookie | Requests require a valid `HttpOnly`, `Secure`, `SameSite=Strict` cookie (`pulse_session`). |
| **Anti-Hotlinking** | Origin & Referer Enforcement | `antiHotlink` middleware rejects requests from unapproved domains. |
| **Rate Limiting** | IP Rate Limiter | `express-rate-limit` enforces max 120 sample requests/min. |
| **HTTP Caching** | Strict `Cache-Control: no-store` | `no-store, no-cache, must-revalidate, private` on stream endpoints to prevent browser caching. |

---

## 🚀 Running the Server & Application

### 1. Start Backend Server & Frontend Dev Server
Run both Express secure audio server (Port 3001) and Vite dev server (Port 3000):
```bash
npm run dev:all
```

Or run separately:
```bash
npm run server   # Starts Express Audio Server on http://localhost:3001
npm run dev      # Starts Vite Frontend on http://localhost:3000
```
