import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  insertAccountCategorySchema,
  insertAccountSchema,
  insertMonthlyAccountEntrySchema,
} from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Calculator, FileText } from 'lucide-react';

// Types
interface AccountCategory {
  id: string;
  name: string;
  code: string;
  type: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface Account {
  id: string;
  accountNumber: string;
  name: string;
  categoryId: string;
  description: string | null;
  isAllocated: boolean;
  allocationBasis: string | null;
  isActive: boolean;
}

interface MonthlyEntry {
  id: string;
  accountId: string;
  year: number;
  month: number;
  amount: string;
  notes: string | null;
  source: string;
}

const ACCOUNT_TYPES = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expense', label: 'Operating Expense' },
  { value: 'cogs', label: 'Cost of Goods Sold' },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function CostAccountingPage() {
  const { toast } = useToast();
  
  // State for categories
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<AccountCategory | null>(null);
  
  // State for accounts
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  
  // State for monthly entries
  const [isEntryDialogOpen, setIsEntryDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MonthlyEntry | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  // Category Form
  const categoryFormSchema = insertAccountCategorySchema.extend({
    sortOrder: z.preprocess(
      (val) => (val === '' ? 0 : parseInt(val as string)),
      z.number().int()
    ),
  });
  
  const categoryForm = useForm({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: '',
      code: '',
      type: 'expense',
      description: '',
      sortOrder: 0,
      isActive: true,
    },
  });

  // Account Form
  const accountFormSchema = insertAccountSchema.extend({
    isAllocated: z.boolean().default(false),
  });
  
  const accountForm = useForm({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      name: '',
      categoryId: '',
      description: '',
      isAllocated: false,
      allocationBasis: '',
      isActive: true,
    },
  });

  // Monthly Entry Form
  const entryFormSchema = insertMonthlyAccountEntrySchema.extend({
    year: z.preprocess(
      (val) => parseInt(val as string),
      z.number().int().min(2000).max(2100)
    ),
    month: z.preprocess(
      (val) => parseInt(val as string),
      z.number().int().min(1).max(12)
    ),
    amount: z.string().refine((val) => !isNaN(parseFloat(val)), {
      message: 'Must be a valid number',
    }),
  });
  
  const entryForm = useForm({
    resolver: zodResolver(entryFormSchema),
    defaultValues: {
      accountId: '',
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      amount: '0',
      notes: '',
      source: 'manual',
    },
  });

  // Queries
  const { data: categories = [], isLoading: categoriesLoading } = useQuery<AccountCategory[]>({
    queryKey: ['/api/cost-accounting/categories'],
  });

  const { data: accounts = [], isLoading: accountsLoading } = useQuery<Account[]>({
    queryKey: ['/api/cost-accounting/accounts'],
  });

  const { data: entries = [], isLoading: entriesLoading } = useQuery<MonthlyEntry[]>({
    queryKey: ['/api/cost-accounting/entries', selectedYear, selectedMonth],
    queryFn: async () => {
      return apiRequest(
        `/api/cost-accounting/entries?year=${selectedYear}&month=${selectedMonth}`,
        { method: 'GET' }
      );
    },
  });

