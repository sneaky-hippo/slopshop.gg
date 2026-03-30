'use strict';

// New tools added 2026-03-31: Vision, Vertical Domains, Memory 2.0
module.exports = {
  NEW_DEFS: {

    // =========================================================================
    // VISION & MEDIA TOOLS
    // =========================================================================

    'vision-base64-info': {
      cat: 'Vision',
      name: 'Base64 Image Info',
      desc: 'Decode a base64 data URI and return image metadata: format, size in bytes, dimensions estimate, and MIME type.',
      credits: 1,
      tier: 'compute'
    },

    'vision-extract-text': {
      cat: 'Vision',
      name: 'Extract Text from Image (OCR)',
      desc: 'Extract printable text runs from a base64-encoded image using heuristic OCR. Returns text blocks with positions.',
      credits: 2,
      tier: 'compute'
    },

    'vision-image-hash': {
      cat: 'Vision',
      name: 'Image Perceptual Hash',
      desc: 'Generate a perceptual hash (pHash) of a base64-encoded image for duplicate/similarity detection.',
      credits: 1,
      tier: 'compute'
    },

    'vision-screenshot-diff': {
      cat: 'Vision',
      name: 'Screenshot Pixel Diff',
      desc: 'Compare two base64-encoded screenshots pixel-by-pixel. Returns diff percentage and changed region summary.',
      credits: 2,
      tier: 'compute'
    },

    'vision-metadata-strip': {
      cat: 'Vision',
      name: 'Strip Image Metadata',
      desc: 'Remove EXIF and other metadata from a base64-encoded image, returning a clean version safe for sharing.',
      credits: 1,
      tier: 'compute'
    },

    'gen-qr-text': {
      cat: 'Vision',
      name: 'QR Code (Text)',
      desc: 'Generate a text-art QR code representation for any URL or string payload.',
      credits: 1,
      tier: 'compute'
    },

    'vision-color-palette': {
      cat: 'Vision',
      name: 'Extract Color Palette',
      desc: 'Extract dominant colors from a base64-encoded image. Returns hex colors with frequency percentages.',
      credits: 2,
      tier: 'compute'
    },

    'vision-text-boxes': {
      cat: 'Vision',
      name: 'Detect Text Bounding Boxes',
      desc: 'Detect regions in a base64-encoded image that likely contain text. Returns bounding box coordinates.',
      credits: 2,
      tier: 'compute'
    },

    'audio-duration-estimate': {
      cat: 'Vision',
      name: 'Audio Duration Estimate',
      desc: 'Estimate audio duration from a base64-encoded audio file by reading header bytes. Supports WAV, MP3, OGG.',
      credits: 1,
      tier: 'compute'
    },

    'file-magic-detect': {
      cat: 'Vision',
      name: 'File Magic Byte Detection',
      desc: 'Detect the true file type of a base64-encoded file using magic byte signatures. Returns MIME type and format.',
      credits: 1,
      tier: 'compute'
    },

    'data-uri-parse': {
      cat: 'Vision',
      name: 'Parse Data URI',
      desc: 'Parse a data URI string into its components: MIME type, encoding, and raw data. Validates the format.',
      credits: 0,
      tier: 'compute'
    },

    'data-uri-create': {
      cat: 'Vision',
      name: 'Create Data URI',
      desc: 'Create a valid data URI from raw bytes (hex or base64) and a MIME type.',
      credits: 0,
      tier: 'compute'
    },

    // =========================================================================
    // FINANCE VERTICAL
    // =========================================================================

    'finance-compound-interest': {
      cat: 'Finance',
      name: 'Compound Interest Calculator',
      desc: 'Calculate compound interest with principal, rate, time, and compounding frequency. Returns final amount, interest earned, and growth chart.',
      credits: 1,
      tier: 'compute'
    },

    'finance-mortgage-calc': {
      cat: 'Finance',
      name: 'Mortgage Calculator',
      desc: 'Calculate monthly mortgage payments, total interest, and full amortization schedule given principal, rate, and term.',
      credits: 1,
      tier: 'compute'
    },

    'finance-dcf-simple': {
      cat: 'Finance',
      name: 'Discounted Cash Flow (DCF)',
      desc: 'Simple DCF valuation: discount a series of future cash flows to present value using a given discount rate.',
      credits: 1,
      tier: 'compute'
    },

    'finance-portfolio-return': {
      cat: 'Finance',
      name: 'Portfolio Return Calculator',
      desc: 'Calculate weighted portfolio return, volatility, Sharpe ratio, and max drawdown from a list of asset returns and weights.',
      credits: 2,
      tier: 'compute'
    },

    'finance-risk-score': {
      cat: 'Finance',
      name: 'Financial Risk Score',
      desc: 'Score financial risk (0-100) based on debt ratio, current ratio, interest coverage, and revenue growth inputs.',
      credits: 1,
      tier: 'compute'
    },

    // =========================================================================
    // DEVOPS VERTICAL
    // =========================================================================

    'devops-docker-analyze': {
      cat: 'DevOps',
      name: 'Dockerfile Analyzer',
      desc: 'Analyze a Dockerfile for best-practice violations, security issues, and optimization opportunities.',
      credits: 2,
      tier: 'compute'
    },

    'devops-k8s-validate': {
      cat: 'DevOps',
      name: 'Kubernetes Manifest Validator',
      desc: 'Validate a Kubernetes YAML manifest for common misconfigurations, missing required fields, and security issues.',
      credits: 2,
      tier: 'compute'
    },

    'devops-semver-bump': {
      cat: 'DevOps',
      name: 'Semantic Version Bump',
      desc: 'Bump a semver version string by major, minor, or patch. Supports pre-release and build metadata.',
      credits: 0,
      tier: 'compute'
    },

    'devops-log-parse': {
      cat: 'DevOps',
      name: 'Log Parser',
      desc: 'Parse structured or unstructured log lines. Extracts timestamp, level, message, and key-value fields. Supports JSON, logfmt, and common log formats.',
      credits: 1,
      tier: 'compute'
    },

    'devops-env-validate': {
      cat: 'DevOps',
      name: 'Environment Variable Validator',
      desc: 'Validate a set of environment variables against a schema of required keys, types, and format patterns.',
      credits: 1,
      tier: 'compute'
    },

    // =========================================================================
    // LEGAL VERTICAL
    // =========================================================================

    'legal-contract-scan': {
      cat: 'Legal',
      name: 'Contract Risk Scanner',
      desc: 'Scan contract text for risky clauses: unlimited liability, auto-renewal traps, unilateral modification, non-compete overreach, and IP assignment issues.',
      credits: 3,
      tier: 'compute'
    },

    'legal-gdpr-scan': {
      cat: 'Legal',
      name: 'GDPR Compliance Scanner',
      desc: 'Scan a privacy policy or data handling document for GDPR compliance gaps. Returns findings with severity and remediation hints.',
      credits: 3,
      tier: 'compute'
    },

    // =========================================================================
    // HEALTHCARE VERTICAL
    // =========================================================================

    'health-bmi-calc': {
      cat: 'Health',
      name: 'BMI Calculator',
      desc: 'Calculate Body Mass Index from height and weight. Returns BMI score, category, and healthy weight range.',
      credits: 0,
      tier: 'compute'
    },

    'health-medication-schedule': {
      cat: 'Health',
      name: 'Medication Schedule Generator',
      desc: 'Generate a medication schedule with dose times, reminders, and interaction warnings for a list of medications.',
      credits: 2,
      tier: 'compute'
    },

    // =========================================================================
    // MARKETING VERTICAL
    // =========================================================================

    'marketing-headline-score': {
      cat: 'Marketing',
      name: 'Headline Scorer',
      desc: 'Score a marketing headline (0-100) for emotional impact, power words, clarity, length, and curiosity. Returns improvement suggestions.',
      credits: 1,
      tier: 'compute'
    },

    'marketing-ab-test-calc': {
      cat: 'Marketing',
      name: 'A/B Test Calculator',
      desc: 'Calculate statistical significance of an A/B test. Returns p-value, confidence interval, relative uplift, and sample size recommendation.',
      credits: 1,
      tier: 'compute'
    },

    'seo-keyword-density': {
      cat: 'Marketing',
      name: 'SEO Keyword Density',
      desc: 'Analyze keyword density in text content. Returns top keywords, density percentages, TF-IDF scores, and LSI keyword suggestions.',
      credits: 1,
      tier: 'compute'
    },

    // =========================================================================
    // MEMORY 2.0 TOOLS
    // =========================================================================

    'memory-score-update': {
      cat: 'Memory',
      name: 'Memory Score Update',
      desc: 'Update the quality/reliability score of a memory key based on an outcome signal (success, failure, neutral). Used for adaptive memory weighting.',
      credits: 1,
      tier: 'compute'
    },

    'memory-score-get': {
      cat: 'Memory',
      name: 'Memory Score Get',
      desc: 'Retrieve the current quality score and signal history for a memory key.',
      credits: 0,
      tier: 'compute'
    },

    'memory-drift-detect': {
      cat: 'Memory',
      name: 'Memory Drift Detector',
      desc: 'Detect semantic drift between the current value of a memory key and its historical versions. Returns drift score and changed fields.',
      credits: 2,
      tier: 'compute'
    },

    'memory-cluster': {
      cat: 'Memory',
      name: 'Memory Cluster',
      desc: 'Cluster a list of memory keys by semantic similarity using TF-IDF vectors. Returns cluster assignments and centroids.',
      credits: 3,
      tier: 'compute'
    },

    'memory-knowledge-graph': {
      cat: 'Memory',
      name: 'Memory Knowledge Graph',
      desc: 'Build a knowledge graph from memory keys: extract entities, relations, and triplets. Returns nodes and edges for visualization.',
      credits: 3,
      tier: 'compute'
    },

    'memory-timeline': {
      cat: 'Memory',
      name: 'Memory Timeline',
      desc: 'Generate a chronological timeline of memory events for a namespace. Returns events sorted by timestamp with value diffs.',
      credits: 2,
      tier: 'compute'
    },

    'memory-importance-rank': {
      cat: 'Memory',
      name: 'Memory Importance Rank',
      desc: 'Rank memory keys by importance using access frequency, recency, score, and content richness. Returns sorted list with importance scores.',
      credits: 2,
      tier: 'compute'
    },

  }
};
