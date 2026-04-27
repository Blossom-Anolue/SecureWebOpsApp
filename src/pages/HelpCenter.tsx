import { useState } from 'react';
import { Mail, Book, FileText, LifeBuoy, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SupportModal } from '@/components/common/SupportModal';

export default function HelpCenter() {
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);

  return (
    <div className="space-y-6 pb-20 lg:pb-0 w-full animate-in fade-in duration-300">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent p-6 md:p-8 border border-indigo-500/10">
        <div className="absolute -right-6 -top-6 opacity-10 pointer-events-none">
          <LifeBuoy className="w-32 h-32 text-indigo-600" />
        </div>
        <div className="relative z-10">
          <h1 className="text-3xl lg:text-4xl font-bold font-display text-slate-900 dark:text-white">Help Center</h1>
          <p className="text-muted-foreground mt-2 text-lg max-w-2xl">
            Check our guides, read documentation, or get in touch with our support team.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Guides and Documentation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Book className="w-5 h-5 text-primary" />
              Guides & Documentation
            </CardTitle>
            <CardDescription>Learn how to use SecureWebOps effectively to protect your business.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <a href="#" className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-md"><FileText className="w-4 h-4 text-primary" /></div>
                  <span className="font-medium text-sm group-hover:text-primary transition-colors">Getting Started Guide</span>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </a>
              <a href="#" className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-md"><FileText className="w-4 h-4 text-primary" /></div>
                  <span className="font-medium text-sm group-hover:text-primary transition-colors">How to Encrypt and Share Files</span>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </a>
              <a href="#" className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-md"><FileText className="w-4 h-4 text-primary" /></div>
                  <span className="font-medium text-sm group-hover:text-primary transition-colors">Understanding Vulnerability Scans</span>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Contact Support */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              Contact Support
            </CardTitle>
            <CardDescription>Need help with something else? Our support team is here for you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-xl border bg-slate-50 dark:bg-slate-900/50 p-6 text-center space-y-3">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">Email Support</h3>
              <p className="text-sm text-muted-foreground">
                Send us an email and we'll get back to you as soon as possible. Typical response time is within 24 hours.
              </p>
              <Button className="w-full mt-4" onClick={() => setIsSupportModalOpen(true)}>
                <Mail className="w-4 h-4 mr-2" />
                Contact Support
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <SupportModal 
        isOpen={isSupportModalOpen} 
        onClose={() => setIsSupportModalOpen(false)} 
      />
    </div>
  );
}