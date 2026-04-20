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
      {/* Enhanced Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 to-slate-800 p-8 shadow-xl mb-8 border border-slate-700">
        <div className="absolute right-0 top-0 w-64 h-64 bg-primary/20 blur-3xl rounded-full -mr-20 -mt-20 pointer-events-none"></div>
        <div className="absolute -right-6 -bottom-6 opacity-10 pointer-events-none">
          <Lock className="w-48 h-48 text-white" />
        </div>
        <div className="relative z-10 flex items-center gap-6">
          <div className="p-4 bg-white/10 rounded-2xl shadow-sm border border-white/20 backdrop-blur-md hidden sm:flex">
            <Database className="text-cyan-400 w-10 h-10" />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold font-display tracking-tight text-white">Protected Files</h1>
            <p className="text-slate-300 mt-2 text-base sm:text-lg max-w-2xl">
              Protect important files, control access, and manage shared documents in one place.
            </p>
          </div>
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
            My Files & Sharing
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
