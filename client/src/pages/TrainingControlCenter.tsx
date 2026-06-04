import { useState } from 'react';
import { Link } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { 
  GraduationCap, 
  LayoutGrid, 
  Settings, 
  Users,
  CheckCircle,
  AlertCircle,
  UserCheck,
  BookOpen,
  Wrench
} from 'lucide-react';

import Training from './Training';
import TrainingMatrixView from './TrainingMatrixView';
import TrainingManagement from './TrainingManagement';
import TrainingMatrixManage from './TrainingMatrixManage';
import TrainTheTrainer from './TrainTheTrainer';
import TrainingContentLibrary from './TrainingContentLibrary';

interface TrainingStats {
  totalModules: number;
  activeEmployees: number;
  completedThisMonth: number;
  pendingAssignments: number;
  overdueCount: number;
}

type Language = 'en' | 'es';
type TrainingTab = 'modules' | 'library' | 'matrix' | 'assignments' | 'trainer' | 'management';

const translations = {
  en: {
    pageTitle: 'Training Control Center',
    pageSubtitle: 'Unified training management: modules, certifications, matrix, and assignments',
    programBuilder: 'Program Builder',
    statModules: 'Modules',
    statModulesDesc: 'available',
    statEmployees: 'Employees',
    statEmployeesDesc: 'active',
    statCompleted: 'Completed',
    statCompletedDesc: 'this month',
    statOverdue: 'Overdue',
    statOverdueDesc: 'items',
    tabModules: 'Modules',
    tabLibrary: 'Content Library',
    tabMatrix: 'Matrix',
    tabAssignments: 'Assignments',
    tabTrainer: 'Train-the-Trainer',
    tabManagement: 'Management',
  },
  es: {
    pageTitle: 'Centro de Control de Capacitación',
    pageSubtitle: 'Gestión unificada de capacitación: módulos, certificaciones, matriz y asignaciones',
    programBuilder: 'Constructor de Programas',
    statModules: 'Módulos',
    statModulesDesc: 'disponibles',
    statEmployees: 'Empleados',
    statEmployeesDesc: 'activos',
    statCompleted: 'Completados',
    statCompletedDesc: 'este mes',
    statOverdue: 'Atrasados',
    statOverdueDesc: 'elementos',
    tabModules: 'Módulos',
    tabLibrary: 'Biblioteca de Contenido',
    tabMatrix: 'Matriz',
    tabAssignments: 'Asignaciones',
    tabTrainer: 'Entrenador de Entrenadores',
    tabManagement: 'Gestión',
  },
};

export default function TrainingControlCenter() {
  const [activeTab, setActiveTab] = useState<TrainingTab>('modules');
  const [lang, setLang] = useState<Language>(() => (localStorage.getItem('trainingLang') as Language) || 'en');

  const toggleLang = () => {
    const next: Language = lang === 'en' ? 'es' : 'en';
    setLang(next);
    localStorage.setItem('trainingLang', next);
  };

  const t = translations[lang];

  const { data: stats } = useQuery<TrainingStats>({
    queryKey: ['/api/training/stats'],
    refetchInterval: 60000,
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <GraduationCap className="h-8 w-8 text-primary" />
            {t.pageTitle}
          </h1>
          <p className="text-muted-foreground">
            {t.pageSubtitle}
          </p>
        </div>
        <Link href="/training/programs">
          <Button>
            <Wrench className="h-4 w-4 mr-2" />
            {t.programBuilder}
          </Button>
        </Link>
      </div>

      <Card className="bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-950/30 dark:to-green-950/30 border-none">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${(stats?.totalModules || 0) > 0 ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <GraduationCap className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">{t.statModules}</div>
                  <div className="text-xs text-muted-foreground">{stats?.totalModules || 0} {t.statModulesDesc}</div>
                </div>
              </div>
              
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
              
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${(stats?.activeEmployees || 0) > 0 ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <Users className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">{t.statEmployees}</div>
                  <div className="text-xs text-muted-foreground">{stats?.activeEmployees || 0} {t.statEmployeesDesc}</div>
                </div>
              </div>
              
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
              
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${(stats?.completedThisMonth || 0) > 0 ? 'bg-emerald-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <CheckCircle className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">{t.statCompleted}</div>
                  <div className="text-xs text-muted-foreground">{stats?.completedThisMonth || 0} {t.statCompletedDesc}</div>
                </div>
              </div>
              
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
              
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${(stats?.overdueCount || 0) > 0 ? 'bg-red-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <AlertCircle className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">{t.statOverdue}</div>
                  <div className="text-xs text-muted-foreground">{stats?.overdueCount || 0} {t.statOverdueDesc}</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex items-center gap-2">
          <TabsList className="grid flex-1 grid-cols-6">
          <TabsTrigger value="modules" className="flex items-center gap-2" data-testid="tab-modules">
            <GraduationCap className="h-4 w-4" />
            {t.tabModules}
          </TabsTrigger>
          <TabsTrigger value="library" className="flex items-center gap-2" data-testid="tab-library">
            <BookOpen className="h-4 w-4" />
            {t.tabLibrary}
          </TabsTrigger>
          <TabsTrigger value="matrix" className="flex items-center gap-2" data-testid="tab-matrix">
            <LayoutGrid className="h-4 w-4" />
            {t.tabMatrix}
          </TabsTrigger>
          <TabsTrigger value="assignments" className="flex items-center gap-2" data-testid="tab-assignments">
            <Users className="h-4 w-4" />
            {t.tabAssignments}
          </TabsTrigger>
          <TabsTrigger value="trainer" className="flex items-center gap-2" data-testid="tab-trainer">
            <UserCheck className="h-4 w-4" />
            {t.tabTrainer}
          </TabsTrigger>
          <TabsTrigger value="management" className="flex items-center gap-2" data-testid="tab-management">
            <Settings className="h-4 w-4" />
            {t.tabManagement}
          </TabsTrigger>
          </TabsList>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleLang}
            aria-label="Toggle language"
            className="font-semibold shrink-0"
          >
            {lang === 'en' ? 'ES' : 'EN'}
          </Button>
        </div>

        <TabsContent value="modules" className="space-y-4">
          <Training lang={lang} />
        </TabsContent>

        <TabsContent value="library" className="space-y-4">
          <TrainingContentLibrary />
        </TabsContent>

        <TabsContent value="matrix" className="space-y-4">
          <TrainingMatrixView />
        </TabsContent>

        <TabsContent value="assignments" className="space-y-4">
          <TrainingMatrixManage />
        </TabsContent>

        <TabsContent value="trainer" className="space-y-4">
          <TrainTheTrainer />
        </TabsContent>

        <TabsContent value="management" className="space-y-4">
          <TrainingManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
