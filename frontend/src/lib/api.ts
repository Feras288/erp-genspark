// =====================================================
// Frontend HTTP client.
// - baseURL = NEXT_PUBLIC_API_URL (falls back to http://localhost:3001/api)
// - credentials: 'include' so the HttpOnly refresh cookie is sent
// - Authorization: Bearer <accessToken> if accessToken is set in-memory
// - On 401, try /auth/refresh once; on success, replay original request.
// - NEVER uses localStorage / sessionStorage.
// - The access token is held in an in-memory store, NOT a module-level global.
// =====================================================
import type { SafeUser } from './auth-types';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

let _accessToken: string | null = null;
const _listeners = new Set<(t: string | null) => void>();

export function setAccessToken(token: string | null) {
  _accessToken = token;
  for (const fn of _listeners) fn(token);
}
export function getAccessToken(): string | null {
  return _accessToken;
}
export function onAccessTokenChange(fn: (t: string | null) => void): () => void {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}

const BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
  'http://localhost:3001/api';

interface RequestOptions {
  method?: string;
  body?: unknown;
  retryOn401?: boolean;
  signal?: AbortSignal;
}

async function rawRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (_accessToken) headers.Authorization = `Bearer ${_accessToken}`;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || 'GET',
    credentials: 'include',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      try {
        body = await res.text();
      } catch {
        body = null;
      }
    }
    throw new ApiError(
      (body && typeof body === 'object' && 'message' in (body as object)
        ? String((body as { message: unknown }).message)
        : `HTTP ${res.status}`),
      res.status,
      body,
    );
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, opts);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && opts.retryOn401 !== false) {
      // try refresh once
      try {
        const r = await rawRequest<{ accessToken: string; user: SafeUser }>(
          '/auth/refresh',
          { method: 'POST', retryOn401: false },
        );
        setAccessToken(r.accessToken);
        return await rawRequest<T>(path, { ...opts, retryOn401: false });
      } catch (refreshErr) {
        setAccessToken(null);
        throw err; // surface the original 401
      }
    }
    throw err;
  }
}

