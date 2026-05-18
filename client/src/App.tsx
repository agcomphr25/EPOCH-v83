import React from 'react';
import { Switch, Route, Router, Link, useLocation } from 'wouter';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { Toaster } from '@/components/ui/toaster';
// import { CSVProvider } from "./contexts/CSVContext"; // Temporarily disabled
import Navigation from './components/Navigation';
import OfflineIndicator from './components/OfflineIndicator';
import MessageNotificationPopup from './components/MessageNotificationPopup';
import ImprovementNoteCapture from './components/ImprovementNoteCapture';
import { useWebSocketNotifications } from './hooks/useWebSocketNotifications';
import NotFound from './pages/not-found';
import AccessDenied from './pages/AccessDenied';
import RouteGuard from './components/auth/RouteGuard';
import SessionExpiryListener from './components/SessionExpiryListener';
import Dashboard from './pages/Dashboard';
import OrderManagement from './pages/OrderManagement';
import OrdersManagementPage from './pages/OrdersManagementPage';
import DiscountManagement from './pages/DiscountManagement';
import OrderEntry from './pages/OrderEntry';
import OrderEntryTest from './components/OrderEntryTest';
import OrdersList from './pages/OrdersList';
import PastDueReport from './pages/PastDueReport';
import WhatIfForecast from './pages/WhatIfForecast';
import OrdersListSimple from './pages/OrdersListSimple';
import FeatureManager from './pages/FeatureManager';
import StockModels from './pages/StockModels';
import DraftOrders from './components/DraftOrders';
import AdminFormsPage from './pages/AdminFormsPage';
import FormPage from './pages/FormPage';
import ReportPage from './pages/ReportPage';
import InventoryScannerPage from './pages/InventoryScannerPage';
import InventoryDashboardPage from './pages/InventoryDashboardPage';
import InventoryManagerPage from './pages/InventoryManagerPage';
import InventoryLedgerPage from './pages/InventoryLedgerPage';
import InventoryTraceabilityPage from './pages/InventoryTraceabilityPage';
import InventoryReceivingPage from './pages/InventoryReceivingPage';
import InventoryReceivingControlCenter from './pages/InventoryReceivingControlCenter';
import InventoryReceivingPageLegacy from './pages/InventoryReceivingPageLegacy';
import EnhancedInventoryMRPPage from './pages/EnhancedInventoryMRPPage';
import MaterialReadinessDashboard from './pages/MaterialReadinessDashboard';
import MaterialIntelligenceDashboard from './pages/MaterialIntelligenceDashboard';
import DepartmentPartsRequestPage from './pages/DepartmentPartsRequestPage';
import PartsRequestsCard from './components/inventory/PartsRequestsCard';
import ConsolidatedNeedsListPage from './pages/ConsolidatedNeedsListPage';
import QCPage from './pages/QCPage';
import AuditSettings from './pages/AuditSettings';
import VaultPage from './pages/VaultPage';
import OrderTimeline from './pages/OrderTimeline';
import MediaLibrary from './pages/MediaLibrary';
import SignPDFPage from './pages/SignPDFPage';
import SignedDocumentsLibrary from './pages/SignedDocumentsLibrary';
import SignatureWorkflowPage from './pages/SignatureWorkflowPage';
import ReferenceDocsPage from './pages/ReferenceDocsPage';
import PolicyLibraryPage from './pages/PolicyLibraryPage';
import PoliciesAdminPage from './pages/admin/PoliciesAdminPage';
import PolicyAcknowledgmentGate from './components/PolicyAcknowledgmentGate';
import VoiceNotesPage from './pages/VoiceNotesPage';
import ProcessRuns from './pages/ProcessRuns';
import ProductionStationDashboard from './pages/ProductionStationDashboard';
import TVDisplayPage from './pages/TVDisplayPage';
import TVTimerBoard from './pages/TVTimerBoard';
import ProductionTimerHistory from './pages/ProductionTimerHistory';
import TimerProgramsPage from './pages/TimerProgramsPage';
import FieldPage from './pages/FieldPage';
import ExecutiveRundown from './pages/ExecutiveRundown';
import TicketsPage from './pages/TicketsPage';
import TicketsCommandCenter from './pages/TicketsCommandCenter';
import PDFSignatureTool from './pages/PDFSignatureTool';
import MaintenancePage from './pages/MaintenancePage';
import MaintenanceEventsPage from './pages/MaintenanceEventsPage';
import WorkOrderDetailPage from './pages/WorkOrderDetailPage';
import ProductionWorkOrderDetailPage from './pages/ProductionWorkOrderDetailPage';
import WADWizardPage from './pages/WADWizardPage';
import WADWizardLauncherPage from './pages/WADWizardLauncherPage';
import WADStatusDashboard from './pages/WADStatusDashboard';
import AssetsPage from './pages/AssetsPage';
import AssetDashboardPage from './pages/AssetDashboardPage';
import EmployeePortalPage from './pages/EmployeePortalPage';
import KioskPage from './pages/timekeeping/KioskPage';
import TimeClockAdminPage from './pages/timekeeping/TimeClockAdminPage';
import SalariedTimeEntryPage from './pages/timekeeping/SalariedTimeEntryPage';
import SalariedDraftListPage from './pages/timekeeping/SalariedDraftListPage';
import PTOCommandCenter from './pages/PTOCommandCenter';
import Module8TestPage from './pages/Module8TestPage';
import CommunicationInboxPage from './pages/CommunicationInboxPage';
import MarketingCommunications from './pages/MarketingCommunications';
import EmailTemplateEditor from './pages/EmailTemplateEditor';
import SignOrderPageSettings from './pages/SignOrderPageSettings';
import APJournalPage from './pages/APJournalPage';
import ARJournalPage from './pages/ARJournalPage';
import InvoicesPage from './pages/InvoicesPage';
import InvoiceFormPage from './pages/InvoiceFormPage';
import InvoiceDetailPage from './pages/InvoiceDetailPage';
import ARAgingPage from './pages/ARAgingPage';
import ARPaymentsPage from './pages/ARPaymentsPage';
import COGSReportPage from './pages/COGSReportPage';
import FinanceDashboardPage from './pages/FinanceDashboardPage';
import FinancialReviewPage from './pages/FinancialReviewPage';
import FinancialReviewListPage from './pages/FinancialReviewListPage';
import FinancialReviewSlidePage from './pages/FinancialReviewSlidePage';
import CostCenterManagement from './pages/CostCenterManagement';
import CostAccountingPage from './pages/CostAccountingPage';
import ChartOfAccountsPage from './pages/ChartOfAccountsPage';
import BurdenRatesAdmin from './pages/BurdenRatesAdmin';
import MonthlyFulfilledReport from './pages/MonthlyFulfilledReport';
import MonthlyShippedReport from './pages/MonthlyShippedReport';
import POProductionOrdersReport from './pages/POProductionOrdersReport';
import BulkPaymentPage from './pages/BulkPaymentPage';
import BulkPaymentHistoryPage from './pages/BulkPaymentHistoryPage';
import PaymentReconciliationPage from './pages/PaymentReconciliationPage';
import AccountingPage from './pages/AccountingPage';
import AccountingControlCenter from './pages/AccountingControlCenter';
import PayrollControlPage from './pages/finance/PayrollControlPage';
import EmployeeBadgeConfiguration from './pages/EmployeeBadgeConfiguration';
import BadgeScanner from './pages/BadgeScanner';
import OnboardingDashboard from './pages/OnboardingDashboard';
import OnboardingInvitePage from './pages/OnboardingInvitePage';
import OnboardingPathsPage from './pages/OnboardingPathsPage';
import OnboardingSettingsPage from './pages/OnboardingSettingsPage';
import PendingEmployerSignaturesPage from './pages/PendingEmployerSignaturesPage';
import OnboardingFormsPage from './pages/OnboardingFormsPage';
import OnboardingSessionWizard from './pages/OnboardingSessionWizard';
import EnhancedFormsPage from './pages/EnhancedFormsPage';
import EnhancedReportsPage from './pages/EnhancedReportsPage';
import FormRendererPage from './pages/FormRendererPage';
import DocumentationPageNew from './pages/DocumentationPageNew';
import CustomerManagement from './pages/CustomerManagement';
import VendorManagement from './pages/VendorManagement';
import ManageGroups from './pages/ManageGroups';
import PurchaseOrders from './pages/PurchaseOrders';
import P2ControlCenter from './pages/P2ControlCenter';
import P2CustomersPage from './pages/P2CustomersPage';
import P2Forms from './pages/P2Forms';
import ManufacturingQueue from './pages/ManufacturingQueue';
import KitsQueue from './pages/KitsQueue';
import LayupQueue from './pages/LayupQueue';
import CoreQueue from './pages/CoreQueue';
import SubAssemblyQueue from './pages/SubAssemblyQueue';
import AssemblyQueue from './pages/AssemblyQueue';
import P2TravelerPage from './pages/P2TravelerPage';
import P2TravelerViewer from './pages/P2TravelerViewer';
import P2PackingSlipViewer from './pages/P2PackingSlipViewer';
import P2POViewer from './pages/P2POViewer';
import P2CertificateViewer from './pages/P2CertificateViewer';
import P2RmaDetailPage from './pages/P2RmaDetailPage';
import P2ShipmentDetail from './pages/P2ShipmentDetail';
import P2ShipmentHistory from './pages/P2ShipmentHistory';
import P2TestReportViewer from './pages/P2TestReportViewer';
import P2ReadyToShipDashboard from './pages/P2ReadyToShipDashboard';
import POProductsPage from './pages/POProductsPage';
import ProductLabelsPage from './pages/ProductLabelsPage';
import ProductionTracking from './pages/ProductionTracking';
import BarcodeScannerPage from './pages/BarcodeScannerPage';
import AllOrdersPage from './pages/AllOrdersPage';
import OrderReports from './pages/OrderReports';
import ProductionOrderInspector from './pages/ProductionOrderInspector';
import DomainTruthInspector from './pages/DomainTruthInspector';
import QueueIntegrityMonitor from './pages/admin/QueueIntegrityMonitor';
import ShippingStatusAuditPage from './pages/admin/ShippingStatusAuditPage';
import ProductionControlTower from './pages/admin/ProductionControlTower';
import LocateOrder from './pages/LocateOrder';
import LinkGroupsReport from './pages/LinkGroupsReport';
import DueDateCapacityReport from './pages/DueDateCapacityReport';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import QuoteAccuracyDashboard from './pages/QuoteAccuracyDashboard';
import AGTestDashboard from './pages/AGTestDashboard';
import ADMINTestDashboard from './pages/GLENNTestDashboard';
import ProductionCommandCenter from './pages/ProductionCommandCenter';
import ProductionControlCenter from './pages/ProductionControlCenter';
import ProductionControlCenterLive from './pages/ProductionControlCenterLive';
import DailyThroughputBoard from './pages/DailyThroughputBoard';
import JOHNLTestDashboard from './pages/JOHNLTestDashboard';
import JENSTestDashboard from './pages/JENSTestDashboard';
import STACIWTestDashboard from './pages/STACIWTestDashboard';
import DARLENEBTestDashboard from './pages/DARLENEBTestDashboard';
import LAURIETTestDashboard from './pages/LAURIETTestDashboard';
import TIMSTestDashboard from './pages/TIMSTestDashboard';
import WatchRulesPage from './pages/WatchRulesPage';
import BRADWTestDashboard from './pages/BRADWTestDashboard';
import CHASEWTestDashboard from './pages/CHASEWTestDashboard';
import FALEESHAHTestDashboard from './pages/FALEESHAHTestDashboard';
import BLAKETDashboard from './pages/BLAKETDashboard';
import JESSICAPDashboard from './pages/JESSICAPDashboard';
import BRIANDashboard from './pages/BRIANDashboard';
import TOMASMDashboard from './pages/TOMASMDashboard';
import JOEYBTestDashboard from './pages/JOEYBTestDashboard';
import TANDYMTestDashboard from './pages/TANDYMTestDashboard';
import OrderDepartmentTransfer from './pages/OrderDepartmentTransfer';
import { BOMAdministration } from './pages/BOMAdministration';
import RobustBOMAdministration from './pages/RobustBOMAdministration';
import AGBottomMetalReport from './pages/AGBottomMetalReport';
import ShippingTracker from './pages/ShippingTracker';
import AwaitingSignaturePage from './pages/AwaitingSignaturePage';
import EmployeeDashboard from './pages/EmployeeDashboard';
import EmployeeDetail from './pages/EmployeeDetail';
import EmployeePortal from './pages/EmployeePortal';
import UserManagement from './pages/UserManagement';
import Settings from './pages/Settings';
import LoginPage from './pages/LoginPage';
import MasterDocumentRegister from '@/pages/MasterDocumentRegister';
import WasteManagementForm from '@/pages/WasteManagementForm';
import TaskTracker from '@/pages/TaskTracker';
import KickbackTracking from '@/components/KickbackTracking';
import DocumentManagement from './pages/DocumentManagement';
import RoutingDocumentManagement from './pages/RoutingDocumentManagement';
import RoutingTemplates from './pages/RoutingTemplates';
import TemplateLibraryPage from './pages/TemplateLibraryPage';
import AnodizeJobs from './pages/AnodizeJobs';
import ShutdownProceduresTraining from '@/pages/ShutdownProceduresTraining';
import CounterfeitPreventionTraining from '@/pages/CounterfeitPreventionTraining';
import TrainingControlCenter from '@/pages/TrainingControlCenter';
import TrainingModule from '@/pages/TrainingModule';
import TrainingPlans from '@/pages/TrainingPlans';
import TrainerDashboard from '@/pages/TrainerDashboard';
import TraineeTrainingPortal from '@/pages/TraineeTrainingPortal';
import TrainingContentLibrary from '@/pages/TrainingContentLibrary';
import {
  ProgramsPage,
  ProgramBuilderPage,
  AssignProgramPage,
  SessionDailySheetPage,
  WorkInstructionsPage,
  QuizManagementPage,
  DailyQuizSelectionPage,
} from '@/modules/training-builder';
import ImportCertifications from '@/pages/ImportCertifications';
import CertificationBacklog from '@/pages/CertificationBacklog';
import SkillMatrixPage from '@/pages/SkillMatrixPage';
import Calendar from './pages/Calendar';
import EmailInbox from './pages/EmailInbox';
import LayupPluggingQueuePage from './pages/LayupPluggingQueuePage';
import BarcodeQueuePage from './pages/BarcodeQueuePage';
import BulkBarcodeReprint from './pages/BulkBarcodeReprint';
import CNCQueuePage from './pages/CNCQueuePage';
import CNCDashboardPage from './pages/CNCDashboardPage';
import CNCPartRoutingsPage from './pages/CNCPartRoutingsPage';
import FinishQCQueuePage from './pages/FinishQCQueuePage';
import FinishQueuePage from './pages/FinishQueuePage';
import FinishQCPage from './pages/FinishQCPage';
import FinishQCCompletedReport from './pages/FinishQCCompletedReport';
import GunsimthQueuePage from './pages/GunsimthQueuePage';
import PaintQueuePage from './pages/PaintQueuePage';
import QCShippingQueuePage from './pages/QCShippingQueuePage';
import OEMShipmentsPage from './pages/OEMShipmentsPage';
import ShippingQueuePage from './pages/ShippingQueuePage';
import ShippingLabelPage from './pages/ShippingLabelPage';
import NonconformanceDashboard from './components/NonconformanceDashboard';
import NonconformanceReport from './components/NonconformanceReport';
import RTSPage from './pages/RTSPage';
import RFQRiskAssessment from './pages/RFQRiskAssessment';
import ConversationalRFQRiskAssessment from './pages/ConversationalRFQRiskAssessment';
import ProductionQueueManager from './components/ProductionQueueManager';
import EnhancedLayupSchedulerPage from './pages/EnhancedLayupSchedulerPage';
import WorkDayAwareScheduler from './components/WorkDayAwareScheduler';
import PurchaseReviewChecklist from './pages/PurchaseReviewChecklist';
import PurchaseReviewSubmissions from './pages/PurchaseReviewSubmissions';
import ManufacturersCertificate from './pages/ManufacturersCertificate';
import P2QuoteForm from './pages/P2QuoteForm';
import P2QuotesList from './pages/P2QuotesList';
import PaymentManagement from './pages/PaymentManagement';
import PaymentAnalytics from './pages/PaymentAnalytics';
import HistoricalDataEntry from './pages/HistoricalDataEntry';
import ShippedOrderDiscountsPage from './pages/ShippedOrderDiscountsPage';
import InvoiceCategoryBreakdownPage from './pages/InvoiceCategoryBreakdownPage';
import ScrapReportPage from './pages/ScrapReportPage';
import ChargeCodeManagerPage from './pages/finance/ChargeCodeManagerPage';
import RefundRequest from './pages/RefundRequest';
import RefundQueue from './pages/RefundQueue';
import RMAFormPage from './pages/RMAFormPage';
import CreditMemoPage from './pages/CreditMemoPage';
import ProductionQueuePage from './pages/ProductionQueuePage';
import SimplifiedLayupScheduler from './components/SimplifiedLayupScheduler';
import CustomerSatisfaction from './pages/CustomerSatisfaction';
import AdminPanelPage from './pages/AdminPanelPage';
import AdminChecklistManagementPage from './pages/AdminChecklistManagementPage';
import RolesPermissionsPage from './pages/admin/RolesPermissionsPage';
import OperatorAuthSessionsPage from './pages/admin/OperatorAuthSessionsPage';
import OrderLookupPage from './pages/admin/OrderLookupPage';
import OrderOverridePage from './pages/admin/OrderOverridePage';
import WidgetCatalogPage from './pages/admin/WidgetCatalogPage';
import ProductionForecastPage from './pages/ProductionForecastPage';
import ForecastSettings from './pages/ForecastSettings';
import AccountingPrepPage from './pages/AccountingPrepPage';
import SystemHealthChecksPage from './pages/SystemHealthChecksPage';
import CommunicationLogsPage from './pages/CommunicationLogsPage';
import MonitoredLinksManager from './pages/MonitoredLinksManager';
import VendorsPage from './pages/VendorsPage';
import PurchaseRequisitionsPage from './pages/PurchaseRequisitionsPage';
import VendorPOPage from './pages/VendorPOPage';
import VendorPOComplianceBackfillPage from './pages/VendorPOComplianceBackfillPage';
import PDFTemplateManager from './pages/PDFTemplateManager';
import CuttingTableControlCenter from './pages/CuttingTableControlCenter';
import CuttingControlCenterLayout from './pages/cutting/CuttingControlCenterLayout';
import FabricInventoryPage from './pages/FabricInventoryPage';
import MetalAccessoriesTracker from './pages/MetalAccessoriesTracker';
import DocumentIntelligence from './pages/DocumentIntelligence';
import SignOrderPage from './pages/SignOrderPage';
import VendorConfirmPage from './pages/VendorConfirmPage';
import FillAndSignPage from './pages/FillAndSignPage';
import QRCodeAdminPage from './pages/QRCodeAdminPage';
import QRErrorPage from './pages/QRErrorPage';
import AttentionDashboard from './pages/AttentionDashboard';
import FillablePdfTemplatesAdmin from './pages/FillablePdfTemplatesAdmin';
import VisualFieldEditor from './pages/VisualFieldEditor';
import PdfFormsPage from './pages/PdfFormsPage';
import PdfFormsEditorPage from './pages/PdfFormsEditorPage';
import PdfFormsFillPage from './pages/PdfFormsFillPage';
import PDFSettings from './pages/PDFSettings';
import GatewayReports from './pages/GatewayReports';
import MetricsSandbox from './pages/MetricsSandbox';
import MetricDirectory from './pages/MetricDirectory';
import PreproductionChecklistPage from './pages/PreproductionChecklistPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ProjectClosingRecordPage from './pages/ProjectClosingRecordPage';
import P2PipelineBoardPage from './pages/P2PipelineBoardPage';
import PMControlCenterPage from './pages/PMControlCenterPage';
import HelpCenter from './pages/HelpCenter';
import P2OrderGuide from './pages/P2OrderGuide';
import TravelerManagement from './pages/TravelerManagement';
import TravelerExecution from './pages/TravelerExecution';
import MaterialReceivingPage from './pages/MaterialReceivingPage';
import MaterialInventoryPage from './pages/MaterialInventoryPage';
import InventoryRestockSignalsPage from './pages/InventoryRestockSignalsPage';
import InventoryReconciliationPage from './pages/InventoryReconciliationPage';
import CycleCountPage from './pages/CycleCountPage';
import FilteredOrdersReport from './pages/FilteredOrdersReport';
import UrgentOrdersReport from './pages/UrgentOrdersReport';
import OTDReport from './pages/OTDReport';
import OrderHeatMap from './pages/OrderHeatMap';
import QuickNotesPage from './pages/QuickNotesPage';
import ImprovementNotesDashboard from './pages/ImprovementNotesDashboard';
import RFQListPage from './pages/RFQListPage';
import RFQBuilderPage from './pages/RFQBuilderPage';
import SystemAuditsPage from './pages/SystemAuditsPage';
import AuditLedgerPage from './pages/AuditLedgerPage';
import InventoryAnomalyDashboard from './pages/InventoryAnomalyDashboard';
import AnomalyDetectorConfigPage from './pages/AnomalyDetectorConfigPage';
import ApprovalsInbox from './pages/ApprovalsInbox';
import EscalationPoliciesPage from './pages/admin/EscalationPoliciesPage';
import CommandCenter from './pages/CommandCenter';
import EdriDashboard from './pages/admin/EdriDashboard';
import EdriDomainDetail from './pages/admin/EdriDomainDetail';
import EdriRedFlags from './pages/admin/EdriRedFlags';
import EdriRemediation from './pages/admin/EdriRemediation';
import EdriHeatmap from './pages/admin/EdriHeatmap';
import EdriMissingEvidence from './pages/admin/EdriMissingEvidence';
import EdriHistory from './pages/admin/EdriHistory';
import EdriEvidence from './pages/admin/EdriEvidence';
import EdriSnapshotDetail from './pages/admin/EdriSnapshotDetail';
import EdriSupportingDocs from './pages/admin/EdriSupportingDocs';
import DcaaFindings from './pages/admin/DcaaFindings';
import ChargeCodeUsageReport from './pages/admin/ChargeCodeUsageReport';
import LaborDistributionReport from './pages/admin/LaborDistributionReport';
import TransactionEvidenceMap from './pages/admin/TransactionEvidenceMap';
import SupervisorApprovalExceptionReport from './pages/admin/SupervisorApprovalExceptionReport';
import TimesheetCorrectionLogReport from './pages/admin/TimesheetCorrectionLogReport';
import PayrollExportReconciliationReport from './pages/admin/PayrollExportReconciliationReport';
import IndirectCostBurdenRateReport from './pages/admin/IndirectCostBurdenRateReport';
import UnallowableCostReviewReport from './pages/admin/UnallowableCostReviewReport';
import ProcurementComplianceReport from './pages/admin/ProcurementComplianceReport';
import InventoryTraceabilityReport from './pages/admin/InventoryTraceabilityReport';
import AuditLedgerIntegrityReport from './pages/admin/AuditLedgerIntegrityReport';
import PolicyTrainingAcknowledgmentReport from './pages/admin/PolicyTrainingAcknowledgmentReport';
import EdriExecutiveMatrix from './pages/admin/EdriExecutiveMatrix';
import SecureVaultPage from './pages/admin/SecureVaultPage';
import CmmcDashboard from './pages/admin/CmmcDashboard';
import BusinessContinuityDashboard from './pages/admin/BusinessContinuityDashboard';
import IdentityMatrixPage from './pages/IdentityMatrixPage';
import IdentityDiagnosticPage from './pages/IdentityDiagnosticPage';
import ProteusLabsDashboard from './pages/proteus-labs/ProteusLabsDashboard';
import ProteusPromptBuilder from './pages/proteus-labs/ProteusPromptBuilder';
import ProteusPromptDetail from './pages/proteus-labs/ProteusPromptDetail';
import ProteusExecutionHistory from './pages/proteus-labs/ProteusExecutionHistory';

