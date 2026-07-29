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
import ErrorBoundary from './components/ErrorBoundary';
// ── Lazy page imports (route-level code splitting) ──────────────────────────
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const OrderManagement = React.lazy(() => import('./pages/OrderManagement'));
const OrdersManagementPage = React.lazy(() => import('./pages/OrdersManagementPage'));
const DiscountManagement = React.lazy(() => import('./pages/DiscountManagement'));
const OrderEntry = React.lazy(() => import('./pages/OrderEntry'));
const OrderEntryTest = React.lazy(() => import('./components/OrderEntryTest'));
const OrdersList = React.lazy(() => import('./pages/OrdersList'));
const PastDueReport = React.lazy(() => import('./pages/PastDueReport'));
const WhatIfForecast = React.lazy(() => import('./pages/WhatIfForecast'));
const OrdersListSimple = React.lazy(() => import('./pages/OrdersListSimple'));
const FeatureManager = React.lazy(() => import('./pages/FeatureManager'));
const StockModels = React.lazy(() => import('./pages/StockModels'));
const DraftOrders = React.lazy(() => import('./components/DraftOrders'));
const AdminFormsPage = React.lazy(() => import('./pages/AdminFormsPage'));
const FormPage = React.lazy(() => import('./pages/FormPage'));
const ReportPage = React.lazy(() => import('./pages/ReportPage'));
const InventoryScannerPage = React.lazy(() => import('./pages/InventoryScannerPage'));
const InventoryDashboardPage = React.lazy(() => import('./pages/InventoryDashboardPage'));
const InventoryManagerPage = React.lazy(() => import('./pages/InventoryManagerPage'));
const InventoryLedgerPage = React.lazy(() => import('./pages/InventoryLedgerPage'));
const InventoryTraceabilityPage = React.lazy(() => import('./pages/InventoryTraceabilityPage'));
const InventoryReceivingPage = React.lazy(() => import('./pages/InventoryReceivingPage'));
const InventoryReceivingControlCenter = React.lazy(() => import('./pages/InventoryReceivingControlCenter'));
const InventoryReceivingPageLegacy = React.lazy(() => import('./pages/InventoryReceivingPageLegacy'));
const EnhancedInventoryMRPPage = React.lazy(() => import('./pages/EnhancedInventoryMRPPage'));
const MaterialReadinessDashboard = React.lazy(() => import('./pages/MaterialReadinessDashboard'));
const MaterialIntelligenceDashboard = React.lazy(() => import('./pages/MaterialIntelligenceDashboard'));
const DepartmentPartsRequestPage = React.lazy(() => import('./pages/DepartmentPartsRequestPage'));
const PartsRequestsCard = React.lazy(() => import('./components/inventory/PartsRequestsCard'));
const ConsolidatedNeedsListPage = React.lazy(() => import('./pages/ConsolidatedNeedsListPage'));
const QCPage = React.lazy(() => import('./pages/QCPage'));
const AuditSettings = React.lazy(() => import('./pages/AuditSettings'));
const VaultPage = React.lazy(() => import('./pages/VaultPage'));
const OrderTimeline = React.lazy(() => import('./pages/OrderTimeline'));
const MediaLibrary = React.lazy(() => import('./pages/MediaLibrary'));
const SignPDFPage = React.lazy(() => import('./pages/SignPDFPage'));
const SignedDocumentsLibrary = React.lazy(() => import('./pages/SignedDocumentsLibrary'));
const SignatureWorkflowPage = React.lazy(() => import('./pages/SignatureWorkflowPage'));
const ReferenceDocsPage = React.lazy(() => import('./pages/ReferenceDocsPage'));
const PolicyLibraryPage = React.lazy(() => import('./pages/PolicyLibraryPage'));
const PoliciesAdminPage = React.lazy(() => import('./pages/admin/PoliciesAdminPage'));
import PolicyAcknowledgmentGate from './components/PolicyAcknowledgmentGate';
const VoiceNotesPage = React.lazy(() => import('./pages/VoiceNotesPage'));
const EpochCopilotPage = React.lazy(() => import('./pages/EpochCopilotPage'));
const ProcessRuns = React.lazy(() => import('./pages/ProcessRuns'));
const ProductionStationDashboard = React.lazy(() => import('./pages/ProductionStationDashboard'));
const TVDisplayPage = React.lazy(() => import('./pages/TVDisplayPage'));
const TVTimerBoard = React.lazy(() => import('./pages/TVTimerBoard'));
const ProductionTimerHistory = React.lazy(() => import('./pages/ProductionTimerHistory'));
const TimerProgramsPage = React.lazy(() => import('./pages/TimerProgramsPage'));
const FieldPage = React.lazy(() => import('./pages/FieldPage'));
const ExecutiveRundown = React.lazy(() => import('./pages/ExecutiveRundown'));
const TicketsPage = React.lazy(() => import('./pages/TicketsPage'));
const TicketsCommandCenter = React.lazy(() => import('./pages/TicketsCommandCenter'));
const PDFSignatureTool = React.lazy(() => import('./pages/PDFSignatureTool'));
const MaintenancePage = React.lazy(() => import('./pages/MaintenancePage'));
const FreezerTemperatureLogPage = React.lazy(
  () => import('./pages/FreezerTemperatureLogPage')
);
const MaintenanceEventsPage = React.lazy(() => import('./pages/MaintenanceEventsPage'));
const WorkOrderDetailPage = React.lazy(() => import('./pages/WorkOrderDetailPage'));
const ProductionWorkOrderDetailPage = React.lazy(() => import('./pages/ProductionWorkOrderDetailPage'));
const WADWizardPage = React.lazy(() => import('./pages/WADWizardPage'));
const WADWizardLauncherPage = React.lazy(() => import('./pages/WADWizardLauncherPage'));
const WADStatusDashboard = React.lazy(() => import('./pages/WADStatusDashboard'));
const WADSummaryPage = React.lazy(() => import('./pages/WADSummaryPage'));
const AssetsPage = React.lazy(() => import('./pages/AssetsPage'));
const AssetDashboardPage = React.lazy(() => import('./pages/AssetDashboardPage'));
const QMSPlaceholderPage = React.lazy(() => import('./pages/QMSPlaceholderPage'));
const QMSChangeControlPage = React.lazy(() => import('./pages/QMSChangeControlPage'));
const MyQualityActionsPage = React.lazy(() => import('./pages/MyQualityActionsPage'));
const QMSDesignControlPage = React.lazy(() => import('./pages/QMSDesignControlPage'));
const QMSPartsEquipmentPage = React.lazy(() => import('./pages/QMSPartsEquipmentPage'));
const AS9100AuditReadinessPage = React.lazy(() => import('./pages/AS9100AuditReadinessPage'));
const EpochSoftwareValidationPage = React.lazy(() => import('./pages/EpochSoftwareValidationPage'));
const EmployeePortalPage = React.lazy(() => import('./pages/EmployeePortalPage'));
const KioskPage = React.lazy(() => import('./pages/timekeeping/KioskPage'));
const TimeClockAdminPage = React.lazy(() => import('./pages/timekeeping/TimeClockAdminPage'));
const SalariedTimeEntryPage = React.lazy(() => import('./pages/timekeeping/SalariedTimeEntryPage'));
const SalariedDraftListPage = React.lazy(() => import('./pages/timekeeping/SalariedDraftListPage'));
const PTOCommandCenter = React.lazy(() => import('./pages/PTOCommandCenter'));
const Module8TestPage = React.lazy(() => import('./pages/Module8TestPage'));
const CommunicationInboxPage = React.lazy(() => import('./pages/CommunicationInboxPage'));
const MarketingCommunications = React.lazy(() => import('./pages/MarketingCommunications'));
const EmailTemplateEditor = React.lazy(() => import('./pages/EmailTemplateEditor'));
const SignOrderPageSettings = React.lazy(() => import('./pages/SignOrderPageSettings'));
const APJournalPage = React.lazy(() => import('./pages/APJournalPage'));
const ARJournalPage = React.lazy(() => import('./pages/ARJournalPage'));
const InvoicesPage = React.lazy(() => import('./pages/InvoicesPage'));
const InvoiceFormPage = React.lazy(() => import('./pages/InvoiceFormPage'));
const InvoiceDetailPage = React.lazy(() => import('./pages/InvoiceDetailPage'));
const ARAgingPage = React.lazy(() => import('./pages/ARAgingPage'));
const ARPaymentsPage = React.lazy(() => import('./pages/ARPaymentsPage'));
const COGSReportPage = React.lazy(() => import('./pages/COGSReportPage'));
const FinanceDashboardPage = React.lazy(() => import('./pages/FinanceDashboardPage'));
const FinancialReviewPage = React.lazy(() => import('./pages/FinancialReviewPage'));
const FinancialReviewListPage = React.lazy(() => import('./pages/FinancialReviewListPage'));
const FinancialReviewSlidePage = React.lazy(() => import('./pages/FinancialReviewSlidePage'));
const CostCenterManagement = React.lazy(() => import('./pages/CostCenterManagement'));
const CostAccountingPage = React.lazy(() => import('./pages/CostAccountingPage'));
const ChartOfAccountsPage = React.lazy(() => import('./pages/ChartOfAccountsPage'));
const BurdenRatesAdmin = React.lazy(() => import('./pages/BurdenRatesAdmin'));
const MonthlyFulfilledReport = React.lazy(() => import('./pages/MonthlyFulfilledReport'));
const MonthlyShippedReport = React.lazy(() => import('./pages/MonthlyShippedReport'));
const POProductionOrdersReport = React.lazy(() => import('./pages/POProductionOrdersReport'));
const BulkPaymentPage = React.lazy(() => import('./pages/BulkPaymentPage'));
const BulkPaymentHistoryPage = React.lazy(() => import('./pages/BulkPaymentHistoryPage'));
const PaymentReconciliationPage = React.lazy(() => import('./pages/PaymentReconciliationPage'));
const AccountingPage = React.lazy(() => import('./pages/AccountingPage'));
const AccountingControlCenter = React.lazy(() => import('./pages/AccountingControlCenter'));
const PayrollControlPage = React.lazy(() => import('./pages/finance/PayrollControlPage'));
const EmployeeBadgeConfiguration = React.lazy(() => import('./pages/EmployeeBadgeConfiguration'));
const BadgeScanner = React.lazy(() => import('./pages/BadgeScanner'));
const OnboardingDashboard = React.lazy(() => import('./pages/OnboardingDashboard'));
const OnboardingInvitePage = React.lazy(() => import('./pages/OnboardingInvitePage'));
const OnboardingPathsPage = React.lazy(() => import('./pages/OnboardingPathsPage'));
const OnboardingSettingsPage = React.lazy(() => import('./pages/OnboardingSettingsPage'));
const EmployerSignaturesPage = React.lazy(() => import('./pages/EmployerSignaturesPage'));
const OnboardingFormsPage = React.lazy(() => import('./pages/OnboardingFormsPage'));
const OnboardingSessionWizard = React.lazy(() => import('./pages/OnboardingSessionWizard'));
const EnhancedFormsPage = React.lazy(() => import('./pages/EnhancedFormsPage'));
const EnhancedReportsPage = React.lazy(() => import('./pages/EnhancedReportsPage'));
const FormRendererPage = React.lazy(() => import('./pages/FormRendererPage'));
const DocumentationPageNew = React.lazy(() => import('./pages/DocumentationPageNew'));
const CustomerManagement = React.lazy(() => import('./pages/CustomerManagement'));
const VendorManagement = React.lazy(() => import('./pages/VendorManagement'));
const ManageGroups = React.lazy(() => import('./pages/ManageGroups'));
const PurchaseOrders = React.lazy(() => import('./pages/PurchaseOrders'));
const P2ControlCenter = React.lazy(() => import('./pages/P2ControlCenter'));
const P2CustomersPage = React.lazy(() => import('./pages/P2CustomersPage'));
const P2Forms = React.lazy(() => import('./pages/P2Forms'));
const ManufacturingQueue = React.lazy(() => import('./pages/ManufacturingQueue'));
const KitsQueue = React.lazy(() => import('./pages/KitsQueue'));
const LayupQueue = React.lazy(() => import('./pages/LayupQueue'));
const CoreQueue = React.lazy(() => import('./pages/CoreQueue'));
const SubAssemblyQueue = React.lazy(() => import('./pages/SubAssemblyQueue'));
const AssemblyQueue = React.lazy(() => import('./pages/AssemblyQueue'));
const P2TravelerPage = React.lazy(() => import('./pages/P2TravelerPage'));
const P2TravelerViewer = React.lazy(() => import('./pages/P2TravelerViewer'));
const P2PackingSlipViewer = React.lazy(() => import('./pages/P2PackingSlipViewer'));
const P2POViewer = React.lazy(() => import('./pages/P2POViewer'));
const P2CertificateViewer = React.lazy(() => import('./pages/P2CertificateViewer'));
const P2RmaDetailPage = React.lazy(() => import('./pages/P2RmaDetailPage'));
const P2ShipmentDetail = React.lazy(() => import('./pages/P2ShipmentDetail'));
const P2ShipmentHistory = React.lazy(() => import('./pages/P2ShipmentHistory'));
const P2MaterialTransferForm = React.lazy(() => import('./pages/P2MaterialTransferForm'));
const P2TestReportViewer = React.lazy(() => import('./pages/P2TestReportViewer'));
const P2ReadyToShipDashboard = React.lazy(() => import('./pages/P2ReadyToShipDashboard'));
const POProductsPage = React.lazy(() => import('./pages/POProductsPage'));
const ProductLabelsPage = React.lazy(() => import('./pages/ProductLabelsPage'));
const ProductionTracking = React.lazy(() => import('./pages/ProductionTracking'));
const CustomerWIPPage = React.lazy(() => import('./pages/CustomerWIPPage'));
const BarcodeScannerPage = React.lazy(() => import('./pages/BarcodeScannerPage'));
const AllOrdersPage = React.lazy(() => import('./pages/AllOrdersPage'));
const OrderReports = React.lazy(() => import('./pages/OrderReports'));
const ProductionOrderInspector = React.lazy(() => import('./pages/ProductionOrderInspector'));
const DomainTruthInspector = React.lazy(() => import('./pages/DomainTruthInspector'));
const QueueIntegrityMonitor = React.lazy(() => import('./pages/admin/QueueIntegrityMonitor'));
const ShippingStatusAuditPage = React.lazy(() => import('./pages/admin/ShippingStatusAuditPage'));
const P1POStatusRepairPage = React.lazy(() => import('./pages/admin/P1POStatusRepairPage'));
const ProductionControlTower = React.lazy(() => import('./pages/admin/ProductionControlTower'));
const LocateOrder = React.lazy(() => import('./pages/LocateOrder'));
const LinkGroupsReport = React.lazy(() => import('./pages/LinkGroupsReport'));
const DueDateCapacityReport = React.lazy(() => import('./pages/DueDateCapacityReport'));
const AnalyticsDashboard = React.lazy(() => import('./pages/AnalyticsDashboard'));
const QuoteAccuracyDashboard = React.lazy(() => import('./pages/QuoteAccuracyDashboard'));
const AGTestDashboard = React.lazy(() => import('./pages/AGTestDashboard'));
const ADMINTestDashboard = React.lazy(() => import('./pages/GLENNTestDashboard'));
const AdminDashboardPreview = React.lazy(() => import('./pages/AdminDashboardPreview'));
const ProductionCommandCenter = React.lazy(() => import('./pages/ProductionCommandCenter'));
const ProductionControlCenter = React.lazy(() => import('./pages/ProductionControlCenter'));
const ProductionControlCenterLive = React.lazy(() => import('./pages/ProductionControlCenterLive'));
const DailyThroughputBoard = React.lazy(() => import('./pages/DailyThroughputBoard'));
const JOHNLTestDashboard = React.lazy(() => import('./pages/JOHNLTestDashboard'));
const JENSTestDashboard = React.lazy(() => import('./pages/JENSTestDashboard'));
const STACIWTestDashboard = React.lazy(() => import('./pages/STACIWTestDashboard'));
const DARLENEBTestDashboard = React.lazy(() => import('./pages/DARLENEBTestDashboard'));
const LAURIETTestDashboard = React.lazy(() => import('./pages/LAURIETTestDashboard'));
const TIMSTestDashboard = React.lazy(() => import('./pages/TIMSTestDashboard'));
const WatchRulesPage = React.lazy(() => import('./pages/WatchRulesPage'));
const BRADWTestDashboard = React.lazy(() => import('./pages/BRADWTestDashboard'));
const CHASEWTestDashboard = React.lazy(() => import('./pages/CHASEWTestDashboard'));
const FALEESHAHTestDashboard = React.lazy(() => import('./pages/FALEESHAHTestDashboard'));
const BLAKETDashboard = React.lazy(() => import('./pages/BLAKETDashboard'));
const JESSICAPDashboard = React.lazy(() => import('./pages/JESSICAPDashboard'));
const BRIANDashboard = React.lazy(() => import('./pages/BRIANDashboard'));
const TOMASMDashboard = React.lazy(() => import('./pages/TOMASMDashboard'));
const JOEYBTestDashboard = React.lazy(() => import('./pages/JOEYBTestDashboard'));
const ANGIETTestDashboard = React.lazy(() => import('./pages/ANGIETTestDashboard'));
const TANDYMTestDashboard = React.lazy(() => import('./pages/TANDYMTestDashboard'));
const OrderDepartmentTransfer = React.lazy(() => import('./pages/OrderDepartmentTransfer'));
const BOMAdministration = React.lazy(() => import('./pages/BOMAdministration').then(m => ({ default: m.BOMAdministration })));
const RobustBOMAdministration = React.lazy(() => import('./pages/RobustBOMAdministration'));
const AGBottomMetalReport = React.lazy(() => import('./pages/AGBottomMetalReport'));
const ShippingTracker = React.lazy(() => import('./pages/ShippingTracker'));
const EmployeeDashboard = React.lazy(() => import('./pages/EmployeeDashboard'));
const EmployeeDetail = React.lazy(() => import('./pages/EmployeeDetail'));
const EmployeePortal = React.lazy(() => import('./pages/EmployeePortal'));
const UserManagement = React.lazy(() => import('./pages/UserManagement'));
const Settings = React.lazy(() => import('./pages/Settings'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const MasterDocumentRegister = React.lazy(() => import('@/pages/MasterDocumentRegister'));
const WasteManagementForm = React.lazy(() => import('@/pages/WasteManagementForm'));
const TaskTracker = React.lazy(() => import('@/pages/TaskTracker'));
const KickbackTracking = React.lazy(() => import('@/components/KickbackTracking'));
const DocumentManagement = React.lazy(() => import('./pages/DocumentManagement'));
const RoutingDocumentManagement = React.lazy(() => import('./pages/RoutingDocumentManagement'));
const RoutingTemplates = React.lazy(() => import('./pages/RoutingTemplates'));
const TemplateLibraryPage = React.lazy(() => import('./pages/TemplateLibraryPage'));
const AnodizeJobs = React.lazy(() => import('./pages/AnodizeJobs'));
const ShutdownProceduresTraining = React.lazy(() => import('@/pages/ShutdownProceduresTraining'));
const CounterfeitPreventionTraining = React.lazy(() => import('@/pages/CounterfeitPreventionTraining'));
const TrainingControlCenter = React.lazy(() => import('@/pages/TrainingControlCenter'));
const TrainingModule = React.lazy(() => import('@/pages/TrainingModule'));
const TrainingPlans = React.lazy(() => import('@/pages/TrainingPlans'));
const TrainerDashboard = React.lazy(() => import('@/pages/TrainerDashboard'));
const TraineeTrainingPortal = React.lazy(() => import('@/pages/TraineeTrainingPortal'));
const TrainingContentLibrary = React.lazy(() => import('@/pages/TrainingContentLibrary'));
const ProgramsPage = React.lazy(() => import('@/modules/training-builder').then(m => ({ default: m.ProgramsPage })));
const ProgramBuilderPage = React.lazy(() => import('@/modules/training-builder').then(m => ({ default: m.ProgramBuilderPage })));
const AssignProgramPage = React.lazy(() => import('@/modules/training-builder').then(m => ({ default: m.AssignProgramPage })));
const SessionDailySheetPage = React.lazy(() => import('@/modules/training-builder').then(m => ({ default: m.SessionDailySheetPage })));
const WorkInstructionsPage = React.lazy(() => import('@/modules/training-builder').then(m => ({ default: m.WorkInstructionsPage })));
const QuizManagementPage = React.lazy(() => import('@/modules/training-builder').then(m => ({ default: m.QuizManagementPage })));
const DailyQuizSelectionPage = React.lazy(() => import('@/modules/training-builder').then(m => ({ default: m.DailyQuizSelectionPage })));
const ImportCertifications = React.lazy(() => import('@/pages/ImportCertifications'));
const CertificationBacklog = React.lazy(() => import('@/pages/CertificationBacklog'));
const SkillMatrixPage = React.lazy(() => import('@/pages/SkillMatrixPage'));
const Calendar = React.lazy(() => import('./pages/Calendar'));
const EmailInbox = React.lazy(() => import('./pages/EmailInbox'));
const LayupPluggingQueuePage = React.lazy(() => import('./pages/LayupPluggingQueuePage'));
const BarcodeQueuePage = React.lazy(() => import('./pages/BarcodeQueuePage'));
const BulkBarcodeReprint = React.lazy(() => import('./pages/BulkBarcodeReprint'));
const CNCQueuePage = React.lazy(() => import('./pages/CNCQueuePage'));
const CNCDashboardPage = React.lazy(() => import('./pages/CNCDashboardPage'));
const CNCPartRoutingsPage = React.lazy(() => import('./pages/CNCPartRoutingsPage'));
const CNCOperationBatchStation = React.lazy(() => import('./pages/CNCOperationBatchStation'));
const FinishQCQueuePage = React.lazy(() => import('./pages/FinishQCQueuePage'));
const FinishQueuePage = React.lazy(() => import('./pages/FinishQueuePage'));
const FinishQCPage = React.lazy(() => import('./pages/FinishQCPage'));
const FinishQCCompletedReport = React.lazy(() => import('./pages/FinishQCCompletedReport'));
const GunsimthQueuePage = React.lazy(() => import('./pages/GunsimthQueuePage'));
const PaintQueuePage = React.lazy(() => import('./pages/PaintQueuePage'));
const QCShippingQueuePage = React.lazy(() => import('./pages/QCShippingQueuePage'));
const OEMShipmentsPage = React.lazy(() => import('./pages/OEMShipmentsPage'));
const ShippingQueuePage = React.lazy(() => import('./pages/ShippingQueuePage'));
const ShippingLabelPage = React.lazy(() => import('./pages/ShippingLabelPage'));
const NonconformanceDashboard = React.lazy(() => import('./components/NonconformanceDashboard'));
const NonconformanceReport = React.lazy(() => import('./components/NonconformanceReport'));
const RTSPage = React.lazy(() => import('./pages/RTSPage'));
const RFQRiskAssessment = React.lazy(() => import('./pages/RFQRiskAssessment'));
const ConversationalRFQRiskAssessment = React.lazy(() => import('./pages/ConversationalRFQRiskAssessment'));
const ProductionQueueManager = React.lazy(() => import('./components/ProductionQueueManager'));
const EnhancedLayupSchedulerPage = React.lazy(() => import('./pages/EnhancedLayupSchedulerPage'));
const WorkDayAwareScheduler = React.lazy(() => import('./components/WorkDayAwareScheduler'));
const PurchaseReviewChecklist = React.lazy(() => import('./pages/PurchaseReviewChecklist'));
const PurchaseReviewSubmissions = React.lazy(() => import('./pages/PurchaseReviewSubmissions'));
const ManufacturersCertificate = React.lazy(() => import('./pages/ManufacturersCertificate'));
const P2QuoteForm = React.lazy(() => import('./pages/P2QuoteForm'));
const P2QuotesList = React.lazy(() => import('./pages/P2QuotesList'));
const PaymentManagement = React.lazy(() => import('./pages/PaymentManagement'));
const PaymentAnalytics = React.lazy(() => import('./pages/PaymentAnalytics'));
const HistoricalDataEntry = React.lazy(() => import('./pages/HistoricalDataEntry'));
const ShippedOrderDiscountsPage = React.lazy(() => import('./pages/ShippedOrderDiscountsPage'));
const InvoiceCategoryBreakdownPage = React.lazy(() => import('./pages/InvoiceCategoryBreakdownPage'));
const ScrapReportPage = React.lazy(() => import('./pages/ScrapReportPage'));
const ChargeCodeManagerPage = React.lazy(() => import('./pages/finance/ChargeCodeManagerPage'));
const RefundRequest = React.lazy(() => import('./pages/RefundRequest'));
const RefundQueue = React.lazy(() => import('./pages/RefundQueue'));
const RMAFormPage = React.lazy(() => import('./pages/RMAFormPage'));
const CreditMemoPage = React.lazy(() => import('./pages/CreditMemoPage'));
const ProductionQueuePage = React.lazy(() => import('./pages/ProductionQueuePage'));
const SimplifiedLayupScheduler = React.lazy(() => import('./components/SimplifiedLayupScheduler'));
const CustomerSatisfaction = React.lazy(() => import('./pages/CustomerSatisfaction'));
const AdminPanelPage = React.lazy(() => import('./pages/AdminPanelPage'));
const AdminChecklistManagementPage = React.lazy(() => import('./pages/AdminChecklistManagementPage'));
const RolesPermissionsPage = React.lazy(() => import('./pages/admin/RolesPermissionsPage'));
const OperatorAuthSessionsPage = React.lazy(() => import('./pages/admin/OperatorAuthSessionsPage'));
const OrderLookupPage = React.lazy(() => import('./pages/admin/OrderLookupPage'));
const OrderOverridePage = React.lazy(() => import('./pages/admin/OrderOverridePage'));
const WidgetCatalogPage = React.lazy(() => import('./pages/admin/WidgetCatalogPage'));
const ProductionForecastPage = React.lazy(() => import('./pages/ProductionForecastPage'));
const ForecastSettings = React.lazy(() => import('./pages/ForecastSettings'));
const AccountingPrepPage = React.lazy(() => import('./pages/AccountingPrepPage'));
const SystemHealthChecksPage = React.lazy(() => import('./pages/SystemHealthChecksPage'));
const CommunicationLogsPage = React.lazy(() => import('./pages/CommunicationLogsPage'));
const MonitoredLinksManager = React.lazy(() => import('./pages/MonitoredLinksManager'));
const VendorsPage = React.lazy(() => import('./pages/VendorsPage'));
const PurchaseRequisitionsPage = React.lazy(() => import('./pages/PurchaseRequisitionsPage'));
const VendorPOPage = React.lazy(() => import('./pages/VendorPOPage'));
const VendorPOComplianceBackfillPage = React.lazy(() => import('./pages/VendorPOComplianceBackfillPage'));
const PDFTemplateManager = React.lazy(() => import('./pages/PDFTemplateManager'));
const CuttingControlCenterLayout = React.lazy(() => import('./pages/cutting/CuttingControlCenterLayout'));
const FabricInventoryPage = React.lazy(() => import('./pages/FabricInventoryPage'));
const MetalAccessoriesTracker = React.lazy(() => import('./pages/MetalAccessoriesTracker'));
const DocumentIntelligence = React.lazy(() => import('./pages/DocumentIntelligence'));
const SignOrderPage = React.lazy(() => import('./pages/SignOrderPage'));
const FillAndSignPage = React.lazy(() => import('./pages/FillAndSignPage'));
const QRCodeAdminPage = React.lazy(() => import('./pages/QRCodeAdminPage'));
const QRErrorPage = React.lazy(() => import('./pages/QRErrorPage'));
const AttentionDashboard = React.lazy(() => import('./pages/AttentionDashboard'));
const FillablePdfTemplatesAdmin = React.lazy(() => import('./pages/FillablePdfTemplatesAdmin'));
const VisualFieldEditor = React.lazy(() => import('./pages/VisualFieldEditor'));
const PdfFormsPage = React.lazy(() => import('./pages/PdfFormsPage'));
const PdfFormsEditorPage = React.lazy(() => import('./pages/PdfFormsEditorPage'));
const PdfFormsFillPage = React.lazy(() => import('./pages/PdfFormsFillPage'));
const PDFSettings = React.lazy(() => import('./pages/PDFSettings'));
const GatewayReports = React.lazy(() => import('./pages/GatewayReports'));
const MetricsSandbox = React.lazy(() => import('./pages/MetricsSandbox'));
const MetricDirectory = React.lazy(() => import('./pages/MetricDirectory'));
const PreproductionChecklistPage = React.lazy(() => import('./pages/PreproductionChecklistPage'));
const ProjectsPage = React.lazy(() => import('./pages/ProjectsPage'));
const ProjectDetailPage = React.lazy(() => import('./pages/ProjectDetailPage'));
const ProjectClosingRecordPage = React.lazy(() => import('./pages/ProjectClosingRecordPage'));
const P2PipelineBoardPage = React.lazy(() => import('./pages/P2PipelineBoardPage'));
const PMControlCenterPage = React.lazy(() => import('./pages/PMControlCenterPage'));
const HelpCenter = React.lazy(() => import('./pages/HelpCenter'));
const P2OrderGuide = React.lazy(() => import('./pages/P2OrderGuide'));
const TimeclockTrainingProgramGuide = React.lazy(() => import('./pages/TimeclockTrainingProgramGuide'));
const PTORequestGuide = React.lazy(() => import('./pages/PTORequestGuide'));
const PunchEditRequestGuide = React.lazy(() => import('./pages/PunchEditRequestGuide'));
const TimesheetReviewGuide = React.lazy(() => import('./pages/TimesheetReviewGuide'));
const TravelerManagement = React.lazy(() => import('./pages/TravelerManagement'));
const TravelerExecution = React.lazy(() => import('./pages/TravelerExecution'));
const MaterialReceivingPage = React.lazy(() => import('./pages/MaterialReceivingPage'));
const MaterialInventoryPage = React.lazy(() => import('./pages/MaterialInventoryPage'));
const InventoryRestockSignalsPage = React.lazy(() => import('./pages/InventoryRestockSignalsPage'));
const InventoryReconciliationPage = React.lazy(() => import('./pages/InventoryReconciliationPage'));
const CycleCountPage = React.lazy(() => import('./pages/CycleCountPage'));
const FilteredOrdersReport = React.lazy(() => import('./pages/FilteredOrdersReport'));
const UrgentOrdersReport = React.lazy(() => import('./pages/UrgentOrdersReport'));
const OTDReport = React.lazy(() => import('./pages/OTDReport'));
const OrderHeatMap = React.lazy(() => import('./pages/OrderHeatMap'));
const QuickNotesPage = React.lazy(() => import('./pages/QuickNotesPage'));
const ImprovementNotesDashboard = React.lazy(() => import('./pages/ImprovementNotesDashboard'));
const RFQListPage = React.lazy(() => import('./pages/RFQListPage'));
const RFQBuilderPage = React.lazy(() => import('./pages/RFQBuilderPage'));
const DraftBOMBuilderPage = React.lazy(() => import('./pages/DraftBOMBuilderPage'));
const RDProjectsPage = React.lazy(() => import('./pages/RDProjectsPage'));
const SystemAuditsPage = React.lazy(() => import('./pages/SystemAuditsPage'));
const AuditLedgerPage = React.lazy(() => import('./pages/AuditLedgerPage'));
const InventoryAnomalyDashboard = React.lazy(() => import('./pages/InventoryAnomalyDashboard'));
const AnomalyDetectorConfigPage = React.lazy(() => import('./pages/AnomalyDetectorConfigPage'));
const ApprovalsInbox = React.lazy(() => import('./pages/ApprovalsInbox'));
const EscalationPoliciesPage = React.lazy(() => import('./pages/admin/EscalationPoliciesPage'));
const CommandCenter = React.lazy(() => import('./pages/CommandCenter'));
const EdriDashboard = React.lazy(() => import('./pages/admin/EdriDashboard'));
const EdriDomainDetail = React.lazy(() => import('./pages/admin/EdriDomainDetail'));
const EdriRedFlags = React.lazy(() => import('./pages/admin/EdriRedFlags'));
const EdriRemediation = React.lazy(() => import('./pages/admin/EdriRemediation'));
const EdriHeatmap = React.lazy(() => import('./pages/admin/EdriHeatmap'));
const EdriMissingEvidence = React.lazy(() => import('./pages/admin/EdriMissingEvidence'));
const EdriHistory = React.lazy(() => import('./pages/admin/EdriHistory'));
const EdriEvidence = React.lazy(() => import('./pages/admin/EdriEvidence'));
const EdriSnapshotDetail = React.lazy(() => import('./pages/admin/EdriSnapshotDetail'));
const EdriSupportingDocs = React.lazy(() => import('./pages/admin/EdriSupportingDocs'));
const DcaaFindings = React.lazy(() => import('./pages/admin/DcaaFindings'));
const SecurityCenter = React.lazy(() => import('./pages/admin/SecurityCenter'));
const ChargeCodeUsageReport = React.lazy(() => import('./pages/admin/ChargeCodeUsageReport'));
const LaborDistributionReport = React.lazy(() => import('./pages/admin/LaborDistributionReport'));
const TransactionEvidenceMap = React.lazy(() => import('./pages/admin/TransactionEvidenceMap'));
const SupervisorApprovalExceptionReport = React.lazy(() => import('./pages/admin/SupervisorApprovalExceptionReport'));
const TimesheetCorrectionLogReport = React.lazy(() => import('./pages/admin/TimesheetCorrectionLogReport'));
const PayrollExportReconciliationReport = React.lazy(() => import('./pages/admin/PayrollExportReconciliationReport'));
const IndirectCostBurdenRateReport = React.lazy(() => import('./pages/admin/IndirectCostBurdenRateReport'));
const UnallowableCostReviewReport = React.lazy(() => import('./pages/admin/UnallowableCostReviewReport'));
const ProcurementComplianceReport = React.lazy(() => import('./pages/admin/ProcurementComplianceReport'));
const InventoryTraceabilityReport = React.lazy(() => import('./pages/admin/InventoryTraceabilityReport'));
const AuditLedgerIntegrityReport = React.lazy(() => import('./pages/admin/AuditLedgerIntegrityReport'));
const PolicyTrainingAcknowledgmentReport = React.lazy(() => import('./pages/admin/PolicyTrainingAcknowledgmentReport'));
const EdriExecutiveMatrix = React.lazy(() => import('./pages/admin/EdriExecutiveMatrix'));
const SecureVaultPage = React.lazy(() => import('./pages/admin/SecureVaultPage'));
const CmmcDashboard = React.lazy(() => import('./pages/admin/CmmcDashboard'));
const BusinessContinuityDashboard = React.lazy(() => import('./pages/admin/BusinessContinuityDashboard'));
const IdentityMatrixPage = React.lazy(() => import('./pages/IdentityMatrixPage'));
const IdentityDiagnosticPage = React.lazy(() => import('./pages/IdentityDiagnosticPage'));
const ProteusLabsDashboard = React.lazy(() => import('./pages/proteus-labs/ProteusLabsDashboard'));
const ProteusPromptBuilder = React.lazy(() => import('./pages/proteus-labs/ProteusPromptBuilder'));
const ProteusPromptDetail = React.lazy(() => import('./pages/proteus-labs/ProteusPromptDetail'));
const ProteusExecutionHistory = React.lazy(() => import('./pages/proteus-labs/ProteusExecutionHistory'));

import { Toaster as HotToaster } from 'react-hot-toast';
import DeploymentAuthWrapper from './components/DeploymentAuthWrapper';
import { getDashboardRoute } from './config/dashboardMapping';

function useIsEmbedMode() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === '1';
}

function isFloorOperatorRoute(location: string) {
  return (
    location.startsWith('/kiosk') ||
    location.startsWith('/cnc/batch-station') ||
    location.startsWith('/p2-traveler') ||
    location.startsWith('/travelers/')
  );
}

function ConditionalOfflineIndicator() {
  const isEmbed = useIsEmbedMode();
  const [location] = useLocation();
  return isEmbed || location === '/admin-dashboard-preview' ? null : <OfflineIndicator />;
}

function ConditionalMainWrapper({ children }: { children: React.ReactNode }) {
  const isEmbed = useIsEmbedMode();
  const [location] = useLocation();
  if (isEmbed || location === '/admin-dashboard-preview' || isFloorOperatorRoute(location)) {
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
    location === '/admin-dashboard-preview' ||
    location === '/login' ||
    location.startsWith('/sign-order') || // Hide navigation on customer sign order page
    location.startsWith('/fill-and-sign') || // Hide navigation on customer fill-and-sign page
    location.startsWith('/tv-display') || // Hide navigation on TV display page
    location.startsWith('/tv-timer-board') || // Hide navigation on timer board page
    isFloorOperatorRoute(location); // Hide navigation on badge/PIN based production floor pages

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
      setLocation('/login', { replace: true });
      return;
    }

    if (currentUser.username) {
      const personalizedRoute = getDashboardRoute(currentUser.username);
      if (personalizedRoute !== '/') {
        console.log(`Redirecting ${currentUser.username} to ${personalizedRoute}`);
        setLocation(personalizedRoute, { replace: true });
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
    setLocation('/shipping-tracker', { replace: true });
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

function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary key={location}>{children}</ErrorBoundary>;
}

function App() {
  console.log('App component is rendering...');
  console.log('Environment:', import.meta.env.MODE);
  console.log('Base URL:', import.meta.env.BASE_URL);

  // Add error boundary
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    const handlePreloadError = () => {
      const reloadKey = 'epoch:vite-preload-reloaded';
      const lastReloadedAt = Number(sessionStorage.getItem(reloadKey) || 0);
      if (Date.now() - lastReloadedAt < 10_000) return;
      sessionStorage.setItem(reloadKey, String(Date.now()));
      window.location.reload();
    };

    const handleError = (event: ErrorEvent) => {
      console.error('Global error caught:', event.error);
      setError(event.error);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      setError(new Error(event.reason));
    };

    window.addEventListener('vite:preloadError', handlePreloadError);
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('vite:preloadError', handlePreloadError);
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
                <RouteErrorBoundary>
                  <RouteGuard>
                    <React.Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>}>
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
                  <Route path="/estimating/bom-drafts" component={DraftBOMBuilderPage} />
                  <Route path="/design/rd-projects" component={RDProjectsPage} />
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
                  <Route path="/admin/p1-po-status-repair" component={P1POStatusRepairPage} />
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
                  <Route path="/epoch-copilot" component={EpochCopilotPage} />
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
                    path="/production-tracking/customer-wip"
                    component={CustomerWIPPage}
                  />
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
                    path="/inventory/department-parts-request"
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
                  <Route
                    path="/freezer-temperature-log"
                    component={FreezerTemperatureLogPage}
                  />
                  <Route path="/maintenance-events" component={MaintenanceEventsPage} />
                  <Route path="/maintenance-events/:id">
                    {(params) => <WorkOrderDetailPage params={params} />}
                  </Route>
                  <Route path="/wad-wizard" component={WADWizardLauncherPage} />
                  <Route path="/wad-status" component={WADStatusDashboard} />
                  <Route path="/work-orders/:id/wizard">
                    {(params) => <WADWizardPage params={params} />}
                  </Route>
                  <Route path="/work-orders/:id/wad-summary">
                    {(params) => <WADSummaryPage params={params} />}
                  </Route>
                  <Route path="/work-orders/:id">
                    {(params) => <ProductionWorkOrderDetailPage params={params} />}
                  </Route>
                  <Route path="/assets" component={AssetsPage} />
                  <Route path="/asset-dashboard" component={AssetDashboardPage} />
                  <Route path="/qms/parts-equipment" component={QMSPartsEquipmentPage} />
                  <Route path="/qms/design-control" component={QMSDesignControlPage} />
                  <Route path="/qms/as9100-audit-readiness" component={AS9100AuditReadinessPage} />
                  <Route path="/qms/epoch-software-validation" component={EpochSoftwareValidationPage} />
                  <Route path="/qms" component={QMSPlaceholderPage} />
                  <Route path="/qms/change-control" component={QMSChangeControlPage} />
                  <Route path="/my-quality-actions" component={MyQualityActionsPage} />
                  <Route path="/qms/:section">
                    {(params) => <QMSPlaceholderPage params={params} />}
                  </Route>

                  {/* Employee Routes */}
                  <Route path="/employee" component={EmployeeDashboard} />
                  <Route path="/onboarding" component={OnboardingDashboard} />
                  <Route path="/onboarding/invite/:token" component={OnboardingInvitePage} />
                  <Route path="/onboarding/paths" component={OnboardingPathsPage} />
                  <Route path="/onboarding/settings" component={OnboardingSettingsPage} />
                  <Route path="/onboarding/employer-signatures" component={EmployerSignaturesPage} />
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
                    path="/admin-dashboard-preview"
                    component={AdminDashboardPreview}
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
                    path="/angiet-dashboard"
                    component={ANGIETTestDashboard}
                  />
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
                  <Route path="/help/timeclock-training-program" component={TimeclockTrainingProgramGuide} />
                  <Route path="/help/pto-request-guide" component={PTORequestGuide} />
                  <Route path="/help/punch-edit-request-guide" component={PunchEditRequestGuide} />
                  <Route path="/help/timesheet-review-guide" component={TimesheetReviewGuide} />
                  <Route path="/refund-queue" component={RefundQueue} />
                  <Route path="/rma-form" component={RMAFormPage} />

                  {/* Credit Memo Management */}
                  <Route path="/credit-memo" component={CreditMemoPage} />

                  {/* Forms and Reports Routes */}
                  <Route path="/forms" component={AdminFormsPage} />
                  <Route path="/forms/document-builder" component={RoutingDocumentManagement} />
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
                  <Route path="/p2/material-transfer" component={P2MaterialTransferForm} />
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
                  <Route path="/training"><Redirect to="/training/my-training" /></Route>
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

                  {/* RTS (Ready to Sell) Page */}
                  <Route path="/rts" component={RTSPage} />

                  {/* Reports */}
                  <Route
                    path="/ag-bottom-metal-report"
                    component={AGBottomMetalReport}
                  />
                  <Route path="/shipping-tracker" component={ShippingTracker} />
                  <Route path="/weekly-shipments" component={RedirectToShippingTracker} />
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
                  <Route path="/cnc/batch-station" component={CNCOperationBatchStation} />
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
                  <Route path="/admin/security-center" component={SecurityCenter} />

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
                  {/* Fill and Sign Routes - Public routes for customers */}
                  <Route
                    path="/fill-and-sign/:publicSignatureId"
                    component={FillAndSignPage}
                  />

                    {/* Catch-all route for 404 */}
                    <Route component={NotFound} />
                    </Switch>
                    </React.Suspense>
                  </RouteGuard>
                </RouteErrorBoundary>
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
