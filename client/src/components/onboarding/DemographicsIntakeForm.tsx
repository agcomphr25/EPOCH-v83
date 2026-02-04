import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  CheckCircle2, User, Mail, Phone, MapPin, Car, CreditCard, Loader2, 
  AlertCircle, Lock, Camera, Upload, Shield, Calendar, IdCard, Building2,
  SkipForward, RotateCcw
} from 'lucide-react';

interface DemographicsData {
  firstName: string;
  lastName: string;
  preferredName: string;
  email: string;
  phone: string;
  address: string;
  aptUnit: string;
  city: string;
  state: string;
  zipCode: string;
  vehicleType: string;
  vehicleColor: string;
  vehicleMakeModel: string;
  driversLicenseNumber: string;
  driversLicenseState: string;
  driversLicenseExpiration: string;
  driversLicensePhotoId: string | null;
  bankName: string;
  bankRoutingNumber: string;
  bankAccountNumber: string;
  bankAccountType: string;
  voidedCheckPhotoId: string | null;
  skippedSections: string[];
}

interface DemographicsIntakeFormProps {
  sessionId: string;
  isCompleted?: boolean;
  isLocked?: boolean;
  onComplete?: (data: DemographicsData) => void;
  onSaveForLater?: () => void;
}

const INITIAL_DEMOGRAPHICS: DemographicsData = {
  firstName: '',
  lastName: '',
  preferredName: '',
  email: '',
  phone: '',
  address: '',
  aptUnit: '',
  city: '',
  state: '',
  zipCode: '',
  vehicleType: '',
  vehicleColor: '',
  vehicleMakeModel: '',
  driversLicenseNumber: '',
  driversLicenseState: '',
  driversLicenseExpiration: '',
  driversLicensePhotoId: null,
  bankName: '',
  bankRoutingNumber: '',
  bankAccountNumber: '',
  bankAccountType: '',
  voidedCheckPhotoId: null,
  skippedSections: [],
};

const VEHICLE_TYPES = [
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV / Crossover' },
  { value: 'truck', label: 'Truck' },
  { value: 'van', label: 'Van / Minivan' },
  { value: 'coupe', label: 'Coupe' },
  { value: 'hatchback', label: 'Hatchback' },
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'other', label: 'Other' },
];

const VEHICLE_COLORS = [
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
  { value: 'silver', label: 'Silver' },
  { value: 'gray', label: 'Gray' },
  { value: 'red', label: 'Red' },
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'brown', label: 'Brown / Tan' },
  { value: 'gold', label: 'Gold / Beige' },
  { value: 'orange', label: 'Orange' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'purple', label: 'Purple' },
  { value: 'other', label: 'Other' },
];

const SECTION_IDS = {
  BASIC: 'basic_info',
  ADDRESS: 'home_address',
  TRANSPORTATION: 'transportation',
  IDENTIFICATION: 'identification',
  PAYROLL: 'payroll',
};

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

function SensitiveLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Lock className="h-3.5 w-3.5 text-amber-600" />
      <span className="text-sm text-amber-700 font-medium">Sensitive</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}

