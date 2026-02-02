import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, User, Mail, Phone, MapPin, Car, CreditCard, Camera, Loader2 } from 'lucide-react';

interface DemographicsData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  vehicleType: string;
  licensePlate: string;
  driversLicenseNumber: string;
  driversLicenseState: string;
  bankName: string;
  bankRoutingNumber: string;
  bankAccountNumber: string;
}

interface DemographicsIntakeFormProps {
  sessionId: string;
  initialData?: Partial<DemographicsData>;
  isCompleted?: boolean;
  isRehire?: boolean;
  onComplete?: (data: DemographicsData) => void;
}

const INITIAL_DEMOGRAPHICS: DemographicsData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  vehicleType: '',
  licensePlate: '',
  driversLicenseNumber: '',
  driversLicenseState: '',
  bankName: '',
  bankRoutingNumber: '',
  bankAccountNumber: '',
};

export default function DemographicsIntakeForm({
  sessionId,
  initialData = {},
  isCompleted = false,
  isRehire = false,
  onComplete,
}: DemographicsIntakeFormProps) {
  const [data, setData] = useState<DemographicsData>({
    ...INITIAL_DEMOGRAPHICS,
    ...initialData,
  });
  const [isSaving, setIsSaving] = useState(false);

  const updateField = (field: keyof DemographicsData, value: string) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const isValid = data.firstName.trim() && data.lastName.trim() && data.email.trim();

  const handleSave = async () => {
    if (!isValid) return;
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    setIsSaving(false);
    onComplete?.(data);
  };

  if (isCompleted) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="py-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <div>
              <p className="font-medium text-green-800">Demographics Completed</p>
              <p className="text-sm text-green-600">
                {data.firstName} {data.lastName} - {data.email}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {isRehire && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Re-Hire:</strong> Verify and update the employee's information below.
            Fields are pre-filled from their previous record.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-gray-600" />
            <CardTitle>Personal Information</CardTitle>
          </div>
          <CardDescription>Basic employee identification</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={data.firstName}
                onChange={(e) => updateField('firstName', e.target.value)}
                placeholder="John"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={data.lastName}
                onChange={(e) => updateField('lastName', e.target.value)}
                placeholder="Smith"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-1">
                <Mail className="h-3 w-3" /> Email *
              </Label>
              <Input
                id="email"
                type="email"
                value={data.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="john.smith@email.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-1">
                <Phone className="h-3 w-3" /> Phone
              </Label>
              <Input
                id="phone"
                type="tel"
                value={data.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-gray-600" />
            <CardTitle>Address</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address">Street Address</Label>
            <Input
              id="address"
              value={data.address}
              onChange={(e) => updateField('address', e.target.value)}
              placeholder="123 Main Street"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={data.city}
                onChange={(e) => updateField('city', e.target.value)}
                placeholder="Anytown"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={data.state}
                onChange={(e) => updateField('state', e.target.value)}
                placeholder="CA"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zipCode">ZIP Code</Label>
              <Input
                id="zipCode"
                value={data.zipCode}
                onChange={(e) => updateField('zipCode', e.target.value)}
                placeholder="12345"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5 text-gray-600" />
            <CardTitle>Vehicle & License</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vehicleType">Vehicle Type</Label>
              <Input
                id="vehicleType"
                value={data.vehicleType}
                onChange={(e) => updateField('vehicleType', e.target.value)}
                placeholder="Honda Civic"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="licensePlate">License Plate</Label>
              <Input
                id="licensePlate"
                value={data.licensePlate}
                onChange={(e) => updateField('licensePlate', e.target.value)}
                placeholder="ABC 1234"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="driversLicenseNumber">Driver's License #</Label>
              <Input
                id="driversLicenseNumber"
                value={data.driversLicenseNumber}
                onChange={(e) => updateField('driversLicenseNumber', e.target.value)}
                placeholder="D1234567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="driversLicenseState">DL State</Label>
              <Input
                id="driversLicenseState"
                value={data.driversLicenseState}
                onChange={(e) => updateField('driversLicenseState', e.target.value)}
                placeholder="CA"
                maxLength={2}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-gray-600" />
            <CardTitle>Bank Information</CardTitle>
          </div>
          <CardDescription>For direct deposit (optional)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bankName">Bank Name</Label>
            <Input
              id="bankName"
              value={data.bankName}
              onChange={(e) => updateField('bankName', e.target.value)}
              placeholder="First National Bank"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bankRoutingNumber">Routing Number</Label>
              <Input
                id="bankRoutingNumber"
                value={data.bankRoutingNumber}
                onChange={(e) => updateField('bankRoutingNumber', e.target.value)}
                placeholder="123456789"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankAccountNumber">Account Number</Label>
              <Input
                id="bankAccountNumber"
                value={data.bankAccountNumber}
                onChange={(e) => updateField('bankAccountNumber', e.target.value)}
                placeholder="••••••••1234"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-gray-600" />
            <CardTitle>Photo (Optional)</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed rounded-lg p-8 text-center text-gray-400">
            <Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Photo capture will be available in a future update</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button
          onClick={handleSave}
          disabled={!isValid || isSaving}
          size="lg"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save & Continue'
          )}
        </Button>
      </div>

      <div className="text-center text-xs text-gray-400">
        Session ID: {sessionId}
      </div>
    </div>
  );
}
