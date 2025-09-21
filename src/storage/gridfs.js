const { GridFSBucket, ObjectId } = require('mongodb');
const { getDb } = require('../config/mongo');

let originalBucket;
let variantsBucket;

function getOriginalBucket() {
  if (!originalBucket) {
    originalBucket = new GridFSBucket(getDb(), {
      bucketName: 'artworks',
      chunkSizeBytes: 1024 * 1024,
    });
  }
  return originalBucket;
}

function getVariantsBucket() {
  if (!variantsBucket) {
    variantsBucket = new GridFSBucket(getDb(), {
      bucketName: 'artwork_variants',
      chunkSizeBytes: 1024 * 1024,
    });
  }
  return variantsBucket;
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
  getVariantsBucket,
  uploadStreamToBucket,
  downloadStreamFromBucket,
  deleteFileFromBucket,
};