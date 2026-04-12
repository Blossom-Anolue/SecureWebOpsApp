import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Shield, Lock, FileUp, Database } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PDFEncryption from './PDFEncryption';
import PDFDecryptionDownload from './PDFDecryptionDownload';

export default function SecureVault() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('vault');

  // Set default tab based on URL path
  useEffect(() => {
    if (location.pathname === '/encrypt') {
      setActiveTab('encrypt');
    } else {
      setActiveTab('vault');
    }
  }, [location.pathname]);

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    // Optionally push state to URL so back button works, or just keep it purely stateful
    navigate(val === 'encrypt' ? '/encrypt' : '/vault', { replace: true });
  };

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4 border-b pb-6 mb-6">
        <div className="p-4 bg-primary/10 rounded-2xl shadow-sm border border-primary/20">
          <Database className="text-primary w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-slate-900 dark:text-white">Secure Data Vault</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Encrypt sensitive files with AES-256-GCM and manage your secure documents.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl mb-8">
          <TabsTrigger 
            value="encrypt"
            className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary font-medium transition-all"
          >
            <FileUp className="w-4 h-4 mr-2" />
            Encrypt New File
          </TabsTrigger>
          <TabsTrigger 
            value="vault" 
            className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary font-medium transition-all"
          >
            <Lock className="w-4 h-4 mr-2" />
            My Vault & Sharing
          </TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="encrypt" className="m-0 focus-visible:outline-none">
            <PDFEncryption />
          </TabsContent>

          <TabsContent value="vault" className="m-0 focus-visible:outline-none">
            <PDFDecryptionDownload />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
