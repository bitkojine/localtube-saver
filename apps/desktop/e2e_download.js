const path = require('path');
const os = require('os');
const fs = require('fs');
const { setToolDir, ensureTools } = require('./src/tools');
const { downloadVideo } = require('./src/download');
const logging = require('./src/logging');
const config = require('./src/config');


config.COOKIES_FROM_BROWSER = null;
config.DOWNLOAD_FORMAT_PRIMARY = '18';


logging.info = (msg) => console.log(`[INFO] ${msg}`);
logging.error = (msg, err) => console.log(`[ERROR] ${msg}${err ? ' | ' + err.message : ''}`);
logging.debug = (msg) => console.log(`[DEBUG] ${msg}`);
logging.warn = (msg) => console.log(`[WARN] ${msg}`);

async function runTest() {
  const videoUrl = 'https:
  
  const logDir = config.LOG_DIR;
  const testDir = path.join(os.tmpdir(), `localtube-test-${Date.now()}`);
  const binDir = path.join(testDir, 'bin');
  
  console.log(`Starting E2E test for: ${videoUrl}`);
  console.log(`Using test directory: ${testDir}`);
  console.log(`Logs will be at: ${logDir}`);
  
  try {
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });
    
    
    setToolDir(binDir);
    console.log('Ensuring tools (yt-dlp nightly)...');
    await ensureTools();
    
    
    console.log('Starting download...');
    const result = await downloadVideo(videoUrl, (percent) => {
      process.stdout.write(`\rDownload progress: ${percent}%`);
    });
    console.log('\nDownload finished.');
    
    
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
    
    
    fs.unlinkSync(result.tempPath);
    console.log('Cleaned up test video file.');
    
  } catch (error) {
    console.error('\nTest FAILED:');
    console.error(error);
    process.exit(1);
  } finally {
    
    try {
      
      
      
    } catch (e) {}
  }
}

runTest();