import { Toaster as HotToaster } from 'react-hot-toast';
import DeploymentAuthWrapper from './components/DeploymentAuthWrapper';
import { getDashboardRoute } from './config/dashboardMapping';

function useIsEmbedMode() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === '1';
}

function ConditionalOfflineIndicator() {
  const isEmbed = useIsEmbedMode();
  return isEmbed ? null : <OfflineIndicator />;
}

function ConditionalMainWrapper({ children }: { children: React.ReactNode }) {
  const isEmbed = useIsEmbedMode();
  const [location] = useLocation();
  if (isEmbed || location.startsWith('/kiosk') || location.startsWith('/vendor-confirm')) {
    return <div className="w-full min-h-screen overflow-auto">{children}</div>;
  }
  return <main className="container mx-auto px-4 py-8">{children}</main>;
}

// Component to conditionally render Navigation
function ConditionalNavigation() {
  const [location] = useLocation();
  const isEmbed = useIsEmbedMode();
  const hideNavigation =
    isEmbed ||
    location === '/darleneb-dashboard' ||
    location === '/ag-dashboard' ||
    location === '/staciw-dashboard' ||
    location === '/login' ||
    location.startsWith('/sign-order') || // Hide navigation on customer sign order page
    location.startsWith('/fill-and-sign') || // Hide navigation on customer fill-and-sign page
    location.startsWith('/vendor-confirm') || // Hide navigation on vendor PO confirmation page
    location.startsWith('/tv-display') || // Hide navigation on TV display page
    location.startsWith('/tv-timer-board') || // Hide navigation on timer board page
    location.startsWith('/kiosk'); // Hide navigation on time-clock kiosk (PIN-based, no EPOCH nav)

  return hideNavigation ? null : <Navigation />;
}

