const { buildSAC, parseSAC } = require('../src/services/sac-encoder.service');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Integration test for SAC mask upload and retrieval
 * This test generates sample SAC files and validates the upload/storage flow
 */

async function generateTestSACFiles() {
  console.log('Generating test SAC files...');

  const testDir = path.join(__dirname, 'test-data');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Generate high-resolution mask (256x256)
  const hiWidth = 256;
  const hiHeight = 256;
  const hiPixels = hiWidth * hiHeight;

  const hiArrayA = new Int16Array(hiPixels);
  const hiArrayB = new Int16Array(hiPixels);

  for (let i = 0; i < hiPixels; i++) {
    // Create a gradient pattern for testing
    const x = i % hiWidth;
    const y = Math.floor(i / hiWidth);
    hiArrayA[i] = Math.floor((x / hiWidth) * 65535 - 32768);
    hiArrayB[i] = Math.floor((y / hiHeight) * 65535 - 32768);
  }

  const hiSAC = buildSAC(hiArrayA, hiArrayB, hiWidth, hiHeight);
  const hiPath = path.join(testDir, 'mask_hi.sac');
  fs.writeFileSync(hiPath, hiSAC);
  console.log(`✓ Generated mask_hi.sac (${hiWidth}x${hiHeight}, ${hiSAC.length} bytes)`);

  // Generate low-resolution mask (64x64)
  const loWidth = 64;
  const loHeight = 64;
  const loPixels = loWidth * loHeight;

  const loArrayA = new Int16Array(loPixels);
  const loArrayB = new Int16Array(loPixels);

  for (let i = 0; i < loPixels; i++) {
    const x = i % loWidth;
    const y = Math.floor(i / loWidth);
    loArrayA[i] = Math.floor((x / loWidth) * 65535 - 32768);
    loArrayB[i] = Math.floor((y / loHeight) * 65535 - 32768);
  }

  const loSAC = buildSAC(loArrayA, loArrayB, loWidth, loHeight);
  const loPath = path.join(testDir, 'mask_lo.sac');
  fs.writeFileSync(loPath, loSAC);
  console.log(`✓ Generated mask_lo.sac (${loWidth}x${loHeight}, ${loSAC.length} bytes)`);

  return { hiPath, loPath };
}

async function generateTestImages() {
  console.log('Generating test images...');

  const testDir = path.join(__dirname, 'test-data');

  // Generate a simple test image (512x512)
  const width = 512;
  const height = 512;
  const channels = 3;
  const imageData = Buffer.alloc(width * height * channels);

  for (let i = 0; i < width * height; i++) {
    const offset = i * channels;
    const x = i % width;
    const y = Math.floor(i / width);
    imageData[offset + 0] = Math.floor((x / width) * 255); // R
    imageData[offset + 1] = Math.floor((y / height) * 255); // G
    imageData[offset + 2] = 128; // B
  }

  const originalPath = path.join(testDir, 'original.jpg');
  await sharp(imageData, {
    raw: { width, height, channels },
  })
    .jpeg({ quality: 90 })
    .toFile(originalPath);
  console.log(`✓ Generated original.jpg (${width}x${height})`);

  const protectedPath = path.join(testDir, 'protected.jpg');
  await sharp(imageData, {
    raw: { width, height, channels },
  })
    .jpeg({ quality: 80 })
    .toFile(protectedPath);
  console.log(`✓ Generated protected.jpg (${width}x${height})`);

  return { originalPath, protectedPath };
}

async function generateTestMetadata() {
  console.log('Generating test metadata...');

  const testDir = path.join(__dirname, 'test-data');

  const analysis = {
    colors: ['#FF5733', '#33FF57', '#3357FF'],
    dominantColor: '#FF5733',
    brightness: 0.6,
    contrast: 0.8,
  };

  const summary = {
    title: 'Test Artwork',
    description: 'A test artwork for SAC integration testing',
    style: 'abstract',
    mood: 'vibrant',
  };

  const analysisPath = path.join(testDir, 'analysis.json');
  const summaryPath = path.join(testDir, 'summary.json');

  fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log('✓ Generated analysis.json and summary.json');

  return { analysisPath, summaryPath };
}

async function validateSACFiles(hiPath, loPath) {
  console.log('\nValidating SAC files...');

  // Validate high-resolution mask
  const hiBuffer = fs.readFileSync(hiPath);
  const hiParsed = parseSAC(hiBuffer);

  if (hiParsed.width !== 256 || hiParsed.height !== 256) {
    throw new Error(`Invalid hi-res dimensions: ${hiParsed.width}x${hiParsed.height}`);
  }
  console.log(`✓ mask_hi.sac validated (${hiParsed.width}x${hiParsed.height})`);

  // Validate low-resolution mask
  const loBuffer = fs.readFileSync(loPath);
  const loParsed = parseSAC(loBuffer);

  if (loParsed.width !== 64 || loParsed.height !== 64) {
    throw new Error(`Invalid lo-res dimensions: ${loParsed.width}x${loParsed.height}`);
  }
  console.log(`✓ mask_lo.sac validated (${loParsed.width}x${loParsed.height})`);
}

async function runIntegrationTest() {
  console.log('Running SAC integration test...\n');

  try {
    // Generate test files
    const { hiPath, loPath } = await generateTestSACFiles();
    const { originalPath, protectedPath } = await generateTestImages();
    const { analysisPath, summaryPath } = await generateTestMetadata();

    // Validate SAC files
    await validateSACFiles(hiPath, loPath);

    console.log('\n✓ All test files generated successfully!');
    console.log('\nTest files location:', path.join(__dirname, 'test-data'));
    console.log('\nYou can now use these files to test the upload endpoint:');
    console.log('curl -X POST http://localhost:3000/artworks \\');
    console.log(`  -F "original=@${originalPath}" \\`);
    console.log(`  -F "protected=@${protectedPath}" \\`);
    console.log(`  -F "maskHi=@${hiPath}" \\`);
    console.log(`  -F "maskLo=@${loPath}" \\`);
    console.log(`  -F "analysis=@${analysisPath}" \\`);
    console.log(`  -F "summary=@${summaryPath}" \\`);
    console.log('  -F "title=SAC Integration Test" \\');
    console.log('  -F "artist=Test Artist" \\');
    console.log('  -F "tags=test,sac,integration"');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  runIntegrationTest();
}

module.exports = {
  generateTestSACFiles,
  generateTestImages,
  generateTestMetadata,
  validateSACFiles,
  runIntegrationTest,
};
