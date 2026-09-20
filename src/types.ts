export type Locale = 'en-IN' | 'hi-IN'

export interface BusinessOwner {
  id: string
  phoneNumber: string
  email: string | null
  displayName: string
  businessId: string
  businessName: string
  preferredLocale: Locale
  role: string
}

export interface Customer {
  id: number
  displayName: string
  phoneE164: string | null
  notes: string | null
  preferredMessageLocale: Locale | null
  outstanding: string
  totalPurchases: string
  totalPaid: string
  nextCommitment: CommitmentSummary | null
  openingBalanceSet: boolean
  createdAt: string
}

export interface CustomerPage {
  items: Customer[]
  page: number
  pageSize: number
  total: number
}

export interface PurchaseRecord {
  id: number
  customerId: number
  mode: 'QUICK' | 'ITEMIZED' | string
  occurredOn: string
  description: string | null
  subtotal: string
  discount: string
  total: string
  paidNow: string
  outstanding: string
  lines: { name: string; quantity: string; unit: string | null; unitPrice: string; lineTotal: string }[]
  postedAt: string
}

export interface PurchasePage {
  items: PurchaseRecord[]
  page: number
  pageSize: number
  total: number
}

export interface PaymentRecord {
  id: number
  amount: string
  method: string
  occurredOn: string
  reference: string | null
  postedAt: string
}

export interface CommitmentSummary {
  id: number
  remaining: string
  dueDate: string
  status: 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' | string
}

export interface Commitment {
  id: number
  customerId: number
  originalAmount: string
  remaining: string
  originalDueDate: string
  dueDate: string
  status: string
  note: string | null
  revisions: { oldDate: string; newDate: string; reason: string | null; createdAt: string }[]
  createdAt: string
}

export interface LedgerMovement {
  type: 'OPENING_BALANCE' | 'PURCHASE' | 'PAYMENT' | string
  id: number
  occurredOn: string
  description: string | null
  amount: string
  direction: 'CREDIT' | 'DEBIT'
  method: string | null
  postedAt: string
}

export interface Ledger {
  customerId: number
  from: string
  to: string
  openingAtFrom: string
  purchasesInPeriod: string
  paymentsInPeriod: string
  closingAtTo: string
  lifetimeOutstanding: string
  movements: LedgerMovement[]
}

export interface Dashboard {
  businessDate: string
  totalOutstanding: string
  customersWithOutstanding: number
  dueTodayAmount: string
  dueTodayCount: number
  overdueAmount: string
  overdueCount: number
  customersWithoutPromise: number
  attentionCustomers: Customer[]
}

export interface Business {
  id: string
  name: string
  timezone: string
  currency: string
  upiVpa: string | null
  upiLinkedMobileE164: string | null
  upiPayeeName: string | null
  paymentDetailsOwnerConfirmed: boolean
}

export interface ReminderPreview {
  locale: Locale
  format: 'SHORT' | 'DETAILED'
  generatedAt: string
  recipient: string | null
  periodStart: string
  periodEnd: string
  openingBalance: string
  purchases: string
  payments: string
  closingBalance: string
  outstandingAsOfNow: string
  message: string
  whatsappUrl: string
  sent: boolean
}

export class ApiError extends Error {
  code: string

  constructor(message: string, code = 'UNKNOWN_ERROR') {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}
