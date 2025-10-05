const { GridFSBucket, ObjectId } = require('mongodb');
const { getDb } = require('../config/mongo');

let originalBucket;
let protectedBucket;
let maskBucket;

function getOriginalBucket() {
  if (!originalBucket) {
    originalBucket = new GridFSBucket(getDb(), {
      bucketName: 'artwork_originals',
      chunkSizeBytes: 1024 * 1024,
    });
  }
  return originalBucket;
}

function getProtectedBucket() {
  if (!protectedBucket) {
    protectedBucket = new GridFSBucket(getDb(), {
      bucketName: 'artwork_protected',
      chunkSizeBytes: 1024 * 1024,
    });
  }
  return protectedBucket;
}

function getMaskBucket() {
  if (!maskBucket) {
    maskBucket = new GridFSBucket(getDb(), {
      bucketName: 'artwork_masks',
      chunkSizeBytes: 1024 * 1024,
    });
  }
  return maskBucket;
}

function uploadStreamToBucket(bucket, stream, { filename, contentType }) {
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, {
      contentType,
    });

    stream.pipe(uploadStream);

    uploadStream.on('error', reject);
    uploadStream.on('finish', () => resolve(uploadStream.id));
  });
}

function downloadStreamFromBucket(bucket, id) {
  return bucket.openDownloadStream(new ObjectId(id));
}

function deleteFileFromBucket(bucket, id) {
  return bucket.delete(new ObjectId(id));
}

module.exports = {
  getOriginalBucket,
  getProtectedBucket,
  getMaskBucket,
  uploadStreamToBucket,
  downloadStreamFromBucket,
  deleteFileFromBucket,
};
