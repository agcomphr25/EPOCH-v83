import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { Factory, User, FileText, TrendingDown, Plus, Settings, Package, FilePenLine, ClipboardList, BarChart, ChevronDown, ChevronRight, FormInput, PieChart, Scan, Warehouse, Shield, Wrench, Users, TestTube, DollarSign, Receipt, TrendingUp, List, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import InstallPWAButton from "./InstallPWAButton";

export default function Navigation() {
  const [location] = useLocation();

  const [verifiedModulesExpanded, setVerifiedModulesExpanded] = useState(false);
  const [formsReportsExpanded, setFormsReportsExpanded] = useState(false);
  const [inventoryExpanded, setInventoryExpanded] = useState(false);
  const [employeesExpanded, setEmployeesExpanded] = useState(false);
  const [qcMaintenanceExpanded, setQcMaintenanceExpanded] = useState(false);
  const [financeExpanded, setFinanceExpanded] = useState(false);

  const navItems = [
    {
      path: '/order-entry',
      label: 'Order Entry',
      icon: Plus,
      description: 'Create single orders'
    },
    {
      path: '/orders-list',
      label: 'All Orders',
      icon: List,
      description: 'View all created orders'
    },
    {
      path: '/draft-orders',
      label: 'Draft Orders',
      icon: FilePenLine,
      description: 'Manage saved draft orders'
    },
    {
      path: '/module8-test',
      label: 'Module 8 Test',
      icon: TestTube,
      description: 'Test API integrations and communications'
    }
    // Documentation button disabled per user request - was causing problems
    // {
    //   path: '/documentation',
    //   label: 'Documentation',
    //   icon: BookOpen,
    //   description: 'Complete system architecture and structure'
    // }

  ];

  const inventoryItems = [
    {
      path: '/inventory/scanner',
      label: 'Inventory Scanner',
      icon: Scan,
      description: 'Scan inventory items'
    },
    {
      path: '/inventory/dashboard',
      label: 'Inventory Dashboard',
      icon: Warehouse,
      description: 'View inventory overview'
    },
    {
      path: '/inventory/manager',
      label: 'Inventory Manager',
      icon: Package,
      description: 'Manage inventory items'
    }
  ];

  const formsReportsItems = [
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
    },
    {
      path: '/enhanced-forms',
      label: 'Enhanced Forms',
      icon: FormInput,
      description: 'Advanced form builder with drag-and-drop'
    },
    {
      path: '/enhanced-reports',
      label: 'Enhanced Reports',
      icon: PieChart,
      description: 'Advanced reporting with PDF/CSV export'
    }
  ];

  const qcMaintenanceItems = [
    {
      path: '/qc',
      label: 'Quality Control',
      icon: Shield,
      description: 'QC inspections and definitions'
    },
    {
      path: '/maintenance',
      label: 'Maintenance',
      icon: Wrench,
      description: 'Preventive maintenance schedules'
    }
  ];

  const employeesItems = [
    {
      path: '/employee-portal',
      label: 'Employee Portal',
      icon: Users,
      description: 'Employee time tracking and onboarding'
    },
    {
      path: '/time-clock-admin',
      label: 'Time Clock Admin',
      icon: Settings,
      description: 'Manage time clock entries and punches'
    }
  ];

  const financeItems = [
    {
      path: '/finance/dashboard',
      label: 'Finance Dashboard',
      icon: BarChart,
      description: 'Financial overview and KPIs'
    },
    {
      path: '/finance/ap',
      label: 'AP Journal',
      icon: Receipt,
      description: 'Accounts Payable transactions'
    },
    {
      path: '/finance/ar',
      label: 'AR Journal',
      icon: DollarSign,
      description: 'Accounts Receivable transactions'
    },
    {
      path: '/finance/cogs',
      label: 'COGS Report',
      icon: TrendingUp,
      description: 'Cost of Goods Sold reporting'
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
  const isFormsReportsActive = formsReportsItems.some(item => location === item.path);
  const isInventoryActive = inventoryItems.some(item => location === item.path);
  const isQcMaintenanceActive = qcMaintenanceItems.some(item => location === item.path);
  const isEmployeesActive = employeesItems.some(item => location === item.path);
  const isFinanceActive = financeItems.some(item => location === item.path);

  // Auto-expand dropdowns when on those pages
  useEffect(() => {
    if (isVerifiedModulesActive) {
      setVerifiedModulesExpanded(true);
    }
    if (isFormsReportsActive) {
      setFormsReportsExpanded(true);
    }
    if (isInventoryActive) {
      setInventoryExpanded(true);
    }
    if (isQcMaintenanceActive) {
      setQcMaintenanceExpanded(true);
    }
    if (isEmployeesActive) {
      setEmployeesExpanded(true);
    }
    if (isFinanceActive) {
      setFinanceExpanded(true);
    }
  }, [isVerifiedModulesActive, isFormsReportsActive, isInventoryActive, isQcMaintenanceActive, isEmployeesActive, isFinanceActive]);

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
            
            {/* Forms & Reports Dropdown */}
            <div className="relative">
              <Button
                variant={isFormsReportsActive ? "default" : "ghost"}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  isFormsReportsActive && "bg-primary text-white"
                )}
                onClick={() => setFormsReportsExpanded(!formsReportsExpanded)}
              >
                <FormInput className="h-4 w-4" />
                Forms & Reports
                {formsReportsExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              
              {formsReportsExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                  {formsReportsItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setFormsReportsExpanded(false)}
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
            
            {/* Inventory Dropdown */}
            <div className="relative">
              <Button
                variant={isInventoryActive ? "default" : "ghost"}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  isInventoryActive && "bg-primary text-white"
                )}
                onClick={() => setInventoryExpanded(!inventoryExpanded)}
              >
                <Package className="h-4 w-4" />
                Inventory
                {inventoryExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              
              {inventoryExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                  {inventoryItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setInventoryExpanded(false)}
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

            {/* QC & Maintenance Dropdown */}
            <div className="relative">
              <Button
                variant={isQcMaintenanceActive ? "default" : "ghost"}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  isQcMaintenanceActive && "bg-primary text-white"
                )}
                onClick={() => setQcMaintenanceExpanded(!qcMaintenanceExpanded)}
              >
                <Shield className="h-4 w-4" />
                QC & Maintenance
                {qcMaintenanceExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              
              {qcMaintenanceExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                  {qcMaintenanceItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setQcMaintenanceExpanded(false)}
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

            {/* Employees Dropdown */}
            <div className="relative">
              <Button
                variant={isEmployeesActive ? "default" : "ghost"}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  isEmployeesActive && "bg-primary text-white"
                )}
                onClick={() => setEmployeesExpanded(!employeesExpanded)}
              >
                <Users className="h-4 w-4" />
                Employees
                {employeesExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              
              {employeesExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                  {employeesItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setEmployeesExpanded(false)}
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

            {/* Finance Dropdown */}
            <div className="relative">
              <Button
                variant={isFinanceActive ? "default" : "ghost"}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  isFinanceActive && "bg-primary text-white"
                )}
                onClick={() => setFinanceExpanded(!financeExpanded)}
              >
                <DollarSign className="h-4 w-4" />
                Finance
                {financeExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              
              {financeExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                  {financeItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setFinanceExpanded(false)}
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
            <InstallPWAButton />
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
            
            {/* Forms & Reports in Mobile */}
            <div className="relative">
              <Button
                variant={isFormsReportsActive ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "flex items-center gap-2 text-xs",
                  isFormsReportsActive && "bg-primary text-white"
                )}
                onClick={() => setFormsReportsExpanded(!formsReportsExpanded)}
              >
                <FormInput className="h-3 w-3" />
                Forms & Reports
                {formsReportsExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
              
              {formsReportsExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[150px]">
                  {formsReportsItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setFormsReportsExpanded(false)}
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