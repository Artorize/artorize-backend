#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const fixturesDir = __dirname;

async function generateTestImages() {
  console.log('Generating test fixtures...');

  // Create directories
  const dirs = ['images', 'json'];
  dirs.forEach(dir => {
    const dirPath = path.join(fixturesDir, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  });

  // Generate test images
  const images = {
    'original.jpg': {
      width: 1920,
      height: 1080,
      channels: 3,
      background: { r: 255, g: 100, b: 50 },
      format: 'jpeg',
    },
    'protected.jpg': {
      width: 1920,
      height: 1080,
      channels: 3,
      background: { r: 100, g: 255, b: 100 },
      format: 'jpeg',
    },
    'mask_hi.png': {
      width: 1920,
      height: 1080,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0.5 },
      format: 'png',
    },
    'mask_lo.png': {
      width: 960,
      height: 540,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0.3 },
      format: 'png',
    },
    'small.jpg': {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 200, g: 200, b: 200 },
      format: 'jpeg',
    },
    'large.jpg': {
      width: 4096,
      height: 4096,
      channels: 3,
      background: { r: 150, g: 150, b: 150 },
      format: 'jpeg',
    },
  };

  for (const [filename, config] of Object.entries(images)) {
    const outputPath = path.join(fixturesDir, 'images', filename);

    let image = sharp({
      create: {
        width: config.width,
        height: config.height,
        channels: config.channels,
        background: config.background,
      },
    });

    // Add some patterns to make images distinct
    const svgOverlay = `
      <svg width="${config.width}" height="${config.height}">
        <rect width="${config.width}" height="${config.height}" fill="none" stroke="black" stroke-width="2"/>
        <text x="50%" y="50%" font-size="48" text-anchor="middle" fill="black">${filename}</text>
      </svg>
    `;

    image = image.composite([{
      input: Buffer.from(svgOverlay),
      top: 0,
      left: 0,
    }]);

    if (config.format === 'jpeg') {
      await image.jpeg({ quality: 90 }).toFile(outputPath);
    } else if (config.format === 'png') {
      await image.png().toFile(outputPath);
    }

    console.log(`Created ${outputPath}`);
  }

  // Generate JSON fixtures
  const jsonFixtures = {
    'analysis.json': {
      processedAt: '2024-01-01T00:00:00Z',
      processor: 'test-processor',
      version: '1.0.0',
      dimensions: {
        width: 1920,
        height: 1080,
      },
      format: 'jpeg',
      colorSpace: 'sRGB',
      quality: 95,
      features: {
        faces: 0,
        objects: ['artwork', 'painting'],
        dominant_colors: ['#FF6432', '#64FF64', '#3232FF'],
      },
    },
    'summary.json': {
      title: 'Test Artwork',
      artist: 'Test Artist',
      description: 'A comprehensive test artwork for unit testing all API endpoints',
      tags: ['test', 'sample', 'fixture', 'unit-test'],
      created_date: '2024-01-01',
      medium: 'Digital',
      dimensions: '1920x1080px',
      metadata: {
        source: 'test-suite',
        version: 1,
        collection: 'test-collection',
      },
    },
    'analysis-alt.json': {
      processedAt: '2024-01-02T00:00:00Z',
      processor: 'alt-processor',
      version: '2.0.0',
      dimensions: {
        width: 1024,
        height: 768,
      },
      format: 'png',
      colorSpace: 'Adobe RGB',
      quality: 100,
      features: {
        faces: 2,
        objects: ['portrait', 'person'],
        dominant_colors: ['#000000', '#FFFFFF', '#808080'],
      },
    },
    'summary-alt.json': {
      title: 'Alternative Test Artwork',
      artist: 'Another Artist',
      description: 'An alternative test artwork with different metadata',
      tags: ['alternative', 'test2', 'different'],
      created_date: '2024-01-02',
      medium: 'Photography',
      dimensions: '1024x768px',
      metadata: {
        source: 'alt-source',
        version: 2,
        collection: 'alt-collection',
      },
    },
  };

  for (const [filename, content] of Object.entries(jsonFixtures)) {
    const outputPath = path.join(fixturesDir, 'json', filename);
    fs.writeFileSync(outputPath, JSON.stringify(content, null, 2));
    console.log(`Created ${outputPath}`);
  }

  // Generate invalid files for negative testing
  const invalidFiles = {
    'invalid.txt': 'This is not an image file',
    'invalid.json': '{ invalid json }',
    'empty.jpg': '',
  };

  for (const [filename, content] of Object.entries(invalidFiles)) {
    const outputPath = path.join(fixturesDir, 'images', filename);
    fs.writeFileSync(outputPath, content);
    console.log(`Created ${outputPath}`);
  }

  console.log('Test fixtures generated successfully!');
}

// Run if executed directly
if (require.main === module) {
  generateTestImages().catch(console.error);
}

module.exports = { generateTestImages };