function PhotoUploadButton({ 
  label, 
  hasPhoto, 
  onCapture,
  onUpload,
  isCapturing 
}: { 
  label: string;
  hasPhoto: boolean;
  onCapture: () => void;
  onUpload: () => void;
  isCapturing?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm text-gray-600">{label}</Label>
      <div className="flex gap-2">
        <Button
          type="button"
          variant={hasPhoto ? "secondary" : "outline"}
          className="flex-1 h-14 text-base"
          onClick={onCapture}
          disabled={isCapturing}
        >
          {isCapturing ? (
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          ) : (
            <Camera className="h-5 w-5 mr-2" />
          )}
          {hasPhoto ? 'Retake Photo' : 'Take Photo'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-14 px-4"
          onClick={onUpload}
        >
          <Upload className="h-5 w-5" />
        </Button>
      </div>
      {hasPhoto && (
        <p className="text-sm text-green-600 flex items-center gap-1">
          <CheckCircle2 className="h-4 w-4" />
          Photo captured
        </p>
      )}
    </div>
  );
}

export default function DemographicsIntakeForm({
  sessionId,
  isCompleted = false,
  isLocked = false,
  onComplete,
  onSaveForLater,
}: DemographicsIntakeFormProps) {
  const { toast } = useToast();
  const [data, setData] = useState<DemographicsData>(INITIAL_DEMOGRAPHICS);
  const [showAccountNumber, setShowAccountNumber] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const dlFileInputRef = useRef<HTMLInputElement>(null);
  const checkFileInputRef = useRef<HTMLInputElement>(null);
  const lastFetchedRef = useRef<string | null>(null);

  const { data: fetchedData, isLoading: isFetching } = useQuery<{
    demographicsData: DemographicsData | null;
    isRehire: boolean;
    source: string;
  }>({
    queryKey: ['/api/onboarding/sessions', sessionId, 'demographics'],
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (fetchedData?.demographicsData) {
      const fetchedJson = JSON.stringify(fetchedData.demographicsData);
      if (lastFetchedRef.current !== fetchedJson) {
        setData({ ...INITIAL_DEMOGRAPHICS, ...fetchedData.demographicsData });
        lastFetchedRef.current = fetchedJson;
      }
    }
  }, [fetchedData]);

  const saveMutation = useMutation({
    mutationFn: async (demographics: DemographicsData) => {
      return apiRequest(`/api/onboarding/sessions/${sessionId}/demographics`, {
        method: 'PATCH',
        body: JSON.stringify(demographics),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/sessions', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/sessions', sessionId, 'demographics'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to save demographics', 
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateField = (field: keyof DemographicsData, value: string | null) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const toggleSkipSection = (sectionId: string) => {
    setData(prev => {
      const skipped = prev.skippedSections || [];
      if (skipped.includes(sectionId)) {
        return { ...prev, skippedSections: skipped.filter(s => s !== sectionId) };
      } else {
        return { ...prev, skippedSections: [...skipped, sectionId] };
      }
    });
  };

  const isSectionSkipped = (sectionId: string) => {
    return (data.skippedSections || []).includes(sectionId);
  };

  const skippedCount = (data.skippedSections || []).length;
  const isValid = data.firstName.trim() && data.lastName.trim() && data.email.trim() && data.phone.trim();

  const handleSaveAndContinue = async () => {
    if (!isValid) {
      toast({
        title: 'Required fields missing',
        description: 'Please fill in all required fields (Full Name, Email, Phone)',
        variant: 'destructive',
      });
      return;
    }
    await saveMutation.mutateAsync(data);
    toast({ title: 'Demographics saved successfully' });
    onComplete?.(data);
  };

  const handleSaveForLater = async () => {
    await saveMutation.mutateAsync(data);
    toast({ title: 'Progress saved' });
    onSaveForLater?.();
  };

  const handleDLPhotoCapture = () => {
    toast({ title: 'Camera capture', description: 'Opening camera for driver\'s license photo...' });
  };

  const handleDLPhotoUpload = () => {
    dlFileInputRef.current?.click();
  };

  const handleCheckPhotoCapture = () => {
    toast({ title: 'Camera capture', description: 'Opening camera for voided check photo...' });
  };

  const handleCheckPhotoUpload = () => {
    checkFileInputRef.current?.click();
  };

  if (isFetching) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-500" />
          <p className="mt-4 text-lg text-gray-600">Loading employee information...</p>
        </div>
      </div>
    );
  }

  if (isLocked) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <Lock className="h-12 w-12 text-amber-600" />
            <div>
              <p className="text-lg font-medium text-amber-800">Step Locked</p>
              <p className="text-amber-600 mt-1">
                Please complete the Digital Signature Authorization step first.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isCompleted && !isEditing) {
    const hasSkippedSections = skippedCount > 0;
    return (
      <Card className={hasSkippedSections ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}>
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-4 text-center">
            {hasSkippedSections ? (
              <AlertCircle className="h-12 w-12 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-12 w-12 text-green-600" />
            )}
            <div>
              <p className={`text-lg font-medium ${hasSkippedSections ? 'text-amber-800' : 'text-green-800'}`}>
                {hasSkippedSections ? 'Demographics Saved - Sections Pending' : 'Demographics Completed'}
              </p>
              <p className={hasSkippedSections ? "text-amber-600 mt-1" : "text-green-600 mt-1"}>
                {data.firstName} {data.lastName} - {data.email}
              </p>
              {hasSkippedSections && (
                <p className="text-sm text-amber-700 mt-3 bg-amber-100 rounded-lg px-4 py-2">
                  {skippedCount} section{skippedCount > 1 ? 's' : ''} skipped - can be completed later
                </p>
              )}
            </div>
            <Button 
              onClick={() => setIsEditing(true)}
              variant={hasSkippedSections ? "default" : "outline"}
              className={hasSkippedSections ? "mt-4 h-12 px-6 bg-amber-600 hover:bg-amber-700" : "mt-4 h-12 px-6"}
            >
              {hasSkippedSections ? 'Complete Skipped Sections' : 'Edit Information'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isRehire = fetchedData?.isRehire || false;

  return (
    <div className="pb-40">
      {isRehire && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-base font-medium text-blue-800">Re-Hire: Verify Information</p>
              <p className="text-sm text-blue-600 mt-1">
                The fields below are pre-filled from this employee's previous record.
                Please verify and update any information that has changed.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <Card className="shadow-sm border-gray-200">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <User className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-xl">Basic Information</CardTitle>
                <CardDescription className="text-sm">Employee identification details</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-base font-medium">
                  First Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="firstName"
                  value={data.firstName}
                  onChange={(e) => updateField('firstName', e.target.value)}
                  placeholder="Legal first name"
                  className="h-14 text-lg px-4"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-base font-medium">
                  Last Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="lastName"
                  value={data.lastName}
                  onChange={(e) => updateField('lastName', e.target.value)}
                  placeholder="Legal last name"
                  className="h-14 text-lg px-4"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferredName" className="text-base font-medium">
                Preferred Name <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <Input
                id="preferredName"
                value={data.preferredName}
                onChange={(e) => updateField('preferredName', e.target.value)}
                placeholder="Name you go by"
                className="h-14 text-lg px-4"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-base font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-500" />
                  Email Address <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={data.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="email@example.com"
                  className="h-14 text-lg px-4"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-base font-medium flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-500" />
                  Phone Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={data.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="(555) 123-4567"
                  className="h-14 text-lg px-4"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-gray-200">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <MapPin className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <CardTitle className="text-xl">Home Address</CardTitle>
                <CardDescription className="text-sm">Current residential address</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              <div className="md:col-span-3 space-y-2">
                <Label htmlFor="address" className="text-base font-medium">Street Address</Label>
                <Input
                  id="address"
                  value={data.address}
                  onChange={(e) => updateField('address', e.target.value)}
                  placeholder="123 Main Street"
                  className="h-14 text-lg px-4"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="aptUnit" className="text-base font-medium">
                  Apt / Unit <span className="text-gray-400 font-normal">(opt.)</span>
                </Label>
                <Input
                  id="aptUnit"
                  value={data.aptUnit}
                  onChange={(e) => updateField('aptUnit', e.target.value)}
                  placeholder="#101"
                  className="h-14 text-lg px-4"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="city" className="text-base font-medium">City</Label>
                <Input
                  id="city"
                  value={data.city}
                  onChange={(e) => updateField('city', e.target.value)}
                  placeholder="Anytown"
                  className="h-14 text-lg px-4"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state" className="text-base font-medium">State</Label>
                <Select value={data.state} onValueChange={(v) => updateField('state', v)}>
                  <SelectTrigger className="h-14 text-lg">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map(state => (
                      <SelectItem key={state} value={state} className="text-lg py-3">
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="zipCode" className="text-base font-medium">ZIP Code</Label>
                <Input
                  id="zipCode"
                  value={data.zipCode}
                  onChange={(e) => updateField('zipCode', e.target.value)}
                  placeholder="12345"
                  className="h-14 text-lg px-4"
                  maxLength={10}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`shadow-sm ${isSectionSkipped(SECTION_IDS.TRANSPORTATION) ? 'border-gray-300 bg-gray-50 opacity-75' : 'border-gray-200'}`}>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isSectionSkipped(SECTION_IDS.TRANSPORTATION) ? 'bg-gray-200' : 'bg-purple-100'}`}>
                <Car className={`h-6 w-6 ${isSectionSkipped(SECTION_IDS.TRANSPORTATION) ? 'text-gray-500' : 'text-purple-600'}`} />
              </div>
              <div className="flex-1">
                <CardTitle className="text-xl flex items-center gap-2">
                  Transportation
                  {isSectionSkipped(SECTION_IDS.TRANSPORTATION) && (
                    <span className="text-xs font-medium text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">Skipped</span>
                  )}
                </CardTitle>
                <CardDescription className="text-sm">Vehicle information for parking</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => toggleSkipSection(SECTION_IDS.TRANSPORTATION)}
                className="h-10 px-4"
              >
                {isSectionSkipped(SECTION_IDS.TRANSPORTATION) ? (
                  <>
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Fill Later
                  </>
                ) : (
                  <>
                    <SkipForward className="h-4 w-4 mr-1" />
                    Skip
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          {!isSectionSkipped(SECTION_IDS.TRANSPORTATION) && (
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-2">
                <Label htmlFor="vehicleType" className="text-base font-medium">Vehicle Type</Label>
                <Select value={data.vehicleType} onValueChange={(v) => updateField('vehicleType', v)}>
                  <SelectTrigger className="h-14 text-lg">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value} className="text-lg py-3">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vehicleColor" className="text-base font-medium">Vehicle Color</Label>
                <Select value={data.vehicleColor} onValueChange={(v) => updateField('vehicleColor', v)}>
                  <SelectTrigger className="h-14 text-lg">
                    <SelectValue placeholder="Select color" />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_COLORS.map(color => (
                      <SelectItem key={color.value} value={color.value} className="text-lg py-3">
                        {color.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vehicleMakeModel" className="text-base font-medium">
                  Make / Model <span className="text-gray-400 font-normal">(opt)</span>
                </Label>
                <Input
                  id="vehicleMakeModel"
                  value={data.vehicleMakeModel}
                  onChange={(e) => updateField('vehicleMakeModel', e.target.value)}
                  placeholder="Toyota Camry"
                  className="h-14 text-lg px-4"
                />
              </div>
            </div>
          </CardContent>
          )}
        </Card>

        <Card className={`shadow-sm ${isSectionSkipped(SECTION_IDS.IDENTIFICATION) ? 'border-gray-300 bg-gray-50 opacity-75' : 'border-amber-200 bg-amber-50/30'}`}>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isSectionSkipped(SECTION_IDS.IDENTIFICATION) ? 'bg-gray-200' : 'bg-amber-100'}`}>
                <IdCard className={`h-6 w-6 ${isSectionSkipped(SECTION_IDS.IDENTIFICATION) ? 'text-gray-500' : 'text-amber-600'}`} />
              </div>
              <div className="flex-1">
                <CardTitle className="text-xl flex items-center gap-2">
                  Identification
                  {isSectionSkipped(SECTION_IDS.IDENTIFICATION) && (
                    <span className="text-xs font-medium text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">Skipped</span>
                  )}
                </CardTitle>
                <CardDescription className="text-sm">Driver's license information</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleSkipSection(SECTION_IDS.IDENTIFICATION)}
                  className="h-10 px-4"
                >
                  {isSectionSkipped(SECTION_IDS.IDENTIFICATION) ? (
                    <>
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Fill Later
                    </>
                  ) : (
                    <>
                      <SkipForward className="h-4 w-4 mr-1" />
                      Skip
                    </>
                  )}
                </Button>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 rounded-full">
                  <Shield className="h-4 w-4 text-amber-700" />
                  <span className="text-sm font-medium text-amber-700">Sensitive</span>
                </div>
              </div>
            </div>
          </CardHeader>
          {!isSectionSkipped(SECTION_IDS.IDENTIFICATION) && (
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-2">
                <Label htmlFor="driversLicenseNumber" className="text-base font-medium">
                  Driver's License Number
                </Label>
                <Input
                  id="driversLicenseNumber"
                  value={data.driversLicenseNumber}
                  onChange={(e) => updateField('driversLicenseNumber', e.target.value)}
                  placeholder="D1234567"
                  className="h-14 text-lg px-4 bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="driversLicenseState" className="text-base font-medium">State of Issue</Label>
                <Select value={data.driversLicenseState} onValueChange={(v) => updateField('driversLicenseState', v)}>
                  <SelectTrigger className="h-14 text-lg bg-white">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map(state => (
                      <SelectItem key={state} value={state} className="text-lg py-3">
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="driversLicenseExpiration" className="text-base font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  Expiration Date
                </Label>
                <Input
                  id="driversLicenseExpiration"
                  type="date"
                  value={data.driversLicenseExpiration}
                  onChange={(e) => updateField('driversLicenseExpiration', e.target.value)}
                  className="h-14 text-lg px-4 bg-white"
                />
              </div>
            </div>
            <div className="pt-2">
              <PhotoUploadButton
                label="Driver's License Photo (optional)"
                hasPhoto={!!data.driversLicensePhotoId}
                onCapture={handleDLPhotoCapture}
                onUpload={handleDLPhotoUpload}
              />
              <input
                ref={dlFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    toast({ title: 'Photo selected', description: 'Uploading driver\'s license photo...' });
                    updateField('driversLicensePhotoId', 'placeholder-dl-photo');
                  }
                }}
              />
            </div>
          </CardContent>
          )}
        </Card>

        <Card className={`shadow-sm ${isSectionSkipped(SECTION_IDS.PAYROLL) ? 'border-gray-300 bg-gray-50 opacity-75' : 'border-amber-200 bg-amber-50/30'}`}>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isSectionSkipped(SECTION_IDS.PAYROLL) ? 'bg-gray-200' : 'bg-amber-100'}`}>
                <Building2 className={`h-6 w-6 ${isSectionSkipped(SECTION_IDS.PAYROLL) ? 'text-gray-500' : 'text-amber-600'}`} />
              </div>
              <div className="flex-1">
                <CardTitle className="text-xl flex items-center gap-2">
                  Payroll Information
                  {isSectionSkipped(SECTION_IDS.PAYROLL) && (
                    <span className="text-xs font-medium text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">Skipped</span>
                  )}
                </CardTitle>
                <CardDescription className="text-sm">For direct deposit setup</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleSkipSection(SECTION_IDS.PAYROLL)}
                  className="h-10 px-4"
                >
                  {isSectionSkipped(SECTION_IDS.PAYROLL) ? (
                    <>
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Fill Later
                    </>
                  ) : (
                    <>
                      <SkipForward className="h-4 w-4 mr-1" />
                      Skip Section
                    </>
                  )}
                </Button>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 rounded-full">
                  <Shield className="h-4 w-4 text-amber-700" />
                  <span className="text-sm font-medium text-amber-700">Sensitive</span>
                </div>
              </div>
            </div>
          </CardHeader>
          {!isSectionSkipped(SECTION_IDS.PAYROLL) && (
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="bankName" className="text-base font-medium">Bank Name</Label>
                <Input
                  id="bankName"
                  value={data.bankName}
                  onChange={(e) => updateField('bankName', e.target.value)}
                  placeholder="First National Bank"
                  className="h-14 text-lg px-4 bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankAccountType" className="text-base font-medium">Account Type</Label>
                <Select value={data.bankAccountType} onValueChange={(v) => updateField('bankAccountType', v)}>
                  <SelectTrigger className="h-14 text-lg bg-white">
                    <SelectValue placeholder="Select account type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checking" className="text-lg py-3">Checking</SelectItem>
                    <SelectItem value="savings" className="text-lg py-3">Savings</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="bankRoutingNumber" className="text-base font-medium">Routing Number</Label>
                <Input
                  id="bankRoutingNumber"
                  value={data.bankRoutingNumber}
                  onChange={(e) => updateField('bankRoutingNumber', e.target.value)}
                  placeholder="123456789"
                  className="h-14 text-lg px-4 bg-white font-mono"
                  maxLength={9}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankAccountNumber" className="text-base font-medium flex items-center justify-between">
                  <span>Account Number</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAccountNumber(!showAccountNumber)}
                    className="h-auto py-1 px-2 text-xs"
                  >
                    {showAccountNumber ? 'Hide' : 'Show'}
                  </Button>
                </Label>
                <Input
                  id="bankAccountNumber"
                  type={showAccountNumber ? 'text' : 'password'}
                  value={data.bankAccountNumber}
                  onChange={(e) => updateField('bankAccountNumber', e.target.value)}
                  placeholder="Enter account number"
                  className="h-14 text-lg px-4 bg-white font-mono"
                />
              </div>
            </div>
            <div className="pt-2">
              <PhotoUploadButton
                label="Voided Check Photo (optional)"
                hasPhoto={!!data.voidedCheckPhotoId}
                onCapture={handleCheckPhotoCapture}
                onUpload={handleCheckPhotoUpload}
              />
              <input
                ref={checkFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    toast({ title: 'Photo selected', description: 'Uploading voided check photo...' });
                    updateField('voidedCheckPhotoId', 'placeholder-check-photo');
                  }
                }}
              />
            </div>
          </CardContent>
        )}
        </Card>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              onClick={handleSaveForLater}
              disabled={saveMutation.isPending}
              className="h-14 text-base flex-1 sm:flex-none sm:w-48"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : null}
              Save for Later
            </Button>
            <Button
              onClick={handleSaveAndContinue}
              disabled={!isValid || saveMutation.isPending}
              className="h-14 text-base flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Save & Continue
                  <CheckCircle2 className="h-5 w-5 ml-2" />
                </>
              )}
            </Button>
          </div>
          {!isValid && (
            <p className="text-sm text-amber-600 mt-2 text-center">
              Please fill in required fields: Full Name, Email, and Phone
            </p>
          )}
          {skippedCount > 0 && (
            <p className="text-sm text-orange-600 mt-2 text-center">
              {skippedCount} section{skippedCount > 1 ? 's' : ''} skipped - you can complete {skippedCount > 1 ? 'them' : 'it'} later
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
