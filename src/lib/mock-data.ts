import type { Scan, PhishingCheck, SecurityScore, Recommendation, TrainingLesson, PhishingSimulation } from '@/types';

export const mockSecurityScore: SecurityScore = {
  current: 72,
  previous: 65,
  tier: 'at-risk',
  lastScanDate: '2024-01-15T10:30:00Z',
  nextScanDate: '2024-01-22T10:30:00Z',
  trend: [
    { date: '2024-01-01', score: 58 },
    { date: '2024-01-05', score: 62 },
    { date: '2024-01-08', score: 65 },
    { date: '2024-01-12', score: 68 },
    { date: '2024-01-15', score: 72 },
  ],
};

export const mockRecommendations: Recommendation[] = [
  {
    id: '1',
    title: 'Enable two-factor authentication',
    description: 'Add an extra layer of security to your login pages by requiring a second verification step.',
    priority: 'high',
    category: 'Authentication',
  },
  {
    id: '2',
    title: 'Update your SSL certificate',
    description: 'Your SSL certificate expires in 30 days. Renew it to keep your website secure.',
    priority: 'medium',
    category: 'Encryption',
  },
  {
    id: '3',
    title: 'Review user access permissions',
    description: 'Some team members have more access than they need. Review and adjust permissions.',
    priority: 'low',
    category: 'Access Control',
  },
];

export const mockScans: Scan[] = [
  {
    id: '1',
    domain: 'mybusiness.com',
    type: 'full',
    status: 'completed',
    startedAt: '2024-01-15T10:30:00Z',
    completedAt: '2024-01-15T10:45:00Z',
    score: 72,
    summary: { critical: 1, high: 2, medium: 3, low: 5 },
    issues: [
      {
        id: 'issue-1',
        title: 'Login page allows unlimited attempts',
        severity: 'critical',
        category: 'Authentication',
        owaspCategory: 'A07:2021 - Identification and Authentication Failures',
        description: 'Your login page doesn\'t limit how many times someone can try to guess a password.',
        businessImpact: 'Attackers could try thousands of password combinations to break into accounts.',
        recommendation: 'Add a limit of 5 login attempts, then require a waiting period or CAPTCHA.',
        technicalDetails: 'Implement rate limiting on the /login endpoint. Consider using fail2ban or similar tools.',
      },
      {
        id: 'issue-2',
        title: 'Contact form missing spam protection',
        severity: 'high',
        category: 'Input Validation',
        owaspCategory: 'A03:2021 - Injection',
        description: 'Your contact form doesn\'t verify that submissions come from real people.',
        businessImpact: 'Spammers could flood your inbox or use your form to send malicious messages.',
        recommendation: 'Add a CAPTCHA or honeypot field to your contact form.',
      },
      {
        id: 'issue-3',
        title: 'Some cookies missing security flags',
        severity: 'medium',
        category: 'Session Management',
        owaspCategory: 'A02:2021 - Cryptographic Failures',
        description: 'Some of your website cookies could be accessed by malicious scripts.',
        businessImpact: 'User sessions could potentially be hijacked if other vulnerabilities exist.',
        recommendation: 'Add HttpOnly and Secure flags to all session cookies.',
      },
    ],
  },
  {
    id: '2',
    domain: 'shop.mybusiness.com',
    type: 'quick',
    status: 'completed',
    startedAt: '2024-01-14T14:00:00Z',
    completedAt: '2024-01-14T14:10:00Z',
    score: 85,
    summary: { critical: 0, high: 1, medium: 2, low: 3 },
    issues: [],
  },
  {
    id: '3',
    domain: 'mybusiness.com',
    type: 'quick',
    status: 'running',
    startedAt: '2024-01-16T09:00:00Z',
    summary: { critical: 0, high: 0, medium: 0, low: 0 },
    issues: [],
  },
];

export const mockPhishingChecks: PhishingCheck[] = [
  {
    id: '1',
    type: 'email',
    content: 'URGENT: Your account has been compromised. Click here immediately to verify your identity...',
    subject: 'URGENT: Account Security Alert',
    from: 'security@bankofamerica-secure.net',
    checkedAt: '2024-01-15T14:30:00Z',
    riskLevel: 'high',
    verdict: 'Very likely a phishing attempt',
    redFlags: [
      { id: '1', title: 'Suspicious sender domain', description: 'The email is from "bankofamerica-secure.net" not the real Bank of America domain.', severity: 'high' },
      { id: '2', title: 'Urgent language', description: 'Uses pressure tactics like "URGENT" and "immediately" to make you act without thinking.', severity: 'high' },
      { id: '3', title: 'Requests sensitive action', description: 'Asks you to click a link to "verify your identity" - a common phishing tactic.', severity: 'medium' },
    ],
  },
  {
    id: '2',
    type: 'link',
    content: 'https://paypa1.com/verify-account',
    checkedAt: '2024-01-14T11:20:00Z',
    riskLevel: 'high',
    verdict: 'This is a fake website designed to steal your PayPal login',
    redFlags: [
      { id: '1', title: 'Lookalike domain', description: 'Uses "paypa1.com" (with number 1) instead of "paypal.com" - a common trick.', severity: 'high' },
      { id: '2', title: 'Requests account verification', description: 'Legitimate services rarely ask you to verify via random links.', severity: 'medium' },
    ],
  },
  {
    id: '3',
    type: 'email',
    content: 'Hi, just following up on our meeting yesterday. Here are the notes we discussed...',
    subject: 'Meeting Notes - Project Update',
    from: 'colleague@company.com',
    checkedAt: '2024-01-13T09:15:00Z',
    riskLevel: 'low',
    verdict: 'Appears to be a legitimate email',
    redFlags: [],
  },
];

export const mockTrainingLessons: TrainingLesson[] = [
  {
    id: '1',
    title: 'Spotting Phishing Emails',
    description: 'Learn the common signs of phishing emails and how to protect yourself.',
    duration: '5 min',
    completed: true,
    category: 'Email Security',
  },
  {
    id: '2',
    title: 'Creating Strong Passwords',
    description: 'Best practices for creating and managing secure passwords.',
    duration: '4 min',
    completed: true,
    category: 'Password Security',
  },
  {
    id: '3',
    title: 'Safe Web Browsing',
    description: 'How to identify suspicious websites and browse safely.',
    duration: '6 min',
    completed: false,
    category: 'Web Security',
  },
  {
    id: '4',
    title: 'Handling Sensitive Data',
    description: 'Guidelines for protecting customer and business information.',
    duration: '8 min',
    completed: false,
    category: 'Data Protection',
  },
];

export const mockSimulations: PhishingSimulation[] = [
  {
    id: '1',
    name: 'Q1 Security Test',
    template: 'Fake Delivery Notice',
    status: 'completed',
    scheduledFor: '2024-01-10T09:00:00Z',
    recipients: 25,
    clickRate: 12,
  },
  {
    id: '2',
    name: 'February Test',
    template: 'Fake Password Reset',
    status: 'scheduled',
    scheduledFor: '2024-02-01T09:00:00Z',
    recipients: 30,
  },
];
