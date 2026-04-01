## 1. Purpose

This document defines the exact functional and non-functional behavior of the LocalTube Saver application.  
Any behavior not explicitly defined here is considered out of scope.

This version of the contract defines a DESKTOP-ONLY application.  
No native iPhone application is included.

---

## 2. Supported Input

### 2.1 URL Format
The application MUST accept only:
- https://www.youtube.com/watch?v={video_id}
- https://youtu.be/{video_id}

Where:
- `{video_id}` is exactly 11 characters

### 2.2 URL Validation
- Invalid URL → immediate error: "Neteisinga nuoroda"
- No network request should be made for invalid URLs

### 2.3 Video Accessibility
- Cookies MUST be used for authentication (e.g. --cookies-from-browser)
- Region-restricted videos → fail
- Age-restricted videos → fail
- If yt-dlp fails due to access restrictions → show:
  "Nepavyko atsisiųsti"

---

## 3. Download Behavior

### 3.1 Tooling
- MUST use yt-dlp nightly builds
- Version is auto-updated daily to the latest nightly version

### 3.2 Format Selection
Primary:
- "bv*[height<=720]+ba/best"

Fallback:
- "best"

System MUST fallback automatically if primary fails due to format

### 3.3 Output Container
- MUST be MP4

### 3.4 Retry Policy
- Retry up to 2 times on failure
- After 3rd failure → hard fail

### 3.5 Timeout
- If no progress for 30 seconds → abort

### 3.6 Progress Reporting
- Update at least every 500ms
- States:
  - "Atsisiunčiama..."
  - "Konvertuojama..."
  - "Paruošta"

### 3.7 Failure Classification (internal)
- NETWORK_ERROR
- EXTRACTION_ERROR
- FORMAT_ERROR

User always sees:
- "Nepavyko atsisiųsti"

---

## 4. Transcoding Behavior

### 4.1 Tooling
- MUST use ffmpeg
- Version is fixed via `ffmpeg-static` (currently 6.0)

### 4.2 Video Encoding
- Codec: H.264 (libx264)
- Profile: High
- CRF: 30 (fixed)
- Preset: fast
- Max resolution: 720p
- No upscaling allowed
- Video MUST always be re-encoded

### 4.3 Audio Encoding
- If source bitrate >=160 kbps → copy
- Else:
  - Codec: AAC
  - Bitrate: 256 kbps

- Audio MUST never be downscaled

### 4.4 Output File
- Container: MP4
- MUST be playable on iPhone (Safari + Photos after manual save)

- Filename format:
  {video_title_sanitized}.mp4

---

## 5. File Storage

### 5.1 Default Paths
- macOS: ~/Movies/LocalTube
- Windows: %USERPROFILE%\Videos\LocalTube

### 5.2 File Naming
- Illegal characters removed
- Max length: 120 characters

### 5.3 Duplicate Handling
- Append suffix:
  - filename (1).mp4
  - filename (2).mp4

### 5.4 Temporary Files
- Stored in OS temp directory
- Deleted on success
- Cleaned on app startup

### 5.5 Disk Space
- Require 2x estimated file size before starting
- If insufficient:
  - Abort
  - Show: "Nepakanka vietos diske"

---

## 6. Local Sharing (iPhone via Browser)

### 6.1 Protocol
- HTTP over local network

### 6.2 Server Binding
- 0.0.0.0

### 6.3 Access Method
- Desktop app MUST display:
  - QR code
  - Direct URL (e.g. http://192.168.x.x:port)

### 6.4 Discovery
- No automatic device discovery required
- User manually opens link on iPhone

---

## 7. Transfer Behavior

### 7.1 Trigger
- User clicks "Siųsti į iPhone"
- App generates temporary download link

### 7.2 Security
- Random token (minimum 128-bit)
- Token embedded in URL
- Token expires after 10 minutes

### 7.3 File Size Limit
- 2GB max

### 7.4 Timeout
- If no data transfer for 30 seconds → connection closed

### 7.5 Integrity
- No checksum verification in MVP

### 7.6 Retry
- User refreshes page manually

---

## 8. iPhone User Flow (Browser-Based)

### 8.1 Steps
1. User scans QR code OR opens URL
2. Video download starts in Safari
3. User taps:
   - Share button
   - "Save Video"

### 8.2 Requirements
- No app installation required
- Must work in Safari on iOS

### 8.3 Output
- Video appears in Photos app after manual save

### 8.4 Failure Cases
- If download fails:
  - User retries manually
- No automatic recovery

---

## 9. UI Contract (Lithuanian Only)

### 9.1 Language
- All UI MUST be Lithuanian
- No English fallback

### 9.2 Exact Strings

Buttons:
- "Atsisiųsti"
- "Siųsti į iPhone"
- "Bandyti dar kartą"

Statuses:
- "Atsisiunčiama..."
- "Konvertuojama..."
- "Paruošta"
- "Paruošta siuntimui"
- "Atsidarykite nuorodą telefone"

Errors:
- "Neteisinga nuoroda"
- "Nepavyko atsisiųsti"
- "Nepakanka vietos diske"

### 9.3 Constraints
- No technical terms allowed in UI

### 9.4 Progress
- Download: percentage only
- No ETA

### 9.5 Recovery
- Failed items must show retry option

---

## 10. Performance Constraints

- Download must start within 2 seconds
- Transcoding must start within 1 second after download
- UI must not block >100ms

### 10.1 Concurrency
- Max 2 downloads simultaneously
- Others queued

### 10.2 CPU Usage
- ffmpeg may use full CPU

---

## 11. Logging

### 11.1 Location
- macOS: ~/Library/Logs/LocalTube
- Windows: AppData\LocalTube\Logs

### 11.2 Contents
- yt-dlp output
- ffmpeg output
- HTTP access logs

### 11.3 Retention
- 7 days

### 11.4 Visibility
- Not visible to user in MVP

---

## 12. Error Handling

- Every failure MUST map to one user-visible message
- No silent failures

---

## 13. Out of Scope

- Native iOS app
- Automatic saving to Photos
- Playlists
- Batch downloads
- Subtitles
- Resume downloads
- Android support
- Cloud sync
- App Store distribution

---

## 14. Testing / Validation

### 14.1 Devices
- iPhone 15 Pro
- iPhone 12 Pro Max

### 14.2 Browser
- Safari (latest iOS version)

### 14.3 Validation Criteria
A test passes if:

1. Video downloads on desktop
2. User opens link on iPhone
3. Video downloads in Safari
4. User can manually save video to Photos
5. Playback:
   - Starts <2 seconds
   - Audio in sync
   - No corruption

### 14.4 Out of Scope
- Other browsers
- Older devices
- Poor network conditions

---

## 15. Legal / Distribution

- Personal use only
- Not distributed via App Store
- Desktop app only distribution

---

## 16. Final Principle

When in doubt:
- Prefer reliability over optimal quality
- Prefer simplicity over configurability
- Prefer visible failure over silent degradation

---

## 17. Acceptance Criteria

System is complete only if:

1. Valid unlisted YouTube URL downloads successfully
2. Output file plays on macOS and Windows
3. QR code or URL opens on iPhone
4. Video downloads via Safari
5. User can manually save video to Photos
6. Audio is preserved (per bitrate rules)
7. Video is <=720p
8. Lithuanian-only user can complete flow without confusion

Failure of ANY condition = contract not satisfied