// Root redirect component that intercepts "/" and redirects to personalized dashboards or login
function RootRedirect() {
  const [, setLocation] = useLocation();

  const { data: currentUser, isLoading } = useQuery<{ id: number; username: string; role: string } | null>({
    queryKey: ['currentUser'],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  React.useEffect(() => {
    if (isLoading) return;

    if (!currentUser) {
      setLocation('/login');
      return;
    }

    if (currentUser.username) {
      const personalizedRoute = getDashboardRoute(currentUser.username);
      if (personalizedRoute !== '/') {
        console.log(`Redirecting ${currentUser.username} to ${personalizedRoute}`);
        setLocation(personalizedRoute);
      }
    }
  }, [isLoading, currentUser, setLocation]);

  // While auth resolves, show a lightweight skeleton shell instead of blocking spinner
  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-7xl mx-auto">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
              <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Unauthenticated: return null while useEffect handles the /login redirect
  if (!currentUser) {
    return null;
  }

  // Authenticated with a personalized dashboard: return null while useEffect redirects
  if (currentUser.username) {
    const personalizedRoute = getDashboardRoute(currentUser.username);
    if (personalizedRoute !== '/') {
      return null;
    }
  }

  // Authenticated with no personalized dashboard: render the generic one
  return <Dashboard />;
}

function WebSocketNotifications() {
  useWebSocketNotifications();
  return null;
}

/**
 * Renders the MessageNotificationPopup only when there is a confirmed active user session.
 *
 * The component itself guards its internal unread-count query with `enabled: !!currentUser?.id`,
 * but it still fires the /api/auth/session query unconditionally on mount.  For unauthenticated
 * floor operators viewing traveler execution pages that query always returns 401, producing
 * console noise.  By querying the session here first and short-circuiting when unauthenticated,
 * we prevent both the session query noise and any accidental future regressions in the inner
 * guard from surfacing hard-auth 401 errors on public floor-operator routes.
 */
function SessionAwareMessageNotificationPopup() {
  const { data: sessionUser, isLoading: sessionLoading } = useQuery<{ id: number } | null>({
    queryKey: ['/api/auth/session'],
    retry: false,
  });

  // While the session request is in flight avoid a flash — render nothing.
  // Once settled, only render the popup when a real authenticated user is present.
  if (sessionLoading || !sessionUser?.id) return null;
  return <MessageNotificationPopup />;
}

function RedirectToShippingTracker() {
  const [, setLocation] = useLocation();
  React.useEffect(() => {
    setLocation('/shipping-tracker');
  }, [setLocation]);
  return null;
}

function Redirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  React.useEffect(() => {
    setLocation(to, { replace: true });
  }, [to, setLocation]);
  return null;
}

function App() {
  console.log('App component is rendering...');
  console.log('Environment:', import.meta.env.MODE);
  console.log('Base URL:', import.meta.env.BASE_URL);

  // Add error boundary
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('Global error caught:', event.error);
      setError(event.error);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      setError(new Error(event.reason));
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener(
        'unhandledrejection',
        handleUnhandledRejection
      );
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full">
          <h1 className="text-2xl font-bold text-red-600 mb-4">
            Application Error
          </h1>
          <p className="text-gray-700 mb-4">
            An error occurred while loading the application:
          </p>
          <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
            {error.message}
            {error.stack && '\n\nStack trace:\n' + error.stack}
          </pre>
          <button
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            onClick={() => window.location.reload()}
          >
            Reload Application
          </button>
        </div>
      </div>
    );
  }

  try {
    return (
      <QueryClientProvider client={queryClient}>
        <DeploymentAuthWrapper>
          <Router>
            <div className="min-h-screen bg-gray-50">
              <ConditionalNavigation />
              <ConditionalOfflineIndicator />
              <PolicyAcknowledgmentGate />
              <ConditionalMainWrapper>
                <RouteGuard>
                  <Switch>
                    <Route path="/" component={RootRedirect} />
                    <Route path="/access-denied" component={AccessDenied} />
                  <Route path="/order-management" component={OrderManagement} />
                  <Route
                    path="/orders-management"
                    component={OrdersManagementPage}
                  />
                  <Route path="/order-entry" component={OrderEntry} />
                  <Route path="/test-order-entry" component={OrderEntryTest} />
                  <Route path="/orders" component={OrdersList} />
                  <Route path="/orders-list" component={OrdersList} />
                  <Route path="/orders-simple" component={OrdersListSimple} />
                  <Route path="/all-orders" component={AllOrdersPage} />
                  <Route path="/order-reports" component={OrderReports} />
                  <Route path="/link-groups" component={LinkGroupsReport} />
                  <Route path="/due-date-capacity" component={DueDateCapacityReport} />
                  <Route path="/filtered-orders-report" component={FilteredOrdersReport} />
                  <Route path="/urgent-orders-report" component={UrgentOrdersReport} />
                  <Route path="/otd-report" component={OTDReport} />
                  <Route path="/order-heat-map" component={OrderHeatMap} />
                  <Route path="/quick-notes" component={QuickNotesPage} />
                  <Route path="/improvement-notes" component={ImprovementNotesDashboard} />
                  <Route path="/estimating" component={RFQListPage} />
                  <Route path="/rfq-builder" component={RFQBuilderPage} />
                  <Route path="/rfq-builder/:id" component={RFQBuilderPage} />
                  <Route path="/analytics" component={AnalyticsDashboard} />
                  <Route path="/quote-accuracy" component={QuoteAccuracyDashboard} />
                  <Route path="/finish-qc-completed-report" component={FinishQCCompletedReport} />
                  <Route path="/discounts" component={DiscountManagement} />
                  <Route path="/feature-manager" component={FeatureManager} />
                  <Route path="/stock-models" component={StockModels} />
                  <Route path="/draft-orders" component={DraftOrders} />

                  {/* Customer Management Routes */}
                  <Route
                    path="/customer-management"
                    component={CustomerManagement}
                  />
                  <Route path="/customers" component={CustomerManagement} />
                  <Route
                    path="/customer-satisfaction"
                    component={CustomerSatisfaction}
                  />

                  {/* Admin Panel Routes */}
                  <Route path="/admin/orders" component={AdminPanelPage} />
                  <Route path="/admin/roles-permissions" component={RolesPermissionsPage} />
                  <Route path="/admin/operator-sessions" component={OperatorAuthSessionsPage} />
                  <Route path="/admin/order-lookup" component={OrderLookupPage} />
                  <Route path="/admin/order-override" component={OrderOverridePage} />
                  <Route path="/admin/widget-catalog" component={WidgetCatalogPage} />
                  <Route path="/admin/health-checks" component={SystemHealthChecksPage} />
                  <Route path="/admin/monitored-links" component={MonitoredLinksManager} />
                  <Route path="/admin/communication-logs" component={CommunicationLogsPage} />
                  <Route path="/admin/accounting-prep" component={AccountingPrepPage} />
                  <Route path="/admin/qr-codes" component={QRCodeAdminPage} />
                  <Route path="/admin/checklist-management" component={AdminChecklistManagementPage} />
                  <Route path="/production-forecast" component={ProductionForecastPage} />
                  <Route path="/production-forecast/settings" component={ForecastSettings} />
                  <Route path="/admin/attention" component={AttentionDashboard} />
                  <Route path="/admin/inspector/production-order" component={ProductionOrderInspector} />
                  <Route path="/admin/domain-truth" component={DomainTruthInspector} />
                  <Route path="/admin/queue-integrity" component={QueueIntegrityMonitor} />
                  <Route path="/admin/shipping-status-audit" component={ShippingStatusAuditPage} />
                  <Route path="/admin/control-tower" component={ProductionControlTower} />
                  <Route path="/admin/secure-vault" component={SecureVaultPage} />
                  <Route path="/admin/inventory-reconciliation" component={InventoryReconciliationPage} />
                  <Route path="/system-audits" component={SystemAuditsPage} />
                  <Route path="/admin/audit-ledger" component={AuditLedgerPage} />
                  <Route path="/admin/inventory-anomalies" component={InventoryAnomalyDashboard} />
                  <Route path="/admin/anomaly-config" component={AnomalyDetectorConfigPage} />
                  <Route path="/approvals" component={ApprovalsInbox} />
                  <Route path="/admin/escalation-policies" component={EscalationPoliciesPage} />
                  <Route path="/admin/locate-order" component={LocateOrder} />
                  <Route path="/qr-error" component={QRErrorPage} />
                  <Route path="/audit-settings" component={AuditSettings} />
                  <Route path="/vault" component={VaultPage} />
                  <Route path="/policies" component={PolicyLibraryPage} />
                  <Route path="/admin/policies" component={PoliciesAdminPage} />
                  <Route path="/order-timeline/:entityType/:entityId" component={OrderTimeline} />
                  <Route path="/media-library" component={MediaLibrary} />
                  <Route path="/sign-pdf" component={SignPDFPage} />
                  <Route path="/signed-documents" component={SignedDocumentsLibrary} />
                  <Route path="/signature-workflow" component={SignatureWorkflowPage} />
                  <Route path="/reference-docs" component={ReferenceDocsPage} />
                  <Route path="/knowledge-capture" component={VoiceNotesPage} />
                  <Route path="/voice-notes" component={VoiceNotesPage} />
                  <Route path="/process-runs" component={ProcessRuns} />
                  <Route path="/app/production/stations" component={ProductionStationDashboard} />
                  <Route path="/tv-display" component={TVDisplayPage} />
                  <Route path="/tv-timer-board" component={TVTimerBoard} />
                  <Route path="/app/production/timer-history" component={ProductionTimerHistory} />
                  <Route path="/app/production/timer-programs" component={TimerProgramsPage} />
                  
                  {/* Field - Calm thinking surface (single user: admin_glennj) */}
                  <Route path="/field" component={FieldPage} />
                  <Route path="/executive" component={ExecutiveRundown} />

                  {/* Ticketing System - Internal CSR Tool */}
                  <Route path="/tickets" component={TicketsPage} />
                  <Route path="/tickets-command-center" component={TicketsCommandCenter} />
                  <Route path="/pdf-signature-tool" component={PDFSignatureTool} />

                  {/* Vendor Management Routes */}
                  <Route path="/vendor-management" component={VendorManagement} />
                  <Route path="/vendors" component={VendorManagement} />
                  <Route path="/vendor-pos/compliance-backfill" component={VendorPOComplianceBackfillPage} />
                  <Route path="/vendor-pos" component={VendorPOPage} />
                  <Route path="/purchase-requisitions" component={PurchaseRequisitionsPage} />
                  
                  {/* Cost Accounting Routes */}
                  <Route path="/cost-accounting" component={CostAccountingPage} />
                  
                  {/* PDF Template Routes */}
                  <Route path="/pdf-templates" component={PDFTemplateManager} />
                  <Route path="/fillable-pdf-templates" component={FillablePdfTemplatesAdmin} />
                  <Route path="/fillable-pdf-templates/:id/editor" component={VisualFieldEditor} />

                  {/* PDF Forms Module */}
                  <Route path="/pdf-forms" component={PdfFormsPage} />
                  <Route path="/pdf-forms/editor/:id" component={PdfFormsEditorPage} />
                  <Route path="/pdf-forms/fill/:id" component={PdfFormsFillPage} />
                  
                  {/* Item Groups Management */}
                  <Route path="/manage-groups" component={ManageGroups} />

                  {/* Purchase Order Routes */}
                  <Route path="/purchase-orders" component={PurchaseOrders} />
                  <Route
                    path="/p1-purchase-orders"
                    component={PurchaseOrders}
                  />
                  <Route path="/p2-purchase-orders"><Redirect to="/p2-control-center" /></Route>
                  <Route path="/p2-department-manager"><Redirect to="/p2-control-center" /></Route>
                  <Route path="/po-products" component={POProductsPage} />
                  <Route path="/product-labels" component={ProductLabelsPage} />

                  {/* Production and BOM Routes */}
                  <Route
                    path="/production-tracking"
                    component={ProductionTracking}
                  />
                  {/* <Route
                    path="/bom-administration"
                    component={BOMAdministration}
                  /> */}
                  <Route
                    path="/robust-bom-administration"
                    component={RobustBOMAdministration}
                  />
                  <Route
                    path="/robust-bom"
                    component={RobustBOMAdministration}
                  />

                  {/* Barcode and Scanner Routes */}
                  <Route
                    path="/barcode-scanner"
                    component={BarcodeScannerPage}
                  />
                  <Route
                    path="/bulk-barcode-reprint"
                    component={BulkBarcodeReprint}
                  />

                  {/* Inventory Routes (Legacy) */}
                  <Route path="/inventory" component={InventoryManagerPage} />
                  <Route
                    path="/inventory/scanner"
                    component={InventoryScannerPage}
                  />
                  {/* <Route
                    path="/inventory/dashboard"
                    component={InventoryDashboardPage}
                  /> */}
                  <Route
                    path="/inventory/manager"
                    component={InventoryManagerPage}
                  />
                  <Route
                    path="/inventory/receiving"
                    component={InventoryReceivingControlCenter}
                  />
                  <Route
                    path="/inventory/receiving-legacy"
                    component={InventoryReceivingPageLegacy}
                  />
                  <Route
                    path="/inventory/material-intelligence"
                    component={MaterialIntelligenceDashboard}
                  />
                  <Route
                    path="/inventory/enhanced-mrp"
                    component={EnhancedInventoryMRPPage}
                  />
                  <Route
                    path="/inventory/ledger"
                    component={InventoryLedgerPage}
                  />
                  <Route
                    path="/inventory/traceability"
                    component={InventoryTraceabilityPage}
                  />
                  <Route
                    path="/production/material-readiness"
                    component={MaterialReadinessDashboard}
                  />
                  <Route
                    path="/inventory/parts-request"
                    component={() => (
                      <div className="container mx-auto px-4 py-6">
                        <PartsRequestsCard />
                      </div>
                    )}
                  />
                  <Route
                    path="/inventory/parts-request-legacy"
                    component={DepartmentPartsRequestPage}
                  />
                  <Route
                    path="/inventory/consolidated-needs"
                    component={ConsolidatedNeedsListPage}
                  />

                  {/* Enhanced System Routes (Independent) */}
                  <Route
                    path="/metal-accessories"
                    component={MetalAccessoriesTracker}
                  />

                  {/* QC and Maintenance Routes */}
                  <Route path="/qc" component={QCPage} />
                  <Route path="/maintenance" component={MaintenancePage} />
                  <Route path="/maintenance-events" component={MaintenanceEventsPage} />
                  <Route path="/maintenance-events/:id">
                    {(params) => <WorkOrderDetailPage params={params} />}
                  </Route>
                  <Route path="/wad-wizard" component={WADWizardLauncherPage} />
                  <Route path="/wad-status" component={WADStatusDashboard} />
                  <Route path="/work-orders/:id/wizard">
                    {(params) => <WADWizardPage params={params} />}
                  </Route>
                  <Route path="/work-orders/:id">
                    {(params) => <ProductionWorkOrderDetailPage params={params} />}
                  </Route>
                  <Route path="/assets" component={AssetsPage} />
                  <Route path="/asset-dashboard" component={AssetDashboardPage} />

                  {/* Employee Routes */}
                  <Route path="/employee" component={EmployeeDashboard} />
                  <Route path="/onboarding" component={OnboardingDashboard} />
                  <Route path="/onboarding/invite/:token" component={OnboardingInvitePage} />
                  <Route path="/onboarding/paths" component={OnboardingPathsPage} />
                  <Route path="/onboarding/settings" component={OnboardingSettingsPage} />
                  <Route path="/onboarding/employer-signatures" component={PendingEmployerSignaturesPage} />
                  {/* DEPRECATED: Form builder hidden - using fixed demographics instead */}
                  {/* <Route path="/onboarding/forms" component={OnboardingFormsPage} /> */}
                  <Route path="/onboarding/session/:id" component={OnboardingSessionWizard} />
                  <Route path="/user-management" component={UserManagement} />
                  <Route path="/settings" component={Settings} />
                  <Route path="/pdf-settings" component={PDFSettings} />
                  <Route
                    path="/employee-portal"
                    component={EmployeePortalPage}
                  />
                  <Route
                    path="/employee-portal/:portalId"
                    component={EmployeePortal}
                  />
                  <Route
                    path="/employee-portal/:portalId/drafts"
                    component={SalariedDraftListPage}
                  />
                  <Route
                    path="/employee-portal/:portalId/time-entry/:draftId"
                    component={SalariedTimeEntryPage}
                  />
                  <Route
                    path="/employee-portal/:portalId/time-entry"
                    component={SalariedTimeEntryPage}
                  />
                  <Route
                    path="/employee-dashboard"
                    component={EmployeeDashboard}
                  />
                  <Route
                    path="/employee-detail/:id"
                    component={EmployeeDetail}
                  />
                  <Route
                    path="/employee-portal-new"
                    component={EmployeePortal}
                  />
                  <Route path="/kiosk" component={KioskPage} />
                  <Route
                    path="/time-clock-admin"
                    component={TimeClockAdminPage}
                  />
                  <Route
                    path="/pto-command-center"
                    component={PTOCommandCenter}
                  />

                  {/* Auth Routes */}
                  <Route path="/login" component={LoginPage} />

                  {/* Communication Routes */}
                  <Route path="/email-inbox" component={EmailInbox} />

                  {/* User Dashboard Routes */}
                  <Route path="/production-command-center" component={ProductionCommandCenter} />
                  <Route path="/production-control-center" component={ProductionControlCenter} />
                  <Route path="/production-control-center-live" component={ProductionControlCenterLive} />
                  <Route path="/daily-throughput-board" component={DailyThroughputBoard} />
                  <Route path="/ag-dashboard" component={AGTestDashboard} />
                  <Route
                    path="/admin-dashboard"
                    component={ADMINTestDashboard}
                  />
                  <Route
                    path="/johnl-dashboard"
                    component={JOHNLTestDashboard}
                  />
                  <Route path="/jens-dashboard" component={JENSTestDashboard} />
                  <Route
                    path="/staciw-dashboard"
                    component={STACIWTestDashboard}
                  />
                  <Route
                    path="/darleneb-dashboard"
                    component={DARLENEBTestDashboard}
                  />
                  <Route
                    path="/lauriet-dashboard"
                    component={LAURIETTestDashboard}
                  />
                  <Route path="/tims-dashboard" component={TIMSTestDashboard} />
                  <Route
                    path="/bradw-dashboard"
                    component={BRADWTestDashboard}
                  />
                  <Route
                    path="/chasew-dashboard"
                    component={CHASEWTestDashboard}
                  />
                  <Route
                    path="/faleeshah-dashboard"
                    component={FALEESHAHTestDashboard}
                  />
                  <Route path="/blaket-dashboard" component={BLAKETDashboard} />
                  <Route path="/jessicap-dashboard" component={JESSICAPDashboard} />
                  <Route path="/brian-dashboard" component={BRIANDashboard} />
                  <Route path="/tomasm-dashboard" component={TOMASMDashboard} />
                  <Route
                    path="/joeyb-dashboard"
                    component={JOEYBTestDashboard}
                  />
                  <Route
                    path="/tandym-dashboard"
                    component={TANDYMTestDashboard}
                  />

                  {/* Watch Rules Management Route */}
                  <Route path="/watch-rules" component={WatchRulesPage} />

                  {/* Cutting Table Routes - 3-Page Structure */}
                  <Route path="/cutting-control-center/:rest*" component={CuttingControlCenterLayout} />
                  <Route path="/cutting-control-center" component={CuttingControlCenterLayout} />
                  <Route path="/cutting-table-legacy" component={CuttingTableControlCenter} />
                  <Route path="/cutting-table"><Redirect to="/cutting-control-center" /></Route>
                  <Route path="/cutting-dashboard"><Redirect to="/cutting-control-center" /></Route>
                  <Route path="/fabric-inventory" component={FabricInventoryPage} />

                  {/* Employee Badge Routes */}
                  <Route path="/badge-configuration" component={EmployeeBadgeConfiguration} />
                  <Route path="/badge-scanner" component={BadgeScanner} />

                  {/* Test Routes */}
                  <Route path="/module8-test" component={Module8TestPage} />
                  <Route
                    path="/order-department-transfer"
                    component={OrderDepartmentTransfer}
                  />
                  <Route
                    path="/communications/inbox"
                    component={CommunicationInboxPage}
                  />
                  <Route
                    path="/marketing-communications"
                    component={MarketingCommunications}
                  />
                  <Route
                    path="/email-templates"
                    component={EmailTemplateEditor}
                  />
                  <Route
                    path="/sign-order-page-settings"
                    component={SignOrderPageSettings}
                  />
                  <Route path="/enhanced-forms" component={EnhancedFormsPage} />
                  <Route
                    path="/enhanced-reports"
                    component={EnhancedReportsPage}
                  />

                  {/* Business Review */}
                  <Route path="/business-review/sessions/:monthKey" component={FinancialReviewSlidePage} />
                  <Route path="/business-review/sessions" component={FinancialReviewListPage} />
                  <Route path="/business-review" component={FinancialReviewPage} />
                  <Route path="/finance/ap-journal" component={APJournalPage} />
                  <Route path="/finance/ar-journal" component={ARJournalPage} />
                  <Route path="/finance/ar-aging" component={ARAgingPage} />
                  <Route path="/finance/ar-payments" component={ARPaymentsPage} />
                  <Route path="/finance/invoices/new" component={InvoiceFormPage} />
                  <Route path="/finance/invoices/:id/edit" component={InvoiceFormPage} />
                  <Route path="/finance/invoices/:id" component={InvoiceDetailPage} />
                  <Route path="/finance/invoices" component={InvoicesPage} />
                  <Route
                    path="/finance/cogs-report"
                    component={COGSReportPage}
                  />
                  <Route
                    path="/finance/dashboard"
                    component={FinanceDashboardPage}
                  />
                  <Route
                    path="/finance/cost-centers"
                    component={CostCenterManagement}
                  />
                  <Route
                    path="/finance/cost-accounting"
                    component={CostAccountingPage}
                  />
                  <Route
                    path="/finance/chart-of-accounts"
                    component={ChartOfAccountsPage}
                  />
                  <Route
                    path="/finance/burden-rates"
                    component={BurdenRatesAdmin}
                  />
                  <Route
                    path="/finance/monthly-fulfilled"
                    component={MonthlyFulfilledReport}
                  />
                  <Route
                    path="/finance/monthly-shipped"
                    component={MonthlyShippedReport}
                  />
                  <Route
                    path="/finance/bulk-payment"
                    component={BulkPaymentPage}
                  />
                  <Route
                    path="/finance/bulk-payment-history"
                    component={BulkPaymentHistoryPage}
                  />
                  <Route
                    path="/finance/payment-reconciliation"
                    component={PaymentReconciliationPage}
                  />
                  <Route
                    path="/finance/accounting"
                    component={AccountingPage}
                  />
                  <Route
                    path="/finance/accounting-control"
                    component={AccountingControlCenter}
                  />
                  <Route
                    path="/finance/payroll-control"
                    component={PayrollControlPage}
                  />

                  {/* Payment Processing Routes */}
                  <Route
                    path="/payment-management"
                    component={PaymentManagement}
                  />
                  <Route
                    path="/payment-analytics"
                    component={PaymentAnalytics}
                  />
                  <Route
                    path="/historical-data"
                    component={HistoricalDataEntry}
                  />
                  <Route
                    path="/finance/shipped-discounts"
                    component={ShippedOrderDiscountsPage}
                  />
                  <Route
                    path="/finance/invoice-breakdown"
                    component={InvoiceCategoryBreakdownPage}
                  />
                  <Route
                    path="/finance/scrap-report"
                    component={ScrapReportPage}
                  />
                  <Route
                    path="/finance/charge-codes"
                    component={ChargeCodeManagerPage}
                  />

                  {/* Refund Management Routes */}
                  <Route path="/refund-request" component={RefundRequest} />
                  <Route path="/help" component={HelpCenter} />
                  <Route path="/help/p2-order-guide" component={P2OrderGuide} />
                  <Route path="/refund-queue" component={RefundQueue} />
                  <Route path="/rma-form" component={RMAFormPage} />

                  {/* Credit Memo Management */}
                  <Route path="/credit-memo" component={CreditMemoPage} />

                  {/* Forms and Reports Routes */}
                  <Route path="/forms" component={AdminFormsPage} />
                  <Route path="/form/:id" component={FormPage} />
                  <Route path="/reports" component={ReportPage} />
                  <Route path="/reports/po-production-orders" component={POProductionOrdersReport} />
                  <Route
                    path="/form-renderer/:id"
                    component={FormRendererPage}
                  />
                  <Route path="/enhanced-forms" component={EnhancedFormsPage} />
                  <Route
                    path="/enhanced-reports"
                    component={EnhancedReportsPage}
                  />
                  <Route
                    path="/documentation"
                    component={DocumentationPageNew}
                  />

                  {/* P2 Routes - Control Center consolidates all P2 functionality */}
                  <Route path="/p2-control-center" component={P2ControlCenter} />
                  <Route path="/p2-customers" component={P2CustomersPage} />
                  <Route path="/p2-forms" component={P2Forms} />
                  <Route path="/p2-traveler" component={P2TravelerPage} />
                  <Route path="/p2-traveler-viewer" component={P2TravelerViewer} />
                  <Route path="/p2/packing-slip/:id" component={P2PackingSlipViewer} />
                  <Route path="/p2/purchase-orders/:id/preview" component={P2POViewer} />
                  <Route path="/p2/rma/:id" component={P2RmaDetailPage} />
                  <Route path="/p2/certificate/:id" component={P2CertificateViewer} />
                  <Route path="/p2/shipments" component={P2ShipmentHistory} />
                  <Route path="/p2/shipments/:lotId" component={P2ShipmentDetail} />
                  <Route path="/p2/ready-to-ship" component={P2ReadyToShipDashboard} />
                  <Route path="/p2/test-report/:id" component={P2TestReportViewer} />
                  <Route path="/p2-production-queue"><Redirect to="/p2-control-center" /></Route>
                  <Route path="/cutting-table-queue"><Redirect to="/cutting-control-center" /></Route>
                  <Route path="/manufacturing-queue" component={ManufacturingQueue} />
                  <Route path="/kits-queue" component={KitsQueue} />
                  <Route path="/layup-queue" component={LayupQueue} />
                  <Route path="/core-queue" component={CoreQueue} />
                  <Route path="/sub-assembly-queue" component={SubAssemblyQueue} />
                  <Route path="/assembly-queue" component={AssemblyQueue} />
                  <Route path="/cutting-table-mfg-queue"><Redirect to="/cutting-control-center" /></Route>
                  <Route path="/part-routing-management"><Redirect to="/p2-control-center" /></Route>
                  
                  {/* Traveler System - AS9100 compliant production travelers */}
                  <Route path="/travelers" component={TravelerManagement} />
                  <Route path="/travelers/:id" component={TravelerExecution} />
                  <Route path="/travelers/:id/execute" component={TravelerExecution} />
                  
                  {/* Material Traceability System - AS9100 compliant material tracking */}
                  <Route path="/material-receiving" component={MaterialReceivingPage} />
                  <Route path="/material-inventory" component={MaterialInventoryPage} />
                  <Route path="/inventory/restock-signals" component={InventoryRestockSignalsPage} />
                  <Route path="/inventory/cycle-count" component={CycleCountPage} />
                  <Route path="/inventory/cycle-counts" component={CycleCountPage} />
                  <Route
                    path="/master-document-register"
                    component={MasterDocumentRegister}
                  />
                  <Route
                    path="/waste-management-form"
                    component={WasteManagementForm}
                  />
                  <Route
                    path="/rfq-risk-assessment/conversation"
                    component={ConversationalRFQRiskAssessment}
                  />
                  <Route
                    path="/rfq-risk-assessment"
                    component={RFQRiskAssessment}
                  />
                  <Route
                    path="/purchase-review-checklist"
                    component={PurchaseReviewChecklist}
                  />
                  <Route
                    path="/purchase-review-submissions"
                    component={PurchaseReviewSubmissions}
                  />
                  <Route path="/p2-quote-form" component={P2QuoteForm} />
                  <Route path="/p2-quotes-list" component={P2QuotesList} />
                  <Route
                    path="/manufacturers-certificate"
                    component={ManufacturersCertificate}
                  />
                  <Route path="/task-tracker" component={TaskTracker} />
                  <Route path="/preproduction-checklists" component={PreproductionChecklistPage} />
                  <Route path="/pm-control-center" component={PMControlCenterPage} />
                  <Route path="/projects" component={ProjectsPage} />
                  <Route path="/projects/pipeline" component={P2PipelineBoardPage} />
                  <Route path="/projects/:id/closing" component={ProjectClosingRecordPage} />
                  <Route path="/projects/:id" component={ProjectDetailPage} />
                  <Route
                    path="/kickback-tracking"
                    component={KickbackTracking}
                  />
                  <Route
                    path="/document-management"
                    component={DocumentManagement}
                  />
                  <Route
                    path="/routing-document-management"
                    component={RoutingDocumentManagement}
                  />
                  <Route
                    path="/routing-templates"
                    component={RoutingTemplates}
                  />
                  <Route
                    path="/template-library"
                    component={TemplateLibraryPage}
                  />
                  <Route
                    path="/anodize-jobs"
                    component={AnodizeJobs}
                  />
                  <Route
                    path="/document-intelligence"
                    component={DocumentIntelligence}
                  />

                  {/* Training Routes */}
                  <Route path="/training-control-center" component={TrainingControlCenter} />
                  <Route path="/training"><Redirect to="/training-control-center" /></Route>
                  <Route path="/training-management"><Redirect to="/training-control-center" /></Route>
                  <Route path="/training-matrix"><Redirect to="/training-control-center" /></Route>
                  <Route path="/training-matrix-import"><Redirect to="/training-control-center" /></Route>
                  <Route path="/training-matrix-manage"><Redirect to="/training-control-center" /></Route>
                  <Route path="/import-certifications" component={ImportCertifications} />
                  <Route path="/certification-backlog" component={CertificationBacklog} />
                  <Route path="/skill-matrix" component={SkillMatrixPage} />
                  <Route path="/p2-certifications"><Redirect to="/p2-control-center" /></Route>
                  <Route path="/shutdown-training" component={ShutdownProceduresTraining} />
                  <Route path="/counterfeit-prevention-training" component={CounterfeitPreventionTraining} />
                  <Route path="/training/programs" component={ProgramsPage} />
                  <Route path="/training/programs/:id" component={ProgramBuilderPage} />
                  <Route path="/training/plans" component={TrainingPlans} />
                  <Route path="/training/trainer-dashboard" component={TrainerDashboard} />
                  <Route path="/training/my-training" component={TraineeTrainingPortal} />
                  <Route path="/training/work-instructions" component={WorkInstructionsPage} />
                  <Route path="/training/quizzes" component={QuizManagementPage} />
                  <Route path="/training/daily-quizzes" component={DailyQuizSelectionPage} />
                  <Route path="/training/assign" component={AssignProgramPage} />
                  <Route path="/training/sessions/:sessionId" component={SessionDailySheetPage} />
                  <Route path="/training/content-library" component={TrainingContentLibrary} />
                  <Route path="/training/:moduleId" component={TrainingModule} />

                  <Route path="/calendar" component={Calendar} />

                  {/* Queue Management Routes */}
                  <Route
                    path="/enhanced-layup-scheduler"
                    component={EnhancedLayupSchedulerPage}
                  />
                  <Route
                    path="/work-day-scheduler"
                    component={() => <WorkDayAwareScheduler />}
                  />
                  <Route
                    path="/simplified-layup-scheduler"
                    component={SimplifiedLayupScheduler}
                  />
                  <Route path="/p2-serialized-scheduler"><Redirect to="/p2-control-center" /></Route>
                  <Route
                    path="/production-queue"
                    component={ProductionQueueManager}
                  />

                  {/* Nonconformance Tracking Routes */}
                  <Route
                    path="/nonconformance"
                    component={NonconformanceDashboard}
                  />
                  <Route
                    path="/nonconformance-report"
                    component={NonconformanceReport}
                  />

                  {/* RTS (Ready to Ship) Page */}
                  <Route path="/rts" component={RTSPage} />

                  {/* Reports */}
                  <Route
                    path="/ag-bottom-metal-report"
                    component={AGBottomMetalReport}
                  />
                  <Route path="/shipping-tracker" component={ShippingTracker} />
                  <Route path="/weekly-shipments" component={RedirectToShippingTracker} />
                  <Route path="/awaiting-signature" component={AwaitingSignaturePage} />
                  <Route path="/gateway-reports" component={GatewayReports} />
                  <Route path="/metrics-sandbox" component={MetricsSandbox} />
                  <Route path="/metric-directory" component={MetricDirectory} />
                  <Route path="/identity-matrix" component={IdentityMatrixPage} />
                  <Route path="/admin/identity-diagnostic" component={IdentityDiagnosticPage} />
                  <Route path="/past-due-report" component={PastDueReport} />
                  <Route path="/what-if-forecast" component={WhatIfForecast} />

                  {/* Department Queue Management Routes */}
                  <Route
                    path="/department-queue/production-queue"
                    component={ProductionQueuePage}
                  />
                  <Route
                    path="/department-queue/layup-plugging"
                    component={LayupPluggingQueuePage}
                  />
                  <Route
                    path="/department-queue/barcode"
                    component={BarcodeQueuePage}
                  />
                  <Route
                    path="/department-queue/cnc"
                    component={CNCQueuePage}
                  />
                  <Route path="/cnc-dashboard" component={CNCDashboardPage} />
                  <Route path="/cnc-part-routings" component={CNCPartRoutingsPage} />
                  <Route
                    path="/department-queue/finish"
                    component={FinishQueuePage}
                  />
                  <Route
                    path="/department-queue/gunsmith"
                    component={GunsimthQueuePage}
                  />
                  <Route
                    path="/department-queue/finish-qc"
                    component={FinishQCQueuePage}
                  />
                  <Route
                    path="/finish-qc-queue"
                    component={FinishQCQueuePage}
                  />
                  <Route
                    path="/department-queue/paint"
                    component={PaintQueuePage}
                  />
                  <Route
                    path="/department-queue/qc-shipping"
                    component={QCShippingQueuePage}
                  />
                  <Route
                    path="/oem-shipments"
                    component={OEMShipmentsPage}
                  />
                  <Route
                    path="/department-queue/shipping"
                    component={ShippingQueuePage}
                  />

                  {/* Shipping Label Route */}
                  <Route
                    path="/shipping/label/:orderId"
                    component={ShippingLabelPage}
                  />

                  {/* Sign Order Routes - Public routes for customers */}
                  <Route
                    path="/sign-order/:token"
                    component={SignOrderPage}
                  />
                  <Route
                    path="/sign-order"
                    component={SignOrderPage}
                  />
                  
                  <Route path="/command-center" component={CommandCenter} />

                  {/* EDRI — EPOCH DCAA Readiness Index */}
                  <Route path="/admin/edri" component={EdriDashboard} />
                  <Route path="/admin/edri/heatmap" component={EdriHeatmap} />
                  <Route path="/admin/edri/red-flags" component={EdriRedFlags} />
                  <Route path="/admin/edri/remediation" component={EdriRemediation} />
                  <Route path="/admin/edri/missing-evidence" component={EdriMissingEvidence} />
                  <Route path="/admin/edri/history" component={EdriHistory} />
                  <Route path="/admin/edri/charge-code-usage" component={ChargeCodeUsageReport} />
                  <Route path="/admin/edri/labor-distribution" component={LaborDistributionReport} />
                  <Route path="/admin/edri/transaction-evidence-map" component={TransactionEvidenceMap} />
                  <Route path="/admin/edri/supervisor-approval-exceptions" component={SupervisorApprovalExceptionReport} />
                  <Route path="/admin/edri/timesheet-correction-log" component={TimesheetCorrectionLogReport} />
                  <Route path="/admin/edri/payroll-export-reconciliation" component={PayrollExportReconciliationReport} />
                  <Route path="/admin/edri/indirect-cost-burden-rates" component={IndirectCostBurdenRateReport} />
                  <Route path="/admin/edri/unallowable-cost-review" component={UnallowableCostReviewReport} />
                  <Route path="/admin/edri/procurement-compliance" component={ProcurementComplianceReport} />
                  <Route path="/admin/edri/inventory-traceability" component={InventoryTraceabilityReport} />
                  <Route path="/admin/edri/audit-ledger-integrity" component={AuditLedgerIntegrityReport} />
                  <Route path="/admin/edri/policy-training-acknowledgment" component={PolicyTrainingAcknowledgmentReport} />
                  <Route path="/admin/edri/supporting-docs" component={EdriSupportingDocs} />
                  <Route path="/admin/edri/domain/:domainKey" component={EdriDomainDetail} />
                  <Route path="/admin/edri/snapshot/:snapshotId/evidence/:domainKey" component={EdriEvidence} />
                  <Route path="/admin/edri/snapshot/:snapshotId/evidence" component={EdriEvidence} />
                  <Route path="/admin/edri/executive-matrix" component={EdriExecutiveMatrix} />
                  <Route path="/admin/edri/snapshot/:snapshotId" component={EdriSnapshotDetail} />
                  <Route path="/admin/dcaa-findings" component={DcaaFindings} />

                  {/* CMMC 2.0 Level 2 Readiness Dashboard */}
                  <Route path="/admin/cmmc" component={CmmcDashboard} />

                  {/* Business Continuity Dashboard */}
                  <Route path="/admin/continuity" component={BusinessContinuityDashboard} />
                  {/* Prompt Library (ADMIN/OWNER only) */}
                  <Route path="/prompt-library" component={ProteusLabsDashboard} />
                  <Route path="/prompt-library/new" component={ProteusPromptBuilder} />
                  <Route path="/prompt-library/history" component={ProteusExecutionHistory} />
                  <Route path="/prompt-library/:id/edit" component={ProteusPromptBuilder} />
                  <Route path="/prompt-library/:id" component={ProteusPromptDetail} />
                  <Route path="/proteus-labs"><Redirect to="/prompt-library" /></Route>
                  <Route path="/proteus-labs/new"><Redirect to="/prompt-library/new" /></Route>
                  <Route path="/proteus-labs/history"><Redirect to="/prompt-library/history" /></Route>
                  <Route path="/proteus-labs/:id/edit">
                    {(params) => <Redirect to={`/prompt-library/${params.id}/edit`} />}
                  </Route>
                  <Route path="/proteus-labs/:id">
                    {(params) => <Redirect to={`/prompt-library/${params.id}`} />}
                  </Route>

                  {/* Vendor PO Confirmation — public route for external vendors */}
                  <Route path="/vendor-confirm" component={VendorConfirmPage} />

                  {/* Fill and Sign Routes - Public routes for customers */}
                  <Route
                    path="/fill-and-sign/:publicSignatureId"
                    component={FillAndSignPage}
                  />

                    {/* Catch-all route for 404 */}
                    <Route component={NotFound} />
                  </Switch>
                </RouteGuard>
              </ConditionalMainWrapper>
            </div>
            <Toaster />
            <HotToaster />
            <WebSocketNotifications />
            <SessionAwareMessageNotificationPopup />
            <SessionExpiryListener />
            <ImprovementNoteCapture />
          </Router>
        </DeploymentAuthWrapper>
      </QueryClientProvider>
    );
  } catch (error) {
    console.error('Error in App component:', error);
    return <div>Error loading application</div>;
  }
}

export default App;
