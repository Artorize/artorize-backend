const sharp = require('sharp');

const SAC_MAGIC = Buffer.from('SAC1', 'ascii');
const DTYPE_INT16 = 1;
const ARRAYS_COUNT = 2;
const HEADER_SIZE = 24;

/**
 * Encodes two int16 arrays into SAC v1 binary format
 * @param {Int16Array|Array} arrayA - First array of signed 16-bit integers
 * @param {Int16Array|Array} arrayB - Second array of signed 16-bit integers
 * @param {number} width - Image width (optional, 0 if unknown)
 * @param {number} height - Image height (optional, 0 if unknown)
 * @returns {Buffer} SAC v1 binary data
 */
function buildSAC(arrayA, arrayB, width = 0, height = 0) {
  // Ensure we have typed arrays
  const a = arrayA instanceof Int16Array ? arrayA : new Int16Array(arrayA);
  const b = arrayB instanceof Int16Array ? arrayB : new Int16Array(arrayB);

  const lengthA = a.length;
  const lengthB = b.length;

  // Validate dimensions if provided
  if (width && height) {
    if (lengthA !== width * height) {
      throw new Error(`Array A length ${lengthA} != width*height ${width * height}`);
    }
    if (lengthB !== width * height) {
      throw new Error(`Array B length ${lengthB} != width*height ${width * height}`);
    }
  }

  // Create header buffer (24 bytes)
  const header = Buffer.allocUnsafe(HEADER_SIZE);
  let offset = 0;

  // magic: 4 bytes "SAC1"
  SAC_MAGIC.copy(header, offset);
  offset += 4;

  // flags: 1 byte (0)
  header.writeUInt8(0, offset);
  offset += 1;

  // dtype_code: 1 byte (1 = int16)
  header.writeUInt8(DTYPE_INT16, offset);
  offset += 1;

  // arrays_count: 1 byte (2)
  header.writeUInt8(ARRAYS_COUNT, offset);
  offset += 1;

  // reserved: 1 byte (0)
  header.writeUInt8(0, offset);
  offset += 1;

  // length_a: 4 bytes uint32 (little-endian)
  header.writeUInt32LE(lengthA, offset);
  offset += 4;

  // length_b: 4 bytes uint32 (little-endian)
  header.writeUInt32LE(lengthB, offset);
  offset += 4;

  // width: 4 bytes uint32 (little-endian)
  header.writeUInt32LE(width, offset);
  offset += 4;

  // height: 4 bytes uint32 (little-endian)
  header.writeUInt32LE(height, offset);

  // Create payload buffers
  const payloadA = Buffer.from(a.buffer, a.byteOffset, a.byteLength);
  const payloadB = Buffer.from(b.buffer, b.byteOffset, b.byteLength);

  // Concatenate header + payloadA + payloadB
  return Buffer.concat([header, payloadA, payloadB]);
}

/**
 * Converts a PNG mask buffer to SAC v1 format
 * Expects a 2-channel PNG (e.g., RG or RA) where each channel represents an int16 array
 * The pixel values are mapped from [0, 255] to signed int16 range
 *
 * @param {Buffer} pngBuffer - PNG image buffer
 * @returns {Promise<Buffer>} SAC v1 binary data
 */
async function pngToSAC(pngBuffer) {
  // Parse PNG and extract raw pixel data
  const image = sharp(pngBuffer);
  const metadata = await image.metadata();

  const { width, height, channels } = metadata;

  if (!width || !height) {
    throw new Error('Unable to determine image dimensions');
  }

  // Extract raw pixel data
  // We'll use the raw format to get uncompressed pixel values
  const { data, info } = await image
    .ensureAlpha() // Ensure we have at least 2 channels (RGBA)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const totalPixels = width * height;
  const arrayA = new Int16Array(totalPixels);
  const arrayB = new Int16Array(totalPixels);

  // Extract two channels and convert to int16
  // Channel 0 (R) -> Array A
  // Channel 1 (G) -> Array B
  // Map [0, 255] to signed int16 range [-32768, 32767]
  // We'll use a simple linear mapping: (value - 128) * 256
  for (let i = 0; i < totalPixels; i++) {
    const pixelOffset = i * info.channels;

    // Channel 0 (R) -> Array A
    const r = data[pixelOffset];
    arrayA[i] = (r - 128) * 256;

    // Channel 1 (G) -> Array B
    const g = data[pixelOffset + 1];
    arrayB[i] = (g - 128) * 256;
  }

  return buildSAC(arrayA, arrayB, width, height);
}

/**
 * Parses SAC v1 binary data and extracts the arrays
 * Useful for validation and testing
 *
 * @param {Buffer} sacBuffer - SAC v1 binary data
 * @returns {Object} Parsed SAC data with arrays and metadata
 */
function parseSAC(sacBuffer) {
  if (sacBuffer.length < HEADER_SIZE) {
    throw new Error('Buffer too small to be valid SAC');
  }

  let offset = 0;

  // Validate magic
  const magic = sacBuffer.toString('ascii', offset, offset + 4);
  if (magic !== 'SAC1') {
    throw new Error(`Invalid magic: expected 'SAC1', got '${magic}'`);
  }
  offset += 4;

  // Read header fields
  const flags = sacBuffer.readUInt8(offset);
  offset += 1;

  const dtypeCode = sacBuffer.readUInt8(offset);
  offset += 1;
  if (dtypeCode !== DTYPE_INT16) {
    throw new Error(`Unsupported dtype_code: ${dtypeCode}`);
  }

  const arraysCount = sacBuffer.readUInt8(offset);
  offset += 1;
  if (arraysCount !== ARRAYS_COUNT) {
    throw new Error(`Unsupported arrays_count: ${arraysCount}`);
  }

  const reserved = sacBuffer.readUInt8(offset);
  offset += 1;

  const lengthA = sacBuffer.readUInt32LE(offset);
  offset += 4;

  const lengthB = sacBuffer.readUInt32LE(offset);
  offset += 4;

  const width = sacBuffer.readUInt32LE(offset);
  offset += 4;

  const height = sacBuffer.readUInt32LE(offset);
  offset += 4;

  // Validate buffer size
  const expectedSize = HEADER_SIZE + (lengthA * 2) + (lengthB * 2);
  if (sacBuffer.length !== expectedSize) {
    throw new Error(`Buffer size mismatch: expected ${expectedSize}, got ${sacBuffer.length}`);
  }

  // Validate dimensions if present
  if (width && height) {
    if (lengthA !== width * height) {
      throw new Error(`Array A length ${lengthA} != width*height ${width * height}`);
    }
    if (lengthB !== width * height) {
      throw new Error(`Array B length ${lengthB} != width*height ${width * height}`);
    }
  }

  // Extract arrays
  const arrayA = new Int16Array(
    sacBuffer.buffer,
    sacBuffer.byteOffset + offset,
    lengthA
  );
  offset += lengthA * 2;

  const arrayB = new Int16Array(
    sacBuffer.buffer,
    sacBuffer.byteOffset + offset,
    lengthB
  );

  return {
    flags,
    dtypeCode,
    arraysCount,
    lengthA,
    lengthB,
    width,
    height,
    arrayA,
    arrayB,
  };
}

module.exports = {
  buildSAC,
  pngToSAC,
  parseSAC,
  SAC_MAGIC,
  DTYPE_INT16,
  ARRAYS_COUNT,
  HEADER_SIZE,
};
