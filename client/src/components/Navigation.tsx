import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { Factory, User, FileText, TrendingDown, Plus, Settings, Package, FilePenLine, ClipboardList, BarChart, ChevronDown, ChevronRight, FormInput, PieChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Navigation() {
  const [location] = useLocation();

  const [verifiedModulesExpanded, setVerifiedModulesExpanded] = useState(false);

  const navItems = [
    {
      path: '/order-entry',
      label: 'Order Entry',
      icon: Plus,
      description: 'Create single orders'
    },
    {
      path: '/draft-orders',
      label: 'Draft Orders',
      icon: FilePenLine,
      description: 'Manage saved draft orders'
    },
    {
      path: '/admin/forms',
      label: 'Form Builder',
      icon: FormInput,
      description: 'Build and manage forms'
    },
    {
      path: '/admin/reports',
      label: 'Reports',
      icon: PieChart,
      description: 'View form submissions and reports'
    }
  ];

  const verifiedModulesItems = [
    {
      path: '/',
      label: 'Order Management',
      icon: FileText,
      description: 'View orders and import historical data'
    },
    {
      path: '/discounts',
      label: 'Discount Management',
      icon: TrendingDown,
      description: 'Configure discounts and sales'
    },
    {
      path: '/feature-manager',
      label: 'Feature Manager',
      icon: Settings,
      description: 'Configure order features'
    },
    {
      path: '/stock-models',
      label: 'Stock Models',
      icon: Package,
      description: 'Manage stock models and pricing'
    }
  ];

  const isVerifiedModulesActive = verifiedModulesItems.some(item => location === item.path);

  // Auto-expand Verified Modules when on those pages
  useEffect(() => {
    if (isVerifiedModulesActive) {
      setVerifiedModulesExpanded(true);
    }
  }, [isVerifiedModulesActive]);

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center">
            <Factory className="h-6 w-6 text-primary mr-3" />
            <h1 className="text-xl font-semibold text-gray-900">EPOCH v8</h1>
          </div>
          
          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              
              return (
                <Link key={item.path} href={item.path}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    className={cn(
                      "flex items-center gap-2 text-sm",
                      isActive && "bg-primary text-white"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
            
            {/* Verified Modules Dropdown */}
            <div className="relative">
              <Button
                variant={isVerifiedModulesActive ? "default" : "ghost"}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  isVerifiedModulesActive && "bg-primary text-white"
                )}
                onClick={() => setVerifiedModulesExpanded(!verifiedModulesExpanded)}
              >
                <Settings className="h-4 w-4" />
                Verified Modules
                {verifiedModulesExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              
              {verifiedModulesExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                  {verifiedModulesItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setVerifiedModulesExpanded(false)}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
            

          </nav>

          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">Manufacturing ERP System</span>
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <User className="h-4 w-4 text-white" />
            </div>
          </div>
        </div>
      </div>
      
      {/* Mobile Navigation */}
      <div className="md:hidden border-t border-gray-200">
        <div className="px-4 py-2">
          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              
              return (
                <Link key={item.path} href={item.path}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    size="sm"
                    className={cn(
                      "flex items-center gap-2 text-xs",
                      isActive && "bg-primary text-white"
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
            
            {/* Verified Modules in Mobile */}
            <div className="relative">
              <Button
                variant={isVerifiedModulesActive ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "flex items-center gap-2 text-xs",
                  isVerifiedModulesActive && "bg-primary text-white"
                )}
                onClick={() => setVerifiedModulesExpanded(!verifiedModulesExpanded)}
              >
                <Settings className="h-3 w-3" />
                Verified Modules
                {verifiedModulesExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
              
              {verifiedModulesExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[150px]">
                  {verifiedModulesItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setVerifiedModulesExpanded(false)}
                        >
                          <Icon className="h-3 w-3" />
                          {item.label}
                        </button>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
            

          </nav>
        </div>
      </div>
    </header>
  );
}