export const api = {
  login: (email: string, password: string) =>
    apiRequest<{ accessToken: string; user: SafeUser }>('/auth/login', {
      method: 'POST',
      body: { email, password },
      retryOn401: false,
    }),
  refresh: () =>
    apiRequest<{ accessToken: string; user: SafeUser }>('/auth/refresh', {
      method: 'POST',
      retryOn401: false,
    }),
  logout: () =>
    apiRequest<void>('/auth/logout', { method: 'POST', retryOn401: false }),
  me: () => apiRequest<SafeUser>('/auth/me'),
  listUsers: (page = 1, pageSize = 20, search?: string) => {
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) q.set('search', search);
    return apiRequest<{ total: number; page: number; pageSize: number; items: SafeUser[] }>(
      `/users?${q.toString()}`,
    );
  },

  // ===== Phase 2: Products + Partners =====

  listProducts: (params: {
    page?: number;
    pageSize?: number;
    search?: string;
    type?: 'PRODUCT' | 'SERVICE';
    isActive?: boolean;
  } = {}) => {
    const q = new URLSearchParams();
    q.set('page', String(params.page ?? 1));
    q.set('pageSize', String(params.pageSize ?? 20));
    if (params.search) q.set('search', params.search);
    if (params.type) q.set('type', params.type);
    if (params.isActive !== undefined) q.set('isActive', String(params.isActive));
    return apiRequest<Paginated<Product>>(`/products?${q.toString()}`);
  },
  getProduct: (id: string) => apiRequest<Product>(`/products/${id}`),
  createProduct: (data: Partial<Product>) =>
    apiRequest<Product>('/products', { method: 'POST', body: data }),
  updateProduct: (id: string, data: Partial<Product>) =>
    apiRequest<Product>(`/products/${id}`, { method: 'PATCH', body: data }),
  deleteProduct: (id: string) =>
    apiRequest<{ id: string; isActive: boolean }>(`/products/${id}`, { method: 'DELETE' }),

  listPartners: (params: {
    page?: number;
    pageSize?: number;
    search?: string;
    type?: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
    isActive?: boolean;
  } = {}) => {
    const q = new URLSearchParams();
    q.set('page', String(params.page ?? 1));
    q.set('pageSize', String(params.pageSize ?? 20));
    if (params.search) q.set('search', params.search);
    if (params.type) q.set('type', params.type);
    if (params.isActive !== undefined) q.set('isActive', String(params.isActive));
    return apiRequest<Paginated<Partner>>(`/partners?${q.toString()}`);
  },
  getPartner: (id: string) => apiRequest<Partner>(`/partners/${id}`),
  createPartner: (data: Partial<Partner>) =>
    apiRequest<Partner>('/partners', { method: 'POST', body: data }),
  updatePartner: (id: string, data: Partial<Partner>) =>
    apiRequest<Partner>(`/partners/${id}`, { method: 'PATCH', body: data }),
  deletePartner: (id: string) =>
    apiRequest<{ id: string; isActive: boolean }>(`/partners/${id}`, { method: 'DELETE' }),

  // ===== Phase 3: Warehouses (master data) =====

  listWarehouses: (params: {
    page?: number;
    pageSize?: number;
    search?: string;
    isActive?: boolean;
  } = {}) => {
    const q = new URLSearchParams();
    q.set('page', String(params.page ?? 1));
    q.set('pageSize', String(params.pageSize ?? 20));
    if (params.search) q.set('search', params.search);
    if (params.isActive !== undefined) q.set('isActive', String(params.isActive));
    return apiRequest<Paginated<Warehouse>>(`/warehouses?${q.toString()}`);
  },
  getWarehouse: (id: string) => apiRequest<Warehouse>(`/warehouses/${id}`),
  createWarehouse: (data: Partial<Warehouse>) =>
    apiRequest<Warehouse>('/warehouses', { method: 'POST', body: data }),
  updateWarehouse: (id: string, data: Partial<Warehouse>) =>
    apiRequest<Warehouse>(`/warehouses/${id}`, { method: 'PATCH', body: data }),
  deleteWarehouse: (id: string) =>
    apiRequest<{ id: string; isActive: boolean }>(`/warehouses/${id}`, { method: 'DELETE' }),

  // ===== Phase 3: Inventory (Stock levels, Movements, Adjustments, Transfers) =====

  listStockLevels: (params: {
    page?: number;
    pageSize?: number;
    search?: string;
    productId?: string;
    warehouseId?: string;
  } = {}) => {
    const q = new URLSearchParams();
    q.set('page', String(params.page ?? 1));
    q.set('pageSize', String(params.pageSize ?? 20));
    if (params.search) q.set('search', params.search);
    if (params.productId) q.set('productId', params.productId);
    if (params.warehouseId) q.set('warehouseId', params.warehouseId);
    return apiRequest<Paginated<StockLevel>>(`/inventory/levels?${q.toString()}`);
  },

  listStockMovements: (params: {
    page?: number;
    pageSize?: number;
    productId?: string;
    warehouseId?: string;
    movementType?: StockMovementTypeKey;
    dateFrom?: string;
    dateTo?: string;
  } = {}) => {
    const q = new URLSearchParams();
    q.set('page', String(params.page ?? 1));
    q.set('pageSize', String(params.pageSize ?? 20));
    if (params.productId) q.set('productId', params.productId);
    if (params.warehouseId) q.set('warehouseId', params.warehouseId);
    if (params.movementType) q.set('movementType', params.movementType);
    if (params.dateFrom) q.set('dateFrom', params.dateFrom);
    if (params.dateTo) q.set('dateTo', params.dateTo);
    return apiRequest<Paginated<StockMovement>>(`/inventory/movements?${q.toString()}`);
  },

  adjustStock: (data: StockAdjustmentInput) =>
    apiRequest<{ level: StockLevel; movement: StockMovement }>(
      '/inventory/adjustments',
      { method: 'POST', body: data },
    ),

  transferStock: (data: StockTransferInput) =>
    apiRequest<{ out: StockMovement; inn: StockMovement }>(
      '/inventory/transfers',
      { method: 'POST', body: data },
    ),

  // Convenience: list active products (type=PRODUCT) for Inventory forms.
  listProductsLiteForInventory: () =>
    api.listProducts({ page: 1, pageSize: 200, type: 'PRODUCT', isActive: true }),

  // Convenience: list active customers (Partner type CUSTOMER | BOTH) for Sales/POS forms.
  listActiveCustomers: () =>
    api.listPartners({
      page: 1,
      pageSize: 200,
      isActive: true,
    }),

  // Convenience: list active warehouses (used by sales issue / pos checkout).
  listActiveWarehouses: () =>
    api.listWarehouses({ page: 1, pageSize: 200, isActive: true }),

  // Convenience: list all active products (PRODUCT + SERVICE) for sales lines / POS checkout.
  listActiveProducts: () =>
    api.listProducts({ page: 1, pageSize: 200, isActive: true }),

  // ===== Phase 4: Sales invoices =====

  listSalesInvoices: (params: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: 'DRAFT' | 'ISSUED' | 'CANCELLED';
    type?: 'STANDARD' | 'POS';
    customerId?: string;
  } = {}) => {
    const q = new URLSearchParams();
    q.set('page', String(params.page ?? 1));
    q.set('pageSize', String(params.pageSize ?? 20));
    if (params.search) q.set('search', params.search);
    if (params.status) q.set('status', params.status);
    if (params.type) q.set('type', params.type);
    if (params.customerId) q.set('customerId', params.customerId);
    return apiRequest<Paginated<SalesInvoice>>(`/sales/invoices?${q.toString()}`);
  },
  getSalesInvoice: (id: string) =>
    apiRequest<SalesInvoice>(`/sales/invoices/${id}`),
  createSalesInvoice: (data: CreateSalesInvoiceInput) =>
    apiRequest<SalesInvoice>('/sales/invoices', { method: 'POST', body: data }),
  updateSalesInvoice: (id: string, data: UpdateSalesInvoiceInput) =>
    apiRequest<SalesInvoice>(`/sales/invoices/${id}`, {
      method: 'PATCH',
      body: data,
    }),
  deleteSalesInvoice: (id: string) =>
    apiRequest<{ id: string; isActive: boolean; deletedAt: string }>(
      `/sales/invoices/${id}`,
      { method: 'DELETE' },
    ),
  issueSalesInvoice: (id: string, data: IssueSalesInvoiceInput = {}) =>
    apiRequest<SalesInvoice>(`/sales/invoices/${id}/issue`, {
      method: 'POST',
      body: data,
    }),
  cancelSalesInvoice: (id: string, data: CancelSalesInvoiceInput = {}) =>
    apiRequest<SalesInvoice>(`/sales/invoices/${id}/cancel`, {
      method: 'POST',
      body: data,
    }),

  // ===== Phase 4B-4: POS sales =====

  listPosSales: (params: {
    page?: number;
    pageSize?: number;
    search?: string;
    customerId?: string;
  } = {}) => {
    const q = new URLSearchParams();
    q.set('page', String(params.page ?? 1));
    q.set('pageSize', String(params.pageSize ?? 20));
    if (params.search) q.set('search', params.search);
    if (params.customerId) q.set('customerId', params.customerId);
    return apiRequest<Paginated<SalesInvoice>>(`/pos/sales?${q.toString()}`);
  },
  createPosSale: (data: CreatePosSaleInput) =>
    apiRequest<SalesInvoice>('/pos/sales', { method: 'POST', body: data }),
};

