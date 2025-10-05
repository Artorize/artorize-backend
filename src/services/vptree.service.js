/**
 * Vantage Point Tree (VP-Tree) implementation for fast Hamming distance search
 *
 * VP-Tree is a metric tree that organizes data points based on their distances.
 * For Hamming distance searches, it provides O(log n) average-case complexity
 * instead of O(n) linear scans.
 *
 * Key advantages:
 * - Finds all matches within threshold (no false negatives)
 * - Dramatically faster for large datasets (10,000+ items)
 * - Works perfectly with Hamming distance metric
 */

const { calculateHammingDistance } = require('./similarity-search.service');

/**
 * VP-Tree node structure
 */
class VPNode {
  constructor(point, threshold, left = null, right = null) {
    this.point = point;        // { hash: bigint, artworkId: ObjectId }
    this.threshold = threshold; // Median distance to split left/right
    this.left = left;           // Points closer than threshold
    this.right = right;         // Points farther than threshold
  }
}

/**
 * VP-Tree class for efficient nearest neighbor search
 */
class VPTree {
  constructor() {
    this.root = null;
    this.size = 0;
  }

  /**
   * Builds the VP-Tree from an array of hash points
   * @param {Array} points - Array of { hash: bigint, artworkId: ObjectId, ...metadata }
   */
  build(points) {
    if (!points || points.length === 0) {
      this.root = null;
      this.size = 0;
      return;
    }

    this.size = points.length;
    this.root = this._buildRecursive(points);
  }

  /**
   * Recursively builds the tree
   * @private
   */
  _buildRecursive(points) {
    if (points.length === 0) return null;
    if (points.length === 1) return new VPNode(points[0], 0, null, null);

    // Select vantage point (use first point for simplicity, could randomize)
    const vantagePoint = points[0];
    const others = points.slice(1);

    // Calculate distances from vantage point to all other points
    const distances = others.map(p => ({
      point: p,
      distance: calculateHammingDistance(vantagePoint.hash, p.hash),
    }));

    // Find median distance
    distances.sort((a, b) => a.distance - b.distance);
    const medianIdx = Math.floor(distances.length / 2);
    const medianDistance = distances[medianIdx].distance;

    // Split into near (left) and far (right) sets
    const nearPoints = distances
      .slice(0, medianIdx + 1)
      .map(d => d.point);
    const farPoints = distances
      .slice(medianIdx + 1)
      .map(d => d.point);

    // Recursively build subtrees
    return new VPNode(
      vantagePoint,
      medianDistance,
      this._buildRecursive(nearPoints),
      this._buildRecursive(farPoints)
    );
  }

  /**
   * Searches for all points within maxDistance from query hash
   * @param {bigint} queryHash - Hash to search for
   * @param {number} maxDistance - Maximum Hamming distance threshold
   * @returns {Array} Array of matching points
   */
  search(queryHash, maxDistance) {
    const results = [];
    this._searchRecursive(this.root, queryHash, maxDistance, results);
    return results;
  }

  /**
   * Recursive search implementation
   * @private
   */
  _searchRecursive(node, queryHash, maxDistance, results) {
    if (!node) return;

    // Calculate distance from query to current node
    const distance = calculateHammingDistance(queryHash, node.point.hash);

    // If within threshold, add to results
    if (distance <= maxDistance) {
      results.push({
        ...node.point,
        distance,
      });
    }

    // Determine which subtrees to search using triangle inequality
    // If distance to vantage point is d, and threshold is tau:
    // - Search left if: d - maxDistance <= tau
    // - Search right if: d + maxDistance >= tau

    if (node.left && distance - maxDistance <= node.threshold) {
      this._searchRecursive(node.left, queryHash, maxDistance, results);
    }

    if (node.right && distance + maxDistance >= node.threshold) {
      this._searchRecursive(node.right, queryHash, maxDistance, results);
    }
  }

  /**
   * Returns the size of the tree
   */
  getSize() {
    return this.size;
  }

  /**
   * Checks if tree is built
   */
  isBuilt() {
    return this.root !== null;
  }
}

/**
 * In-memory cache of VP-Trees for each hash type
 */
class VPTreeCache {
  constructor() {
    this.trees = new Map(); // hashType -> VPTree
    this.lastBuilt = new Map(); // hashType -> timestamp
    this.buildInProgress = new Set(); // hashType set
  }

  /**
   * Gets or builds a VP-Tree for a specific hash type
   * @param {string} hashType - Type of hash (e.g., 'perceptual_hash')
   * @param {Function} dataFetcher - Async function that returns array of hash points
   * @param {number} ttl - Time to live in milliseconds (default: 10 minutes)
   */
  async getOrBuild(hashType, dataFetcher, ttl = 10 * 60 * 1000) {
    const now = Date.now();
    const lastBuiltTime = this.lastBuilt.get(hashType);

    // Check if we have a valid cached tree
    if (this.trees.has(hashType) && lastBuiltTime && now - lastBuiltTime < ttl) {
      return this.trees.get(hashType);
    }

    // Prevent multiple simultaneous builds
    if (this.buildInProgress.has(hashType)) {
      // Wait a bit and retry
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.getOrBuild(hashType, dataFetcher, ttl);
    }

    // Build new tree
    this.buildInProgress.add(hashType);
    try {
      const points = await dataFetcher(hashType);
      const tree = new VPTree();
      tree.build(points);

      this.trees.set(hashType, tree);
      this.lastBuilt.set(hashType, now);

      return tree;
    } finally {
      this.buildInProgress.delete(hashType);
    }
  }

  /**
   * Invalidates cache for a specific hash type or all
   */
  invalidate(hashType = null) {
    if (hashType) {
      this.trees.delete(hashType);
      this.lastBuilt.delete(hashType);
    } else {
      this.trees.clear();
      this.lastBuilt.clear();
    }
  }

  /**
   * Gets cache statistics
   */
  getStats() {
    const stats = {};
    for (const [hashType, tree] of this.trees.entries()) {
      stats[hashType] = {
        size: tree.getSize(),
        lastBuilt: this.lastBuilt.get(hashType),
        age: Date.now() - (this.lastBuilt.get(hashType) || 0),
      };
    }
    return stats;
  }
}

// Global cache instance
const vpTreeCache = new VPTreeCache();

module.exports = {
  VPTree,
  VPNode,
  VPTreeCache,
  vpTreeCache,
};
