const path = require('path');
const os = require('os');
const fs = require('fs');
const { setToolDir, ensureTools } = require('./src/tools');
const { downloadVideo } = require('./src/download');
const logging = require('./src/logging');
const config = require('./src/config');

// Disable cookies for the E2E test to avoid errors in restricted environment
config.COOKIES_FROM_BROWSER = null;
config.DOWNLOAD_FORMAT_PRIMARY = '18';

// Mock logging to stdout for the test
logging.info = (msg) => console.log(`[INFO] ${msg}`);
logging.error = (msg, err) => console.log(`[ERROR] ${msg}${err ? ' | ' + err.message : ''}`);
logging.debug = (msg) => console.log(`[DEBUG] ${msg}`);
logging.warn = (msg) => console.log(`[WARN] ${msg}`);

async function runTest() {
  const videoUrl = 'https://www.youtube.com/watch?v=DZ5Z3G6FKWA';
  // Use the project's actual log directory (now set to apps/desktop/logs)
  const logDir = config.LOG_DIR;
  const testDir = path.join(os.tmpdir(), `localtube-test-${Date.now()}`);
  const binDir = path.join(testDir, 'bin');
  
  console.log(`Starting E2E test for: ${videoUrl}`);
  console.log(`Using test directory: ${testDir}`);
  console.log(`Logs will be at: ${logDir}`);
  
  try {
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });
    
    // 1. Setup tools
    setToolDir(binDir);
    console.log('Ensuring tools (yt-dlp nightly)...');
    await ensureTools();
    
    // 2. Download video
    console.log('Starting download...');
    const result = await downloadVideo(videoUrl, (percent) => {
      process.stdout.write(`\rDownload progress: ${percent}%`);
    });
    console.log('\nDownload finished.');
    
    // 3. Verify
    if (fs.existsSync(result.tempPath)) {
      const stats = fs.statSync(result.tempPath);
      console.log(`Success! Video downloaded to: ${result.tempPath}`);
      console.log(`File size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
      
      if (stats.size > 0) {
        console.log('Verification: File exists and is not empty.');
      } else {
        throw new Error('Verification failed: File is empty.');
      }
    } else {
      throw new Error('Verification failed: Output file does not exist.');
    }
    
    // Cleanup
    fs.unlinkSync(result.tempPath);
    console.log('Cleaned up test video file.');
    
  } catch (error) {
    console.error('\nTest FAILED:');
    console.error(error);
    process.exit(1);
  } finally {
    // Optional: cleanup testDir
    try {
      // We keep the binDir to avoid re-downloading during development if needed, 
      // but for a clean E2E we might want to wipe it.
      // fs.rmSync(testDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

runTest();
