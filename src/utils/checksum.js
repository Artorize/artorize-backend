const fs = require('fs');
const crypto = require('crypto');

function sha256FromBuffer(buffer) {
  const hash = crypto.createHash('sha256');
  hash.update(buffer);
  return `sha256:${hash.digest('hex')}`;
}

function sha256FromFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => {
      resolve(`sha256:${hash.digest('hex')}`);
    });
  });
}

module.exports = {
  sha256FromBuffer,
  sha256FromFile,
};