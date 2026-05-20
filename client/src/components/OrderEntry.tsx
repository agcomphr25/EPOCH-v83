import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { ForecastDateModal } from '@/components/orders/ForecastDateModal';
import { getConfidenceLabel } from '@/lib/forecastConfidence';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

import { useToast } from '@/hooks/use-toast';
import {
  Package,
  Users,
  SlidersHorizontal,
  AlertTriangle,
  ClipboardList,
  ChevronDown,
  DollarSign,
  Send,
  CheckCircle,
  Check,
  ChevronsUpDown,
  Paperclip,
  ExternalLink,
  FileText,
  Loader2,
  Palette,
  ShieldCheck,
  Truck,
  UserRound,
  Wrench,
} from 'lucide-react';
// @ts-ignore
import debounce from 'lodash.debounce';
import { useLocation, useRoute } from 'wouter';
import CustomerSearchInput from '@/components/CustomerSearchInput';
import PaymentManager from '@/components/PaymentManager';
import { OrderAttachments } from '@/components/OrderAttachments';
import CustomerCreditIndicator from '@/components/CustomerCreditIndicator';
import OrderRefundsSection from '@/components/OrderRefundsSection';
import { OrderActionsDrawer } from '@/components/OrderActionsDrawer';
import type { Customer } from '@shared/schema';
import {
  useFeatureValidation,
  useFeatureStateValidation,
} from '@/hooks/useFeatureValidation';
import { useDataConsistencyValidation } from '@/hooks/useDataConsistencyValidation';
import { useSmartSort } from '@/hooks/useSmartSort';
import { useFormDraft } from '@/hooks/useFormDraft';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import {
  FEATURE_IDS,
  findFeature,
  getFeatureOptionDisplay,
  getPaintFeatures,
} from '@/utils/featureMapping';

interface StockModel {
  id: string;
  name: string;
  displayName: string;
  price: number;
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

interface FeatureDefinition {
  id: string;
  name: string;
  displayName: string;
  type: 'dropdown' | 'search' | 'text' | 'multiselect' | 'checkbox';
  options?: { value: string; label: string; price?: number }[];
  category?: string;
  subcategory?: string;
}

interface MiscItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface OrderDraftData {
  customer: Customer | null;
  modelId: string;
  features: Record<string, any>;
  customerPO: string;
  hasCustomerPO: boolean;
  fbOrderNumber: string;
  hasAGROrder: boolean;
  agrOrderDetails: string;
  isFlattop: boolean;
  discountCode: string;
  customDiscountType: 'percent' | 'amount';
  customDiscountValue: number;
  priceOverride: number | null;
  flattopPriceOverride: number | null;
  shipping: number;
  isCustomOrder: boolean;
  notes: string;
  miscItems: MiscItem[];
  otherOptionsQuantities: Record<string, number>;
  specialShipping: { international: boolean; nextDayAir: boolean; billToReceiver: boolean };
  hasAltShipTo: boolean;
  altShipToMode: 'existing' | 'manual';
  altShipToName: string;
  altShipToCompany: string;
  altShipToEmail: string;
  altShipToPhone: string;
  altShipToAddress: { street: string; city: string; state: string; zipCode: string; country: string };
}

const TIKKA_BARREL_OPTIONS = [
  'tikka_proof_sendero',
  'tikka_proof_sendero_lite',
  'tikka_factory_sporter_lite',
  'tikka_hca_summit',
  'tikka_hca_heavy',
] as const;

type ConsoleStyleMode = 'standard' | 'industrial' | 'retro';

const consoleStyleOptions: { value: ConsoleStyleMode; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'industrial', label: 'Workbench' },
  { value: 'retro', label: 'Retro' },
];

