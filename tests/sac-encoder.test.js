const { buildSAC, parseSAC, pngToSAC } = require('../src/services/sac-encoder.service');
const sharp = require('sharp');

/**
 * Test SAC v1 encoder implementation
 */

async function testBuildAndParseSAC() {
  console.log('Testing buildSAC and parseSAC...');

  // Create test data: 2x3 image (6 pixels)
  const width = 3;
  const height = 2;
  const totalPixels = width * height;

  const arrayA = new Int16Array([0, 1, -1, 2, -2, 3]);
  const arrayB = new Int16Array([5, -5, 4, -4, 0, 1]);

  // Build SAC
  const sacBuffer = buildSAC(arrayA, arrayB, width, height);

  // Verify header size + payload size
  const expectedSize = 24 + (totalPixels * 2) + (totalPixels * 2);
  if (sacBuffer.length !== expectedSize) {
    throw new Error(`Expected buffer size ${expectedSize}, got ${sacBuffer.length}`);
  }

  // Verify magic
  const magic = sacBuffer.toString('ascii', 0, 4);
  if (magic !== 'SAC1') {
    throw new Error(`Expected magic 'SAC1', got '${magic}'`);
  }

  // Parse SAC
  const parsed = parseSAC(sacBuffer);

  // Verify metadata
  if (parsed.width !== width) {
    throw new Error(`Expected width ${width}, got ${parsed.width}`);
  }
  if (parsed.height !== height) {
    throw new Error(`Expected height ${height}, got ${parsed.height}`);
  }
  if (parsed.lengthA !== totalPixels) {
    throw new Error(`Expected lengthA ${totalPixels}, got ${parsed.lengthA}`);
  }
  if (parsed.lengthB !== totalPixels) {
    throw new Error(`Expected lengthB ${totalPixels}, got ${parsed.lengthB}`);
  }

  // Verify array values
  for (let i = 0; i < totalPixels; i++) {
    if (parsed.arrayA[i] !== arrayA[i]) {
      throw new Error(`Array A mismatch at index ${i}: expected ${arrayA[i]}, got ${parsed.arrayA[i]}`);
    }
    if (parsed.arrayB[i] !== arrayB[i]) {
      throw new Error(`Array B mismatch at index ${i}: expected ${arrayB[i]}, got ${parsed.arrayB[i]}`);
    }
  }

  console.log('✓ buildSAC and parseSAC test passed');
}

async function testPngToSAC() {
  console.log('Testing pngToSAC...');

  // Create a simple 4x4 test PNG with 2 channels
  const width = 4;
  const height = 4;
  const totalPixels = width * height;

  // Create RGBA image data
  const channels = 4;
  const data = Buffer.alloc(totalPixels * channels);

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * channels;
    data[offset + 0] = 128 + (i % 128); // R channel (will map to array A)
    data[offset + 1] = 128 - (i % 128); // G channel (will map to array B)
    data[offset + 2] = 0; // B channel (unused)
    data[offset + 3] = 255; // Alpha channel
  }

  // Create PNG buffer
  const pngBuffer = await sharp(data, {
    raw: {
      width,
      height,
      channels,
    },
  }).png().toBuffer();

  // Convert to SAC
  const sacBuffer = await pngToSAC(pngBuffer);

  // Parse the result
  const parsed = parseSAC(sacBuffer);

  // Verify dimensions
  if (parsed.width !== width) {
    throw new Error(`Expected width ${width}, got ${parsed.width}`);
  }
  if (parsed.height !== height) {
    throw new Error(`Expected height ${height}, got ${parsed.height}`);
  }

  // Verify arrays have correct length
  if (parsed.arrayA.length !== totalPixels) {
    throw new Error(`Expected arrayA length ${totalPixels}, got ${parsed.arrayA.length}`);
  }
  if (parsed.arrayB.length !== totalPixels) {
    throw new Error(`Expected arrayB length ${totalPixels}, got ${parsed.arrayB.length}`);
  }

  console.log('✓ pngToSAC test passed');
  console.log(`  - Image dimensions: ${width}x${height}`);
  console.log(`  - Array A length: ${parsed.arrayA.length}`);
  console.log(`  - Array B length: ${parsed.arrayB.length}`);
  console.log(`  - SAC buffer size: ${sacBuffer.length} bytes`);
}

async function runAllTests() {
  console.log('Running SAC encoder tests...\n');

  try {
    await testBuildAndParseSAC();
    await testPngToSAC();

    console.log('\n✓ All tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  testBuildAndParseSAC,
  testPngToSAC,
  runAllTests,
};