// =====================================================
// Phase 2 types — must mirror backend Prisma selections.
// `companyId` comes from JWT only, never from these objects
// outside the SafeUser contract; the user can't forge it.
// =====================================================
export type Paginated<T> = {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
};

export type Product = {
  id: string;
  companyId: string;
  sku: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  type: 'PRODUCT' | 'SERVICE';
  barcode: string | null;
  unit: string | null;
  priceBeforeVat: string | null; // Decimal serializes to string
  vatRate: string;              // Decimal default '15.00'
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  updatedById: string | null;
};

export type Partner = {
  id: string;
  companyId: string;
  code: string | null;
  name: string;
  nameAr: string | null;
  type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
  vatNumber: string | null;
  commercialRegistration: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  updatedById: string | null;
};

// =====================================================
// Phase 3 types — must mirror backend Prisma selections.
// companyId is also returned from the API (as a hint), but
// authorization always comes from the JWT in currentUser.
// =====================================================
export type Warehouse = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  nameAr: string | null;
  address: string | null;
  city: string | null;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  updatedById: string | null;
};

export type StockLevel = {
  id: string;
  companyId: string;
  productId: string;
  warehouseId: string;
  quantity: string;            // Decimal serializes to string
  reservedQuantity: string;
  createdAt: string;
  updatedAt: string;
  product?: { id: string; sku: string; name: string };
  warehouse?: { id: string; code: string; name: string };
};

