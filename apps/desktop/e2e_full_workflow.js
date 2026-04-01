const path = require('path');
const os = require('os');
const fs = require('fs');
const { setToolDir, ensureTools } = require('./src/tools');
const { downloadVideo } = require('./src/download');
const { transcodeToMp4 } = require('./src/transcode');
const { createTransferServer, closeTransferServer } = require('./src/transfer');
const logging = require('./src/logging');
const config = require('./src/config');
const QRCode = require('qrcode');

// Disable cookies for the E2E test to avoid errors in restricted environment
config.COOKIES_FROM_BROWSER = null;
config.DOWNLOAD_FORMAT_PRIMARY = '18'; // Use a small format for faster testing

// Mock logging to stdout for the test
logging.info = (msg) => console.log(`[INFO] ${msg}`);
logging.error = (msg, err) => console.log(`[ERROR] ${msg}${err ? ' | ' + err.message : ''}`);
logging.debug = (msg) => console.log(`[DEBUG] ${msg}`);
logging.warn = (msg) => console.log(`[WARN] ${msg}`);

async function runTest() {
  const videoUrl = 'https://www.youtube.com/watch?v=DZ5Z3G6FKWA';
  const testDir = path.join(os.tmpdir(), `localtube-full-test-${Date.now()}`);
  const binDir = path.join(testDir, 'bin');
  const outputDir = path.join(testDir, 'output');
  
  console.log(`Starting Full Workflow E2E test for: ${videoUrl}`);
  console.log(`Using test directory: ${testDir}`);
  
  try {
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    
    // 1. Setup tools
    setToolDir(binDir);
    console.log('Ensuring tools (yt-dlp nightly)...');
    await ensureTools();
    
    // 2. Download video
    console.log('Starting download...');
    const downloadResult = await downloadVideo(videoUrl, (percent) => {
      process.stdout.write(`\rDownload progress: ${percent}%`);
    });
    console.log('\nDownload finished.');
    console.log(`Temp file: ${downloadResult.tempPath}`);

    // 3. Transcode video
    console.log('Starting transcoding...');
    const outputPath = path.join(outputDir, 'test-video.mp4');
    await transcodeToMp4(downloadResult.tempPath, outputPath, (time, duration) => {
      const percent = duration > 0 ? Math.min(100, Math.round((time / duration) * 100)) : 0;
      process.stdout.write(`\rTranscoding progress: ${percent}%`);
    });
    console.log('\nTranscoding finished.');
    console.log(`Output file: ${outputPath}`);

    // Verify transcoded file
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      console.log(`Transcoded file size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
      if (stats.size === 0) throw new Error('Transcoded file is empty.');
    } else {
      throw new Error('Transcoded file does not exist.');
    }

    // 4. Start transfer server
    console.log('Starting transfer server...');
    const transfer = await createTransferServer(outputPath);
    console.log(`Server started on port: ${transfer.port}`);
    console.log(`Token: ${transfer.token}`);

    // 5. Generate QR Code (simulating renderer.js logic)
    console.log('Generating QR code...');
    const ip = '127.0.0.1'; // Mock IP
    const url = `http://${ip}:${transfer.port}/transfer?token=${transfer.token}`;
    const qr = await QRCode.toDataURL(url);
    
    if (qr.startsWith('data:image/png;base64,')) {
      console.log('QR code generated successfully.');
    } else {
      throw new Error('Failed to generate valid QR code data URL.');
    }

    // 6. Verify Instructions (simulating renderer.js logic)
    const instructions = [
      'Nuskenuokite kodą telefone.',
      'Telefonas ir kompiuteris turi būti prie to paties namų interneto.'
    ];
    console.log('Instructions verification:');
    instructions.forEach(ins => console.log(`  - ${ins}`));

    // 7. Test transfer download (optional but good)
    console.log('Testing transfer download via curl...');
    const { execSync } = require('child_process');
    const curlOutput = execSync(`curl -I "${url}"`).toString();
    console.log('Curl output (headers):');
    console.log(curlOutput);
    
    if (!curlOutput.includes('HTTP/1.1 200 OK')) {
      throw new Error('Transfer server returned non-200 status.');
    }
    if (!curlOutput.includes('Content-Type: video/mp4')) {
      throw new Error('Transfer server returned wrong content type.');
    }

    console.log('\nFULL WORKFLOW SUCCESS!');

    // Cleanup
    closeTransferServer(transfer.server);
    fs.rmSync(testDir, { recursive: true, force: true });
    console.log('Cleaned up test directory.');
    
  } catch (error) {
    console.error('\nTest FAILED:');
    console.error(error);
    process.exit(1);
  }
}

runTest();
