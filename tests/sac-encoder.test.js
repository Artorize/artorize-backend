const { buildSAC, parseSAC, pngToSAC, FLAG_SINGLE_ARRAY } = require('../src/services/sac-encoder.service');
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

async function testSACv11SingleArray() {
  console.log('Testing SAC v1.1 single-array mode...');

  // Create test data with identical arrays (grayscale mask)
  const width = 4;
  const height = 3;
  const totalPixels = width * height;

  const arrayA = new Int16Array([10, -20, 30, -40, 50, -60, 70, -80, 90, -100, 110, -120]);
  const arrayB = new Int16Array([10, -20, 30, -40, 50, -60, 70, -80, 90, -100, 110, -120]); // Identical

  // Build SAC (should use FLAG_SINGLE_ARRAY)
  const sacBuffer = buildSAC(arrayA, arrayB, width, height);

  // Expected size: 24-byte header + (12 pixels × 2 bytes) = 48 bytes
  // vs v1.0 which would be: 24 + (12 × 2) + (12 × 2) = 72 bytes
  const expectedSize = 24 + (totalPixels * 2);
  if (sacBuffer.length !== expectedSize) {
    throw new Error(`Expected buffer size ${expectedSize}, got ${sacBuffer.length}`);
  }

  console.log(`  - SAC v1.1 size: ${sacBuffer.length} bytes (50% smaller than v1.0)`);

  // Verify FLAG_SINGLE_ARRAY is set
  const flags = sacBuffer.readUInt8(4);
  if ((flags & FLAG_SINGLE_ARRAY) === 0) {
    throw new Error('FLAG_SINGLE_ARRAY should be set for identical arrays');
  }

  // Verify arrays_count is 1
  const arraysCount = sacBuffer.readUInt8(6);
  if (arraysCount !== 1) {
    throw new Error(`Expected arrays_count 1, got ${arraysCount}`);
  }

  // Parse SAC
  const parsed = parseSAC(sacBuffer);

  // Verify metadata
  if (!parsed.isSingleArray) {
    throw new Error('isSingleArray flag should be true');
  }
  if (parsed.width !== width) {
    throw new Error(`Expected width ${width}, got ${parsed.width}`);
  }
  if (parsed.height !== height) {
    throw new Error(`Expected height ${height}, got ${parsed.height}`);
  }

  // Verify both arrays are identical and match original
  for (let i = 0; i < totalPixels; i++) {
    if (parsed.arrayA[i] !== arrayA[i]) {
      throw new Error(`Array A mismatch at index ${i}: expected ${arrayA[i]}, got ${parsed.arrayA[i]}`);
    }
    if (parsed.arrayB[i] !== arrayA[i]) {
      throw new Error(`Array B should match A at index ${i}: expected ${arrayA[i]}, got ${parsed.arrayB[i]}`);
    }
  }

  console.log('✓ SAC v1.1 single-array mode test passed');
}

async function testSACv10BackwardCompatibility() {
  console.log('Testing SAC v1.0 backward compatibility (different arrays)...');

  // Create test data with different arrays (legacy RGB mask)
  const width = 3;
  const height = 2;
  const totalPixels = width * height;

  const arrayA = new Int16Array([1, 2, 3, 4, 5, 6]);
  const arrayB = new Int16Array([10, 20, 30, 40, 50, 60]); // Different

  // Build SAC (should NOT use FLAG_SINGLE_ARRAY)
  const sacBuffer = buildSAC(arrayA, arrayB, width, height);

  // Expected size: 24 + (6 × 2) + (6 × 2) = 48 bytes
  const expectedSize = 24 + (totalPixels * 2) + (totalPixels * 2);
  if (sacBuffer.length !== expectedSize) {
    throw new Error(`Expected buffer size ${expectedSize}, got ${sacBuffer.length}`);
  }

  console.log(`  - SAC v1.0 size: ${sacBuffer.length} bytes`);

  // Verify FLAG_SINGLE_ARRAY is NOT set
  const flags = sacBuffer.readUInt8(4);
  if ((flags & FLAG_SINGLE_ARRAY) !== 0) {
    throw new Error('FLAG_SINGLE_ARRAY should NOT be set for different arrays');
  }

  // Verify arrays_count is 2
  const arraysCount = sacBuffer.readUInt8(6);
  if (arraysCount !== 2) {
    throw new Error(`Expected arrays_count 2, got ${arraysCount}`);
  }

  // Parse SAC
  const parsed = parseSAC(sacBuffer);

  // Verify metadata
  if (parsed.isSingleArray) {
    throw new Error('isSingleArray flag should be false');
  }

  // Verify both arrays match originals
  for (let i = 0; i < totalPixels; i++) {
    if (parsed.arrayA[i] !== arrayA[i]) {
      throw new Error(`Array A mismatch at index ${i}: expected ${arrayA[i]}, got ${parsed.arrayA[i]}`);
    }
    if (parsed.arrayB[i] !== arrayB[i]) {
      throw new Error(`Array B mismatch at index ${i}: expected ${arrayB[i]}, got ${parsed.arrayB[i]}`);
    }
  }

  console.log('✓ SAC v1.0 backward compatibility test passed');
}

async function testSACv11FileSizeComparison() {
  console.log('Testing SAC v1.1 file size comparison...');

  // Create larger test data to demonstrate size savings
  const width = 512;
  const height = 344;
  const totalPixels = width * height;

  // Grayscale mask (identical arrays)
  const arrayA = new Int16Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    arrayA[i] = (i % 256) - 128; // Some test data
  }
  const arrayB = new Int16Array(arrayA); // Identical

  // Build SAC v1.1
  const sacV11 = buildSAC(arrayA, arrayB, width, height);

  // Build SAC v1.0 (force different arrays for comparison)
  const arrayBDifferent = new Int16Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    arrayBDifferent[i] = arrayA[i] + 1; // Slightly different
  }
  const sacV10 = buildSAC(arrayA, arrayBDifferent, width, height);

  const savings = sacV10.length - sacV11.length;
  const savingsPercent = ((savings / sacV10.length) * 100).toFixed(1);

  console.log(`  - SAC v1.0 size: ${sacV10.length.toLocaleString()} bytes`);
  console.log(`  - SAC v1.1 size: ${sacV11.length.toLocaleString()} bytes`);
  console.log(`  - Savings: ${savings.toLocaleString()} bytes (${savingsPercent}%)`);

  // Verify savings are approximately 50%
  if (Math.abs(parseFloat(savingsPercent) - 50.0) > 1.0) {
    throw new Error(`Expected ~50% savings, got ${savingsPercent}%`);
  }

  console.log('✓ SAC v1.1 file size comparison test passed');
}

async function runAllTests() {
  console.log('Running SAC encoder tests...\n');

  try {
    await testBuildAndParseSAC();
    await testPngToSAC();
    await testSACv11SingleArray();
    await testSACv10BackwardCompatibility();
    await testSACv11FileSizeComparison();

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
  testSACv11SingleArray,
  testSACv10BackwardCompatibility,
  testSACv11FileSizeComparison,
  runAllTests,
};