export type StockMovementTypeKey =
  | 'OPENING_BALANCE'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT';

export type StockMovementDirectionKey = 'IN' | 'OUT';

export type StockMovement = {
  id: string;
  companyId: string;
  productId: string;
  warehouseId: string;
  movementType: StockMovementTypeKey;
  direction: StockMovementDirectionKey;
  quantity: string;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  notes: string | null;
  movementDate: string;
  createdAt: string;
  createdById: string | null;
  product?: { id: string; sku: string; name: string };
  warehouse?: { id: string; code: string; name: string };
};

export type StockAdjustmentInput = {
  productId: string;
  warehouseId: string;
  adjustmentType: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';
  quantity: string;
  reason: string;
  notes?: string;
};

export type StockTransferInput = {
  fromWarehouseId: string;
  toWarehouseId: string;
  productId: string;
  quantity: string;
  notes?: string;
};

// =====================================================
// Phase 4 types — Sales invoices + POS sales.
// All Decimal columns serialize to strings (matches backend).
// `companyId` is returned as a hint but authorization is
// always from the JWT in currentUser. Money is never `Number`.
// =====================================================

export type SalesInvoiceStatus = 'DRAFT' | 'ISSUED' | 'CANCELLED';
export type SalesInvoiceType = 'STANDARD' | 'POS';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER';

export type SalesInvoiceLine = {
  id: string;
  companyId: string;
  invoiceId: string;
  productId: string;
  warehouseId: string | null;
  description: string | null;
  quantity: string;       // Decimal
  unitPrice: string;      // Decimal
  discountAmount: string; // Decimal
  vatRate: string;        // Decimal @db.Decimal(5, 2)
  vatAmount: string;      // Decimal
  lineSubtotal: string;   // Decimal
  lineTotal: string;      // Decimal
  createdAt: string;
  updatedAt: string;
  product?: { id: string; sku: string; name: string; type: 'PRODUCT' | 'SERVICE' };
  warehouse?: { id: string; code: string; name: string } | null;
};

export type SalesInvoice = {
  id: string;
  companyId: string;
  invoiceNumber: string;
  status: SalesInvoiceStatus;
  type: SalesInvoiceType;
  customerId: string | null;
  issueDate: string | null;
  dueDate: string | null;
  subtotal: string;        // Decimal
  vatTotal: string;        // Decimal
  discountTotal: string;   // Decimal
  total: string;           // Decimal
  paymentMethod: PaymentMethod | null;
  paidAmount: string | null;
  notes: string | null;
  cancelledAt: string | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  updatedById: string | null;
  issuedById: string | null;
  cancelledById: string | null;
  customer?: { id: string; code: string | null; name: string; type: string } | null;
  lines?: SalesInvoiceLine[];
  _count?: { lines: number };
};

export type CreateSalesInvoiceLineInput = {
  productId: string;
  warehouseId?: string;
  description?: string;
  quantity: string;
  unitPrice: string;
  discountAmount?: string;
  vatRate?: string;
};

export type CreateSalesInvoiceInput = {
  customerId?: string;
  issueDate?: string;
  dueDate?: string;
  notes?: string;
  lines: CreateSalesInvoiceLineInput[];
};

export type UpdateSalesInvoiceInput = Partial<Omit<CreateSalesInvoiceInput, 'lines'>> & {
  lines?: CreateSalesInvoiceLineInput[];
};

export type IssueSalesInvoiceInput = {
  issueDate?: string;
  notes?: string;
};

export type CancelSalesInvoiceInput = {
  reason?: string;
  notes?: string;
};

export type CreatePosSaleLineInput = {
  productId: string;
  warehouseId?: string;
  description?: string;
  quantity: string;
  unitPrice: string;
  discountAmount?: string;
  vatRate?: string;
};

export type CreatePosSaleInput = {
  customerId?: string;
  paymentMethod?: PaymentMethod;
  paidAmount?: string;
  notes?: string;
  lines: CreatePosSaleLineInput[];
};