export default function OrderEntry() {
  console.log('OrderEntry component rendering...');
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [consoleStyleMode, setConsoleStyleMode] = useState<ConsoleStyleMode>(() => {
    if (typeof window === 'undefined') return 'standard';
    try {
      const savedStyle = window.localStorage.getItem('order-entry-console-style');
      if (
        savedStyle === 'standard' ||
        savedStyle === 'industrial' ||
        savedStyle === 'retro'
      ) {
        return savedStyle;
      }
      return window.localStorage.getItem('order-entry-console-mode') === 'true'
        ? 'industrial'
        : 'standard';
    } catch {
      return 'standard';
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        'order-entry-console-style',
        consoleStyleMode
      );
      window.localStorage.setItem(
        'order-entry-console-mode',
        String(consoleStyleMode !== 'standard')
      );
    } catch {
      // Preference persistence is best-effort only.
    }
  }, [consoleStyleMode]);

  // Form state
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [modelOptions, setModelOptions] = useState<StockModel[]>([]);
  const [modelId, setModelId] = useState('');
  const [modelOpen, setModelOpen] = useState(false);
  const [featureDefs, setFeatureDefs] = useState<FeatureDefinition[]>([]);
  const [features, setFeatures] = useState<Record<string, any>>({});
  const [discountOptions, setDiscountOptions] = useState<
    { value: string; label: string }[]
  >([]);

  const [orderDate, setOrderDate] = useState(new Date());
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 98 * 24 * 60 * 60 * 1000)
  ); // 98 days from now (default)
  const [orderId, setOrderId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Synchronous ref guard — prevents re-entrant handleSubmit calls that can slip
  // through before React re-renders the disabled state (e.g. Enter key + button
  // click arriving in the same tick, or rapid double-click).
  const submitInFlightRef = useRef(false);
  const [hasCustomerPO, setHasCustomerPO] = useState(false);
  const [customerPO, setCustomerPO] = useState('');
  const [fbOrderNumber, setFbOrderNumber] = useState('');
  const [hasAGROrder, setHasAGROrder] = useState(false);
  const [agrOrderDetails, setAgrOrderDetails] = useState('');
  const [isFlattop, setIsFlattop] = useState(false);

  // Track if we're editing an existing order (needs to be early for useEffect dependencies)
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);
  const [isDuplicateMode, setIsDuplicateMode] = useState(false);
  
  // Track order status for actions drawer
  const [orderStatus, setOrderStatus] = useState<string | undefined>(undefined);
  const [currentDepartment, setCurrentDepartment] = useState<string | undefined>(undefined);
  const [isCancelled, setIsCancelled] = useState(false);
  const [urgency, setUrgency] = useState<string | undefined>(undefined);

  // Note: All feature data is now stored in the unified features object
  // Legacy separate state variables removed to prevent data consistency issues

  // Feature validation hooks (development only)
  useFeatureValidation(featureDefs);

  // Price Override state
  const [priceOverride, setPriceOverride] = useState<number | null>(null);
  const [showPriceOverride, setShowPriceOverride] = useState(false);
  
  // Flattop Price Override state
  const [flattopPriceOverride, setFlattopPriceOverride] = useState<number | null>(null);
  const [showFlattopPriceOverride, setShowFlattopPriceOverride] = useState(false);

  // Discount and pricing
  const [discountCode, setDiscountCode] = useState('');
  const [customDiscountType, setCustomDiscountType] = useState<
    'percent' | 'amount'
  >('percent');
  const [customDiscountValue, setCustomDiscountValue] = useState<number>(0);
  const [showCustomDiscount, setShowCustomDiscount] = useState(false);
  const [discountDetailsMap, setDiscountDetailsMap] = useState<Record<string, any>>({});
  const [shipping, setShipping] = useState(36.95);
  const [isCustomOrder, setIsCustomOrder] = useState(false);
  const [notes, setNotes] = useState('');
  const [isVerified, setIsVerified] = useState(false);

  // Payment state - simplified for multiple payments
  const [orderPayments, setOrderPayments] = useState<any[]>([]);

  // Miscellaneous items state
  const [miscItems, setMiscItems] = useState<MiscItem[]>([]);

  // Other options quantities - tracks qty for options that don't include "No"
  const [otherOptionsQuantities, setOtherOptionsQuantities] = useState<
    Record<string, number>
  >({});

  // Special Shipping Instructions state
  const [specialShipping, setSpecialShipping] = useState({
    international: false,
    nextDayAir: false,
    billToReceiver: false,
  });

  // Track base due date for rush fee calculations
  const [baseDueDate, setBaseDueDate] = useState(
    new Date(Date.now() + 98 * 24 * 60 * 60 * 1000)
  );

  // Track whether user has manually set the due date
  const [isManualDueDate, setIsManualDueDate] = useState(false);
  // Track whether user has manually set the order date
  const [isManualOrderDate, setIsManualOrderDate] = useState(false);

  // QD Same-Side Confirmation Modal state
  const [showQdSameSideModal, setShowQdSameSideModal] = useState(false);
  const [qdSameSideConfirmed, setQdSameSideConfirmed] = useState(false);
  const [qdSameSideConfirmedBy, setQdSameSideConfirmedBy] = useState<string | null>(null);
  const [qdSameSideConfirmedAt, setQdSameSideConfirmedAt] = useState<Date | null>(null);
  const [pendingOrderSubmit, setPendingOrderSubmit] = useState<{ saveAsDraft: boolean } | null>(null);

  // Alt Ship To Address state
  const [hasAltShipTo, setHasAltShipTo] = useState(false);
  const [altShipToMode, setAltShipToMode] = useState<'existing' | 'manual'>(
    'existing'
  );
  const [altShipToCustomer, setAltShipToCustomer] = useState<Customer | null>(
    null
  );
  const [altShipToCustomerId, setAltShipToCustomerId] = useState<string>('');
  const [altShipToName, setAltShipToName] = useState('');
  const [altShipToCompany, setAltShipToCompany] = useState('');
  const [altShipToEmail, setAltShipToEmail] = useState('');
  const [altShipToPhone, setAltShipToPhone] = useState('');
  const [altShipToAddress, setAltShipToAddress] = useState({
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States',
  });

  // Smart sorting for Action Inlet - AI-powered sorting by frequency + alphabetical
  const actionInletOptions = featureDefs.find(
    (f) => f.name === 'action_inlet' || f.id === 'action_inlet'
  )?.options;
  const {
    sortedOptions: smartSortedActionInlet,
    trackSelection: trackActionInletSelection,
  } = useSmartSort('action_inlet', actionInletOptions);

  const isNewOrderMode = !isEditMode && !isDuplicateMode && !editingOrderId;

  const { hasDraft: hasOrderDraft, restoreDraft: restoreOrderDraft, clearDraft: clearOrderDraft, resumeAutoSave: resumeOrderDraftAutoSave } = useFormDraft<OrderDraftData>({
    storageKey: 'order-entry-draft',
    getValues: () => ({
      customer,
      modelId,
      features,
      customerPO,
      hasCustomerPO,
      fbOrderNumber,
      hasAGROrder,
      agrOrderDetails,
      isFlattop,
      discountCode,
      customDiscountType,
      customDiscountValue,
      priceOverride,
      flattopPriceOverride,
      shipping,
      isCustomOrder,
      notes,
      miscItems,
      otherOptionsQuantities,
      specialShipping,
      hasAltShipTo,
      altShipToMode,
      altShipToName,
      altShipToCompany,
      altShipToEmail,
      altShipToPhone,
      altShipToAddress,
    }),
    enabled: isNewOrderMode,
  });

  const [showOrderDraftBanner, setShowOrderDraftBanner] = useState(false);
  const [orderDraftChecked, setOrderDraftChecked] = useState(false);

  useEffect(() => {
    if (isNewOrderMode && !orderDraftChecked && hasOrderDraft) {
      setShowOrderDraftBanner(true);
      setOrderDraftChecked(true);
    }
  }, [isNewOrderMode, orderDraftChecked, hasOrderDraft]);

  const hasUnsavedOrderChanges = isNewOrderMode && (
    !!customer || !!modelId || Object.keys(features).length > 0 || !!customerPO || !!notes || miscItems.length > 0
  );

  useUnsavedChangesWarning(hasUnsavedOrderChanges);

  const handleRestoreOrderDraft = useCallback(() => {
    const draft = restoreOrderDraft();
    if (draft) {
      if (draft.customer) setCustomer(draft.customer);
      if (draft.modelId) setModelId(draft.modelId);
      if (draft.features && Object.keys(draft.features).length > 0) setFeatures(draft.features);
      if (draft.customerPO) { setCustomerPO(draft.customerPO); setHasCustomerPO(true); }
      if (draft.fbOrderNumber) setFbOrderNumber(draft.fbOrderNumber);
      if (draft.hasAGROrder) { setHasAGROrder(true); setAgrOrderDetails(draft.agrOrderDetails || ''); }
      if (draft.isFlattop) setIsFlattop(true);
      if (draft.discountCode) setDiscountCode(draft.discountCode);
      if (draft.customDiscountType) setCustomDiscountType(draft.customDiscountType);
      if (draft.customDiscountValue) setCustomDiscountValue(draft.customDiscountValue);
      if (draft.priceOverride !== null) { setPriceOverride(draft.priceOverride); setShowPriceOverride(true); }
      if (draft.flattopPriceOverride !== null) { setFlattopPriceOverride(draft.flattopPriceOverride); setShowFlattopPriceOverride(true); }
      if (draft.shipping !== undefined) setShipping(draft.shipping);
      if (draft.isCustomOrder) setIsCustomOrder(true);
      if (draft.notes) setNotes(draft.notes);
      if (draft.miscItems?.length > 0) setMiscItems(draft.miscItems);
      if (draft.otherOptionsQuantities) setOtherOptionsQuantities(draft.otherOptionsQuantities);
      if (draft.specialShipping) setSpecialShipping(draft.specialShipping);
      if (draft.hasAltShipTo) {
        setHasAltShipTo(true);
        setAltShipToMode(draft.altShipToMode || 'existing');
        setAltShipToName(draft.altShipToName || '');
        setAltShipToCompany(draft.altShipToCompany || '');
        setAltShipToEmail(draft.altShipToEmail || '');
        setAltShipToPhone(draft.altShipToPhone || '');
        if (draft.altShipToAddress) setAltShipToAddress(draft.altShipToAddress);
      }
    }
    setShowOrderDraftBanner(false);
  }, [restoreOrderDraft]);

  const [forecastConfidence, setForecastConfidence] = useState<string | null>(null);
  const [forecastCycleDays, setForecastCycleDays] = useState<number | null>(null);
  const [isForecastLoading, setIsForecastLoading] = useState(false);
  const [forecastModalOpen, setForecastModalOpen] = useState(false);
  const [fullForecastData, setFullForecastData] = useState<any>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);

  const addBusinessDaysClient = (start: Date, days: number): Date => {
    const result = new Date(start);
    let added = 0;
    while (added < days) {
      result.setDate(result.getDate() + 1);
      const dow = result.getDay();
      if (dow !== 0 && dow !== 6) added++;
    }
    return result;
  };

  const mappedForecastData = useMemo(() => {
    if (!fullForecastData) return null;
    const data = fullForecastData;
    const recommended = data.suggestedDueDate;
    const projected = data.projectedCompletion;
    const bufferDays = data.totalBusinessDays - data.estimatedCycleDays;
    const conservativeDate = new Date(
      new Date(recommended).getTime() + Math.ceil(bufferDays) * 86400000
    ).toISOString();
    const confidenceLabel = getConfidenceLabel(data.confidence || 'LOW');

    const timeline: { stage: string; date: string }[] = [];
    if (data.stageDurations && data.stageDurations.length > 0) {
      let cumulativeDays = 0;
      for (const sd of data.stageDurations) {
        cumulativeDays += sd.days;
        const stageDate = addBusinessDaysClient(new Date(), Math.round(cumulativeDays));
        timeline.push({ stage: sd.stage, date: stageDate.toISOString() });
      }
    } else if (data.pipelineStages && data.pipelineStages.length > 0) {
      const totalCycleDays = data.estimatedCycleDays || data.totalBusinessDays || 1;
      const stageCount = data.pipelineStages.length;
      let cumulativeDays = 0;
      for (let i = 0; i < stageCount; i++) {
        cumulativeDays += totalCycleDays / stageCount;
        const stageDate = addBusinessDaysClient(new Date(), Math.round(cumulativeDays));
        timeline.push({ stage: data.pipelineStages[i], date: stageDate.toISOString() });
      }
    }

    const reasons: string[] = [];
    const stageCount = data.pipelineStages?.length || 0;
    const cycleDays = Math.round(data.estimatedCycleDays || 0);
    if (cycleDays > 0) {
      const cycleWeeks = Math.round(cycleDays / 5);
      const sourceLabel = data.modelSpecific ? 'Model-specific cycle time' : 'Average cycle time';
      reasons.push(`${sourceLabel}: ~${cycleWeeks} week${cycleWeeks !== 1 ? 's' : ''} across ${stageCount} department${stageCount !== 1 ? 's' : ''}`);
    }
    if (data.modelSpecific) {
      reasons.push('Using historical data specific to this stock model');
    }
    const backlogDays = Math.round(data.backlogDelayDays || 0);
    if (backlogDays > 0) {
      const backlogWeeks = (backlogDays / 5).toFixed(1);
      reasons.push(`Weighted queue backlog adds ~${backlogWeeks} week${backlogDays > 5 ? 's' : ''} based on current load`);
    }
    if (data.isAdjustable && !data.modelSpecific) {
      reasons.push('Adjustable model: +2 weeks added for adjustable cheekpiece work');
    }
    const bufferWeeks = Math.ceil(bufferDays / 5);
    reasons.push(`Safety buffer: ~${bufferWeeks} week${bufferWeeks !== 1 ? 's' : ''} added beyond projected completion`);
    const otherOptions = features.other_options || [];
    if (otherOptions.includes('rush_fee1') || otherOptions.includes('rush_fee2')) {
      reasons.push('Rush fee applied — timeline may be shortened');
    }
    if (data.modelReasons && data.modelReasons.length > 0) {
      const deptReasons = data.modelReasons.filter((r: string) => r.includes('days avg'));
      for (const r of deptReasons.slice(0, 3)) {
        reasons.push(r);
      }
    }

    return {
      recommendedDate: recommended,
      confidence: confidenceLabel,
      window: {
        earliest: projected,
        latest: conservativeDate,
      },
      timeline,
      reasons,
      totalBusinessDays: data.totalBusinessDays || 0,
      estimatedCycleDays: data.estimatedCycleDays || 0,
      backlogDelayDays: data.backlogDelayDays || 0,
    };
  }, [fullForecastData, features.other_options]);

  const calculateBaseDueDate = useCallback(() => {
    const selectedModel = modelOptions.find((m) => m.id === modelId);
    const modelName = selectedModel?.displayName || selectedModel?.name || '';
    const isAdjModel = modelName.toLowerCase().includes('adj');
    const daysFromNow = isAdjModel ? 112 : 98;
    return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  }, [modelId, modelOptions]);

  useEffect(() => {
    if (
      modelId &&
      modelOptions.length > 0 &&
      !isEditMode &&
      !isManualDueDate &&
      editingOrderId === null &&
      !isLoadingOrder
    ) {
      setIsForecastLoading(true);
      const controller = new AbortController();

      fetch('/api/admin/order-forecast/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          model_id: modelId,
          is_flattop: isFlattop,
          features,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.suggestedDueDate) {
            const suggested = new Date(data.suggestedDueDate);
            setBaseDueDate(suggested);
            setForecastConfidence(data.confidence || null);
            setForecastCycleDays(data.totalBusinessDays || null);
            setFullForecastData(data);
            setForecastError(null);

            const otherOptions = features.other_options || [];
            const hasAnyRushFee = otherOptions.includes('rush_fee1') || otherOptions.includes('rush_fee2');
            if (!hasAnyRushFee && !isManualDueDate) {
              setDueDate(suggested);
            }
          } else {
            const fallback = calculateBaseDueDate();
            setBaseDueDate(fallback);
            setForecastConfidence(null);
            setForecastCycleDays(null);
            setFullForecastData(null);
            setForecastError('No forecast data returned');

            const otherOptions = features.other_options || [];
            const hasAnyRushFee = otherOptions.includes('rush_fee1') || otherOptions.includes('rush_fee2');
            if (!hasAnyRushFee && !isManualDueDate) {
              setDueDate(fallback);
            }
          }
          setIsForecastLoading(false);
        })
        .catch((err) => {
          if (err.name === 'AbortError') {
            return;
          }
          const fallback = calculateBaseDueDate();
          setBaseDueDate(fallback);
          setForecastConfidence(null);
          setForecastCycleDays(null);
          setFullForecastData(null);
          setForecastError('Could not reach forecast engine');

          const otherOptions = features.other_options || [];
          const hasAnyRushFee = otherOptions.includes('rush_fee1') || otherOptions.includes('rush_fee2');
          if (!hasAnyRushFee && !isManualDueDate) {
            setDueDate(fallback);
          }
          setIsForecastLoading(false);
        });

      return () => {
        controller.abort();
        setIsForecastLoading(false);
      };
    }
  }, [
    modelId,
    modelOptions,
    isFlattop,
    calculateBaseDueDate,
    features.other_options,
    features.rail_accessory,
    isEditMode,
    isManualDueDate,
    isLoadingOrder,
  ]);

  const triggerForecastFetch = useCallback(() => {
    if (!modelId || isForecastLoading) return;
    setIsForecastLoading(true);
    fetch('/api/admin/order-forecast/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        model_id: modelId,
        is_flattop: isFlattop,
        features,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.suggestedDueDate) {
          const suggested = new Date(data.suggestedDueDate);
          setBaseDueDate(suggested);
          setForecastConfidence(data.confidence || null);
          setForecastCycleDays(data.totalBusinessDays || null);
          setFullForecastData(data);
          setForecastError(null);

          const otherOptions = features.other_options || [];
          const hasAnyRushFee = otherOptions.includes('rush_fee1') || otherOptions.includes('rush_fee2');
          if (!hasAnyRushFee && !isManualDueDate) {
            setDueDate(suggested);
          }
        } else {
          const fallback = calculateBaseDueDate();
          setBaseDueDate(fallback);
          setForecastConfidence(null);
          setForecastCycleDays(null);
          setFullForecastData(null);
          setForecastError('No forecast data returned');

          const otherOptions = features.other_options || [];
          const hasAnyRushFee = otherOptions.includes('rush_fee1') || otherOptions.includes('rush_fee2');
          if (!hasAnyRushFee && !isManualDueDate) {
            setDueDate(fallback);
          }
        }
        setIsForecastLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        const fallback = calculateBaseDueDate();
        setBaseDueDate(fallback);
        setForecastConfidence(null);
        setForecastCycleDays(null);
        setForecastError('Could not reach forecast engine');

        const otherOptions = features.other_options || [];
        const hasAnyRushFee = otherOptions.includes('rush_fee1') || otherOptions.includes('rush_fee2');
        if (!hasAnyRushFee && !isManualDueDate) {
          setDueDate(fallback);
        }
        setIsForecastLoading(false);
      });
  }, [modelId, isFlattop, features, isManualDueDate, isForecastLoading, calculateBaseDueDate]);

  // Auto-adjust due date based on rush fee selections (only for new orders, not when editing existing ones)
  useEffect(() => {
    // Skip auto-adjustment for existing orders being edited or manually set due dates
    if (
      isEditMode ||
      isManualDueDate ||
      editingOrderId !== null ||
      isLoadingOrder
    )
      return;

    const otherOptions = features.other_options || [];

    // Check for rush fee options by value
    const hasRush = otherOptions.includes('rush_fee1');
    const hasExpedite = otherOptions.includes('rush_fee2');

    let adjustedDate = new Date(baseDueDate);

    if (hasExpedite) {
      // Expedite: reduce by 28 days (4 weeks)
      adjustedDate.setDate(adjustedDate.getDate() - 28);
    } else if (hasRush) {
      // Rush: reduce by 14 days (2 weeks)
      adjustedDate.setDate(adjustedDate.getDate() - 14);
    }

    // Only update if the calculated date is different from current due date and user hasn't manually set it
    if (adjustedDate.getTime() !== dueDate.getTime() && !isManualDueDate) {
      setDueDate(adjustedDate);

      // Show user feedback about the date change
      const selectedModel = modelOptions.find((m) => m.id === modelId);
      const modelName = selectedModel?.displayName || selectedModel?.name || '';
      const isAdjModel = modelName.toLowerCase().includes('adj');
      const baseWeeks = isAdjModel ? 16 : 14; // 112 days = 16 weeks, 98 days = 14 weeks

      if (hasExpedite) {
        const finalWeeks = baseWeeks - 4; // 28 days = 4 weeks
        toast({
          title: 'Due Date Updated',
          description: `Due date reduced from ${baseWeeks} weeks to ${finalWeeks} weeks due to Expedite selection`,
          duration: 3000,
        });
      } else if (hasRush) {
        const finalWeeks = baseWeeks - 2; // 14 days = 2 weeks
        toast({
          title: 'Due Date Updated',
          description: `Due date reduced from ${baseWeeks} weeks to ${finalWeeks} weeks due to Rush selection`,
          duration: 3000,
        });
      } else {
        toast({
          title: 'Due Date Reset',
          description: `Due date restored to ${baseWeeks} weeks (${isAdjModel ? 'Adj model' : 'Standard model'})`,
          duration: 3000,
        });
      }
    }
  }, [
    features.other_options,
    baseDueDate,
    toast,
    modelId,
    isEditMode,
    isManualDueDate,
    isLoadingOrder,
  ]); // Include modelId to recalculate when model changes

  // Update base due date when user manually changes due date (and no rush/expedite fees are selected)
  useEffect(() => {
    const otherOptions = features.other_options || [];
    const hasAnyRushFee = otherOptions.includes('rush_fee1') || otherOptions.includes('rush_fee2');

    // Only update base due date if no rush fees are currently selected
    // Add a small delay to prevent immediate recalculation cycles
    if (!hasAnyRushFee) {
      const timeoutId = setTimeout(() => {
        setBaseDueDate(new Date(dueDate));
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [dueDate, features.other_options]);

  // Miscellaneous items functions
  const addMiscItem = () => {
    const newItem: MiscItem = {
      id: Date.now().toString(),
      description: '',
      quantity: 1,
      unitPrice: 0,
      total: 0,
    };
    setMiscItems((prev) => [...prev, newItem]);
  };

  const updateMiscItem = (
    id: string,
    field: keyof MiscItem,
    value: string | number
  ) => {
    setMiscItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          // Recalculate total when quantity or unitPrice changes
          if (field === 'quantity' || field === 'unitPrice') {
            updated.total = updated.quantity * updated.unitPrice;
          }
          return updated;
        }
        return item;
      })
    );
  };

  const removeMiscItem = (id: string) => {
    setMiscItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Unified price calculation function
  const calculateTotalPrice = useCallback(() => {
    // If price override is set (Alamo), use that as the subtotal (complete override)
    if (priceOverride !== null) {
      console.log(
        '💰 Price calculation - Using APR Price Override as subtotal:',
        priceOverride
      );
      return priceOverride;
    }

    let total = 0;

    // Add base price: Flattop override takes priority over stock model price
    if (isFlattop && flattopPriceOverride !== null) {
      total = flattopPriceOverride;
      console.log('💰 Price calculation - Using Flattop Price Override as base:', flattopPriceOverride);
    } else {
      // Use stock model price
      const selectedModel = modelOptions.find((model) => model.id === modelId);
      if (selectedModel) {
        const basePrice = selectedModel.price || 0;
        total += basePrice;
        console.log('💰 Price calculation - Base price:', basePrice);
      }
    }

    // Add feature prices from features object (but NOT bottom_metal, paint_options, rail_accessory, other_options as they are handled separately)
    Object.entries(features).forEach(([featureId, value]) => {
      // Skip features that have separate state variables to avoid double counting
      if (
        featureId === 'bottom_metal' ||
        featureId === 'paint_options' ||
        featureId === 'rail_accessory' ||
        featureId === 'other_options'
      ) {
        return;
      }

      if (value && value !== 'none') {
        const feature = featureDefs.find((f) => f.id === featureId);
        if (feature?.options) {
          if (Array.isArray(value)) {
            // Handle multi-select features
            value.forEach((optionValue) => {
              const option = feature.options!.find(
                (opt) => opt.value === optionValue
              );
              if (option?.price) {
                total += option.price;
              }
            });
          } else {
            // Handle single-select features
            const option = feature.options.find((opt) => opt.value === value);
            if (option?.price) {
              total += option.price;
            }
          }
        }
      }
    });

    // Add bottom metal price (from features object)
    if (features.bottom_metal) {
      const bottomMetalFeature = featureDefs.find(
        (f) => f.id === 'bottom_metal'
      );
      if (bottomMetalFeature?.options) {
        const option = bottomMetalFeature.options.find(
          (opt) => opt.value === features.bottom_metal
        );
        if (option?.price) {
          let bottomMetalPrice = option.price;

          // Special pricing: SepFG10 or SepCF25 seasonal sale + AG bottom metal = $100 instead of $149
          if (
            (discountCode === 'short_term_3' ||
              discountCode === 'short_term_1') &&
            features.bottom_metal.includes('ag_') &&
            option.price === 149
          ) {
            bottomMetalPrice = 100;
            const saleName =
              discountCode === 'short_term_3' ? 'SepFG10' : 'SepCF25';
            console.log(
              `💰 Special pricing applied: ${saleName} + AG bottom metal - price changed from $149 to $100`
            );
          }

          total += bottomMetalPrice;
          console.log(
            '💰 Price calculation - Bottom metal:',
            features.bottom_metal,
            'price:',
            bottomMetalPrice
          );
        }
      }
    }

    // Add paint options price (from features object)
    const currentPaint =
      features.metallic_finishes ||
      features.paint_options ||
      features.paint_options_combined;

    if (currentPaint && currentPaint !== 'none') {
      console.log('💰 Paint calculation - current paint:', currentPaint);
      console.log('💰 Paint calculation - from features object');

      const paintFeatures = featureDefs.filter(
        (f) =>
          f.displayName?.includes('Options') ||
          f.displayName?.includes('Camo') ||
          f.displayName?.includes('Cerakote') ||
          f.displayName?.includes('Terrain') ||
          f.displayName?.includes('Rogue') ||
          f.displayName?.includes('Standard') ||
          f.id === 'metallic_finishes' ||
          f.name === 'metallic_finishes' ||
          f.category === 'paint' ||
          f.subcategory === 'paint'
      );

      console.log(
        '💰 Paint calculation - found features:',
        paintFeatures.length,
        paintFeatures.map((f) => f.displayName)
      );

      let paintPriceAdded = false;
      for (const feature of paintFeatures) {
        if (feature.options) {
          const option = feature.options.find(
            (opt) => opt.value === currentPaint
          );
          if (option?.price) {
            console.log(
              '💰 Paint calculation - FOUND and ADDED:',
              option.label,
              'price:',
              option.price
            );
            total += option.price;
            paintPriceAdded = true;
            break; // Only add price once
          }
        }
      }

      if (!paintPriceAdded) {
        console.log('💰 Paint calculation - NO PRICE FOUND for:', currentPaint);
      }
    }

    // Add rail accessory prices (from features object)
    const currentRails = Array.isArray(features.rail_accessory)
      ? features.rail_accessory
      : [];
    if (currentRails && currentRails.length > 0) {
      console.log('💰 Rails calculation - current rails:', currentRails);
      const railFeature = featureDefs.find((f) => f.id === 'rail_accessory');
      console.log(
        '💰 Rails calculation - found feature:',
        railFeature?.displayName || railFeature?.name
      );

      if (railFeature?.options) {
        console.log(
          '💰 Rails calculation - available options:',
          railFeature.options.map(
            (opt) => `${opt.label}: ${opt.value} = $${opt.price}`
          )
        );
        let railsTotal = 0;
        currentRails.forEach((optionValue: string) => {
          const option = railFeature.options!.find(
            (opt) => opt.value === optionValue
          );
          if (option?.price) {
            railsTotal += option.price;
            total += option.price;
            console.log(
              '💰 Rails calculation - FOUND and ADDED:',
              option.label,
              'price:',
              option.price
            );
          } else {
            console.log(
              '💰 Rails calculation - NO PRICE FOUND for:',
              optionValue
            );
          }
        });
        console.log('💰 Rails calculation - Total rails price:', railsTotal);
      } else {
        console.log(
          '💰 Rails calculation - NO FEATURE or OPTIONS found for rail_accessory'
        );
      }
    } else {
      console.log('💰 Rails calculation - No rails selected');
    }

    // Add other options prices with quantities (from features object)
    const currentOtherOptions = Array.isArray(features.other_options)
      ? features.other_options
      : [];
    if (currentOtherOptions && currentOtherOptions.length > 0) {
      const otherFeature = featureDefs.find((f) => f.id === 'other_options');
      if (otherFeature?.options) {
        let otherTotal = 0;
        currentOtherOptions.forEach((optionValue: string) => {
          const option = otherFeature.options!.find(
            (opt) => opt.value === optionValue
          );
          if (option?.price) {
            const quantity = otherOptionsQuantities[optionValue] || 1;
            const optionTotal = option.price * quantity;
            otherTotal += optionTotal;
            total += optionTotal;
          }
        });
        console.log(
          '💰 Price calculation - Other options total:',
          otherTotal,
          'from',
          currentOtherOptions,
          'with quantities:',
          otherOptionsQuantities
        );
      }
    }

    // Add miscellaneous items total
    const miscTotal = miscItems.reduce((sum, item) => sum + item.total, 0);
    total += miscTotal;
    console.log('💰 Price calculation - Misc items total:', miscTotal);

    console.log('💰 Price calculation - Final total:', total);
    return total;
  }, [
    modelOptions,
    modelId,
    priceOverride,
    isFlattop,
    flattopPriceOverride,
    featureDefs,
    features,
    miscItems,
    otherOptionsQuantities,
    discountCode,
  ]);

  // Store discount details for appliesTo logic
  const [discountDetails, setDiscountDetails] = useState<any>(null);

  // Calculate discount amount based on selected discount code
  const calculateDiscountAmount = useCallback(
    (subtotal: number) => {
      if (!discountCode || discountCode === 'none') return 0;

      // Handle custom discount
      if (discountCode === 'custom' || showCustomDiscount) {
        if (customDiscountType === 'percent') {
          return (subtotal * customDiscountValue) / 100;
        } else {
          return customDiscountValue;
        }
      }

      // Handle predefined discount codes
      const selectedDiscount = discountOptions.find(
        (d) => d.value === discountCode
      );
      if (!selectedDiscount) return 0;

      // Get discount details from the map
      const currentDiscountDetails = discountDetailsMap[discountCode];

      // For persistent discounts, check appliesTo setting
      if (discountCode.startsWith('persistent_') && currentDiscountDetails) {
        const baseAmount =
          priceOverride !== null
            ? priceOverride
            : modelOptions.find((m) => m.id === modelId)?.price || 0;

        // If appliesTo is 'stock_model', apply discount only to base model price
        if (currentDiscountDetails.appliesTo === 'stock_model') {
          // Handle percentage discounts
          if (currentDiscountDetails.percent) {
            return (baseAmount * currentDiscountDetails.percent) / 100;
          }

          // Handle fixed amount discounts
          if (currentDiscountDetails.fixedAmount) {
            return currentDiscountDetails.fixedAmount / 100; // Convert from cents to dollars
          }
        }
        // If appliesTo is 'total_order', apply to full subtotal (existing behavior)
        else {
          // Handle percentage discounts on total order
          if (currentDiscountDetails.percent) {
            return (subtotal * currentDiscountDetails.percent) / 100;
          }

          // Handle fixed amount discounts on total order
          if (currentDiscountDetails.fixedAmount) {
            return currentDiscountDetails.fixedAmount / 100; // Convert from cents to dollars
          }
        }
      }

      // For short-term sales, check appliesTo setting
      if (discountCode.startsWith('short_term_') && currentDiscountDetails) {
        if (currentDiscountDetails.appliesTo === 'stock_model') {
          const baseAmount =
            priceOverride !== null
              ? priceOverride
              : modelOptions.find((m) => m.id === modelId)?.price || 0;
          if (currentDiscountDetails.percent) {
            return (baseAmount * currentDiscountDetails.percent) / 100;
          }
        } else {
          // Apply to total order
          if (currentDiscountDetails.percent) {
            return (subtotal * currentDiscountDetails.percent) / 100;
          }
        }
      }

      // Fallback to label parsing for compatibility
      const percentMatch = selectedDiscount.label.match(/(\d+)% off/);
      if (percentMatch) {
        const percent = parseInt(percentMatch[1]);
        return (subtotal * percent) / 100;
      }

      const dollarMatch = selectedDiscount.label.match(/\$(\d+\.?\d*) off/);
      if (dollarMatch) {
        const amount = parseFloat(dollarMatch[1]);
        return amount;
      }

      return 0;
    },
    [
      discountCode,
      discountOptions,
      showCustomDiscount,
      customDiscountType,
      customDiscountValue,
      discountDetailsMap,
      priceOverride,
      modelOptions,
      modelId,
    ]
  );

  const subtotalPrice = useMemo(() => {
    const result = calculateTotalPrice();
    console.log('💰 Subtotal recalculated:', result);
    return result;
  }, [calculateTotalPrice]);

  const discountAmount = useMemo(() => {
    const result = calculateDiscountAmount(subtotalPrice);
    console.log('💰 Discount recalculated:', result);
    console.log('💰 Discount details:', discountDetails);
    console.log(
      '💰 Base model price:',
      priceOverride !== null
        ? priceOverride
        : modelOptions.find((m) => m.id === modelId)?.price || 0
    );
    console.log('💰 Subtotal price:', subtotalPrice);
    if (discountDetails && discountDetails.appliesTo === 'stock_model') {
      console.log(
        '💰 Stock model discount applied - discount only affects base model price'
      );
    } else if (discountDetails && discountDetails.appliesTo === 'total_order') {
      console.log(
        '💰 Total order discount applied - discount affects entire subtotal'
      );
    }
    return result;
  }, [
    calculateDiscountAmount,
    subtotalPrice,
    discountDetails,
    priceOverride,
    modelOptions,
    modelId,
  ]);

  const totalPrice = useMemo(() => {
    const result = subtotalPrice - discountAmount;
    console.log('💰 Total recalculated:', result);
    return result;
  }, [subtotalPrice, discountAmount]);

  // Helper function to detect discount-like text in notes
  // Used to warn CSRs when they type discounts in notes instead of using structured discount fields
  const hasDiscountTextInNotes = useMemo(() => {
    if (!notes) return false;
    const discountPatterns = [
      /\bdiscount\b/i,
      /\d+\s*%\s*off/i,
      /\$\s*\d+(\.\d{2})?\s*off/i,
      /price reduction/i,
      /\bdeduct\b/i,
      /\brebate\b/i,
    ];
    return discountPatterns.some(pattern => pattern.test(notes));
  }, [notes]);

  // Check if a structured discount is active
  const hasStructuredDiscount = useMemo(() => {
    return (
      (discountCode && discountCode !== 'none') ||
      (showCustomDiscount && customDiscountValue && customDiscountValue > 0)
    );
  }, [discountCode, showCustomDiscount, customDiscountValue]);

  // Show warning when notes mention discounts but no structured discount is applied
  const showDiscountWarning = hasDiscountTextInNotes && !hasStructuredDiscount;

  // Helper function to format currency with commas
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Extract order ID from URL if editing existing order
  const getOrderIdFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('draft') || urlParams.get('edit');
  };

  // Extract duplicate order ID from URL if duplicating an order
  const getDuplicateOrderIdFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('duplicate');
  };

  // Track loading state to ensure proper order
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  // Force component re-render when loading existing order
  const [renderKey, setRenderKey] = useState(0);

  // Load initial data first
  useEffect(() => {
    const loadInitialData = async () => {
      await Promise.all([
        loadStockModels(),
        loadFeatures(),
        loadDiscountCodes(),
      ]);
      setInitialDataLoaded(true);
    };

    loadInitialData();
  }, []);

  // Load order data only after initial data is loaded
  useEffect(() => {
    if (!initialDataLoaded) return;

    const editOrderId = getOrderIdFromUrl();
    const duplicateOrderId = getDuplicateOrderIdFromUrl();
    
    if (editOrderId) {
      // Only load existing order if we have model options
      if (modelOptions.length > 0) {
        setIsEditMode(true);
        setEditingOrderId(editOrderId);
        console.log(
          '🔄 Loading existing order with model options available:',
          modelOptions.length
        );
        loadExistingOrder(editOrderId);
      }
    } else if (duplicateOrderId) {
      // Duplicate mode - load order data but create as new order
      if (modelOptions.length > 0) {
        console.log(
          '🔁 Duplicating order with model options available:',
          modelOptions.length
        );
        preloadDuplicateOrder(duplicateOrderId);
      }
    } else {
      setIsEditMode(false);
      setEditingOrderId(null);
      setIsDuplicateMode(false);
      generateOrderId(); // Generate order ID even without stock models
    }
  }, [initialDataLoaded, modelOptions.length]); // Wait for initial data, but don't block on model options

  // Clear Medium action length when switching to Ferrata/Armor models and LOP for CAT/Visigoth models
  useEffect(() => {
    if (modelId) {
      const selectedModel = modelOptions.find((m) => m.id === modelId);
      const modelName = selectedModel?.displayName || selectedModel?.name || '';

      // Handle Medium action length exclusion for Ferrata/Armor models
      if (features.action_length === 'medium') {
        const shouldExcludeMedium =
          modelName.toLowerCase().includes('ferrata') ||
          modelName.toLowerCase().includes('armor');

        if (shouldExcludeMedium) {
          setFeatures((prev) => ({
            ...prev,
            action_length: undefined, // Clear the medium selection
          }));
          toast({
            title: 'Action Length Updated',
            description:
              'Medium action length is not available for this model. Please select Short or Long.',
            variant: 'default',
          });
        }
      }

      // Handle LOP exclusion for CAT/Visigoth models
      if (features.length_of_pull) {
        const shouldExcludeLOP =
          modelName.toLowerCase().includes('cat') ||
          modelName.toLowerCase().includes('visigoth');

        if (shouldExcludeLOP) {
          setFeatures((prev) => ({
            ...prev,
            length_of_pull: undefined, // Clear the LOP selection
          }));
          toast({
            title: 'LOP Option Removed',
            description:
              'Length of Pull options are not available for this model.',
            variant: 'default',
          });
        }
      }
    }
  }, [
    modelId,
    modelOptions,
    features.action_length,
    features.length_of_pull,
    toast,
  ]);

  // Business rule: Impact Action Inlet + Long Action Length cannot have Left handedness
  useEffect(() => {
    const hasImpactInlet =
      features.action_inlet &&
      features.action_inlet.toLowerCase().includes('impact');
    const isLongAction = features.action_length === 'long';
    const isLeftHanded = features.handedness === 'left';

    if (hasImpactInlet && isLongAction && isLeftHanded) {
      setFeatures((prev) => ({
        ...prev,
        handedness: undefined, // Clear the left handedness selection
      }));
      toast({
        title: 'Handedness Updated',
        description:
          'Left handedness is not available for Impact Action Inlet with Long Action Length.',
        variant: 'default',
      });
    }
  }, [
    features.action_inlet,
    features.action_length,
    features.handedness,
    toast,
  ]);

  // Business rule: Clear Impact Action Inlet when Long Action Length + Left Handedness is selected
  useEffect(() => {
    const isLongAction = features.action_length === 'long';
    const isLeftHanded = features.handedness === 'left';
    const hasImpactInlet =
      features.action_inlet &&
      features.action_inlet.toLowerCase().includes('impact');

    if (isLongAction && isLeftHanded && hasImpactInlet) {
      setFeatures((prev) => ({
        ...prev,
        action_inlet: undefined, // Clear the Impact action inlet selection
      }));
      toast({
        title: 'Action Inlet Updated',
        description:
          'Impact Action Inlet is not available for Long Action Length with Left handedness.',
        variant: 'default',
      });
    }
  }, [
    features.action_length,
    features.handedness,
    features.action_inlet,
    toast,
  ]);

  // Business rule: Clear restricted bottom metals when Medium Action Length is selected
  useEffect(() => {
    const isMediumAction = features.action_length === 'medium';
    const restrictedBottomMetals = [
      'ag_m5_sa',
      'ag_m5_la',
      'ag_m5_la_cip',
      'ag_bdl_sa',
      'ag_bdl_la',
    ];
    const hasRestrictedBottomMetal =
      features.bottom_metal &&
      restrictedBottomMetals.includes(features.bottom_metal);

    if (isMediumAction && hasRestrictedBottomMetal) {
      setFeatures((prev) => ({
        ...prev,
        bottom_metal: undefined, // Clear the restricted bottom metal selection
      }));
      toast({
        title: 'Bottom Metal Updated',
        description:
          'The selected bottom metal is not available for Medium Action Length.',
        variant: 'default',
      });
    }
  }, [features.action_length, features.bottom_metal, toast]);

  // Business rule: M1A stock models - default Action Inlet, Barrel Inlet, Bottom Metal to Factory M1A and restrict Left handedness
  useEffect(() => {
    if (!modelId || modelOptions.length === 0) return;

    const selectedModel = modelOptions.find((m) => m.id === modelId);
    const modelName = selectedModel?.displayName || selectedModel?.name || '';
    const isM1AModel = modelName.toLowerCase().includes('m1a');

    if (isM1AModel) {
      const updates: Record<string, string | undefined> = {};
      const messages: string[] = [];

      if (features.action_inlet !== 'factory_m1a') {
        updates.action_inlet = 'factory_m1a';
        messages.push('Action Inlet set to Factory M1A');
      }

      if (features.barrel_inlet !== 'factory_m1a') {
        updates.barrel_inlet = 'factory_m1a';
        messages.push('Barrel Inlet set to Factory M1A');
      }

      if (features.bottom_metal !== 'factory_m1a') {
        updates.bottom_metal = 'factory_m1a';
        messages.push('Bottom Metal set to Factory M1A');
      }

      if (features.handedness === 'left') {
        updates.handedness = undefined;
        messages.push('Left handedness is not available for M1A models');
      }

      if (Object.keys(updates).length > 0) {
        setFeatures((prev) => ({
          ...prev,
          ...updates,
        }));

        if (messages.length > 0) {
          toast({
            title: 'M1A Model Constraints Applied',
            description: messages.join('. '),
            variant: 'default',
          });
        }
      }
    }
  }, [
    modelId,
    modelOptions,
    features.action_inlet,
    features.barrel_inlet,
    features.bottom_metal,
    features.handedness,
    toast,
  ]);

  // Preload order data for duplication (copies most fields but generates new ID)
  const preloadDuplicateOrder = async (duplicateOrderId: string) => {
    try {
      console.log('Preloading order for duplication:', duplicateOrderId);
      setIsLoadingOrder(true);
      setIsDuplicateMode(true);

      // Check URL params for editMode and clearSpecs
      const urlParams = new URLSearchParams(window.location.search);
      const shouldEnterEditMode = urlParams.get('editMode') === 'true';
      const shouldClearSpecs = urlParams.get('clearSpecs') === 'true';

      // Fetch the order to duplicate
      const order = await apiRequest(`/api/orders/${duplicateOrderId}`);
      
      if (!order) {
        throw new Error(`Order ${duplicateOrderId} not found`);
      }

      console.log('Order data for duplication:', order);

      // Load customer data if available
      if (order.customerId) {
        try {
          const customers = await apiRequest('/api/customers');
          const customerData = customers.find(
            (c: any) => c.id.toString() === order.customerId.toString()
          );
          if (customerData) {
            setCustomer(customerData);
          }
        } catch (error) {
          console.error('Failed to load customer for duplication:', error);
        }
      }

      // Copy order data (but reset certain fields)
      // If clearSpecs is true, don't copy model/features/notes
      if (shouldClearSpecs) {
        setModelId('');
        setFeatures({});
        setNotes('');
        setMiscItems([]);
      } else {
        setModelId(order.modelId || '');
        setFeatures(order.features || {});
        setNotes(order.notes || '');
        // Load miscellaneous items from features if present
        const featuresObj = order.features || {};
        if (featuresObj.miscItems && Array.isArray(featuresObj.miscItems)) {
          setMiscItems(featuresObj.miscItems);
        }
      }

      setOrderDate(new Date()); // Fresh order date
      setDueDate(new Date(Date.now() + 98 * 24 * 60 * 60 * 1000)); // Fresh due date
      setHasCustomerPO(!!order.customerPO);
      setCustomerPO(order.customerPO || '');
      setFbOrderNumber(order.fbOrderNumber || '');
      setHasAGROrder(!!order.agrOrderDetails);
      setAgrOrderDetails(order.agrOrderDetails || '');
      setIsFlattop(order.isFlattop || false);
      setFlattopPriceOverride(order.flattopPriceOverride || null);
      setIsCustomOrder(order.isCustomOrder === 'yes');

      // Reset fields that shouldn't carry over
      setPriceOverride(null);
      setShowPriceOverride(false);
      setShipping(36.95);
      setDiscountCode('');
      setCustomDiscountValue(0);
      setShowCustomDiscount(false);
      setIsVerified(false);
      setIsManualDueDate(false);
      setIsManualOrderDate(false);
      setForecastConfidence(null);
      setForecastCycleDays(null);

      // Reset alt ship to
      setHasAltShipTo(order.hasAltShipTo || false);
      if (order.hasAltShipTo) {
        setAltShipToName(order.altShipToName || '');
        setAltShipToCompany(order.altShipToCompany || '');
        setAltShipToEmail(order.altShipToEmail || '');
        setAltShipToPhone(order.altShipToPhone || '');
        setAltShipToAddress(order.altShipToAddress || {
          street: '',
          city: '',
          state: '',
          zipCode: '',
          country: 'United States',
        });
      }

      // Generate new order ID for the duplicate
      await generateOrderId();

      // Enter edit mode if requested (shows save buttons immediately)
      if (shouldEnterEditMode) {
        setIsEditMode(true);
        setEditingOrderId(null); // Ensure not updating original
      }

      const toastMessage = shouldClearSpecs 
        ? `Order duplicated (specs cleared). Select new model and features.`
        : `Order data copied from ${duplicateOrderId}. Review and submit as a new order.`;

      toast({
        title: 'Order Duplicated',
        description: toastMessage,
        duration: 5000,
      });

    } catch (error) {
      console.error('Failed to preload order for duplication:', error);
      toast({
        title: 'Error',
        description: `Failed to load order ${duplicateOrderId} for duplication`,
        variant: 'destructive',
      });
    } finally {
      setIsLoadingOrder(false);
    }
  };

  // Load existing order data for editing
  const loadExistingOrder = async (orderIdToEdit: string) => {
    try {
      console.log('Loading existing order:', orderIdToEdit);
      setIsLoadingOrder(true);

      // First try to load as draft order
      let order = null;
      try {
        order = await apiRequest(`/api/orders/draft/${orderIdToEdit}`);
        console.log('Found draft order:', order);
      } catch (draftError) {
        console.log('Order not found in drafts, trying finalized orders...');

        // If not found as draft, try to load as finalized order
        try {
          const allOrders = await apiRequest('/api/orders/all');
          order = allOrders.find((o: any) => o.orderId === orderIdToEdit);
          if (order) {
            console.log('Found finalized order:', order);
            toast({
              title: 'Notice',
              description: `Loading finalized order ${orderIdToEdit} for reference. Changes will create a new draft.`,
              variant: 'default',
            });
          }
        } catch (finalizedError) {
          console.log('Order not found in finalized orders either');
          throw new Error(
            `Order ${orderIdToEdit} not found in drafts or finalized orders`
          );
        }
      }

      console.log('Received order data:', order);
      if (order) {
        // Populate form with existing order data
        setOrderId(order.orderId);
        setOrderDate(new Date(order.orderDate));
        const loadedDueDate = new Date(order.dueDate);
        setDueDate(loadedDueDate);

        // Calculate what the base due date should be for this model (without rush fees)
        let calculatedBaseDueDate = loadedDueDate;
        let shouldBeManual = false;

        if (order.modelId) {
          const selectedModel = modelOptions.find(
            (m) => m.id === order.modelId
          );
          const modelName =
            selectedModel?.displayName || selectedModel?.name || '';
          const isAdjModel = modelName.toLowerCase().includes('adj');
          const orderDate = new Date(order.orderDate);
          const daysFromOrder = isAdjModel ? 112 : 98;
          calculatedBaseDueDate = new Date(
            orderDate.getTime() + daysFromOrder * 24 * 60 * 60 * 1000
          );

          // Check if loaded due date differs from auto-calculated date (allowing for rush fees)
          const loadedTime = loadedDueDate.getTime();
          const baseTime = calculatedBaseDueDate.getTime();
          const rushFee1Time = new Date(
            calculatedBaseDueDate.getTime() - 28 * 24 * 60 * 60 * 1000
          ).getTime();
          const rushFee2Time = new Date(
            calculatedBaseDueDate.getTime() - 42 * 24 * 60 * 60 * 1000
          ).getTime();

          // If the loaded date doesn't match any expected calculated date, it's manual
          if (
            loadedTime !== baseTime &&
            loadedTime !== rushFee1Time &&
            loadedTime !== rushFee2Time
          ) {
            shouldBeManual = true;
          }

          // Check for explicit isManualDueDate flag in the order (if saved from newer versions)
          if (order.isManualDueDate !== undefined) {
            shouldBeManual = order.isManualDueDate;
          }
        }

        // Similar logic for order date persistence
        let shouldOrderDateBeManual = false;
        if (order.isManualOrderDate !== undefined) {
          shouldOrderDateBeManual = order.isManualOrderDate;
        }

        setBaseDueDate(calculatedBaseDueDate);
        setIsManualDueDate(shouldBeManual);
        setIsManualOrderDate(shouldOrderDateBeManual);

        if (order.customerId) {
          // Load customer data
          const customers = await apiRequest('/api/customers');
          const customer = customers.find(
            (c: any) => c.id.toString() === order.customerId.toString()
          );
          if (customer) {
            setCustomer(customer);
          }
        }

        console.log('🔧 Loading order modelId:', order.modelId);
        const modelExists = modelOptions.find((m) => m.id === order.modelId);
        console.log(
          '🔧 Model found in options:',
          !!modelExists,
          modelExists?.displayName
        );

        setModelId(order.modelId || '');
        setRenderKey((prev) => prev + 1);
        // CRITICAL: Only use the features object - don't set separate state variables
        console.log('✅ Setting features object:', order.features || {});
        const featuresObj = order.features || {};
        console.log('✅ Loading order features:', featuresObj);
        console.log('✅ Available featuresObj keys:', Object.keys(featuresObj));
        console.log('✅ Specific feature values:');
        console.log('  - handedness:', featuresObj.handedness);
        console.log('  - action_length:', featuresObj.action_length);
        console.log('  - action_inlet:', featuresObj.action_inlet);
        console.log('  - barrel_inlet:', featuresObj.barrel_inlet);
        console.log('  - bottom_metal:', featuresObj.bottom_metal);
        console.log('  - qd_accessory:', featuresObj.qd_accessory);
        console.log('  - paint_options:', featuresObj.paint_options);
        console.log('  - rail_accessory:', featuresObj.rail_accessory);
        console.log('  - other_options:', featuresObj.other_options);

        // Set ONLY the features object - all form controls now read from this
        setFeatures(featuresObj);

        // Load miscellaneous items from features object
        if (featuresObj.miscItems && Array.isArray(featuresObj.miscItems)) {
          setMiscItems(featuresObj.miscItems);
          console.log('✅ Loading miscellaneous items:', featuresObj.miscItems);
        } else {
          setMiscItems([]);
          console.log('✅ No miscellaneous items found in order data');
        }

        // Force component re-render by incrementing render key
        setRenderKey((prev) => prev + 1);

        setCustomerPO(order.customerPO || '');
        setHasCustomerPO(!!order.customerPO);
        setFbOrderNumber(order.fbOrderNumber || '');
        setAgrOrderDetails(order.agrOrderDetails || '');
        setHasAGROrder(!!order.agrOrderDetails);
        setIsFlattop(order.isFlattop || false);
        setFlattopPriceOverride(order.flattopPriceOverride || null);
        setShipping(order.shipping || 0);
        setIsCustomOrder(order.isCustomOrder === 'yes');
        // Load notes from either the dedicated notes column or features.specialInstructions for backward compatibility
        const notesFromField = order.notes || '';
        const notesFromFeatures = featuresObj.specialInstructions || '';
        const finalNotes = notesFromField || notesFromFeatures;
        setNotes(finalNotes);
        console.log('✅ Loading notes:', {
          notesFromField,
          notesFromFeatures,
          finalNotes,
        });

        // Load other options quantities from featureQuantities field
        if (order.featureQuantities) {
          setOtherOptionsQuantities(order.featureQuantities);
          console.log(
            '✅ Loading feature quantities:',
            order.featureQuantities
          );
        } else {
          setOtherOptionsQuantities({});
        }
        setDiscountCode(order.discountCode || '');
        setCustomDiscountType(order.customDiscountType || 'percent');
        setCustomDiscountValue(order.customDiscountValue || 0);
        setShowCustomDiscount(order.showCustomDiscount || false);
        setPriceOverride(order.priceOverride);
        setShowPriceOverride(!!order.priceOverride);
        setIsVerified(order.isVerified || false);
        
        // Load order status for actions drawer
        setOrderStatus(order.status);
        setCurrentDepartment(order.currentDepartment);
        setIsCancelled(order.isCancelled || order.status === 'CANCELLED');
        setUrgency(order.urgency);

        // Load special shipping state from saved order data
        setSpecialShipping({
          international: order.specialShippingInternational || false,
          nextDayAir: order.specialShippingNextDayAir || false,
          billToReceiver: order.specialShippingBillToReceiver || false,
        });

        // Load Alt Ship To data
        setHasAltShipTo(order.hasAltShipTo || false);
        if (order.hasAltShipTo) {
          if (order.altShipToCustomerId) {
            setAltShipToMode('existing');
            setAltShipToCustomerId(order.altShipToCustomerId);

            // Load the customer object for the alt ship to customer
            const loadAltShipToCustomer = async () => {
              try {
                const customers = await apiRequest('/api/customers');
                const altCustomer = customers.find(
                  (c: any) =>
                    c.id.toString() === order.altShipToCustomerId.toString()
                );
                if (altCustomer) {
                  setAltShipToCustomer(altCustomer);
                }
              } catch (error) {
                console.error('Failed to load alt ship to customer:', error);
              }
            };
            loadAltShipToCustomer();

            // Clear manual fields
            setAltShipToName('');
            setAltShipToCompany('');
            setAltShipToEmail('');
            setAltShipToPhone('');
            setAltShipToAddress({
              street: '',
              city: '',
              state: '',
              zipCode: '',
              country: 'United States',
            });
          } else if (order.altShipToAddress) {
            setAltShipToMode('manual');
            setAltShipToName(order.altShipToName || '');
            setAltShipToCompany(order.altShipToCompany || '');
            setAltShipToEmail(order.altShipToEmail || '');
            setAltShipToPhone(order.altShipToPhone || '');
            setAltShipToAddress(
              order.altShipToAddress || {
                street: '',
                city: '',
                state: '',
                zipCode: '',
                country: 'United States',
              }
            );
            // Clear existing customer
            setAltShipToCustomer(null);
            setAltShipToCustomerId('');
          }
        }

        // CRITICAL FIX: Load discount details from saved metadata instead of fetching from discount_codes table
        // This ensures discounts remain stable even if the discount code is later modified or deleted
        if (order.discountCode && order.discountCode !== 'none') {
          // Check if we have saved discount metadata
          if (order.discountType && order.discountValue) {
            // Use saved metadata to reconstruct discount details
            const reconstructedDetails = {
              percent: order.discountType === 'percent' ? order.discountValue : null,
              fixedAmount: order.discountType === 'fixed' ? order.discountValue * 100 : null, // Convert dollars back to cents
              appliesTo: order.discountAppliesTo || 'total_order',
            };
            
            // Store in both discountDetails and discountDetailsMap
            setDiscountDetails(reconstructedDetails);
            setDiscountDetailsMap(prev => ({
              ...prev,
              [order.discountCode]: reconstructedDetails
            }));
            
            console.log('✅ Loaded discount from saved metadata:', reconstructedDetails);
          } else {
            // Fallback: Load from discount codes table (for orders created before metadata feature)
            const loadDiscountDetailsForEdit = async () => {
              try {
                if (order.discountCode.startsWith('persistent_')) {
                  const discountId = order.discountCode.replace(
                    'persistent_',
                    ''
                  );
                  const persistentDiscounts = await apiRequest(
                    '/api/discounts/persistent-discounts'
                  );
                  const discount = persistentDiscounts.find(
                    (d: any) => d.id.toString() === discountId
                  );
                  setDiscountDetails(discount || null);
                  if (discount) {
                    setDiscountDetailsMap(prev => ({
                      ...prev,
                      [order.discountCode]: discount
                    }));
                  }
                } else if (order.discountCode.startsWith('short_term_')) {
                  const saleId = order.discountCode.replace('short_term_', '');
                  const shortTermSales = await apiRequest(
                    '/api/discounts/short-term-sales'
                  );
                  const sale = shortTermSales.find(
                    (s: any) => s.id.toString() === saleId
                  );
                  setDiscountDetails(
                    sale
                      ? { ...sale, appliesTo: sale.appliesTo || 'total_order' }
                      : null
                  );
                  if (sale) {
                    setDiscountDetailsMap(prev => ({
                      ...prev,
                      [order.discountCode]: { ...sale, appliesTo: sale.appliesTo || 'total_order' }
                    }));
                  }
                }
              } catch (error) {
                console.error('Failed to load discount details for edit:', error);
                setDiscountDetails(null);
              }
            };
            loadDiscountDetailsForEdit();
          }
        }

        // Payment data will be loaded by PaymentManager component

        // Load QD same-side confirmation state (for preserving across edits)
        setQdSameSideConfirmed(order.qdSameSideConfirmed || false);
        setQdSameSideConfirmedBy(order.qdSameSideConfirmedBy || null);
        setQdSameSideConfirmedAt(order.qdSameSideConfirmedAt ? new Date(order.qdSameSideConfirmedAt) : null);

        console.log('All order fields loaded:', {
          orderId: order.orderId,
          modelId: order.modelId,
          customerId: order.customerId,
          customerPO: order.customerPO,
          fbOrderNumber: order.fbOrderNumber,
          agrOrderDetails: order.agrOrderDetails,
          handedness: order.handedness,
          features: order.features,
          shipping: order.shipping,
          isCustomOrder: order.isCustomOrder,
          discountCode: order.discountCode,
        });

        toast({
          title: 'Order Loaded',
          description: `Editing order ${order.orderId}`,
        });
      }
    } catch (error) {
      console.error('Failed to load existing order:', error);
      toast({
        title: 'Error',
        description: 'Failed to load order for editing',
        variant: 'destructive',
      });
      generateOrderId(); // Fallback to new order
    } finally {
      setIsLoadingOrder(false);
    }
  };

  const loadStockModels = async () => {
    try {
      console.log('🔍 Loading stock models from API...');
      const models = await apiRequest('/api/stock-models');
      console.log('🔍 Raw models from API:', models);
      console.log('🔍 Total models received:', models?.length || 0);

      if (models && Array.isArray(models) && models.length > 0) {
        console.log('🔍 First model sample:', models[0]);
        console.log('🔍 Model properties:', Object.keys(models[0]));

        // Ensure models have the required fields
        const validModels = models.filter(
          (m: any) =>
            m &&
            typeof m === 'object' &&
            m.id &&
            (m.displayName || m.name) &&
            typeof m.price === 'number'
        );

        const activeModels = validModels.filter(
          (m: StockModel) => m.isActive !== false
        );
        console.log('🔍 Active models filtered:', activeModels.length);
        console.log(
          '🔍 Active models IDs:',
          activeModels.map((m: StockModel) => m.id)
        );
        console.log(
          '🔍 Active models display names:',
          activeModels.map((m: StockModel) => m.displayName || m.name)
        );

        setModelOptions(activeModels);
        console.log(
          '✅ Stock models loaded successfully:',
          activeModels.length
        );
      } else {
        console.log('⚠️ No valid models received from API');
        setModelOptions([]);
      }
    } catch (error) {
      console.error('❌ Failed to load stock models:', error);
      setModelOptions([]);
    }
  };

  const loadFeatures = async () => {
    try {
      const features = await apiRequest('/api/features');
      console.log('🔍 Raw features data from API:', features);
      console.log('🔍 Features array length:', features?.length || 0);
      if (features && features.length > 0) {
        console.log('🔍 First feature sample:', features[0]);
        console.log(
          '🔍 Available feature IDs:',
          features.map((f: any) => f.id).join(', ')
        );
      }
      setFeatureDefs(features || []);
      console.log(
        '🔍 setFeatureDefs called with:',
        features?.length || 0,
        'features'
      );
    } catch (error) {
      console.error('❌ Failed to load features:', error);
      setFeatureDefs([]); // Set empty array on error
    }
  };

  // Set default texture value for new orders
  useEffect(() => {
    // Only set defaults for new orders (not editing existing orders)
    if (!isEditMode && featureDefs.length > 0 && !features.texture_options) {
      const textureFeature = featureDefs.find(
        (f) =>
          f.id === 'texture_options' ||
          f.name === 'texture_options' ||
          f.id?.toLowerCase().includes('texture') ||
          f.name?.toLowerCase().includes('texture') ||
          f.displayName?.toLowerCase().includes('texture')
      );

      if (textureFeature?.options) {
        // Find "No Texture" option (check various possible values)
        const noTextureOption = textureFeature.options.find(
          (option) =>
            option.label?.toLowerCase().includes('no texture') ||
            option.value?.toLowerCase().includes('no_texture') ||
            option.value?.toLowerCase().includes('none') ||
            option.label?.toLowerCase() === 'none'
        );

        if (noTextureOption) {
          setFeatures((prev) => ({
            ...prev,
            texture_options: noTextureOption.value,
          }));
          console.log(
            '✅ Set default texture to:',
            noTextureOption.label,
            'with value:',
            noTextureOption.value
          );
        }
      }
    }
  }, [featureDefs, isEditMode, features.texture_options]);

  // Set default swivel studs value for new orders
  useEffect(() => {
    // Only set defaults for new orders (not editing existing orders)
    if (!isEditMode && featureDefs.length > 0 && !features.swivel_studs) {
      const swivelStudsFeature = featureDefs.find(
        (f) =>
          f.id === 'swivel_studs' ||
          f.name === 'swivel_studs' ||
          f.id?.toLowerCase().includes('swivel') ||
          f.name?.toLowerCase().includes('swivel') ||
          f.displayName?.toLowerCase().includes('swivel')
      );

      if (swivelStudsFeature?.options) {
        // Find "Standard Swivel Studs" option (check various possible values)
        const standardSwivelOption = swivelStudsFeature.options.find(
          (option) =>
            option.label?.toLowerCase().includes('standard swivel studs') ||
            option.value?.toLowerCase().includes('standard_swivel_studs') ||
            option.label?.toLowerCase().includes('standard swivel') ||
            option.value?.toLowerCase().includes('standard_swivel')
        );

        if (standardSwivelOption) {
          setFeatures((prev) => ({
            ...prev,
            swivel_studs: standardSwivelOption.value,
          }));
          console.log(
            '✅ Set default swivel studs to:',
            standardSwivelOption.label,
            'with value:',
            standardSwivelOption.value
          );
        }
      }
    }
  }, [featureDefs, isEditMode, features.swivel_studs]);

  // Set default rail accessory value for new orders
  useEffect(() => {
    // Only set defaults for new orders (not editing existing orders)
    if (
      !isEditMode &&
      featureDefs.length > 0 &&
      (!features.rail_accessory || features.rail_accessory.length === 0)
    ) {
      const railFeature = featureDefs.find(
        (f) =>
          f.id === 'rail_accessory' ||
          f.name === 'rail_accessory' ||
          f.id?.toLowerCase().includes('rail') ||
          f.name?.toLowerCase().includes('rail') ||
          f.displayName?.toLowerCase().includes('rail')
      );

      if (railFeature?.options) {
        // Find "No Rail" option (check various possible values)
        const noRailOption = railFeature.options.find(
          (option) =>
            option.label?.toLowerCase().includes('no rail') ||
            option.value?.toLowerCase().includes('no_rail') ||
            option.label?.toLowerCase() === 'none' ||
            option.value?.toLowerCase() === 'none'
        );

        if (noRailOption) {
          setFeatures((prev) => ({
            ...prev,
            rail_accessory: [noRailOption.value], // Rails is an array field
          }));
          console.log(
            '✅ Set default rail accessory to:',
            noRailOption.label,
            'with value:',
            noRailOption.value
          );
        }
      }
    }
  }, [featureDefs, isEditMode, features.rail_accessory]);

  // Set default length of pull (LOP) value for new orders
  useEffect(() => {
    // Only set defaults for new orders (not editing existing orders)
    if (!isEditMode && featureDefs.length > 0 && !features.length_of_pull) {
      console.log(
        '🔍 Looking for LOP feature in featureDefs:',
        featureDefs.map((f) => ({
          id: f.id,
          name: f.name,
          displayName: f.displayName,
        }))
      );

      const lopFeature = featureDefs.find(
        (f) =>
          f.id === 'length_of_pull' ||
          f.name === 'length_of_pull' ||
          f.id?.toLowerCase().includes('length') ||
          f.name?.toLowerCase().includes('length') ||
          f.displayName?.toLowerCase().includes('length') ||
          f.displayName?.toLowerCase().includes('lop')
      );

      console.log('🔍 Found LOP feature:', lopFeature);

      if (lopFeature?.options) {
        console.log('🔍 LOP feature options:', lopFeature.options);

        // Find "No Extra Length (STD 13.5")" option (check various possible values)
        const standardLopOption = lopFeature.options.find(
          (option) =>
            option.label?.includes('No Extra Length (STD 13.5")') ||
            option.label?.toLowerCase().includes('no extra length') ||
            option.value?.toLowerCase().includes('no_lop_change') ||
            option.label?.toLowerCase().includes('std 13.5') ||
            (option.label?.toLowerCase().includes('no') &&
              option.label?.toLowerCase().includes('13.5'))
        );

        console.log('🔍 Found LOP default option:', standardLopOption);

        if (standardLopOption) {
          setFeatures((prev) => ({
            ...prev,
            length_of_pull: standardLopOption.value,
          }));
          console.log(
            '✅ Set default length of pull to:',
            standardLopOption.label,
            'with value:',
            standardLopOption.value
          );
        } else {
          console.log('❌ Could not find LOP default option');
        }
      } else {
        console.log('❌ LOP feature has no options');
      }
    }
  }, [featureDefs, isEditMode, features.length_of_pull]);

  // Set default QD accessory value for new orders
  useEffect(() => {
    // Only set defaults for new orders (not editing existing orders)
    if (!isEditMode && featureDefs.length > 0 && !features.qd_accessory) {
      const qdFeature = featureDefs.find(
        (f) =>
          f.id === 'qd_accessory' ||
          f.name === 'qd_accessory' ||
          f.id?.toLowerCase().includes('qd') ||
          f.name?.toLowerCase().includes('qd') ||
          f.displayName?.toLowerCase().includes('qd') ||
          f.displayName?.toLowerCase().includes('quick detach')
      );

      if (qdFeature?.options) {
        // Find "No QD" option (check various possible values)
        const noQdOption = qdFeature.options.find(
          (option) =>
            option.label?.toLowerCase().includes('no qd') ||
            option.value?.toLowerCase().includes('no_qd') ||
            option.label?.toLowerCase() === 'none' ||
            option.value?.toLowerCase() === 'none'
        );

        if (noQdOption) {
          setFeatures((prev) => ({
            ...prev,
            qd_accessory: noQdOption.value,
          }));
          console.log(
            '✅ Set default QD accessory to:',
            noQdOption.label,
            'with value:',
            noQdOption.value
          );
        }
      }
    }
  }, [featureDefs, isEditMode, features.qd_accessory]);

  const loadDiscountCodes = async () => {
    try {
      const [shortTermSales, persistentDiscounts] = await Promise.all([
        apiRequest('/api/discounts/short-term-sales'),
        apiRequest('/api/discounts/persistent-discounts'),
      ]);

      const discounts: { value: string; label: string }[] = [];
      const discountDetailsMap: Record<string, any> = {};

      // Add active short-term sales
      const now = new Date();
      shortTermSales
        .filter((sale: any) => {
          const startDate = new Date(sale.startDate);
          const endDate = new Date(sale.endDate);
          return startDate <= now && now <= endDate && sale.isActive;
        })
        .forEach((sale: any) => {
          const value = `short_term_${sale.id}`;
          discounts.push({
            value,
            label: `${sale.name} (${sale.percent}% off)`,
          });
          discountDetailsMap[value] = {
            ...sale,
            appliesTo: sale.appliesTo || 'total_order',
          };
        });

      // Add active persistent discounts
      persistentDiscounts
        .filter((discount: any) => discount.isActive)
        .forEach((discount: any) => {
          const displayValue = discount.percent
            ? `${discount.percent}% off`
            : `$${(discount.fixedAmount / 100).toFixed(2)} off`;
          const value = `persistent_${discount.id}`;
          discounts.push({
            value,
            label: `${discount.name} (${displayValue})`,
          });
          discountDetailsMap[value] = discount;
        });

      // Add Custom discount option
      discounts.push({
        value: 'custom',
        label: 'Custom Discount',
      });

      console.log(
        '💳 Discount options processed:',
        discounts.length,
        'total discounts'
      );
      console.log('💳 Discount options:', discounts);
      console.log('💳 Discount details map:', discountDetailsMap);
      setDiscountOptions(discounts);
      setDiscountDetailsMap(discountDetailsMap);
      // Store discount details for appliesTo logic
      if (discountCode && discountDetailsMap[discountCode]) {
        setDiscountDetails(discountDetailsMap[discountCode]);
      }
    } catch (error) {
      console.error('Failed to load discount codes:', error);
    }
  };

  const generateOrderId = async () => {
    try {
      const response = await apiRequest('/api/orders/generate-id', {
        method: 'POST',
      });

      // Validate the generated ID format (e.g., EH001, AG001)
      const orderIdPattern = /^[A-Z]{1,3}\d{3,}$/;
      if (!orderIdPattern.test(response.orderId)) {
        throw new Error('Invalid Order ID format generated');
      }

      setOrderId(response.orderId);
      setErrors((prev) => ({ ...prev, orderId: '' })); // Clear any previous errors
    } catch (error) {
      console.error('Failed to generate order ID:', error);
      setErrors((prev) => ({
        ...prev,
        orderId: 'Failed to generate Order ID. Please refresh the page.',
      }));
      // Set fallback ID with error indicator
      setOrderId('ERROR-001');
    }
  };

  // Use unified pricing calculation (calculated above with discount already included)

  // Check if QD accessory is on the same side as handedness (unusual configuration)
  const checkQdSameSideWarning = useCallback(() => {
    const handedness = features.handedness;
    const qdAccessory = features.qd_accessory;

    // If no handedness or no QD selected, no warning needed
    if (!handedness || !qdAccessory) return false;

    // Normalize values for comparison
    const handednessLower = handedness.toLowerCase();
    const qdLower = qdAccessory.toLowerCase();

    // Skip warning for "no_qds" or options without side specified
    if (qdLower === 'no_qds' || qdLower === 'qd_2_butt' || qdLower === 'qd_4') {
      return false;
    }

    // Check for same-side configuration (unusual)
    // Left-handed stock with Left QD = unusual (normally QD would be on right)
    // Right-handed stock with Right QD = unusual (normally QD would be on left)
    const isLeftHanded = handednessLower === 'left' || handednessLower === 'lh';
    const isRightHanded = handednessLower === 'right' || handednessLower === 'rh';
    const hasLeftQd = qdLower.includes('left');
    const hasRightQd = qdLower.includes('right');

    // Debug logging to trace the actual values
    console.log('🔍 QD Guardrail Check:', {
      handedness,
      qdAccessory,
      isLeftHanded,
      isRightHanded,
      hasLeftQd,
      hasRightQd,
      wouldWarn: (isLeftHanded && hasLeftQd) || (isRightHanded && hasRightQd)
    });

    // Same side = warning needed
    if (isLeftHanded && hasLeftQd) return true;
    if (isRightHanded && hasRightQd) return true;

    return false;
  }, [features.handedness, features.qd_accessory]);

  // Handle QD same-side confirmation and proceed with order submission
  const handleQdConfirmAndSubmit = async () => {
    setShowQdSameSideModal(false);
    
    // Set the confirmation data
    const confirmedBy = customer?.name || 'CSR';
    const confirmedAt = new Date();
    setQdSameSideConfirmed(true);
    setQdSameSideConfirmedBy(confirmedBy);
    setQdSameSideConfirmedAt(confirmedAt);

    // Proceed with the pending submission
    if (pendingOrderSubmit) {
      setIsSubmitting(true);
      try {
        await executeOrderSubmit(pendingOrderSubmit.saveAsDraft, {
          qdSameSideConfirmed: true,
          qdSameSideConfirmedBy: confirmedBy,
          qdSameSideConfirmedAt: confirmedAt,
        });
      } catch (error: any) {
        console.error('Submit error (QD confirmed):', error);
        if (error?.status === 409 || error?.responseData?.error === 'ORDER_ALREADY_FINALIZED') {
          toast({
            title: 'Order Already Submitted',
            description: error.message || 'This order has already been submitted. Refresh the page to see it in the orders list.',
          });
        } else {
          toast({
            title: 'Error',
            description: error.message || 'Failed to save order',
            variant: 'destructive',
          });
        }
      } finally {
        setIsSubmitting(false);
      }
    }
    setPendingOrderSubmit(null);
  };

  // Cancel the QD confirmation modal
  const handleQdConfirmCancel = () => {
    setShowQdSameSideModal(false);
    setPendingOrderSubmit(null);
    setIsSubmitting(false);
  };

  const handleSubmit = async (
    e?: React.FormEvent<HTMLFormElement>,
    saveAsDraft: boolean = false
  ) => {
    if (e) {
      e.preventDefault();
    }

    // Guard against re-entrant calls using a synchronous ref — React state updates
    // are async, so `isSubmitting` may not reflect the latest value yet when a
    // second invocation arrives in the same render cycle (e.g. Enter key + button
    // click, or two rapid button taps).
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;

    setErrors({});
    setIsSubmitting(true);

    try {
      // Validate required fields
      if (!customer) {
        setErrors((prev) => ({ ...prev, customer: 'Customer is required' }));
        return;
      }

      if (!orderId || orderId.startsWith('ERROR')) {
        setErrors((prev) => ({
          ...prev,
          orderId: 'Valid Order ID is required',
        }));
        return;
      }

      // Validate Order ID format
      const orderIdPattern = /^[A-Z]{1,3}\d{3,}$/;
      if (!orderIdPattern.test(orderId)) {
        setErrors((prev) => ({ ...prev, orderId: 'Invalid Order ID format' }));
        return;
      }

      // CRITICAL VALIDATION: Prevent saving orders with null/empty modelId
      if (!modelId || modelId.trim() === '') {
        setErrors((prev) => ({ ...prev, modelId: 'Stock model is required' }));
        toast({
          title: 'Stock Model Required',
          description: 'Please select a stock model before saving the order',
          variant: 'destructive',
        });
        return;
      }

      // VALIDATION: Bartlein #3B requires shank to be entered
      if (features.barrel_inlet === 'bartlein_#3b') {
        if (!features.add_shank) {
          setErrors((prev) => ({
            ...prev,
            shank: 'Shank is required for Bartlein #3B',
          }));
          toast({
            title: 'Shank Required',
            description:
              'Bartlein #3B barrel inlet requires a shank to be added',
            variant: 'destructive',
          });
          return;
        }
        if (!features.shank_value || !features.shank_value.trim()) {
          setErrors((prev) => ({
            ...prev,
            shank: 'Shank value must be entered for Bartlein #3B',
          }));
          toast({
            title: 'Shank Value Required',
            description: 'Please enter a shank value for Bartlein #3B',
            variant: 'destructive',
          });
          return;
        }
      }

      // QD Same-Side Guardrail Check
      // Check if QD is on the same side as handedness (unusual configuration)
      const needsQdConfirmation = checkQdSameSideWarning();
      if (needsQdConfirmation && !qdSameSideConfirmed) {
        // Show confirmation modal and pause submission
        setPendingOrderSubmit({ saveAsDraft });
        setShowQdSameSideModal(true);
        return; // Wait for modal confirmation
      }

      // Proceed with order submission
      await executeOrderSubmit(saveAsDraft, {
        qdSameSideConfirmed: qdSameSideConfirmed,
        qdSameSideConfirmedBy: qdSameSideConfirmedBy,
        qdSameSideConfirmedAt: qdSameSideConfirmedAt,
      });
    } catch (error: any) {
      console.error('Submit error:', error);
      if (error?.status === 409 || error?.responseData?.error === 'ORDER_ALREADY_FINALIZED') {
        toast({
          title: 'Order Already Submitted',
          description: error.message || 'This order has already been submitted. Refresh the page to see it in the orders list.',
        });
      } else {
        toast({
          title: 'Error',
          description: error.message || 'Failed to save order',
          variant: 'destructive',
        });
      }
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Core order submission logic (extracted for reuse after modal confirmation)
  const executeOrderSubmit = async (
    saveAsDraft: boolean,
    qdConfirmation: {
      qdSameSideConfirmed: boolean;
      qdSameSideConfirmedBy: string | null;
      qdSameSideConfirmedAt: Date | null;
    }
  ) => {
    // Ensure customer is selected (validation already done in handleSubmit)
    if (!customer) {
      throw new Error('Customer is required');
    }
    
    try {
      // All features are now stored directly in the features object by form controls
      // No need to merge separate state variables since handedness, action_inlet, etc.
      // are directly updated in features by their respective form controls
      const completeFeatures = {
        ...features,
        miscItems: miscItems, // Include miscellaneous items for persistence
      };

      console.log('Complete features being saved:', completeFeatures);

      // Try to find matching Stock BOM for this model (for MRP integration)
      let bomDefinitionId = null;
      try {
        const selectedModel = modelOptions.find((m) => m.id === modelId);
        if (selectedModel) {
          const stockBoms = await apiRequest('/api/robust-boms/stock-boms');
          // Try to match by SKU or model name
          const matchingBom = stockBoms?.find(
            (bom: any) =>
              bom.sku === (selectedModel as any).sku ||
              bom.modelName === selectedModel.name ||
              bom.modelName === selectedModel.displayName
          );
          if (matchingBom) {
            bomDefinitionId = matchingBom.id;
            console.log(`✅ Auto-linked Stock BOM ${matchingBom.id} for model ${selectedModel.name}`);
          }
        }
      } catch (error) {
        console.warn('Could not fetch stock BOMs for auto-linking:', error);
      }

      // Extract discount metadata from discountDetailsMap
      let discountType = null;
      let discountValue = null;
      let discountAppliesTo = null;

      if (discountCode && discountCode !== 'none') {
        if (discountCode === 'custom' || showCustomDiscount) {
          // Custom discount
          discountType = customDiscountType; // 'percent' or 'fixed'
          discountValue = customDiscountValue;
          discountAppliesTo = 'total_order'; // Custom discounts always apply to total
        } else {
          // Predefined discount code - get metadata from map
          const discountDetails = discountDetailsMap[discountCode];
          if (discountDetails) {
            if (discountDetails.percent) {
              discountType = 'percent';
              discountValue = discountDetails.percent;
            } else if (discountDetails.fixedAmount) {
              discountType = 'fixed';
              discountValue = discountDetails.fixedAmount / 100; // Convert cents to dollars
            }
            discountAppliesTo = discountDetails.appliesTo || 'total_order';
          }
        }
      }

      const orderData = {
        customerId: customer.id.toString(),
        modelId,
        features: completeFeatures,
        orderDate: orderDate.toISOString(),
        dueDate: dueDate.toISOString(),
        orderId,
        customerPO: hasCustomerPO ? customerPO : '',
        fbOrderNumber,
        agrOrderDetails: hasAGROrder ? agrOrderDetails : '',
        isFlattop,
        flattopPriceOverride,
        shipping,
        status: saveAsDraft ? 'DRAFT' : 'FINALIZED',
        isCustomOrder: isCustomOrder ? 'yes' : 'no',
        notes,
        discountCode,
        discountType,
        discountValue,
        discountAppliesTo,
        customDiscountType,
        customDiscountValue,
        showCustomDiscount,
        priceOverride,
        miscItems: miscItems,
        featureQuantities: otherOptionsQuantities,
        isVerified,
        isManualDueDate, // Save the manual due date flag
        isManualOrderDate, // Save the manual order date flag
        hasAltShipTo,
        altShipToCustomerId:
          hasAltShipTo && altShipToMode === 'existing'
            ? altShipToCustomerId
            : null,
        altShipToName:
          hasAltShipTo && altShipToMode === 'manual' ? altShipToName : null,
        altShipToCompany:
          hasAltShipTo && altShipToMode === 'manual' ? altShipToCompany : null,
        altShipToEmail:
          hasAltShipTo && altShipToMode === 'manual' ? altShipToEmail : null,
        altShipToPhone:
          hasAltShipTo && altShipToMode === 'manual' ? altShipToPhone : null,
        altShipToAddress:
          hasAltShipTo && altShipToMode === 'manual' ? altShipToAddress : null,
        // Special Shipping Instructions
        specialShippingInternational: specialShipping.international,
        specialShippingNextDayAir: specialShipping.nextDayAir,
        specialShippingBillToReceiver: specialShipping.billToReceiver,
        // Stock BOM auto-linking (for MRP integration)
        bomDefinitionId,
        // QD Same-Side Confirmation (for unusual configurations)
        qdSameSideConfirmed: qdConfirmation.qdSameSideConfirmed,
        qdSameSideConfirmedBy: qdConfirmation.qdSameSideConfirmedBy,
        qdSameSideConfirmedAt: qdConfirmation.qdSameSideConfirmedAt?.toISOString() || null,
        // Payment fields removed - now handled by PaymentManager
      };

      // Determine if we're creating or updating
      let response;
      if (isEditMode && editingOrderId) {
        // Update existing order
        response = await apiRequest(`/api/orders/draft/${editingOrderId}`, {
          method: 'PUT',
          body: JSON.stringify(orderData),
        });

        toast({
          title: 'Success',
          description: saveAsDraft
            ? 'Order saved as draft'
            : 'Order updated successfully',
        });
      } else {
        // Create new order - use finalized endpoint for completed orders
        const endpoint = saveAsDraft
          ? '/api/orders/draft'
          : '/api/orders/finalized';
        response = await apiRequest(endpoint, {
          method: 'POST',
          body: JSON.stringify(orderData),
        });

        if (saveAsDraft) {
          toast({
            title: 'Success',
            description: 'Order saved as draft',
          });
        } else {
          // Check email outcome for finalized orders
          const emailOutcome = (response as any)?.emailOutcome;
          const emailError = (response as any)?.emailError;
          
          if (emailOutcome === 'sent') {
            toast({
              title: 'Success',
              description: 'Order created and confirmation email sent to customer',
            });
          } else if (emailOutcome === 'skipped') {
            toast({
              title: 'Success',
              description: 'Order created (confirmation email already sent previously)',
            });
          } else if (emailOutcome === 'failed') {
            // Show warning toast for failed email - order was still created
            toast({
              title: 'Order Created - Email Failed',
              description: `Order was created but the confirmation email failed to send: ${emailError || 'Unknown error'}. Please resend manually from the Orders page.`,
              variant: 'destructive',
            });
          } else {
            // No email outcome (might be no-stock order or other case)
            toast({
              title: 'Success',
              description: 'Order created and added to P1 Production Queue',
            });
          }
        }
      }

      // Invalidate relevant caches based on whether it was saved as draft or finalized
      if (saveAsDraft) {
        queryClient.invalidateQueries({
          queryKey: ['/api/orders/drafts', 'excludeFinalized'],
        });
      } else {
        // Finalized orders appear in the main All Orders list and Production Queue
        queryClient.invalidateQueries({
          queryKey: ['/api/orders/with-payment-status'],
        });
        queryClient.invalidateQueries({
          queryKey: ['/api/orders/pipeline-counts'],
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });

      clearOrderDraft();

      // Navigate to All Orders page after successful creation (not for drafts or edits)
      if (!saveAsDraft && !isEditMode) {
        // Small delay to ensure toast is visible before navigation
        setTimeout(() => {
          setLocation('/orders-list');
        }, 1000);
      }

      // Reset form only if not editing and not saving as draft
      // When saving a new order as draft, transition into edit mode instead of resetting
      if (!isEditMode && saveAsDraft) {
        // Transition into edit mode for the newly created draft
        const savedResponse = response as { orderId?: string; id?: string } | null;
        const newOrderId = savedResponse?.orderId ?? savedResponse?.id;
        if (newOrderId) {
          setIsEditMode(true);
          setEditingOrderId(newOrderId);
          // Update URL to reflect the new draft without triggering a full reload
          const newUrl = `${window.location.pathname}?draft=${newOrderId}`;
          window.history.replaceState(null, '', newUrl);
        } else {
          console.warn('[Draft save] Response did not include orderId — falling back to form reset:', savedResponse);
          resetForm();
        }
      } else if (!isEditMode) {
        resetForm();
      }
    } catch (error: any) {
      console.error('Submit error:', error);
      if (error?.status === 409 || error?.responseData?.error === 'ORDER_ALREADY_FINALIZED') {
        toast({
          title: 'Order Already Submitted',
          description: error.message || 'This order has already been submitted. Refresh the page to see it in the orders list.',
        });
      } else {
        toast({
          title: 'Error',
          description: error.message || 'Failed to save order',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setCustomer(null);
    setModelId('');
    setModelOpen(false);
    setFeatures({});
    setOrderDate(new Date());
    const defaultDueDate = new Date(Date.now() + 98 * 24 * 60 * 60 * 1000); // Default to 98 days
    setDueDate(defaultDueDate);
    setBaseDueDate(defaultDueDate);
    setHasCustomerPO(false);
    setCustomerPO('');
    setFbOrderNumber('');
    setHasAGROrder(false);
    setAgrOrderDetails('');
    setIsFlattop(false);
    setFlattopPriceOverride(null);
    setShowFlattopPriceOverride(false);
    setDiscountCode('');
    setCustomDiscountType('percent');
    setCustomDiscountValue(0);
    setShowCustomDiscount(false);
    setPriceOverride(null);
    setShowPriceOverride(false);
    setShipping(36.95);
    setIsCustomOrder(false);
    setNotes('');
    setErrors({});
    setDiscountDetails(null);
    setIsEditMode(false);
    setEditingOrderId(null);
    // Reset payment state - payments now handled by PaymentManager
    setOrderPayments([]);
    setMiscItems([]);
    setOtherOptionsQuantities({});
    setSpecialShipping({
      international: false,
      nextDayAir: false,
      billToReceiver: false,
    });
    setIsManualDueDate(false);
    setForecastConfidence(null);
    setForecastCycleDays(null);
    // Reset QD same-side confirmation state
    setQdSameSideConfirmed(false);
    setQdSameSideConfirmedBy(null);
    setQdSameSideConfirmedAt(null);
    generateOrderId();
  };

  // Handle save-for-payment callback (card-before-save flow)
  const handleSaveForPayment = async (): Promise<{ success: boolean; orderId?: string }> => {
    if (!customer) {
      return { success: false };
    }

    try {
      const completeFeatures = {
        ...features,
        miscItems: miscItems,
      };

      // Extract discount metadata
      let discountType = null;
      let discountValue = null;
      let discountAppliesTo = null;

      if (discountCode && discountCode !== 'none') {
        if (discountCode === 'custom' || showCustomDiscount) {
          discountType = customDiscountType;
          discountValue = customDiscountValue;
          discountAppliesTo = 'total_order';
        } else {
          const discountDetails = discountDetailsMap[discountCode];
          if (discountDetails) {
            if (discountDetails.percent) {
              discountType = 'percent';
              discountValue = discountDetails.percent;
            } else if (discountDetails.fixedAmount) {
              discountType = 'fixed';
              discountValue = discountDetails.fixedAmount / 100;
            }
            discountAppliesTo = discountDetails.appliesTo || 'total_order';
          }
        }
      }

      const orderData = {
        customerId: customer.id.toString(),
        modelId,
        features: completeFeatures,
        orderDate: orderDate.toISOString(),
        dueDate: dueDate.toISOString(),
        orderId,
        customerPO: hasCustomerPO ? customerPO : '',
        fbOrderNumber,
        agrOrderDetails: hasAGROrder ? agrOrderDetails : '',
        isFlattop,
        flattopPriceOverride,
        shipping,
        status: 'PENDING_PAYMENT',
        isCustomOrder: isCustomOrder ? 'yes' : 'no',
        notes,
        discountCode,
        discountType,
        discountValue,
        discountAppliesTo,
        customDiscountType,
        customDiscountValue,
        showCustomDiscount,
        priceOverride,
        miscItems: miscItems,
        featureQuantities: otherOptionsQuantities,
        isVerified,
        isManualDueDate,
        isManualOrderDate,
        hasAltShipTo,
        altShipToCustomerId: hasAltShipTo && altShipToMode === 'existing' ? altShipToCustomerId : null,
        altShipToName: hasAltShipTo && altShipToMode === 'manual' ? altShipToName : null,
        altShipToCompany: hasAltShipTo && altShipToMode === 'manual' ? altShipToCompany : null,
        altShipToEmail: hasAltShipTo && altShipToMode === 'manual' ? altShipToEmail : null,
        altShipToPhone: hasAltShipTo && altShipToMode === 'manual' ? altShipToPhone : null,
        altShipToAddress: hasAltShipTo && altShipToMode === 'manual' ? altShipToAddress : null,
        specialShippingInternational: specialShipping.international,
        specialShippingNextDayAir: specialShipping.nextDayAir,
        specialShippingBillToReceiver: specialShipping.billToReceiver,
        qdSameSideConfirmed,
        qdSameSideConfirmedBy,
        qdSameSideConfirmedAt: qdSameSideConfirmedAt?.toISOString() || null,
        createdBy:
          typeof window !== 'undefined'
            ? window.localStorage.getItem('dev_username') || 'system'
            : 'system',
      };

      const response = await apiRequest('/api/orders/pending-payment', {
        method: 'POST',
        body: orderData as any,
      });

      if (response.orderId) {
        // Mark as saved (now in edit mode)
        setIsEditMode(true);
        setEditingOrderId(response.orderId);
        return { success: true, orderId: response.orderId };
      }

      return { success: false };
    } catch (error) {
      console.error('Failed to save order for payment:', error);
      return { success: false };
    }
  };

  const selectedModel = modelOptions.find((m) => m.id === modelId);
  const isConsoleMode = consoleStyleMode !== 'standard';
  const consoleWorkflowItems = [
    {
      label: 'Customer',
      value: customer ? 'Locked' : 'Open',
      active: Boolean(customer),
    },
    {
      label: 'Model',
      value: selectedModel ? 'Selected' : 'Open',
      active: Boolean(selectedModel),
    },
    {
      label: 'Validation',
      value: Object.keys(errors).length ? 'Review' : 'Ready',
      active: Object.keys(errors).length === 0,
      warning: Object.keys(errors).length > 0,
    },
    {
      label: 'Payment',
      value: orderPayments.length ? `${orderPayments.length} logged` : 'Pending',
      active: orderPayments.length > 0,
    },
  ];
  const isWorkbenchMode = consoleStyleMode === 'industrial';
  const selectedFeatureCount = Object.entries(features).filter(([, value]) => {
    if (value === undefined || value === null || value === '') return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'boolean') return value;
    return true;
  }).length;
  const openIssueCount = Object.keys(errors).length;
  const workbenchAlerts = [
    !customer ? 'Customer is still open' : null,
    !selectedModel ? 'Stock model has not been selected' : null,
    showDiscountWarning ? 'Discount text is in notes without a structured discount' : null,
    openIssueCount ? `${openIssueCount} validation item${openIssueCount === 1 ? '' : 's'} need review` : null,
    !isVerified ? 'ERP verification is not checked' : null,
  ].filter(Boolean) as string[];
  const workbenchJumpItems = [
    {
      id: 'order-intake',
      label: 'Order',
      meta: orderId || 'New order',
      icon: ClipboardList,
      active: Boolean(orderId),
    },
    {
      id: 'customer-intake',
      label: 'Customer',
      meta: customer ? customer.name || 'Selected' : 'Open',
      icon: UserRound,
      active: Boolean(customer),
    },
    {
      id: 'product-intake',
      label: 'Product',
      meta: selectedModel?.displayName || selectedModel?.name || 'Choose model',
      icon: Wrench,
      active: Boolean(selectedModel),
    },
    {
      id: 'finish-intake',
      label: 'Finish',
      meta: features.paint_options || features.texture_options ? 'Touched' : 'Open',
      icon: Palette,
      active: Boolean(features.paint_options || features.texture_options),
    },
    {
      id: 'shipping-intake',
      label: 'Shipping',
      meta:
        specialShipping.international ||
        specialShipping.nextDayAir ||
        specialShipping.billToReceiver ||
        hasAltShipTo
          ? 'Special'
          : 'Standard',
      icon: Truck,
      active: Boolean(
        specialShipping.international ||
          specialShipping.nextDayAir ||
          specialShipping.billToReceiver ||
          hasAltShipTo
      ),
    },
    {
      id: 'pricing-intake',
      label: 'Pricing',
      meta: formatCurrency(totalPrice + shipping),
      icon: DollarSign,
      active: totalPrice + shipping > 0,
    },
    {
      id: 'notes-intake',
      label: 'Notes',
      meta: notes.trim() ? 'Captured' : 'Open',
      icon: FileText,
      active: Boolean(notes.trim()),
    },
    {
      id: 'review-intake',
      label: 'Review',
      meta: isVerified ? 'Verified' : 'Not verified',
      icon: ShieldCheck,
      active: isVerified,
    },
  ];
  const jumpToWorkbenchSection = (sectionId: string) => {
    const target = document.getElementById(sectionId);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div
      className={`order-entry-shell container mx-auto p-4 space-y-6 ${
        isConsoleMode ? `order-entry-console order-entry-console-${consoleStyleMode}` : ''
      }`}
    >
      <div className="order-console-toggle flex items-center justify-end gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal className="h-4 w-4" />
          <span>Visual Mode</span>
        </div>
        <div
          className="order-console-mode-control"
          role="group"
          aria-label="Order entry visual mode"
        >
          {consoleStyleOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={consoleStyleMode === option.value ? 'is-selected' : ''}
              onClick={() => setConsoleStyleMode(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {isWorkbenchMode && (
        <div className="order-workbench-panel" aria-label="Order entry workbench">
          <div className="order-workbench-hero">
            <div>
              <div className="order-workbench-kicker">Prototype intake lens</div>
              <h2>Capture the order in whatever sequence the call gives it to you.</h2>
              <p>
                Jump to any bucket, keep the price close, and let the mistake radar
                call out anything that needs a second look.
              </p>
            </div>
            <div className="order-workbench-price">
              <span>Current total</span>
              <strong>{formatCurrency(totalPrice + shipping)}</strong>
              <button
                type="button"
                onClick={() => jumpToWorkbenchSection('pricing-intake')}
              >
                Open pricing
              </button>
            </div>
          </div>

          <div className="order-workbench-map">
            {workbenchJumpItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={item.active ? 'is-active' : ''}
                  onClick={() => jumpToWorkbenchSection(item.id)}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  <small>{item.meta}</small>
                </button>
              );
            })}
          </div>

          <div className="order-workbench-radar">
            <div>
              <span>{selectedFeatureCount}</span>
              <small>configured inputs</small>
            </div>
            <div>
              <span>{miscItems.length}</span>
              <small>misc items</small>
            </div>
            <div>
              <span>{orderPayments.length}</span>
              <small>payments</small>
            </div>
            <div className={workbenchAlerts.length ? 'has-alerts' : 'is-clear'}>
              <span>{workbenchAlerts.length}</span>
              <small>{workbenchAlerts.length ? 'radar flags' : 'clear flags'}</small>
            </div>
            {workbenchAlerts.length > 0 && (
              <div className="order-workbench-alerts">
                <AlertTriangle className="h-4 w-4" />
                <div>
                  {workbenchAlerts.slice(0, 3).map((alert) => (
                    <p key={alert}>{alert}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Order Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card className={isConsoleMode ? 'order-console-workbench' : undefined}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Order Entry
                    {isEditMode && orderId && (
                      <span className="text-sm font-normal text-muted-foreground">
                        - {orderId}
                      </span>
                    )}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {isEditMode ? 'Edit existing order' : 'Create new stock order'}
                  </p>
                </div>
                {isEditMode && orderId && (
                  <div className="flex items-center gap-2">
                    {orderStatus && (
                      <Badge
                        variant="outline"
                        className={`text-xs px-2 py-0.5 ${
                          orderStatus === 'HOLDING' || orderStatus === 'DRAFT'
                            ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                            : orderStatus === 'PENDING_SIGNATURE'
                            ? 'bg-orange-100 text-orange-800 border-orange-300'
                            : orderStatus === 'FINALIZED'
                            ? 'bg-blue-100 text-blue-800 border-blue-300'
                            : orderStatus === 'IN_PROGRESS'
                            ? 'bg-purple-100 text-purple-800 border-purple-300'
                            : orderStatus === 'FULFILLED' || orderStatus === 'SHIPPED'
                            ? 'bg-green-100 text-green-800 border-green-300'
                            : orderStatus === 'CANCELLED'
                            ? 'bg-red-100 text-red-800 border-red-300'
                            : 'bg-gray-100 text-gray-800 border-gray-300'
                        } ${(orderStatus === 'FULFILLED' || orderStatus === 'SHIPPED') ? 'cursor-pointer hover:ring-2 hover:ring-green-400 hover:ring-offset-1 transition-all' : ''}`}
                        onClick={(orderStatus === 'FULFILLED' || orderStatus === 'SHIPPED') ? () => setLocation(`/shipping-tracker?search=${orderId}`) : undefined}
                        title={(orderStatus === 'FULFILLED' || orderStatus === 'SHIPPED') ? 'Click to view in Shipping Tracker' : undefined}
                      >
                        {orderStatus.replace(/_/g, ' ')}
                        {(orderStatus === 'FULFILLED' || orderStatus === 'SHIPPED') && (
                          <ExternalLink className="h-3 w-3 ml-1 inline" />
                        )}
                      </Badge>
                    )}
                    {currentDepartment && (
                      <Badge
                        variant="outline"
                        className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 border-slate-300"
                      >
                        {currentDepartment.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    <OrderActionsDrawer
                      orderId={orderId}
                      orderStatus={orderStatus}
                      currentDepartment={currentDepartment}
                      isCancelled={isCancelled}
                      urgency={urgency}
                      onOrderUpdated={() => {
                        if (orderId) {
                          loadExistingOrder(orderId);
                        }
                      }}
                    />
                  </div>
                )}
              </div>
              {isConsoleMode && (
                <div className="order-console-module">
                  <div className="order-console-display grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <span>ORDER</span>
                      <strong>{orderId || 'GENERATING'}</strong>
                    </div>
                    <div>
                      <span>MODE</span>
                      <strong>
                        {isEditMode ? 'EDIT' : isDuplicateMode ? 'COPY' : 'CREATE'}
                      </strong>
                    </div>
                    <div>
                      <span>DUE</span>
                      <strong>
                        {dueDate && !isNaN(dueDate.getTime())
                          ? dueDate.toISOString().split('T')[0]
                          : 'PENDING'}
                      </strong>
                    </div>
                    <div>
                      <span>TOTAL</span>
                      <strong>${(totalPrice + shipping).toFixed(2)}</strong>
                    </div>
                  </div>
                  <div className="order-console-workflow">
                    {consoleWorkflowItems.map((item) => (
                      <div
                        key={item.label}
                        className={`order-console-workflow-item ${
                          item.active ? 'is-active' : ''
                        } ${item.warning ? 'is-warning' : ''}`}
                      >
                        <span aria-hidden="true" />
                        <div>
                          <strong>{item.label}</strong>
                          <small>{item.value}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {showOrderDraftBanner && isNewOrderMode && (
                <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-md p-3 text-sm">
                  <span className="text-blue-800 dark:text-blue-200">You have a previous unsaved order draft. Would you like to restore it?</span>
                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => {
                        handleRestoreOrderDraft();
                        toast({ title: 'Draft restored' });
                      }}
                    >
                      Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => {
                        clearOrderDraft();
                        setShowOrderDraftBanner(false);
                      }}
                    >
                      Discard
                    </Button>
                  </div>
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Order ID and Dates */}
                <div id="order-intake" className="grid grid-cols-1 md:grid-cols-3 gap-4 scroll-mt-28">
                  <div>
                    <Label htmlFor="orderId">Order ID</Label>
                    <Input
                      id="orderId"
                      name="orderId"
                      value={orderId}
                      readOnly
                      className="bg-gray-50 cursor-not-allowed"
                      placeholder="Generating..."
                    />
                    {errors.orderId && (
                      <p className="text-sm text-red-500">{errors.orderId}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="orderDate">Order Date</Label>
                    <Input
                      id="orderDate"
                      name="orderDate"
                      type="date"
                      value={
                        orderDate && !isNaN(orderDate.getTime())
                          ? orderDate.toISOString().split('T')[0]
                          : ''
                      }
                      onChange={(e) => {
                        const dateValue = e.target.value;
                        if (dateValue) {
                          const newDate = new Date(dateValue);
                          if (!isNaN(newDate.getTime())) {
                            setOrderDate(newDate);
                            setIsManualOrderDate(true); // Mark as manually set
                            // Don't auto-update due date if user has manually set it
                            if (!isManualDueDate) {
                              // Update due date based on new order date and current model
                              const selectedModel = modelOptions.find(
                                (m) => m.id === modelId
                              );
                              const modelName =
                                selectedModel?.displayName ||
                                selectedModel?.name ||
                                '';
                              const isAdjModel = modelName
                                .toLowerCase()
                                .includes('adj');
                              const daysFromOrder = isAdjModel ? 112 : 98;
                              const newDueDate = new Date(
                                newDate.getTime() +
                                  daysFromOrder * 24 * 60 * 60 * 1000
                              );
                              setDueDate(newDueDate);
                              setBaseDueDate(newDueDate);
                            }
                          }
                        } else {
                          setOrderDate(new Date());
                          setIsManualOrderDate(false); // Reset manual flag when cleared
                        }
                      }}
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="dueDate"
                      className="flex items-center gap-2"
                    >
                      Estimated Completion Date
                      {isManualDueDate && (
                        <Badge variant="secondary" className="text-xs">
                          Custom
                        </Badge>
                      )}
                      {isForecastLoading && (
                        <span className="text-xs text-muted-foreground animate-pulse">
                          Forecasting...
                        </span>
                      )}
                    </Label>
                    <div className="flex gap-2">
                      {!isEditMode ? (
                        <div
                          className="flex-1 flex items-center h-10 px-3 border rounded-md bg-background cursor-pointer hover:border-blue-400 transition-colors"
                          onClick={() => {
                            if (!fullForecastData && !isForecastLoading) {
                              triggerForecastFetch();
                            }
                            setForecastModalOpen(true);
                          }}
                        >
                          <span className={dueDate && !isNaN(dueDate.getTime()) ? 'text-foreground' : 'text-muted-foreground'}>
                            {dueDate && !isNaN(dueDate.getTime())
                              ? dueDate.toISOString().split('T')[0]
                              : 'Select date...'}
                          </span>
                        </div>
                      ) : (
                        <Input
                          id="dueDate"
                          name="dueDate"
                          type="date"
                          className="flex-1"
                          value={
                            dueDate && !isNaN(dueDate.getTime())
                              ? dueDate.toISOString().split('T')[0]
                              : ''
                          }
                          onChange={(e) => {
                            const dateValue = e.target.value;
                            if (dateValue) {
                              const newDate = new Date(dateValue);
                              if (!isNaN(newDate.getTime())) {
                                setDueDate(newDate);
                                setIsManualDueDate(true);
                              }
                            } else {
                              setDueDate(
                                new Date(Date.now() + 98 * 24 * 60 * 60 * 1000)
                              );
                              setIsManualDueDate(false);
                            }
                          }}
                        />
                      )}
                      {!isEditMode && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0 text-xs"
                          onClick={() => {
                            if (!fullForecastData && !isForecastLoading) {
                              triggerForecastFetch();
                            }
                            setForecastModalOpen(true);
                          }}
                        >
                          Forecast Options
                        </Button>
                      )}
                    </div>
                    {isManualDueDate && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Due date manually set - will not auto-adjust for stock
                        model or rush fees
                      </p>
                    )}
                    {!isManualDueDate && forecastCycleDays && !isForecastLoading && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Forecast: ~{Math.round(forecastCycleDays / 5)} weeks based on current production data
                      </p>
                    )}
                  </div>
                </div>

                {/* Customer Selection and Customer PO */}
                <div id="customer-intake" className="grid grid-cols-2 gap-6 scroll-mt-28">
                  <div>
                    <CustomerSearchInput
                      value={customer}
                      onValueChange={setCustomer}
                      placeholder="Search customer..."
                      error={errors.customer}
                    />
                  </div>

                  <div>
                    <Label htmlFor="customer-po">Customer PO</Label>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="customer-po-checkbox"
                        checked={hasCustomerPO}
                        onCheckedChange={(checked) => {
                          setHasCustomerPO(!!checked);
                          if (!checked) {
                            setCustomerPO('');
                          }
                        }}
                      />
                      <Label
                        htmlFor="customer-po-checkbox"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Enable Customer PO
                      </Label>
                    </div>

                    {hasCustomerPO && (
                      <div className="mt-2">
                        <Input
                          placeholder="Enter Customer PO"
                          value={customerPO}
                          onChange={(e) => setCustomerPO(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* FB Order and AGR Order */}
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <Label>FB Order #</Label>
                    <Input
                      name="fbOrderNumber"
                      value={fbOrderNumber}
                      onChange={(e) => setFbOrderNumber(e.target.value)}
                      placeholder="Enter FB Order #"
                    />
                  </div>

                  <div>
                    <Label htmlFor="agr-order">AGR Order</Label>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="agr-order-checkbox"
                          checked={hasAGROrder}
                          onCheckedChange={(checked) => {
                            setHasAGROrder(!!checked);
                            if (!checked) {
                              setAgrOrderDetails('');
                            }
                          }}
                        />
                        <Label
                          htmlFor="agr-order-checkbox"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Enable AGR Order
                        </Label>
                      </div>
                    </div>

                    {hasAGROrder && (
                      <div className="mt-2">
                        <Input
                          placeholder="Enter Order Details (e.g., AGR-11865 (00586B))"
                          value={agrOrderDetails}
                          onChange={(e) => setAgrOrderDetails(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Shipping Options & Address - Combined Accordion */}
                <div id="shipping-intake" className="mt-6 border rounded-lg p-4 bg-blue-50 scroll-mt-28">
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="shipping-options">
                      <AccordionTrigger className="text-left">
                        <span className="font-medium">
                          Shipping Options & Address
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-6">
                          {/* Special Shipping Instructions */}
                          <div>
                            <Label className="text-base font-medium mb-3 block">
                              Special Shipping Instructions
                            </Label>
                            <div className="space-y-3">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="international"
                                  checked={specialShipping.international}
                                  onCheckedChange={(checked) =>
                                    setSpecialShipping((prev) => ({
                                      ...prev,
                                      international: !!checked,
                                    }))
                                  }
                                />
                                <Label
                                  htmlFor="international"
                                  className="text-sm font-medium"
                                >
                                  International
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="next-day-air"
                                  checked={specialShipping.nextDayAir}
                                  onCheckedChange={(checked) =>
                                    setSpecialShipping((prev) => ({
                                      ...prev,
                                      nextDayAir: !!checked,
                                    }))
                                  }
                                />
                                <Label
                                  htmlFor="next-day-air"
                                  className="text-sm font-medium"
                                >
                                  Next Day Air
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="bill-to-receiver"
                                  checked={specialShipping.billToReceiver}
                                  onCheckedChange={(checked) =>
                                    setSpecialShipping((prev) => ({
                                      ...prev,
                                      billToReceiver: !!checked,
                                    }))
                                  }
                                />
                                <Label
                                  htmlFor="bill-to-receiver"
                                  className="text-sm font-medium"
                                >
                                  Bill to Receiver
                                </Label>
                              </div>
                            </div>
                          </div>

                          {/* Ship to Different Address */}
                          <div className="border-t pt-6">
                            <div className="flex items-center space-x-2 mb-4">
                              <Checkbox
                                id="alt-ship-to-checkbox"
                                checked={hasAltShipTo}
                                onCheckedChange={(checked) => {
                                  setHasAltShipTo(!!checked);
                                  if (!checked) {
                                    // Clear all alt ship to data when disabled
                                    setAltShipToCustomer(null);
                                    setAltShipToCustomerId('');
                                    setAltShipToName('');
                                    setAltShipToCompany('');
                                    setAltShipToEmail('');
                                    setAltShipToPhone('');
                                    setAltShipToAddress({
                                      street: '',
                                      city: '',
                                      state: '',
                                      zipCode: '',
                                      country: 'United States',
                                    });
                                  }
                                }}
                              />
                              <Label
                                htmlFor="alt-ship-to-checkbox"
                                className="text-base font-medium"
                              >
                                Ship to Different Address
                              </Label>
                            </div>

                            {hasAltShipTo && (
                              <div className="space-y-4">
                                {/* Mode Selection */}
                                <div>
                                  <Label className="text-sm font-medium">
                                    Address Type
                                  </Label>
                                  <div className="flex gap-4 mt-2">
                                    <div className="flex items-center space-x-2">
                                      <input
                                        type="radio"
                                        id="existing-customer"
                                        name="alt-ship-mode"
                                        value="existing"
                                        checked={altShipToMode === 'existing'}
                                        onChange={(e) =>
                                          setAltShipToMode(
                                            e.target.value as
                                              | 'existing'
                                              | 'manual'
                                          )
                                        }
                                      />
                                      <Label
                                        htmlFor="existing-customer"
                                        className="text-sm"
                                      >
                                        Existing Customer
                                      </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <input
                                        type="radio"
                                        id="manual-address"
                                        name="alt-ship-mode"
                                        value="manual"
                                        checked={altShipToMode === 'manual'}
                                        onChange={(e) =>
                                          setAltShipToMode(
                                            e.target.value as
                                              | 'existing'
                                              | 'manual'
                                          )
                                        }
                                      />
                                      <Label
                                        htmlFor="manual-address"
                                        className="text-sm"
                                      >
                                        Manual Entry
                                      </Label>
                                    </div>
                                  </div>
                                </div>

                                {altShipToMode === 'existing' ? (
                                  <div>
                                    <CustomerSearchInput
                                      value={altShipToCustomer}
                                      onValueChange={(selectedCustomer) => {
                                        setAltShipToCustomer(selectedCustomer);
                                        if (selectedCustomer) {
                                          setAltShipToCustomerId(
                                            selectedCustomer.id.toString()
                                          );
                                          // Clear manual fields when selecting existing customer
                                          setAltShipToName('');
                                          setAltShipToCompany('');
                                          setAltShipToEmail('');
                                          setAltShipToPhone('');
                                          setAltShipToAddress({
                                            street: '',
                                            city: '',
                                            state: '',
                                            zipCode: '',
                                            country: 'United States',
                                          });
                                        } else {
                                          setAltShipToCustomerId('');
                                        }
                                      }}
                                      placeholder="Search for existing customer..."
                                    />
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <Label>Name *</Label>
                                      <Input
                                        value={altShipToName}
                                        onChange={(e) =>
                                          setAltShipToName(e.target.value)
                                        }
                                        placeholder="Enter recipient name"
                                      />
                                    </div>
                                    <div>
                                      <Label>Company</Label>
                                      <Input
                                        value={altShipToCompany}
                                        onChange={(e) =>
                                          setAltShipToCompany(e.target.value)
                                        }
                                        placeholder="Enter company name"
                                      />
                                    </div>
                                    <div>
                                      <Label>Email</Label>
                                      <Input
                                        type="email"
                                        value={altShipToEmail}
                                        onChange={(e) =>
                                          setAltShipToEmail(e.target.value)
                                        }
                                        placeholder="Enter email address"
                                      />
                                    </div>
                                    <div>
                                      <Label>Phone</Label>
                                      <Input
                                        value={altShipToPhone}
                                        onChange={(e) =>
                                          setAltShipToPhone(e.target.value)
                                        }
                                        placeholder="Enter phone number"
                                      />
                                    </div>
                                    <div className="col-span-2">
                                      <Label>Street Address *</Label>
                                      <Input
                                        value={altShipToAddress.street}
                                        onChange={(e) =>
                                          setAltShipToAddress((prev) => ({
                                            ...prev,
                                            street: e.target.value,
                                          }))
                                        }
                                        placeholder="Enter street address"
                                      />
                                    </div>
                                    <div>
                                      <Label>City *</Label>
                                      <Input
                                        value={altShipToAddress.city}
                                        onChange={(e) =>
                                          setAltShipToAddress((prev) => ({
                                            ...prev,
                                            city: e.target.value,
                                          }))
                                        }
                                        placeholder="Enter city"
                                      />
                                    </div>
                                    <div>
                                      <Label>State *</Label>
                                      <Input
                                        value={altShipToAddress.state}
                                        onChange={(e) =>
                                          setAltShipToAddress((prev) => ({
                                            ...prev,
                                            state: e.target.value,
                                          }))
                                        }
                                        placeholder="Enter state"
                                      />
                                    </div>
                                    <div>
                                      <Label>ZIP Code *</Label>
                                      <Input
                                        value={altShipToAddress.zipCode}
                                        onChange={(e) =>
                                          setAltShipToAddress((prev) => ({
                                            ...prev,
                                            zipCode: e.target.value,
                                          }))
                                        }
                                        placeholder="Enter ZIP code"
                                      />
                                    </div>
                                    <div>
                                      <Label>Country</Label>
                                      <Input
                                        value={altShipToAddress.country}
                                        onChange={(e) =>
                                          setAltShipToAddress((prev) => ({
                                            ...prev,
                                            country: e.target.value,
                                          }))
                                        }
                                        placeholder="United States"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>

                {/* Flattop Option */}
                <div className="flex items-center space-x-2 p-3 border rounded-lg bg-yellow-50">
                  <Checkbox
                    id="flattop-checkbox"
                    checked={isFlattop}
                    onCheckedChange={(checked) => {
                      setIsFlattop(!!checked);
                      if (checked) {
                        // Clear features that are not available for flattop
                        setFeatures((prev) => ({
                          ...prev,
                          action_length: undefined,
                          action_inlet: undefined,
                          bottom_metal: undefined,
                          barrel_inlet: undefined,
                        }));
                      } else {
                        // Clear flattop price override when unchecking
                        setFlattopPriceOverride(null);
                        setShowFlattopPriceOverride(false);
                      }
                    }}
                  />
                  <Label
                    htmlFor="flattop-checkbox"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Flattop
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    (Stock not machined for Action Length, Action Inlet, Bottom
                    Metal, or Barrel Inlet)
                  </span>
                </div>

                {/* Flattop Price Override */}
                {isFlattop && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 pl-[16px] pr-[16px] pt-[0px] pb-[0px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-600">💰</span>
                        <span className="font-medium text-gray-900">
                          Flattop Price Override
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setShowFlattopPriceOverride(!showFlattopPriceOverride)
                        }
                        className="flex items-center gap-2"
                        data-testid="button-flattop-price-override"
                      >
                        <span>✏️</span>
                        Override Price
                      </Button>
                    </div>

                    {showFlattopPriceOverride && (
                      <div className="mt-3 space-y-3">
                        <div>
                          <Label htmlFor="flattop-price-override">
                            Custom Price
                          </Label>
                          <Input
                            id="flattop-price-override"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Enter custom price"
                            value={flattopPriceOverride || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setFlattopPriceOverride(
                                value ? parseFloat(value) : null
                              );
                            }}
                            data-testid="input-flattop-price-override"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setFlattopPriceOverride(null);
                              setShowFlattopPriceOverride(false);
                            }}
                            data-testid="button-cancel-flattop-override"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setShowFlattopPriceOverride(false)}
                            data-testid="button-apply-flattop-override"
                          >
                            Apply Override
                          </Button>
                        </div>
                      </div>
                    )}

                    {flattopPriceOverride !== null && !showFlattopPriceOverride && (
                      <div className="mt-2 text-sm text-green-700">
                        Price overridden to:{' '}
                        <span className="font-semibold">
                          ${flattopPriceOverride.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Stock Model Selection and Price Override Row */}
                <div id="product-intake" className="grid grid-cols-1 lg:grid-cols-2 gap-4 scroll-mt-28">
                  {/* Stock Model Selection */}
                  <div>
                    <Label>Stock Model</Label>
                    <Select
                      key={`stock-model-${renderKey}-${modelId || 'empty'}`}
                      value={modelId || undefined}
                      onValueChange={setModelId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select or search model..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          console.log('🔧 Stock Model Dropdown Debug:');
                          console.log('  - Current modelId:', modelId);
                          console.log(
                            '  - ModelOptions length:',
                            modelOptions.length
                          );
                          console.log('  - RenderKey:', renderKey);
                          if (modelOptions.length > 0) {
                            console.log(
                              '  - Available models:',
                              modelOptions
                                .map(
                                  (m) => `${m.id}:${m.displayName || m.name}`
                                )
                                .slice(0, 5)
                            );
                            const selectedModel = modelOptions.find(
                              (m) => m.id === modelId
                            );
                            console.log(
                              '  - Selected model found:',
                              !!selectedModel,
                              selectedModel?.displayName || selectedModel?.name
                            );
                          } else {
                            console.log('  - No models available in dropdown');
                          }

                          if (modelOptions.length === 0) {
                            return (
                              <SelectItem value="no-models" disabled>
                                No stock models available
                              </SelectItem>
                            );
                          }

                          return modelOptions.map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.displayName || model.name}
                            </SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                    {errors.modelId && (
                      <p className="text-sm text-red-500">{errors.modelId}</p>
                    )}
                    {modelOptions.length === 0 && (
                      <p className="text-sm text-yellow-600">
                        Loading stock models...
                      </p>
                    )}
                  </div>

                  {/* Alamo Price Override */}
                  {modelId && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 pl-[16px] pr-[16px] pt-[0px] pb-[0px]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-yellow-600">💰</span>
                          <span className="font-medium text-gray-900">
                            Alamo Price Override
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setShowPriceOverride(!showPriceOverride)
                          }
                          className="flex items-center gap-2"
                        >
                          <span>✏️</span>
                          Override Price
                        </Button>
                      </div>

                      {showPriceOverride && (
                        <div className="mt-3 space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-sm text-gray-600">
                                Original Price
                              </Label>
                              <div className="text-lg font-semibold text-gray-900">
                                $
                                {(() => {
                                  const selectedModel = modelOptions.find(
                                    (model) => model.id === modelId
                                  );
                                  return selectedModel
                                    ? selectedModel.price.toFixed(2)
                                    : '0.00';
                                })()}
                              </div>
                            </div>
                            <div>
                              <Label htmlFor="price-override">
                                Override Price
                              </Label>
                              <Input
                                id="price-override"
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="Enter override price"
                                value={priceOverride || ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setPriceOverride(
                                    value ? parseFloat(value) : null
                                  );
                                }}
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setPriceOverride(null);
                                setShowPriceOverride(false);
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => setShowPriceOverride(false)}
                            >
                              Apply Override
                            </Button>
                          </div>
                        </div>
                      )}

                      {priceOverride !== null && !showPriceOverride && (
                        <div className="mt-2 text-sm text-green-700">
                          Price overridden to:{' '}
                          <span className="font-semibold">
                            ${priceOverride.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Product Features - Two Column Layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column */}
                  <div className="space-y-4">
                    {/* Handedness */}
                    <div>
                      <Label>Handedness</Label>
                      {(() => {
                        // Business rule: Impact Action Inlet + Long Action Length cannot have Left handedness
                        const hasImpactInlet =
                          features.action_inlet &&
                          features.action_inlet
                            .toLowerCase()
                            .includes('impact');
                        const isLongAction = features.action_length === 'long';
                        const impactRestriction =
                          hasImpactInlet && isLongAction;

                        // Business rule: M1A stock models cannot have Left handedness
                        const selectedModelForHandedness = modelOptions.find(
                          (m) => m.id === modelId
                        );
                        const modelNameForHandedness =
                          selectedModelForHandedness?.displayName ||
                          selectedModelForHandedness?.name ||
                          '';
                        const isM1AModel = modelNameForHandedness
                          .toLowerCase()
                          .includes('m1a');

                        const shouldRestrictLeft =
                          impactRestriction || isM1AModel;

                        const restrictionReason = isM1AModel
                          ? 'Left not available for M1A models'
                          : 'Left not available for Impact Inlet + Long Action';

                        return (
                          <Select
                            key={`handedness-${renderKey}-${features.handedness || 'empty'}`}
                            value={features.handedness || undefined}
                            onValueChange={(value) =>
                              setFeatures((prev) => ({
                                ...prev,
                                handedness: value === '__NONE__' ? undefined : value,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select handedness..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__NONE__">None</SelectItem>
                              <SelectItem value="right">Right</SelectItem>
                              {!shouldRestrictLeft && (
                                <SelectItem value="left">Left</SelectItem>
                              )}
                              {shouldRestrictLeft && (
                                <div className="px-2 py-1.5 text-sm text-gray-500 italic">
                                  {restrictionReason}
                                </div>
                              )}
                            </SelectContent>
                          </Select>
                        );
                      })()}
                    </div>

                    {/* Action Inlet */}
                    <div>
                      <Label className="flex items-center gap-2">
                        Action Inlet
                        {(() => {
                          const selectedModel = modelOptions.find(
                            (m) => m.id === modelId
                          );
                          const modelName =
                            selectedModel?.displayName ||
                            selectedModel?.name ||
                            '';
                          const isTikkaModel = modelName
                            .toLowerCase()
                            .includes('tikka');
                          const hasTikkaOptions = smartSortedActionInlet.some(
                            (opt) =>
                              opt.value.toLowerCase().includes('tikka') ||
                              opt.label.toLowerCase().includes('tikka')
                          );
                          const hasNonTikkaOptions = smartSortedActionInlet.some(
                            (opt) =>
                              !opt.value.toLowerCase().includes('tikka') &&
                              !opt.label.toLowerCase().includes('tikka') &&
                              opt.value.trim() !== ''
                          );

                          if (isTikkaModel && hasNonTikkaOptions) {
                            return (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                                Tikka only
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </Label>
                      <Select
                        key={`action-inlet-${renderKey}-${features.action_inlet || 'empty'}`}
                        value={features.action_inlet || undefined}
                        onValueChange={async (value) => {
                          const normalizedValue = value === '__NONE__' ? undefined : value;
                          // Track the selection for AI-powered smart sorting
                          if (normalizedValue) {
                            const selectedOption = smartSortedActionInlet.find(
                              (opt) => opt.value === normalizedValue
                            );
                            if (selectedOption) {
                              await trackActionInletSelection(
                                selectedOption.value,
                                selectedOption.label
                              );
                              // Invalidate the query to refresh the sorted list
                              queryClient.invalidateQueries({
                                queryKey: [
                                  '/api/feature-selections/sorted',
                                  'action_inlet',
                                ],
                              });
                            }
                          }
                          setFeatures((prev) => ({
                            ...prev,
                            action_inlet: normalizedValue,
                          }));
                        }}
                        disabled={isFlattop}
                      >
                        <SelectTrigger
                          className={
                            isFlattop ? 'opacity-50 cursor-not-allowed' : ''
                          }
                        >
                          <SelectValue
                            placeholder={
                              isFlattop
                                ? 'Not Available (Flattop)'
                                : 'Select...'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__NONE__">None</SelectItem>
                          {(() => {
                            // Check if selected model is a Tikka model
                            const selectedModel = modelOptions.find(
                              (m) => m.id === modelId
                            );
                            const modelName =
                              selectedModel?.displayName ||
                              selectedModel?.name ||
                              '';
                            const isTikkaModel = modelName
                              .toLowerCase()
                              .includes('tikka');

                            return smartSortedActionInlet
                              .filter((option) => {
                                // Filter out empty options
                                if (!option.value || option.value.trim() === '')
                                  return false;

                                const isTikkaOption =
                                  option.value.toLowerCase().includes('tikka') ||
                                  option.label.toLowerCase().includes('tikka');

                                // Business rule: Tikka model shows ONLY Tikka options
                                if (isTikkaModel && !isTikkaOption) {
                                  return false;
                                }

                                // Business rule: Non-Tikka model hides Tikka options
                                if (!isTikkaModel && isTikkaOption) {
                                  return false;
                                }

                                // Business rule: Filter out Impact options when Action Length is "Long" and Handedness is "Left"
                                const isLongAction =
                                  features.action_length === 'long';
                                const isLeftHanded =
                                  features.handedness === 'left';
                                const isImpactOption =
                                  option.value.toLowerCase().includes('impact') ||
                                  option.label.toLowerCase().includes('impact');

                                if (
                                  isLongAction &&
                                  isLeftHanded &&
                                  isImpactOption
                                ) {
                                  return false;
                                }

                                return true;
                              })
                              .map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ));
                          })()}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Barrel Inlet */}
                    <div>
                      <Label className="flex items-center gap-2">
                        Barrel Inlet
                        {(() => {
                          const selectedModel = modelOptions.find(
                            (m) => m.id === modelId
                          );
                          const isTikkaModel =
                            selectedModel?.id?.toLowerCase().includes('tikka') || false;
                          if (isTikkaModel) {
                            return (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                                Tikka only
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </Label>
                      <Select
                        key={`barrel-inlet-${renderKey}-${features.barrel_inlet || 'empty'}`}
                        value={features.barrel_inlet || undefined}
                        onValueChange={(value) => {
                          const normalizedValue = value === '__NONE__' ? undefined : value;
                          // Auto-enable shank checkbox for Bartlein #3B
                          if (normalizedValue === 'bartlein_#3b') {
                            setFeatures((prev) => ({
                              ...prev,
                              barrel_inlet: normalizedValue,
                              add_shank: true,
                            }));
                          } else {
                            setFeatures((prev) => ({
                              ...prev,
                              barrel_inlet: normalizedValue,
                            }));
                          }
                        }}
                        disabled={isFlattop}
                      >
                        <SelectTrigger
                          className={
                            isFlattop ? 'opacity-50 cursor-not-allowed' : ''
                          }
                        >
                          <SelectValue
                            placeholder={
                              isFlattop
                                ? 'Not Available (Flattop)'
                                : 'Select...'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__NONE__">None</SelectItem>
                          {(() => {
                            const selectedModel = modelOptions.find(
                              (m) => m.id === modelId
                            );
                            const isTikkaModel =
                              selectedModel?.id?.toLowerCase().includes('tikka') || false;
                            const barrelOptions =
                              featureDefs.find(
                                (f) =>
                                  f.name === 'barrel_inlet' ||
                                  f.id === 'barrel_inlet'
                              )?.options ?? [];
                            const filteredBarrelOptions = barrelOptions.filter(
                              (opt) => {
                                if (!opt.value || opt.value.trim() === '')
                                  return false;
                                const isTikkaValue = (
                                  TIKKA_BARREL_OPTIONS as readonly string[]
                                ).includes(opt.value);
                                if (features.barrel_inlet === opt.value)
                                  return true;
                                if (isTikkaModel) return isTikkaValue;
                                return !isTikkaValue;
                              }
                            );
                            return filteredBarrelOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ));
                          })()}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Shank - Checkbox with manual entry */}
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="shank-checkbox"
                          data-testid="checkbox-shank"
                          checked={!!features.add_shank}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setFeatures((prev) => ({
                              ...prev,
                              add_shank: checked,
                              shank_value: checked
                                ? prev.shank_value
                                : undefined,
                            }));
                          }}
                          disabled={isFlattop}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <Label
                          htmlFor="shank-checkbox"
                          className={
                            isFlattop ? 'opacity-50 cursor-not-allowed' : ''
                          }
                        >
                          Add Shank
                          {features.barrel_inlet === 'bartlein_#3b' && (
                            <span className="text-red-500 ml-1">*</span>
                          )}
                        </Label>
                      </div>
                      {features.add_shank && (
                        <input
                          type="text"
                          data-testid="input-shank-value"
                          placeholder="Enter unique shank..."
                          value={features.shank_value || ''}
                          onChange={(e) =>
                            setFeatures((prev) => ({
                              ...prev,
                              shank_value: e.target.value,
                            }))
                          }
                          disabled={isFlattop}
                          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            isFlattop
                              ? 'opacity-50 cursor-not-allowed bg-gray-100'
                              : ''
                          } ${
                            features.barrel_inlet === 'bartlein_#3b' &&
                            !features.shank_value?.trim()
                              ? 'border-red-500'
                              : 'border-gray-300'
                          }`}
                        />
                      )}
                      {features.barrel_inlet === 'bartlein_#3b' &&
                        !features.add_shank && (
                          <p className="text-sm text-red-500">
                            Shank is required for Bartlein #3B
                          </p>
                        )}
                      {features.barrel_inlet === 'bartlein_#3b' &&
                        features.add_shank &&
                        !features.shank_value?.trim() && (
                          <p className="text-sm text-red-500">
                            Please enter a shank value
                          </p>
                        )}
                    </div>

                    {/* LOP Length Of Pull - Show message for CAT and Visigoth models */}
                    <div>
                      <Label>LOP Length Of Pull</Label>
                      {(() => {
                        // Check if selected model contains "CAT" or "Visigoth"
                        const selectedModel = modelOptions.find(
                          (m) => m.id === modelId
                        );
                        const modelName =
                          selectedModel?.displayName ||
                          selectedModel?.name ||
                          '';
                        const isRestrictedModel =
                          modelName.toLowerCase().includes('cat') ||
                          modelName.toLowerCase().includes('visigoth');

                        return (
                          <Select
                            value={features.length_of_pull || undefined}
                            onValueChange={(value) =>
                              setFeatures((prev) => ({
                                ...prev,
                                length_of_pull: value === '__NONE__' ? undefined : value,
                              }))
                            }
                            disabled={isRestrictedModel}
                          >
                            <SelectTrigger
                              className={
                                isRestrictedModel
                                  ? 'opacity-50 cursor-not-allowed'
                                  : ''
                              }
                            >
                              <SelectValue
                                placeholder={
                                  isRestrictedModel
                                    ? 'Not Available'
                                    : 'Select...'
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {(() => {
                                // Check if selected model contains "CAT" or "Visigoth"
                                const selectedModel = modelOptions.find(
                                  (m) => m.id === modelId
                                );
                                const modelName =
                                  selectedModel?.displayName ||
                                  selectedModel?.name ||
                                  '';
                                const isRestrictedModel =
                                  modelName.toLowerCase().includes('cat') ||
                                  modelName.toLowerCase().includes('visigoth');

                                // Show "not available" message for restricted models
                                if (isRestrictedModel) {
                                  return (
                                    <div className="px-2 py-1.5 text-sm text-gray-500 italic">
                                      This Option not Available
                                    </div>
                                  );
                                }

                                // Show normal options for other models
                                const lopFeature = featureDefs.find(
                                  (f) =>
                                    f.id === 'length_of_pull' ||
                                    f.name === 'length_of_pull' ||
                                    f.id?.toLowerCase().includes('lop') ||
                                    f.name?.toLowerCase().includes('lop') ||
                                    f.displayName
                                      ?.toLowerCase()
                                      .includes('length of pull') ||
                                    f.displayName?.toLowerCase().includes('lop')
                                );

                                if (!lopFeature || !lopFeature.options) {
                                  return (
                                    <div className="px-2 py-1.5 text-sm text-gray-500 italic">
                                      No LOP options available
                                    </div>
                                  );
                                }

                                return (
                                  <>
                                    <SelectItem value="__NONE__">None</SelectItem>
                                    {lopFeature.options
                                      .filter(
                                        (option) =>
                                          option.value && option.value.trim() !== ''
                                      )
                                      .map((option) => (
                                        <SelectItem
                                          key={option.value}
                                          value={option.value}
                                        >
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                  </>
                                );
                              })()}
                            </SelectContent>
                          </Select>
                        );
                      })()}
                    </div>

                    {/* Texture */}
                    <div>
                      <Label>Texture</Label>
                      <Select
                        value={features.texture_options || undefined}
                        onValueChange={(value) =>
                          setFeatures((prev) => ({
                            ...prev,
                            texture_options: value === '__NONE__' ? undefined : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__NONE__">None</SelectItem>
                          {(() => {
                            const textureFeature = featureDefs.find(
                              (f) =>
                                f.id === 'texture_options' ||
                                f.name === 'texture_options' ||
                                f.id?.toLowerCase().includes('texture') ||
                                f.name?.toLowerCase().includes('texture') ||
                                f.displayName?.toLowerCase().includes('texture')
                            );

                            if (!textureFeature || !textureFeature.options) {
                              return null;
                            }

                            return textureFeature.options
                              .filter(
                                (option) =>
                                  option.value && option.value.trim() !== ''
                              )
                              .map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ));
                          })()}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Other Options */}
                    <div>
                      <Label>Other Options</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between"
                          >
                            {(() => {
                              const selectedCount = (
                                features.other_options || []
                              ).length;
                              if (selectedCount === 0)
                                return 'Select options...';
                              if (selectedCount === 1)
                                return '1 option selected';
                              return `${selectedCount} options selected`;
                            })()}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search options..." />
                            <CommandEmpty>No options found.</CommandEmpty>
                            <CommandGroup>
                              <CommandList className="max-h-48 overflow-y-auto">
                                {(() => {
                                  const otherOptionsFeature = featureDefs.find(
                                    (f) => f.id === 'other_options'
                                  );

                                  if (
                                    !otherOptionsFeature ||
                                    !otherOptionsFeature.options
                                  ) {
                                    return (
                                      <div className="text-gray-500 text-sm p-3">
                                        No Other Options available
                                      </div>
                                    );
                                  }

                                  return otherOptionsFeature.options
                                    .filter(
                                      (option) =>
                                        option.value &&
                                        option.value.trim() !== ''
                                    )
                                    .map((option) => {
                                      const isChecked = (
                                        features.other_options || []
                                      ).includes(option.value);
                                      const showQuantity =
                                        isChecked &&
                                        !option.label
                                          ?.toLowerCase()
                                          .includes('no');
                                      const quantity =
                                        otherOptionsQuantities[option.value] ||
                                        1;

                                      return (
                                        <CommandItem
                                          key={option.value}
                                          onSelect={() => {
                                            const currentOther =
                                              features.other_options || [];
                                            if (isChecked) {
                                              setFeatures((prev) => ({
                                                ...prev,
                                                other_options:
                                                  currentOther.filter(
                                                    (item: string) =>
                                                      item !== option.value
                                                  ),
                                              }));
                                              // Remove quantity when unchecked
                                              setOtherOptionsQuantities(
                                                (prev) => {
                                                  const newQuantities = {
                                                    ...prev,
                                                  };
                                                  delete newQuantities[
                                                    option.value
                                                  ];
                                                  return newQuantities;
                                                }
                                              );
                                            } else {
                                              setFeatures((prev) => ({
                                                ...prev,
                                                other_options: [
                                                  ...currentOther,
                                                  option.value,
                                                ],
                                              }));
                                              // Set default quantity to 1 for new selections
                                              setOtherOptionsQuantities(
                                                (prev) => ({
                                                  ...prev,
                                                  [option.value]: 1,
                                                })
                                              );
                                            }
                                          }}
                                          className="cursor-pointer"
                                        >
                                          <div className="flex items-center space-x-2 w-full">
                                            <Checkbox
                                              checked={isChecked}
                                              onChange={() => {}} // Handled by onSelect
                                              className="pointer-events-none"
                                            />
                                            <div className="flex-1 space-y-1">
                                              <div className="text-sm font-medium">
                                                {option.label}
                                                {option.price &&
                                                  option.price > 0 && (
                                                    <span className="ml-2 text-blue-600 font-bold">
                                                      +$
                                                      {option.price.toFixed(2)}
                                                      {showQuantity &&
                                                        ` x ${quantity}`}
                                                    </span>
                                                  )}
                                              </div>
                                              {showQuantity && (
                                                <div className="flex items-center space-x-2">
                                                  <Label className="text-xs text-gray-600">
                                                    Qty:
                                                  </Label>
                                                  <Input
                                                    type="number"
                                                    min="1"
                                                    value={quantity}
                                                    onChange={(e) => {
                                                      const newQuantity =
                                                        Math.max(
                                                          1,
                                                          parseInt(
                                                            e.target.value
                                                          ) || 1
                                                        );
                                                      setOtherOptionsQuantities(
                                                        (prev) => ({
                                                          ...prev,
                                                          [option.value]:
                                                            newQuantity,
                                                        })
                                                      );
                                                    }}
                                                    className="w-16 h-6 text-xs"
                                                    onClick={(e) =>
                                                      e.stopPropagation()
                                                    }
                                                  />
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </CommandItem>
                                      );
                                    });
                                })()}
                              </CommandList>
                            </CommandGroup>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {/* Display selected options as badges */}
                      {features.other_options &&
                        features.other_options.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {features.other_options.map(
                              (optionValue: string) => {
                                const otherOptionsFeature = featureDefs.find(
                                  (f) => f.id === 'other_options'
                                );
                                const option =
                                  otherOptionsFeature?.options?.find(
                                    (o) => o.value === optionValue
                                  );
                                const quantity =
                                  otherOptionsQuantities[optionValue] || 1;
                                const showQuantity = !option?.label
                                  ?.toLowerCase()
                                  .includes('no');

                                return (
                                  <Badge
                                    key={optionValue}
                                    variant="secondary"
                                    className="text-xs px-2 py-1"
                                  >
                                    {option?.label}
                                    {showQuantity && ` (${quantity})`}
                                  </Badge>
                                );
                              }
                            )}
                          </div>
                        )}
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-4">
                    {/* Action Length */}
                    <div>
                      <Label>Action Length</Label>
                      <Select
                        key={`action-length-${renderKey}-${features.action_length || 'empty'}`}
                        value={features.action_length || undefined}
                        onValueChange={(value) =>
                          setFeatures((prev) => ({
                            ...prev,
                            action_length: value === '__NONE__' ? undefined : value,
                          }))
                        }
                        disabled={isFlattop}
                      >
                        <SelectTrigger
                          className={
                            isFlattop ? 'opacity-50 cursor-not-allowed' : ''
                          }
                        >
                          <SelectValue
                            placeholder={
                              isFlattop
                                ? 'Not Available (Flattop)'
                                : 'Select action length...'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__NONE__">None</SelectItem>
                          <SelectItem value="short">Short</SelectItem>
                          {(() => {
                            // Check if selected model contains "Ferrata" or "Armor"
                            // If so, exclude Medium option
                            const selectedModel = modelOptions.find(
                              (m) => m.id === modelId
                            );
                            const modelName =
                              selectedModel?.displayName ||
                              selectedModel?.name ||
                              '';
                            const excludeMedium =
                              modelName.toLowerCase().includes('ferrata') ||
                              modelName.toLowerCase().includes('armor');

                            // Only show Medium if model doesn't contain Ferrata/Armor
                            if (!excludeMedium) {
                              return (
                                <SelectItem value="medium">Medium</SelectItem>
                              );
                            }
                            return null;
                          })()}
                          <SelectItem value="long">Long</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Bottom Metal */}
                    <div>
                      <Label className="flex items-center gap-2">
                        Bottom Metal
                        {(() => {
                          const selectedModel = modelOptions.find(
                            (m) => m.id === modelId
                          );
                          const modelName =
                            selectedModel?.displayName ||
                            selectedModel?.name ||
                            '';
                          const isTikkaModel = modelName
                            .toLowerCase()
                            .includes('tikka');
                          const bottomMetalFeature = featureDefs.find(
                            (f) =>
                              f.name === 'bottom_metal' ||
                              f.id === 'bottom_metal'
                          );
                          const hasTikkaOptions =
                            bottomMetalFeature?.options?.some(
                              (opt) =>
                                opt.value.toLowerCase().includes('tikka') ||
                                opt.label.toLowerCase().includes('tikka')
                            );
                          const hasNonTikkaOptions =
                            bottomMetalFeature?.options?.some(
                              (opt) =>
                                !opt.value.toLowerCase().includes('tikka') &&
                                !opt.label.toLowerCase().includes('tikka') &&
                                opt.value.trim() !== ''
                            );

                          if (isTikkaModel && hasNonTikkaOptions) {
                            return (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                                Tikka only
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </Label>
                      <Select
                        key={`bottom-metal-${renderKey}-${features.bottom_metal || 'empty'}`}
                        value={features.bottom_metal || undefined}
                        onValueChange={(value) =>
                          setFeatures((prev) => ({
                            ...prev,
                            bottom_metal: value === '__NONE__' ? undefined : value,
                          }))
                        }
                        disabled={isFlattop}
                      >
                        <SelectTrigger
                          className={
                            isFlattop ? 'opacity-50 cursor-not-allowed' : ''
                          }
                        >
                          <SelectValue
                            placeholder={
                              isFlattop
                                ? 'Not Available (Flattop)'
                                : 'Select...'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__NONE__">None</SelectItem>
                          {(() => {
                            // Check if selected model is a Tikka model
                            const selectedModel = modelOptions.find(
                              (m) => m.id === modelId
                            );
                            const modelName =
                              selectedModel?.displayName ||
                              selectedModel?.name ||
                              '';
                            const isTikkaModel = modelName
                              .toLowerCase()
                              .includes('tikka');

                            return (
                              featureDefs
                                .find(
                                  (f) =>
                                    f.name === 'bottom_metal' ||
                                    f.id === 'bottom_metal'
                                )
                                ?.options?.filter((option) => {
                                  // Filter out empty options
                                  if (
                                    !option.value ||
                                    option.value.trim() === ''
                                  )
                                    return false;

                                  const isTikkaOption =
                                    option.value
                                      .toLowerCase()
                                      .includes('tikka') ||
                                    option.label
                                      .toLowerCase()
                                      .includes('tikka');

                                  // Business rule: Tikka model shows ONLY Tikka options
                                  if (isTikkaModel && !isTikkaOption) {
                                    return false;
                                  }

                                  // Business rule: Non-Tikka model hides Tikka options
                                  if (!isTikkaModel && isTikkaOption) {
                                    return false;
                                  }

                                  // Business rule: Filter out specific bottom metals when Action Length is "Medium"
                                  const isMediumAction =
                                    features.action_length === 'medium';
                                  const restrictedBottomMetals = [
                                    'ag_m5_sa',
                                    'ag_m5_la',
                                    'ag_m5_la_cip',
                                    'ag_bdl_sa',
                                    'ag_bdl_la',
                                  ];

                                  if (
                                    isMediumAction &&
                                    restrictedBottomMetals.includes(
                                      option.value
                                    )
                                  ) {
                                    return false;
                                  }

                                  return true;
                                })
                                ?.map((option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </SelectItem>
                                )) || []
                            );
                          })()}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* QD Quick Detach Cups */}
                    <div>
                      <Label className="flex items-center gap-2">
                        QD Quick Detach Cups
                        {(() => {
                          const selectedModel = modelOptions.find(
                            (m) => m.id === modelId
                          );
                          const isChalkModel =
                            selectedModel?.displayName
                              ?.toLowerCase()
                              .includes('chalk') ||
                            selectedModel?.name
                              ?.toLowerCase()
                              .includes('chalk');
                          const isPrivateerModel =
                            selectedModel?.displayName
                              ?.toLowerCase()
                              .includes('privateer') ||
                            selectedModel?.name
                              ?.toLowerCase()
                              .includes('privateer');
                          return (
                            (isChalkModel || isPrivateerModel) && (
                              <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                                Limited Options
                              </span>
                            )
                          );
                        })()}
                      </Label>
                      <Select
                        key={`qd-accessory-${renderKey}-${features.qd_accessory || 'empty'}`}
                        value={features.qd_accessory || undefined}
                        onValueChange={(value) =>
                          setFeatures((prev) => ({
                            ...prev,
                            qd_accessory: value === '__NONE__' ? undefined : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__NONE__">None</SelectItem>
                          {(() => {
                            const qdFeature = featureDefs.find(
                              (f) =>
                                f.id === 'qd_accessory' ||
                                f.name === 'qd_accessory' ||
                                f.id?.toLowerCase().includes('qd') ||
                                f.name?.toLowerCase().includes('qd') ||
                                f.displayName?.toLowerCase().includes('qd') ||
                                f.displayName
                                  ?.toLowerCase()
                                  .includes('quick detach')
                            );

                            if (!qdFeature || !qdFeature.options) {
                              return null;
                            }

                            // Check if selected model contains "Chalk" or "Privateer" in the name
                            const selectedModel = modelOptions.find(
                              (m) => m.id === modelId
                            );
                            const isChalkModel =
                              selectedModel?.displayName
                                ?.toLowerCase()
                                .includes('chalk') ||
                              selectedModel?.name
                                ?.toLowerCase()
                                .includes('chalk');
                            const isPrivateerModel =
                              selectedModel?.displayName
                                ?.toLowerCase()
                                .includes('privateer') ||
                              selectedModel?.name
                                ?.toLowerCase()
                                .includes('privateer');

                            // Define limited QD options for Chalk/Privateer models (based on actual database values)
                            const chalkQDOptions = [
                              'no_qds',
                              'qd_1_right_butt',
                              'qd_1_left_butt',
                              'qd_2_butt',
                            ];

                            // Filter options based on model type
                            let availableOptions = qdFeature.options.filter(
                              (option) =>
                                option.value && option.value.trim() !== ''
                            );

                            if (isChalkModel || isPrivateerModel) {
                              console.log(
                                '🎯 Chalk/Privateer model detected for QDs:',
                                selectedModel?.displayName
                              );
                              console.log(
                                '🎯 Original QD options:',
                                availableOptions.map((o) => o.label)
                              );

                              availableOptions = availableOptions.filter(
                                (option) =>
                                  chalkQDOptions.includes(option.value)
                              );

                              console.log(
                                '🎯 Filtered QD options for Chalk/Privateer:',
                                availableOptions.map((o) => o.label)
                              );
                            }

                            return availableOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ));
                          })()}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Rails */}
                    <div>
                      <Label className="flex items-center gap-2">
                        Rails
                        {(() => {
                          const selectedModel = modelOptions.find(
                            (m) => m.id === modelId
                          );
                          const isChalkModel =
                            selectedModel?.displayName
                              ?.toLowerCase()
                              .includes('chalk') ||
                            selectedModel?.name
                              ?.toLowerCase()
                              .includes('chalk');
                          return (
                            isChalkModel && (
                              <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                                Chalk Model - Limited Options
                              </span>
                            )
                          );
                        })()}
                      </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between"
                          >
                            {(() => {
                              const selectedCount = (
                                features.rail_accessory || []
                              ).length;
                              if (selectedCount === 0) return 'Select rails...';
                              if (selectedCount === 1) return '1 rail selected';
                              return `${selectedCount} rails selected`;
                            })()}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search rails..." />
                            <CommandEmpty>No rails found.</CommandEmpty>
                            <CommandGroup>
                              <CommandList className="max-h-48 overflow-y-auto">
                                {(() => {
                                  const railsFeature = featureDefs.find(
                                    (f) => f.id === 'rail_accessory'
                                  );

                                  if (!railsFeature || !railsFeature.options) {
                                    return (
                                      <div className="text-gray-500 text-sm p-3">
                                        No Rails options available
                                      </div>
                                    );
                                  }

                                  // Check if selected model contains "Chalk" in the name
                                  const selectedModel = modelOptions.find(
                                    (m) => m.id === modelId
                                  );
                                  const isChalkModel =
                                    selectedModel?.displayName
                                      ?.toLowerCase()
                                      .includes('chalk') ||
                                    selectedModel?.name
                                      ?.toLowerCase()
                                      .includes('chalk');

                                  // Define limited Rails options for Chalk models (based on actual database values)
                                  const chalkRailsOptions = [
                                    'arca_4',
                                    'pic_rail',
                                    'pic_intgrated_stud',
                                    'alamo_rail_spacing',
                                  ];

                                  // Filter options based on model type
                                  let availableOptions =
                                    railsFeature.options.filter(
                                      (option) =>
                                        option.value &&
                                        option.value.trim() !== ''
                                    );

                                  if (isChalkModel) {
                                    console.log(
                                      '🎯 Chalk model detected:',
                                      selectedModel?.displayName
                                    );
                                    console.log(
                                      '🎯 Original Rails options:',
                                      availableOptions.map((o) => o.label)
                                    );

                                    availableOptions = availableOptions.filter(
                                      (option) =>
                                        chalkRailsOptions.includes(
                                          option.value
                                        ) ||
                                        option.label
                                          ?.toLowerCase()
                                          .includes('4" arca rail') ||
                                        option.label
                                          ?.toLowerCase()
                                          .includes('ag pic') ||
                                        option.label
                                          ?.toLowerCase()
                                          .includes('ag pic w/int stud')
                                    );

                                    console.log(
                                      '🎯 Filtered Rails options for Chalk:',
                                      availableOptions.map((o) => o.label)
                                    );
                                  }

                                  return availableOptions.map((option) => {
                                    const isChecked = Array.isArray(
                                      features.rail_accessory
                                    )
                                      ? features.rail_accessory.includes(
                                          option.value
                                        )
                                      : false;

                                    return (
                                      <CommandItem
                                        key={option.value}
                                        onSelect={() => {
                                          const currentRails = Array.isArray(
                                            features.rail_accessory
                                          )
                                            ? features.rail_accessory
                                            : [];

                                          if (isChecked) {
                                            // Remove this option
                                            setFeatures((prev) => ({
                                              ...prev,
                                              rail_accessory:
                                                currentRails.filter(
                                                  (item: string) =>
                                                    item !== option.value
                                                ),
                                            }));
                                          } else {
                                            // Adding a new option
                                            if (option.value === 'no_rail') {
                                              // If selecting "No Rail", clear all other rails
                                              setFeatures((prev) => ({
                                                ...prev,
                                                rail_accessory: ['no_rail'],
                                              }));
                                            } else {
                                              // If selecting any other rail, remove "No Rail" and add the new rail
                                              const railsWithoutNoRail =
                                                currentRails.filter(
                                                  (item: string) =>
                                                    item !== 'no_rail'
                                                );
                                              setFeatures((prev) => ({
                                                ...prev,
                                                rail_accessory: [
                                                  ...railsWithoutNoRail,
                                                  option.value,
                                                ],
                                              }));
                                            }
                                          }
                                        }}
                                        className="cursor-pointer"
                                      >
                                        <div className="flex items-center space-x-2 w-full">
                                          <Checkbox
                                            checked={isChecked}
                                            onChange={() => {}} // Handled by onSelect
                                            className="pointer-events-none"
                                          />
                                          <div className="flex-1">
                                            <div className="text-sm font-medium">
                                              {option.label}
                                              {option.price &&
                                                option.price > 0 && (
                                                  <span className="ml-2 text-blue-600 font-bold">
                                                    +${option.price.toFixed(2)}
                                                  </span>
                                                )}
                                            </div>
                                          </div>
                                        </div>
                                      </CommandItem>
                                    );
                                  });
                                })()}
                              </CommandList>
                            </CommandGroup>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {/* Display selected rails as badges */}
                      {features.rail_accessory &&
                        Array.isArray(features.rail_accessory) &&
                        features.rail_accessory.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {features.rail_accessory.map(
                              (optionValue: string) => {
                                const railsFeature = featureDefs.find(
                                  (f) => f.id === 'rail_accessory'
                                );
                                const option = railsFeature?.options?.find(
                                  (o) => o.value === optionValue
                                );

                                return (
                                  <Badge
                                    key={optionValue}
                                    variant="secondary"
                                    className="text-xs px-2 py-1"
                                  >
                                    {option?.label}
                                  </Badge>
                                );
                              }
                            )}
                          </div>
                        )}
                    </div>

                    {/* Swivel Studs */}
                    <div>
                      <Label>Swivel Studs</Label>
                      <Select
                        value={features.swivel_studs || undefined}
                        onValueChange={(value) =>
                          setFeatures((prev) => ({
                            ...prev,
                            swivel_studs: value === '__NONE__' ? undefined : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__NONE__">None</SelectItem>
                          {(() => {
                            const swivelFeature = featureDefs.find(
                              (f) =>
                                f.id === 'swivel_studs' ||
                                f.name === 'swivel_studs' ||
                                f.id?.toLowerCase().includes('swivel') ||
                                f.name?.toLowerCase().includes('swivel') ||
                                f.displayName
                                  ?.toLowerCase()
                                  .includes('swivel') ||
                                f.displayName?.toLowerCase().includes('stud')
                            );

                            if (!swivelFeature || !swivelFeature.options) {
                              return null;
                            }

                            return swivelFeature.options
                              .filter(
                                (option) =>
                                  option.value && option.value.trim() !== ''
                              )
                              .map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ));
                          })()}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Paint Options */}
                    <div id="finish-intake" className="scroll-mt-28">
                      <Label>Paint Options</Label>
                      <Select
                        value={features.paint_options || undefined}
                        onValueChange={(value) =>
                          setFeatures((prev) => ({
                            ...prev,
                            paint_options: value === '__NONE__' ? undefined : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select or search..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__NONE__">None</SelectItem>
                          {(() => {
                            // Find all paint-related features from different sub-categories
                            const paintFeatures = featureDefs.filter(
                              (f) =>
                                f.category === 'paint_options' ||
                                f.displayName === 'Premium Options' ||
                                f.displayName === 'Terrain Options' ||
                                f.displayName === 'Rogue Options' ||
                                f.displayName === 'Standard Options' ||
                                f.displayName === 'Carbon Camo Ready' ||
                                f.displayName === 'Camo Options' ||
                                f.id === 'metallic_finishes' ||
                                f.name === 'metallic_finishes'
                            );

                            if (!paintFeatures || paintFeatures.length === 0) {
                              return (
                                <SelectItem value="none">
                                  No paint options available
                                </SelectItem>
                              );
                            }

                            // Collect all options from all paint features
                            const allOptions: {
                              value: string;
                              label: string;
                              category?: string;
                            }[] = [];

                            paintFeatures.forEach((feature) => {
                              if (feature.options) {
                                feature.options.forEach((option) => {
                                  // Only add options with valid, non-empty values
                                  if (
                                    option.value &&
                                    option.value.trim() !== ''
                                  ) {
                                    allOptions.push({
                                      value: option.value,
                                      label: `${feature.displayName || feature.name} - ${option.label}`,
                                      category:
                                        feature.displayName || feature.name,
                                    });
                                  }
                                });
                              }
                            });

                            // Filter out Carbon options if Fiberglass (FG) stock model is selected
                            const selectedModel = modelOptions.find(
                              (m) => m.id === modelId
                            );
                            const modelName =
                              selectedModel?.name ||
                              selectedModel?.displayName ||
                              '';
                            const isFiberglassModel = modelName
                              .toUpperCase()
                              .includes('FG');

                            const filteredOptions = isFiberglassModel
                              ? allOptions.filter(
                                  (option) => !option.label.includes('Carbon')
                                )
                              : allOptions;

                            return filteredOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ));
                          })()}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Custom Order and Notes */}
                <div id="notes-intake" className="scroll-mt-28">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add special instructions or notes..."
                    rows={3}
                  />
                  {/* Render NCR links as clickable */}
                  {notes && notes.includes('Nonconformance Record #') && (
                    <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
                      <p className="text-xs text-amber-700 font-medium mb-1">Linked Records:</p>
                      <div className="flex flex-wrap gap-2">
                        {notes.match(/\[Nonconformance Record #(\d+)\]\(([^)]+)\)/g)?.map((match, idx) => {
                          const ncrMatch = match.match(/\[Nonconformance Record #(\d+)\]\(([^)]+)\)/);
                          if (ncrMatch) {
                            const [, ncrId, ncrPath] = ncrMatch;
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setLocation(ncrPath)}
                                className="text-xs text-blue-600 hover:text-blue-800 hover:underline cursor-pointer bg-white px-2 py-1 rounded border border-blue-200"
                                data-testid={`link-ncr-${ncrId}`}
                              >
                                Nonconformance Record #{ncrId}
                              </button>
                            );
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  )}
                  {/* CSR Warning: Discount text in notes without structured discount */}
                  {showDiscountWarning && (
                    <div className="mt-2 p-3 bg-orange-50 border border-orange-300 rounded-md flex items-start gap-2">
                      <span className="text-orange-500 text-lg">⚠️</span>
                      <div>
                        <p className="text-sm text-orange-800 font-medium">
                          Discount mentioned in notes, but no pricing discount applied
                        </p>
                        <p className="text-xs text-orange-700 mt-1">
                          Notes do not affect order totals. Use the Discount section below to apply a pricing discount.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Miscellaneous Items */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-medium">
                      Miscellaneous Items
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addMiscItem}
                      className="h-8 px-3"
                    >
                      + Add Item
                    </Button>
                  </div>

                  {miscItems.length > 0 && (
                    <div className="space-y-3">
                      {miscItems.map((item) => (
                        <div
                          key={item.id}
                          className="border rounded-lg p-4 space-y-3"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div className="md:col-span-2">
                              <Label
                                htmlFor={`misc-desc-${item.id}`}
                                className="text-sm"
                              >
                                Description
                              </Label>
                              <Input
                                id={`misc-desc-${item.id}`}
                                value={item.description}
                                onChange={(e) =>
                                  updateMiscItem(
                                    item.id,
                                    'description',
                                    e.target.value
                                  )
                                }
                                placeholder="Item description..."
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label
                                htmlFor={`misc-qty-${item.id}`}
                                className="text-sm"
                              >
                                Quantity
                              </Label>
                              <Input
                                id={`misc-qty-${item.id}`}
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) =>
                                  updateMiscItem(
                                    item.id,
                                    'quantity',
                                    parseInt(e.target.value) || 1
                                  )
                                }
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label
                                htmlFor={`misc-price-${item.id}`}
                                className="text-sm"
                              >
                                Unit Price
                              </Label>
                              <Input
                                id={`misc-price-${item.id}`}
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unitPrice}
                                onChange={(e) =>
                                  updateMiscItem(
                                    item.id,
                                    'unitPrice',
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="mt-1"
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="text-sm text-gray-600">
                              Total:{' '}
                              <span className="font-medium text-blue-600">
                                ${item.total.toFixed(2)}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeMiscItem(item.id)}
                              className="h-8 px-3 text-red-600 hover:text-red-700"
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {miscItems.length === 0 && (
                    <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                      <p className="text-sm">No miscellaneous items added</p>
                      <p className="text-xs mt-1">
                        Click "Add Item" to include custom items with pricing
                      </p>
                    </div>
                  )}
                </div>

                {/* Order Attachments */}
                {orderId && (
                  <OrderAttachmentsSection orderId={orderId} />
                )}
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Order Summary */}
        <div className="space-y-6">
          <Card id="pricing-intake" className={isConsoleMode ? 'order-console-summary-card scroll-mt-28' : 'scroll-mt-28'}>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Main Total Display */}
              <div className="order-summary-total text-center space-y-2 border-b pb-4">
                <div className="flex justify-between items-center">
                  <span className="text-3xl font-bold">1</span>
                  <span className="text-3xl font-bold text-blue-600">
                    ${(totalPrice + shipping).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Items</span>
                  <span>Total with Shipping</span>
                </div>
              </div>

              {/* Feature Selections */}
              <div className="space-y-3">
                <div className="font-medium text-base">Feature Selections</div>

                {/* Stock Model - Always Show */}
                <div className="flex justify-between items-center">
                  <span>Stock Model:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {selectedModel?.displayName || 'Not selected'}
                    </span>
                    <span className="text-blue-600 font-bold">
                      $
                      {priceOverride !== null
                        ? priceOverride.toFixed(2)
                        : isFlattop && flattopPriceOverride !== null
                        ? flattopPriceOverride.toFixed(2)
                        : selectedModel?.price?.toFixed(2) || '0.00'}
                      {(priceOverride !== null || (isFlattop && flattopPriceOverride !== null)) && (
                        <span className="text-xs text-green-600 ml-1">
                          (Override)
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Handedness - Show if selected or as "Not selected" */}
                <div className="flex justify-between items-center">
                  <span>Handedness:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {features.handedness
                        ? features.handedness === 'right'
                          ? 'Right'
                          : 'Left'
                        : 'Not selected'}
                    </span>
                    <span className="text-blue-600 font-bold">$0.00</span>
                  </div>
                </div>

                {/* Action Length - Show if selected or as "Not selected" */}
                <div className="flex justify-between items-center">
                  <span>
                    {(() => {
                      const feature = featureDefs.find(
                        (f) => f.id === 'action_length'
                      );
                      return feature?.displayName || 'Action Length';
                    })()}
                    :
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {features.action_length
                        ? (() => {
                            const feature = featureDefs.find(
                              (f) => f.id === 'action_length'
                            );
                            const option = feature?.options?.find(
                              (opt) => opt.value === features.action_length
                            );
                            return (
                              option?.label ||
                              features.action_length.charAt(0).toUpperCase() +
                                features.action_length.slice(1)
                            );
                          })()
                        : 'Not selected'}
                    </span>
                    <span className="text-blue-600 font-bold">
                      $
                      {features.action_length
                        ? (() => {
                            const feature = featureDefs.find(
                              (f) => f.id === 'action_length'
                            );
                            const option = feature?.options?.find(
                              (opt) => opt.value === features.action_length
                            );
                            return (option?.price || 0).toFixed(2);
                          })()
                        : '0.00'}
                    </span>
                  </div>
                </div>

                {/* Action Inlet */}
                <div className="flex justify-between items-center">
                  <span>
                    {(() => {
                      const feature = featureDefs.find(
                        (f) => f.id === 'action_inlet'
                      );
                      return feature?.displayName || 'Action Inlet';
                    })()}
                    :
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {features.action_inlet
                        ? (() => {
                            const feature = featureDefs.find(
                              (f) =>
                                f.id === 'action_inlet' ||
                                f.name === 'action_inlet'
                            );
                            const option = feature?.options?.find(
                              (opt) => opt.value === features.action_inlet
                            );
                            return option?.label || 'Not selected';
                          })()
                        : 'Not selected'}
                    </span>
                    <span className="text-blue-600 font-bold">
                      $
                      {features.action_inlet
                        ? (() => {
                            const feature = featureDefs.find(
                              (f) => f.id === 'action_inlet'
                            );
                            const option = feature?.options?.find(
                              (opt) => opt.value === features.action_inlet
                            );
                            return (option?.price || 0).toFixed(2);
                          })()
                        : '0.00'}
                    </span>
                  </div>
                </div>

                {/* Bottom Metal */}
                <div className="flex justify-between items-center">
                  <span>
                    {(() => {
                      const feature = featureDefs.find(
                        (f) => f.id === 'bottom_metal'
                      );
                      return feature?.displayName || 'Bottom Metal';
                    })()}
                    :
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {features.bottom_metal
                        ? (() => {
                            const feature = featureDefs.find(
                              (f) => f.id === 'bottom_metal'
                            );
                            const option = feature?.options?.find(
                              (opt) => opt.value === features.bottom_metal
                            );
                            return option?.label || features.bottom_metal;
                          })()
                        : 'Not selected'}
                    </span>
                    <span className="text-blue-600 font-bold">
                      $
                      {features.bottom_metal
                        ? (() => {
                            const feature = featureDefs.find(
                              (f) => f.id === 'bottom_metal'
                            );
                            const option = feature?.options?.find(
                              (opt) => opt.value === features.bottom_metal
                            );
                            let displayPrice = option?.price || 0;

                            // Special pricing: SepFG10 or SepCF25 seasonal sale + AG bottom metal = $100 instead of $149
                            if (
                              (discountCode === 'short_term_3' ||
                                discountCode === 'short_term_1') &&
                              features.bottom_metal.includes('ag_') &&
                              option?.price === 149
                            ) {
                              displayPrice = 100;
                            }

                            return displayPrice.toFixed(2);
                          })()
                        : '0.00'}
                    </span>
                  </div>
                </div>

                {/* Barrel Inlet */}
                <div className="flex justify-between items-center">
                  <span>
                    {(() => {
                      const feature = featureDefs.find(
                        (f) =>
                          f.id === 'barrel_inlet' || f.name === 'barrel_inlet'
                      );
                      return feature?.displayName || 'Barrel Inlet';
                    })()}
                    :
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {features.barrel_inlet
                        ? (() => {
                            const feature = featureDefs.find(
                              (f) =>
                                f.id === 'barrel_inlet' ||
                                f.name === 'barrel_inlet'
                            );
                            const option = feature?.options?.find(
                              (opt) => opt.value === features.barrel_inlet
                            );
                            return option?.label || 'Not selected';
                          })()
                        : 'Not selected'}
                    </span>
                    <span className="text-blue-600 font-bold">
                      $
                      {features.barrel_inlet
                        ? (() => {
                            const feature = featureDefs.find(
                              (f) =>
                                f.id === 'barrel_inlet' ||
                                f.name === 'barrel_inlet'
                            );
                            const option = feature?.options?.find(
                              (opt) => opt.value === features.barrel_inlet
                            );
                            return (option?.price || 0).toFixed(2);
                          })()
                        : '0.00'}
                    </span>
                  </div>
                </div>

                {/* Shank - Show if selected */}
                {features.add_shank && (
                  <div className="flex justify-between items-center">
                    <span>Shank:</span>
                    <div className="flex items-center gap-2">
                      <span
                        className="font-medium"
                        data-testid="text-shank-value"
                      >
                        {features.shank_value || 'Not entered'}
                      </span>
                      <span className="text-blue-600 font-bold">$0.00</span>
                    </div>
                  </div>
                )}

                {/* QDs (Quick Detach Cups) */}
                <div className="flex justify-between items-center">
                  <span>
                    {(() => {
                      const feature = featureDefs.find(
                        (f) =>
                          f.id === 'qd_accessory' || f.name === 'qd_accessory'
                      );
                      return feature?.displayName || 'QDs (Quick Detach Cups)';
                    })()}
                    :
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {features.qd_accessory
                        ? (() => {
                            const feature = featureDefs.find(
                              (f) =>
                                f.id === 'qd_accessory' ||
                                f.name === 'qd_accessory'
                            );
                            const option = feature?.options?.find(
                              (opt) => opt.value === features.qd_accessory
                            );
                            return option?.label || 'Not selected';
                          })()
                        : 'Not selected'}
                    </span>
                    <span className="text-blue-600 font-bold">
                      $
                      {features.qd_accessory
                        ? (() => {
                            const feature = featureDefs.find(
                              (f) =>
                                f.id === 'qd_accessory' ||
                                f.name === 'qd_accessory'
                            );
                            const option = feature?.options?.find(
                              (opt) => opt.value === features.qd_accessory
                            );
                            return (option?.price || 0).toFixed(2);
                          })()
                        : '0.00'}
                    </span>
                  </div>
                </div>

                {/* LOP (Length of Pull) */}
                <div className="flex justify-between items-center">
                  <span>
                    {(() => {
                      const feature = featureDefs.find(
                        (f) =>
                          f.id === 'length_of_pull' ||
                          f.name === 'length_of_pull'
                      );
                      return feature?.displayName || 'LOP (Length of Pull)';
                    })()}
                    :
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {features.length_of_pull
                        ? (() => {
                            const feature = featureDefs.find(
                              (f) =>
                                f.id === 'length_of_pull' ||
                                f.name === 'length_of_pull'
                            );
                            const option = feature?.options?.find(
                              (opt) => opt.value === features.length_of_pull
                            );
                            return option?.label || 'Not selected';
                          })()
                        : 'Not selected'}
                    </span>
                    <span className="text-blue-600 font-bold">
                      $
                      {features.length_of_pull
                        ? (() => {
                            const feature = featureDefs.find(
                              (f) =>
                                f.id === 'length_of_pull' ||
                                f.name === 'length_of_pull'
                            );
                            const option = feature?.options?.find(
                              (opt) => opt.value === features.length_of_pull
                            );
                            return (option?.price || 0).toFixed(2);
                          })()
                        : '0.00'}
                    </span>
                  </div>
                </div>

                {/* Rails */}
                <div className="flex justify-between items-center">
                  <span>
                    {(() => {
                      const feature = featureDefs.find(
                        (f) => f.id === 'rail_accessory'
                      );
                      console.log(
                        '🔧 Rails feature found:',
                        !!feature,
                        feature?.displayName
                      );
                      return feature?.displayName || 'Rails';
                    })()}
                    :
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {(() => {
                        const currentRails = features.rail_accessory || [];

                        console.log('🔧 Rails state debug:', {
                          'features.rail_accessory': features.rail_accessory,
                          currentRails,
                          featureDefsCount: featureDefs.length,
                        });

                        if (currentRails && currentRails.length > 0) {
                          const feature = featureDefs.find(
                            (f) => f.id === 'rail_accessory'
                          );
                          if (!feature?.options) {
                            console.log(
                              '🔧 Rails feature found but no options:',
                              feature
                            );
                            return currentRails.join(', ');
                          }
                          const labels = Array.isArray(currentRails)
                            ? currentRails.map((optionValue: string) => {
                                const option = feature.options!.find(
                                  (opt) => opt.value === optionValue
                                );
                                console.log(
                                  '🔧 Rails option lookup:',
                                  optionValue,
                                  '→',
                                  option?.label
                                );
                                return option?.label || optionValue;
                              })
                            : [];
                          return labels.join(', ');
                        }
                        return 'Not selected';
                      })()}
                    </span>
                    <span className="text-blue-600 font-bold">
                      $
                      {(() => {
                        const currentRails = features.rail_accessory || [];

                        if (currentRails && currentRails.length > 0) {
                          const feature = featureDefs.find(
                            (f) => f.id === 'rail_accessory'
                          );
                          if (!feature?.options) return '0.00';
                          const totalPrice = Array.isArray(currentRails)
                            ? currentRails.reduce(
                                (sum: number, optionValue: string) => {
                                  const option = feature.options!.find(
                                    (opt) => opt.value === optionValue
                                  );
                                  return sum + (option?.price || 0);
                                },
                                0
                              )
                            : 0;
                          return totalPrice.toFixed(2);
                        }
                        return '0.00';
                      })()}
                    </span>
                  </div>
                </div>

                {/* Texture */}
                <div className="flex justify-between items-center">
                  <span>
                    {(() => {
                      const feature = featureDefs.find(
                        (f) =>
                          f.id === 'texture_options' ||
                          f.name === 'texture_options'
                      );
                      return feature?.displayName || 'Texture';
                    })()}
                    :
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {features.texture_options
                        ? (() => {
                            const feature = featureDefs.find(
                              (f) =>
                                f.id === 'texture_options' ||
                                f.name === 'texture_options'
                            );
                            const option = feature?.options?.find(
                              (opt) => opt.value === features.texture_options
                            );
                            return option?.label || 'Not selected';
                          })()
                        : 'Not selected'}
                    </span>
                    <span className="text-blue-600 font-bold">
                      $
                      {features.texture_options
                        ? (() => {
                            const feature = featureDefs.find(
                              (f) =>
                                f.id === 'texture_options' ||
                                f.name === 'texture_options'
                            );
                            const option = feature?.options?.find(
                              (opt) => opt.value === features.texture_options
                            );
                            return (option?.price || 0).toFixed(2);
                          })()
                        : '0.00'}
                    </span>
                  </div>
                </div>

                {/* Swivel Studs */}
                <div className="flex justify-between items-center">
                  <span>
                    {(() => {
                      const feature = featureDefs.find(
                        (f) =>
                          f.id === 'swivel_studs' || f.name === 'swivel_studs'
                      );
                      return feature?.displayName || 'Swivel Studs';
                    })()}
                    :
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {features.swivel_studs
                        ? (() => {
                            const feature = featureDefs.find(
                              (f) =>
                                f.id === 'swivel_studs' ||
                                f.name === 'swivel_studs'
                            );
                            const option = feature?.options?.find(
                              (opt) => opt.value === features.swivel_studs
                            );
                            return option?.label || 'Not selected';
                          })()
                        : 'Not selected'}
                    </span>
                    <span className="text-blue-600 font-bold">
                      $
                      {features.swivel_studs
                        ? (() => {
                            const feature = featureDefs.find(
                              (f) =>
                                f.id === 'swivel_studs' ||
                                f.name === 'swivel_studs'
                            );
                            const option = feature?.options?.find(
                              (opt) => opt.value === features.swivel_studs
                            );
                            return (option?.price || 0).toFixed(2);
                          })()
                        : '0.00'}
                    </span>
                  </div>
                </div>

                {/* Other Options */}
                <div className="flex justify-between items-center">
                  <span>
                    {(() => {
                      const feature = featureDefs.find(
                        (f) => f.id === 'other_options'
                      );
                      return feature?.displayName || 'Other Options';
                    })()}
                    :
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {features.other_options &&
                      features.other_options.length > 0
                        ? (() => {
                            const feature = featureDefs.find(
                              (f) => f.id === 'other_options'
                            );
                            if (!feature?.options)
                              return features.other_options.join(', ');
                            const labels = features.other_options.map(
                              (optionValue: string) => {
                                const option = feature.options!.find(
                                  (opt) => opt.value === optionValue
                                );
                                const quantity =
                                  otherOptionsQuantities[optionValue] || 1;
                                const baseLabel = option?.label || optionValue;
                                const showQuantity = !option?.label
                                  ?.toLowerCase()
                                  .includes('no');
                                return showQuantity && quantity > 1
                                  ? `${baseLabel} (${quantity})`
                                  : baseLabel;
                              }
                            );
                            return labels.join(', ');
                          })()
                        : 'Not selected'}
                    </span>
                    <span className="text-blue-600 font-bold">
                      $
                      {features.other_options &&
                      features.other_options.length > 0
                        ? (() => {
                            const feature = featureDefs.find(
                              (f) => f.id === 'other_options'
                            );
                            if (!feature?.options) return '0.00';
                            const totalPrice = features.other_options.reduce(
                              (sum: number, optionValue: string) => {
                                const option = feature.options!.find(
                                  (opt) => opt.value === optionValue
                                );
                                const quantity =
                                  otherOptionsQuantities[optionValue] || 1;
                                return sum + (option?.price || 0) * quantity;
                              },
                              0
                            );
                            return totalPrice.toFixed(2);
                          })()
                        : '0.00'}
                    </span>
                  </div>
                </div>

                {/* Paint Options */}
                <div className="flex justify-between items-center">
                  <span>Paint Options:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {(() => {
                        const currentPaint =
                          features.metallic_finishes ||
                          features.paint_options ||
                          features.paint_options_combined;

                        console.log('🎨 Paint state debug:', {
                          'features.metallic_finishes':
                            features.metallic_finishes,
                          'features.paint_options': features.paint_options,
                          'features.paint_options_combined':
                            features.paint_options_combined,
                          currentPaint,
                          featureDefsCount: featureDefs.length,
                        });

                        if (currentPaint && currentPaint !== 'none') {
                          // Search through ALL paint-related features to find the matching option
                          const paintFeatures = featureDefs.filter(
                            (f) =>
                              f.displayName?.includes('Options') ||
                              f.displayName?.includes('Camo') ||
                              f.displayName?.includes('Cerakote') ||
                              f.displayName?.includes('Terrain') ||
                              f.displayName?.includes('Rogue') ||
                              f.displayName?.includes('Standard') ||
                              f.id === 'metallic_finishes' ||
                              f.name === 'metallic_finishes' ||
                              f.category === 'paint' ||
                              f.subcategory === 'paint'
                          );

                          console.log(
                            '🎨 Paint features found:',
                            paintFeatures.length,
                            paintFeatures.map((f) => ({
                              id: f.id,
                              displayName: f.displayName,
                              optionsCount: f.options?.length,
                            }))
                          );

                          for (const feature of paintFeatures) {
                            if (feature.options) {
                              const option = feature.options.find(
                                (opt) => opt.value === currentPaint
                              );
                              if (option) {
                                console.log(
                                  '🎨 Paint option found:',
                                  currentPaint,
                                  '→',
                                  option.label,
                                  '$' + option.price
                                );
                                return option.label;
                              }
                            }
                          }
                          console.log(
                            '🎨 Paint option not found for value:',
                            currentPaint
                          );
                          return 'Selected';
                        }
                        return 'Not selected';
                      })()}
                    </span>
                    <span className="text-blue-600 font-bold">
                      $
                      {(() => {
                        const currentPaint =
                          features.metallic_finishes ||
                          features.paint_options ||
                          features.paint_options_combined;

                        if (currentPaint && currentPaint !== 'none') {
                          // Search through ALL paint-related features to find the matching option
                          const paintFeatures = featureDefs.filter(
                            (f) =>
                              f.displayName?.includes('Options') ||
                              f.displayName?.includes('Camo') ||
                              f.displayName?.includes('Cerakote') ||
                              f.displayName?.includes('Terrain') ||
                              f.displayName?.includes('Rogue') ||
                              f.displayName?.includes('Standard') ||
                              f.id === 'metallic_finishes' ||
                              f.name === 'metallic_finishes' ||
                              f.category === 'paint' ||
                              f.subcategory === 'paint'
                          );

                          for (const feature of paintFeatures) {
                            if (feature.options) {
                              const option = feature.options.find(
                                (opt) => opt.value === currentPaint
                              );
                              if (option) {
                                return (option.price || 0).toFixed(2);
                              }
                            }
                          }
                          return '0.00';
                        }
                        return '0.00';
                      })()}
                    </span>
                  </div>
                </div>

                {/* Miscellaneous Items */}
                {miscItems.length > 0 && (
                  <div className="border-t pt-3 mt-3">
                    <div className="font-medium text-base mb-2">
                      Miscellaneous Items
                    </div>
                    <div className="space-y-2">
                      {miscItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between items-center text-sm"
                        >
                          <div className="flex-1">
                            <div className="font-medium">
                              {item.description || 'Untitled Item'}
                            </div>
                            <div className="text-gray-500">
                              Qty: {item.quantity} × $
                              {item.unitPrice.toFixed(2)}
                            </div>
                          </div>
                          <span className="text-blue-600 font-bold">
                            ${item.total.toFixed(2)}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center font-medium pt-2 border-t">
                        <span>Misc Items Total:</span>
                        <span className="text-blue-600 font-bold">
                          $
                          {miscItems
                            .reduce((sum, item) => sum + item.total, 0)
                            .toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Discount Code */}
              <div className="border-t pt-4">
                <div className="font-medium text-base mb-2">Discount Code</div>
                <Select
                  value={discountCode}
                  onValueChange={(value) => {
                    setDiscountCode(value);
                    // Handle custom discount selection
                    if (value === 'custom') {
                      setShowCustomDiscount(true);
                      setDiscountDetails(null);
                    } else {
                      setShowCustomDiscount(false);
                      // Load discount details when selection changes
                      if (value && value !== 'none') {
                        const loadDiscountDetails = async () => {
                          try {
                            if (value.startsWith('persistent_')) {
                              const discountId = value.replace(
                                'persistent_',
                                ''
                              );
                              const persistentDiscounts = await apiRequest(
                                '/api/discounts/persistent-discounts'
                              );
                              const discount = persistentDiscounts.find(
                                (d: any) => d.id.toString() === discountId
                              );
                              setDiscountDetails(discount || null);
                            } else if (value.startsWith('short_term_')) {
                              const saleId = value.replace('short_term_', '');
                              const shortTermSales = await apiRequest(
                                '/api/discounts/short-term-sales'
                              );
                              const sale = shortTermSales.find(
                                (s: any) => s.id.toString() === saleId
                              );
                              setDiscountDetails(
                                sale
                                  ? {
                                      ...sale,
                                      appliesTo:
                                        sale.appliesTo || 'total_order',
                                    }
                                  : null
                              );
                            }
                          } catch (error) {
                            console.error(
                              'Failed to load discount details:',
                              error
                            );
                            setDiscountDetails(null);
                          }
                        };
                        loadDiscountDetails();
                      } else {
                        setDiscountDetails(null);
                      }
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select discount code" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No discount</SelectItem>
                    {discountOptions.map((discount) => (
                      <SelectItem key={discount.value} value={discount.value}>
                        {discount.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Show what the discount applies to */}
                {discountDetails && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Applies to:{' '}
                    {discountDetails.appliesTo === 'stock_model'
                      ? 'Stock Model Only'
                      : 'Total Order'}
                  </div>
                )}

                {/* Custom Discount Fields */}
                {showCustomDiscount && (
                  <div className="mt-3 p-3 border rounded-lg bg-gray-50 space-y-3">
                    <div className="text-sm font-medium">
                      Custom Discount Amount
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="custom-discount-type">Type</Label>
                        <Select
                          value={customDiscountType}
                          onValueChange={(value: 'percent' | 'amount') =>
                            setCustomDiscountType(value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">
                              Percentage (%)
                            </SelectItem>
                            <SelectItem value="amount">
                              Fixed Amount ($)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="custom-discount-value">
                          {customDiscountType === 'percent'
                            ? 'Percentage'
                            : 'Amount ($)'}
                        </Label>
                        <Input
                          id="custom-discount-value"
                          type="number"
                          step={customDiscountType === 'percent' ? '1' : '0.01'}
                          min="0"
                          max={
                            customDiscountType === 'percent' ? '100' : undefined
                          }
                          placeholder={
                            customDiscountType === 'percent'
                              ? 'e.g., 10'
                              : 'e.g., 123.45'
                          }
                          value={customDiscountValue || ''}
                          onChange={(e) =>
                            setCustomDiscountValue(
                              parseFloat(e.target.value) || 0
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {customDiscountType === 'percent'
                        ? `${customDiscountValue}% off the subtotal`
                        : `$${customDiscountValue.toFixed(2)} off the subtotal`}
                    </div>
                  </div>
                )}
              </div>

              {/* Shipping & Handling */}
              <div className="border-t pt-4">
                <div className="font-medium text-base mb-2">
                  Shipping & Handling
                </div>
                <input
                  type="number"
                  placeholder="36.95"
                  value={shipping}
                  onChange={(e) => setShipping(parseFloat(e.target.value) || 0)}
                  className="w-full p-3 border rounded-lg"
                  step="0.01"
                />
              </div>

              {/* Order Totals */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Subtotal:</span>
                  <span className="font-bold">
                    {formatCurrency(subtotalPrice)}
                  </span>
                </div>

                {/* Display selected discount - Enhanced confirmation indicator */}
                {hasStructuredDiscount && discountAmount > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-green-600 text-sm">✓</span>
                      <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                        Discount Applied
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-green-700 text-sm">
                        {showCustomDiscount && customDiscountValue 
                          ? (customDiscountType === 'percent' 
                              ? `Custom (${customDiscountValue}%)` 
                              : 'Custom Discount')
                          : discountOptions.find((d) => d.value === discountCode)?.label || 'Discount'}
                      </span>
                      <span className="font-bold text-green-700">
                        -{formatCurrency(discountAmount)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="font-medium">Shipping & Handling:</span>
                  <span className="font-bold">{formatCurrency(shipping)}</span>
                </div>
                <div className="flex justify-between items-center text-lg border-t pt-2">
                  <span className="font-bold">Total:</span>
                  <span className="font-bold text-blue-600">
                    {formatCurrency(totalPrice + shipping)}
                  </span>
                </div>
              </div>

              {/* Customer Credits Indicator */}
              {customer && (
                <CustomerCreditIndicator
                  customerId={customer.id}
                  orderId={orderId}
                  orderTotal={totalPrice + shipping}
                  onCreditApplied={() => {
                    queryClient.invalidateQueries({ queryKey: ['/api/payments'] });
                  }}
                />
              )}

              {/* Refunds & Credits Applied Section */}
              <OrderRefundsSection orderId={orderId} />

              {/* Payment Management Section */}
              {orderId && orderId !== 'Loading...' && (
                <div className="border-t pt-4">
                  <PaymentManager
                    orderId={orderId}
                    totalAmount={totalPrice + shipping}
                    customerInfo={customer}
                    onPaymentsChange={setOrderPayments}
                    isInline={true}
                    isOrderSaved={isEditMode}
                    onSaveForPayment={handleSaveForPayment}
                  />
                </div>
              )}

              {/* Verified Checkbox */}
              <div id="review-intake" className="flex items-center space-x-2 pt-4 pb-2 scroll-mt-28">
                <input
                  type="checkbox"
                  id="verified-checkbox"
                  checked={isVerified}
                  onChange={(e) => setIsVerified(e.target.checked)}
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                />
                <label
                  htmlFor="verified-checkbox"
                  className="text-sm font-medium text-gray-900 dark:text-gray-100"
                >
                  Verified against previous ERP
                </label>
              </div>

              {/* Action Buttons */}
              <div className="order-console-actions space-y-2">
                <Button
                  type="button"
                  className="w-full"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => handleSubmit(undefined, true)}
                >
                  {isSubmitting ? 'Saving...' : 'Save as Draft'}
                </Button>
                <Button
                  type="button"
                  className="w-full"
                  variant="default"
                  disabled={isSubmitting}
                  onClick={() => handleSubmit(undefined, false)}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : isEditMode ? (
                    'Update Order'
                  ) : (
                    'Create Order'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* QD Same-Side Confirmation Modal */}
      <AlertDialog open={showQdSameSideModal} onOpenChange={setShowQdSameSideModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <span className="text-2xl">⚠️</span>
              QD Same-Side Configuration Warning
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                The QD accessory is on the <span className="font-bold">same side</span> as the stock handedness.
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                Normally, QDs are placed on the <span className="font-bold">opposite side</span> of the stock compared to the handedness. 
                For example, a Left-Handed stock would typically have QDs on the Right side.
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                This configuration is <span className="font-bold">unusual</span> and may be intentional if the customer specifically requested it.
              </p>
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="qd-confirmation-checkbox"
                    checked={qdSameSideConfirmed}
                    onCheckedChange={(checked) => setQdSameSideConfirmed(checked === true)}
                    data-testid="checkbox-qd-confirmation"
                  />
                  <label
                    htmlFor="qd-confirmation-checkbox"
                    className="text-sm font-medium text-amber-800 dark:text-amber-200 cursor-pointer"
                  >
                    I have confirmed with the customer that they want the QD on the same side as the handedness.
                  </label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleQdConfirmCancel} data-testid="button-qd-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleQdConfirmAndSubmit}
              disabled={!qdSameSideConfirmed}
              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-qd-confirm-proceed"
            >
              Confirm & Proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ForecastDateModal
        open={forecastModalOpen}
        onClose={() => setForecastModalOpen(false)}
        onSelectDate={(date, isManual) => {
          setDueDate(date);
          setIsManualDueDate(isManual);
          if (!isManual) {
            setBaseDueDate(date);
          }
        }}
        forecastData={mappedForecastData}
        isLoading={isForecastLoading}
        error={forecastError}
      />
    </div>
  );
}

function OrderAttachmentsSection({ orderId }: { orderId: string }) {
  const { data: attachments = [] } = useQuery<any[]>({
    queryKey: ['order-attachments', orderId],
    queryFn: () => apiRequest(`/api/order-attachments/${orderId}`),
    enabled: !!orderId,
  });

  const count = attachments.length;
  const hasAttachments = count > 0;

  return (
    <div className="mt-6">
      <Accordion type="single" collapsible defaultValue={hasAttachments ? 'attachments' : undefined} className="w-full">
        <AccordionItem value="attachments" className={hasAttachments ? 'border-blue-300 bg-blue-50/50 rounded-lg' : ''}>
          <AccordionTrigger className="text-left px-3">
            <div className="flex items-center gap-2">
              <Paperclip className={`h-4 w-4 ${hasAttachments ? 'text-blue-600' : 'text-gray-400'}`} />
              <span className="font-medium">Order Attachments</span>
              {hasAttachments && (
                <Badge variant="default" className="bg-blue-600 hover:bg-blue-600 text-white text-xs px-2 py-0.5">
                  {count} file{count !== 1 ? 's' : ''} attached
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-3">
            <OrderAttachments orderId={orderId} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