  // Category Mutations
  const createCategoryMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/cost-accounting/categories', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cost-accounting/categories'] });
      toast({ title: 'Category Created' });
      setIsCategoryDialogOpen(false);
      categoryForm.reset();
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest(`/api/cost-accounting/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cost-accounting/categories'] });
      toast({ title: 'Category Updated' });
      setIsCategoryDialogOpen(false);
      setEditingCategory(null);
      categoryForm.reset();
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/cost-accounting/categories/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cost-accounting/categories'] });
      toast({ title: 'Category Deleted' });
    },
  });

  // Account Mutations
  const createAccountMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/cost-accounting/accounts', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cost-accounting/accounts'] });
      toast({ title: 'Account Created', description: 'Account number assigned automatically' });
      setIsAccountDialogOpen(false);
      accountForm.reset();
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest(`/api/cost-accounting/accounts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cost-accounting/accounts'] });
      toast({ title: 'Account Updated' });
      setIsAccountDialogOpen(false);
      setEditingAccount(null);
      accountForm.reset();
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/cost-accounting/accounts/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cost-accounting/accounts'] });
      toast({ title: 'Account Deleted' });
    },
  });

  // Entry Mutations
  const createEntryMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/cost-accounting/entries', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cost-accounting/entries'] });
      toast({ title: 'Entry Created' });
      setIsEntryDialogOpen(false);
      entryForm.reset();
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest(`/api/cost-accounting/entries/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cost-accounting/entries'] });
      toast({ title: 'Entry Updated' });
      setIsEntryDialogOpen(false);
      setEditingEntry(null);
      entryForm.reset();
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/cost-accounting/entries/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cost-accounting/entries'] });
      toast({ title: 'Entry Deleted' });
    },
  });

  // Handlers
  const handleCreateCategory = () => {
    setEditingCategory(null);
    categoryForm.reset();
    setIsCategoryDialogOpen(true);
  };

  const handleEditCategory = (category: AccountCategory) => {
    setEditingCategory(category);
    categoryForm.reset(category);
    setIsCategoryDialogOpen(true);
  };

  const handleCategorySubmit = (data: any) => {
    if (editingCategory) {
      updateCategoryMutation.mutate({ id: editingCategory.id, data });
    } else {
      createCategoryMutation.mutate(data);
    }
  };

  const handleCreateAccount = () => {
    setEditingAccount(null);
    accountForm.reset();
    setIsAccountDialogOpen(true);
  };

  const handleEditAccount = (account: Account) => {
    setEditingAccount(account);
    accountForm.reset(account);
    setIsAccountDialogOpen(true);
  };

  const handleAccountSubmit = (data: any) => {
    if (editingAccount) {
      updateAccountMutation.mutate({ id: editingAccount.id, data });
    } else {
      createAccountMutation.mutate(data);
    }
  };

  const handleCreateEntry = () => {
    setEditingEntry(null);
    entryForm.reset({
      year: selectedYear,
      month: selectedMonth,
      amount: '0',
      accountId: '',
      notes: '',
      source: 'manual',
    });
    setIsEntryDialogOpen(true);
  };

  const handleEditEntry = (entry: MonthlyEntry) => {
    setEditingEntry(entry);
    entryForm.reset(entry);
    setIsEntryDialogOpen(true);
  };

  const handleEntrySubmit = (data: any) => {
    if (editingEntry) {
      updateEntryMutation.mutate({ id: editingEntry.id, data });
    } else {
      createEntryMutation.mutate(data);
    }
  };

  const getCategoryName = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.name : 'Unknown';
  };

  const getAccountName = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    return account ? `${account.accountNumber} - ${account.name}` : 'Unknown';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Cost Accounting</h1>
          <p className="text-muted-foreground">
            Manage chart of accounts, monthly entries, and cost allocations
          </p>
        </div>
      </div>

      <Tabs defaultValue="categories" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="categories" data-testid="tab-categories">
            <FileText className="w-4 h-4 mr-2" />
            Account Categories
          </TabsTrigger>
          <TabsTrigger value="accounts" data-testid="tab-accounts">
            <FileText className="w-4 h-4 mr-2" />
            Chart of Accounts
          </TabsTrigger>
          <TabsTrigger value="entries" data-testid="tab-entries">
            <Calculator className="w-4 h-4 mr-2" />
            Monthly Entries
          </TabsTrigger>
        </TabsList>

        {/* CATEGORIES TAB */}
        <TabsContent value="categories">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Account Categories</CardTitle>
                  <CardDescription>
                    Organize accounts into categories like Assets, COGS, Expenses
                  </CardDescription>
                </div>
                <Button onClick={handleCreateCategory} data-testid="button-create-category">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Category
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {categoriesLoading ? (
                <div>Loading...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map((category) => (
                      <TableRow key={category.id} data-testid={`row-category-${category.id}`}>
                        <TableCell className="font-mono">{category.code}</TableCell>
                        <TableCell className="font-medium">{category.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{category.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={category.isActive ? 'default' : 'secondary'}>
                            {category.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditCategory(category)}
                            data-testid={`button-edit-category-${category.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteCategoryMutation.mutate(category.id)}
                            data-testid={`button-delete-category-${category.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ACCOUNTS TAB */}
        <TabsContent value="accounts">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Chart of Accounts</CardTitle>
                  <CardDescription>
                    Individual line items with auto-assigned account numbers
                  </CardDescription>
                </div>
                <Button onClick={handleCreateAccount} data-testid="button-create-account">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Account
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {accountsLoading ? (
                <div>Loading...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account #</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Allocated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((account) => (
                      <TableRow key={account.id} data-testid={`row-account-${account.id}`}>
                        <TableCell className="font-mono">{account.accountNumber}</TableCell>
                        <TableCell className="font-medium">{account.name}</TableCell>
                        <TableCell>{getCategoryName(account.categoryId)}</TableCell>
                        <TableCell>
                          {account.isAllocated && (
                            <Badge variant="secondary">
                              {account.allocationBasis || 'Yes'}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditAccount(account)}
                            data-testid={`button-edit-account-${account.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteAccountMutation.mutate(account.id)}
                            data-testid={`button-delete-account-${account.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* MONTHLY ENTRIES TAB */}
        <TabsContent value="entries">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Monthly Account Entries</CardTitle>
                  <CardDescription>
                    Input monthly amounts for each account
                  </CardDescription>
                </div>
                <div className="flex gap-2 items-center">
                  <Select
                    value={selectedMonth.toString()}
                    onValueChange={(val) => setSelectedMonth(parseInt(val))}
                  >
                    <SelectTrigger className="w-[150px]" data-testid="select-month">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((month, idx) => (
                        <SelectItem key={idx} value={(idx + 1).toString()}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="w-[100px]"
                    data-testid="input-year"
                  />
                  <Button onClick={handleCreateEntry} data-testid="button-create-entry">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Entry
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {entriesLoading ? (
                <div>Loading...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow key={entry.id} data-testid={`row-entry-${entry.id}`}>
                        <TableCell>{getAccountName(entry.accountId)}</TableCell>
                        <TableCell className="font-mono">${parseFloat(entry.amount).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{entry.source}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {entry.notes || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditEntry(entry)}
                            data-testid={`button-edit-entry-${entry.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteEntryMutation.mutate(entry.id)}
                            data-testid={`button-delete-entry-${entry.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* CATEGORY DIALOG */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent data-testid="dialog-category">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Edit Category' : 'Create Category'}
            </DialogTitle>
          </DialogHeader>
          <Form {...categoryForm}>
            <form onSubmit={categoryForm.handleSubmit(handleCategorySubmit)} className="space-y-4">
              <FormField
                control={categoryForm.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., 5000" data-testid="input-category-code" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={categoryForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., Operating Expenses" data-testid="input-category-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={categoryForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-category-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ACCOUNT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={categoryForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} data-testid="textarea-category-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCategoryDialogOpen(false)}
                  data-testid="button-cancel-category"
                >
                  Cancel
                </Button>
                <Button type="submit" data-testid="button-submit-category">
                  {editingCategory ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ACCOUNT DIALOG */}
      <Dialog open={isAccountDialogOpen} onOpenChange={setIsAccountDialogOpen}>
        <DialogContent data-testid="dialog-account">
          <DialogHeader>
            <DialogTitle>
              {editingAccount ? 'Edit Account' : 'Create Account'}
            </DialogTitle>
          </DialogHeader>
          <Form {...accountForm}>
            <form onSubmit={accountForm.handleSubmit(handleAccountSubmit)} className="space-y-4">
              <FormField
                control={accountForm.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-account-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.code} - {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={accountForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., Direct Materials - Carbon Fiber" data-testid="input-account-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={accountForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} data-testid="textarea-account-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAccountDialogOpen(false)}
                  data-testid="button-cancel-account"
                >
                  Cancel
                </Button>
                <Button type="submit" data-testid="button-submit-account">
                  {editingAccount ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* MONTHLY ENTRY DIALOG */}
      <Dialog open={isEntryDialogOpen} onOpenChange={setIsEntryDialogOpen}>
        <DialogContent data-testid="dialog-entry">
          <DialogHeader>
            <DialogTitle>
              {editingEntry ? 'Edit Entry' : 'Create Entry'}
            </DialogTitle>
          </DialogHeader>
          <Form {...entryForm}>
            <form onSubmit={entryForm.handleSubmit(handleEntrySubmit)} className="space-y-4">
              <FormField
                control={entryForm.control}
                name="accountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-entry-account">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.accountNumber} - {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={entryForm.control}
                  name="year"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Year</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" data-testid="input-entry-year" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={entryForm.control}
                  name="month"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Month</FormLabel>
                      <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger data-testid="select-entry-month">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {MONTHS.map((month, idx) => (
                            <SelectItem key={idx} value={(idx + 1).toString()}>
                              {month}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={entryForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input {...field} type="text" placeholder="0.00" data-testid="input-entry-amount" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={entryForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea {...field} data-testid="textarea-entry-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEntryDialogOpen(false)}
                  data-testid="button-cancel-entry"
                >
                  Cancel
                </Button>
                <Button type="submit" data-testid="button-submit-entry">
                  {editingEntry ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
