/**
 * @fileoverview Home Page / Landing Page
 * 
 * This is the public-facing landing page for SecureWebOps.
 * It introduces the product to potential users and encourages
 * them to sign up or sign in.
 * 
 * The page is designed for small business owners who are not
 * security experts - emphasizing simplicity and plain language.
 * 
 * Sections:
 * - Hero: Main value proposition
 * - Trust Indicators: Quick stats about the service
 * - Features: Core product capabilities
 * - Benefits: Why choose SecureWebOps
 * - CTA: Call to action to sign up
 * - Footer: Basic branding
 * 
 * @module pages/Home
 */

import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { 
  Shield, 
  Mail, 
  BarChart3, 
  Users, 
  CheckCircle2, 
  ArrowRight,
  Lock,
  Zap,
  Eye
} from 'lucide-react';

// ============================================================================
// DATA
// ============================================================================

/**
 * Core product features displayed in the features section.
 * Each feature explains a key capability in plain language.
 */
const features = [
  {
    icon: Shield,
    title: 'Website Security Scans',
    description: 'AI-powered vulnerability detection that checks your website against OWASP Top 10 threats in plain language.',
  },
  {
    icon: Mail,
    title: 'Phishing Detection',
    description: 'Paste any suspicious email or link and get an instant risk assessment with clear explanations.',
  },
  {
    icon: BarChart3,
    title: 'Security Score',
    description: 'See your overall security health at a glance with a simple 0-100 score and actionable recommendations.',
  },
  {
    icon: Users,
    title: 'Team Management',
    description: 'Invite your team, assign roles, and keep everyone informed about your security status.',
  },
];

/**
 * Key benefits/selling points displayed as a checklist.
 * Focuses on what matters to small business owners.
 */
const benefits = [
  'No technical expertise required',
  'Results in plain English, not jargon',
  'Actionable recommendations you can follow',
  'Affordable for small businesses',
  'Email alerts for critical issues',
  'Track your security over time',
];

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Home page component - the public landing page.
 * 
 * This page is accessible to all visitors (no auth required).
 * It serves as the marketing/conversion page for the product.
 * 
 * @returns The rendered home page
 */
export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================== */}
      {/* HEADER - Sticky navigation with logo and auth links */}
      {/* ================================================================== */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo and brand name */}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">SecureWebOps</span>
          </Link>
          
          {/* Navigation actions */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button variant="ghost" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button asChild>
              <Link to="/auth">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ================================================================== */}
      {/* HERO SECTION - Main value proposition */}
      {/* ================================================================== */}
      <section className="relative overflow-hidden">
        {/* Background gradient for visual interest */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
        <div className="container mx-auto px-4 py-24 md:py-32 relative">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            {/* Badge/tagline */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
              <Lock className="w-4 h-4" />
              Simple security for small businesses
            </div>
            
            {/* Main headline */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
              Know if your business is{' '}
              <span className="text-primary">protected</span>
            </h1>
            
            {/* Supporting copy */}
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              SecureWebOps scans your website and emails for security threats, then tells you exactly what to do about them — in plain English, not tech jargon.
            </p>
            
            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button size="lg" asChild className="text-base">
                <Link to="/auth">
                  Start Free Scan
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="text-base">
                <Link to="/auth">See Demo</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* TRUST INDICATORS - Quick stats/features strip */}
      {/* ================================================================== */}
      <section className="border-y bg-muted/30">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16 text-muted-foreground">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">Scans in under 60 seconds</span>
            </div>
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">OWASP Top 10 coverage</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">AI-powered analysis</span>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* FEATURES SECTION - Core product capabilities */}
      {/* ================================================================== */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          {/* Section header */}
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything you need to stay safe
            </h2>
            <p className="text-muted-foreground text-lg">
              No security expertise required. We translate complex threats into simple action items.
            </p>
          </div>
          
          {/* Feature cards grid */}
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {features.map((feature) => (
              <Card key={feature.title} variant="interactive" className="group">
                <CardContent className="p-6">
                  {/* Feature icon */}
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  {/* Feature title and description */}
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* BENEFITS SECTION - Why choose SecureWebOps */}
      {/* ================================================================== */}
      <section className="py-20 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
            {/* Left column: Text content */}
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Built for busy business owners
              </h2>
              <p className="text-muted-foreground text-lg mb-8">
                You didn't start a business to become a cybersecurity expert. SecureWebOps handles the technical stuff so you can focus on what matters.
              </p>
              
              {/* Benefits checklist */}
              <ul className="space-y-4">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            {/* Right column: Score preview card */}
            <Card className="p-6 md:p-8">
              <div className="space-y-6">
                {/* Score header */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Your Security Score</span>
                  <span className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-1 rounded">Good</span>
                </div>
                {/* Large score display */}
                <div className="text-center">
                  <div className="text-6xl md:text-7xl font-bold text-primary">85</div>
                  <div className="text-muted-foreground mt-1">out of 100</div>
                </div>
                {/* Score breakdown */}
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <span>SSL Certificate</span>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Security Headers</span>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Content Security</span>
                    <span className="text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 px-2 py-0.5 rounded">1 issue</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* CTA SECTION - Final call to action */}
      {/* ================================================================== */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          <Card className="max-w-3xl mx-auto bg-primary text-primary-foreground">
            <CardContent className="p-8 md:p-12 text-center">
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                Find out if your business is protected
              </h2>
              <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">
                Get your first security scan free. No credit card required. Results in under a minute.
              </p>
              <Button size="lg" variant="secondary" asChild>
                <Link to="/auth">
                  Get Started Free
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ================================================================== */}
      {/* FOOTER - Basic branding and copyright */}
      {/* ================================================================== */}
      <footer className="border-t py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Shield className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">SecureWebOps</span>
            </div>
            {/* Copyright */}
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} SecureWebOps. Simple security for small businesses.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
